-- =============================================================================
-- Sollelio v2 — Operational Staff MVP · Step 5 · Manual task assignments
-- Migration: 20260827201314_event_task_assignments.sql
--
-- Additive. Creates one relation, two permission-catalogue rows and one write
-- function. It alters no Point 1 object, changes no Step 1/3/4 rule, and
-- depends on no Events Core relation.
--
-- DOMAIN: an assignment says one person will do one task at one event. It
-- belongs to the TASK, never to a consultation — a consultation is how the
-- house asked, and the answer informs the decision without being the decision.
-- Assignments therefore outlive the consultation that prompted them.
--
-- MANUAL, AND ONLY MANUAL: nothing here selects, ranks, scores, recommends or
-- fills anything in. There is no ordering by suitability and no notion of a
-- best person, in this migration or anywhere the application reads it. A person
-- is assigned because Nádia said so.
--
-- MINIMUM IS A FLOOR: event_tasks.minimum_people is what the task needs at
-- least. Nothing here caps the count, and being over it is not a problem to
-- report — a task with six people where four were needed is a task that is
-- covered.
--
-- AVAILABILITY IS NOT A GATE: a compatible person may be assigned having
-- answered unavailable, having answered a partial window that does not cover
-- the task, or having not answered at all. The application says so plainly and
-- then saves it. Refusing would put the schema in charge of an operational
-- judgement that belongs to the person running the event.
--
-- CAPABILITY IS a gate, at the moment of assigning: a person must hold the
-- operational function the task requires. It is checked when the assignment is
-- MADE and is deliberately not a standing constraint — taking a function away
-- from somebody later must not rewrite what they were once put down to do.
--
-- TENANCY: organization_id is explicit and both FKs are composite, so an
-- assignment cannot join one organization's task to another's people. The
-- caller never states which organization it is acting in: §5 derives it from
-- the task and authorises against that.
--
-- AUDIT: as in Steps 1, 3 and 4, attribution lives on the row (assigned_by) and
-- no audit trigger is installed; the reusable helper belongs to E1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permission catalogue. Seeded here, granted to nobody — see §6.
-- -----------------------------------------------------------------------------

insert into public.permissions (key, area, description) values
    ('staff.assignments.read',   'staff', 'Read who is assigned to the operational tasks of an event.'),
    ('staff.assignments.manage', 'staff', 'Assign staff members to event tasks and remove those assignments.');

-- -----------------------------------------------------------------------------
-- 2. Relations.
-- -----------------------------------------------------------------------------

create table if not exists public.event_task_assignments (
    id uuid not null default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    event_task_id uuid not null,
    staff_member_id uuid not null,
    assigned_at timestamptz not null default now(),
    assigned_by uuid references public.user_profiles (user_id) on delete set null,
    constraint event_task_assignments_pkey primary key (id),
    -- one person is on a task once; this is also what makes a repeated save
    -- idempotent rather than a duplicate line on the sheet
    constraint event_task_assignments_person_unique unique (event_task_id, staff_member_id),
    -- a task that is deleted takes its assignments with it: the work is gone
    constraint event_task_assignments_task_fkey
        foreign key (event_task_id, organization_id)
        references public.event_tasks (id, organization_id) on delete cascade,
    -- a person is deactivated, never deleted, so history survives them leaving
    constraint event_task_assignments_member_fkey
        foreign key (staff_member_id, organization_id)
        references public.staff_members (id, organization_id) on delete restrict
);

-- -----------------------------------------------------------------------------
-- 3. Indexes — the per-event read the grid does, the per-person read a later
--    individual plan will want, and support for every FK.
-- -----------------------------------------------------------------------------

create index if not exists event_task_assignments_task_idx
    on public.event_task_assignments (event_task_id, organization_id);
create index if not exists event_task_assignments_member_idx
    on public.event_task_assignments (staff_member_id, organization_id);
create index if not exists event_task_assignments_organization_idx
    on public.event_task_assignments (organization_id, assigned_at desc);
create index if not exists event_task_assignments_assigned_by_idx
    on public.event_task_assignments (assigned_by);

-- -----------------------------------------------------------------------------
-- 4. Row level security. Enable, never force, as in Steps 1, 3 and 4.
-- -----------------------------------------------------------------------------

alter table public.event_task_assignments enable row level security;

drop policy if exists event_task_assignments_select on public.event_task_assignments;
create policy event_task_assignments_select on public.event_task_assignments for select
    using (public.has_permission(organization_id, 'staff.assignments.read')
        or public.has_permission(organization_id, 'staff.assignments.manage'));
drop policy if exists event_task_assignments_delete on public.event_task_assignments;
create policy event_task_assignments_delete on public.event_task_assignments for delete
    using (public.has_permission(organization_id, 'staff.assignments.manage'));
-- no INSERT policy: assigning goes through assign_staff_to_task (§5), which is
-- where the capability check lives. Removing has no invariant to protect, so it
-- is an ordinary delete.
-- no UPDATE policy: an assignment is made or undone, never edited in place.

-- -----------------------------------------------------------------------------
-- 5. Privileges and the write path.
-- -----------------------------------------------------------------------------

revoke all on table public.event_task_assignments from public, anon, authenticated;
grant select, delete on public.event_task_assignments to authenticated;

-- The organization is DERIVED from the task, never accepted from the caller,
-- and the permission is then checked against that derived value — so passing
-- somebody else's task cannot borrow this caller's rights, and passing a task
-- the caller may not touch fails the permission check rather than leaking that
-- the task exists.
create or replace function public.assign_staff_to_task(
    p_event_task_id uuid,
    p_staff_member_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
    v_org uuid;
    v_function uuid;
    v_id uuid;
begin
    select t.organization_id, t.staff_function_id
      into v_org, v_function
      from public.event_tasks t
     where t.id = p_event_task_id;

    if v_org is null or not public.has_permission(v_org, 'staff.assignments.manage') then
        raise exception 'PERMISSION_DENIED';
    end if;

    -- The person must be of THIS organization. Passing somebody else's staff id
    -- lands here, not on a row.
    if not exists (
        select 1 from public.staff_members m
         where m.id = p_staff_member_id and m.organization_id = v_org
    ) then
        raise exception 'MEMBER_NOT_FOUND';
    end if;

    -- Deactivated people take no NEW work. Assignments they already hold stay
    -- exactly as they are — that is history, and deactivating somebody is not
    -- a statement about what they did last summer.
    if not exists (
        select 1 from public.staff_members m
         where m.id = p_staff_member_id and m.organization_id = v_org and m.is_active
    ) then
        raise exception 'MEMBER_INACTIVE';
    end if;

    -- The one real gate: can this person do this work at all.
    if not exists (
        select 1 from public.staff_member_functions mf
         where mf.staff_member_id = p_staff_member_id
           and mf.staff_function_id = v_function
           and mf.organization_id = v_org
    ) then
        raise exception 'MEMBER_LACKS_FUNCTION';
    end if;

    -- Availability is NOT consulted here, on purpose. Somebody who answered
    -- unavailable can still be put down; the screen says so and saves it.
    insert into public.event_task_assignments
        (organization_id, event_task_id, staff_member_id, assigned_by)
    values (v_org, p_event_task_id, p_staff_member_id, auth.uid())
    on conflict (event_task_id, staff_member_id) do nothing
    returning id into v_id;

    if v_id is null then
        select a.id into v_id
          from public.event_task_assignments a
         where a.event_task_id = p_event_task_id
           and a.staff_member_id = p_staff_member_id;
    end if;

    return v_id;
end;
$$;

comment on function public.assign_staff_to_task(uuid, uuid) is
    'Assigns one staff member to one event task. Derives the organization from the task and authorises against it; never trusts an organization supplied by the caller. Requires the member to hold the task''s required function and to be active. Availability is deliberately not consulted. Idempotent on (task, member).';

revoke all on function public.assign_staff_to_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_staff_to_task(uuid, uuid) to authenticated;
-- NOT to anon: a consultation token answers questions, it does not staff events.

-- -----------------------------------------------------------------------------
-- 6. Enabling the module for ONE organization.
--
-- As in Steps 1, 3 and 4 this seeds the catalogue and grants it to nobody. To
-- switch assignments on for a single organization, run the following with that
-- organization's id — never for every organization at once:
--
--     insert into public.role_permissions (role_id, permission_key)
--     select r.id, p.key
--       from public.roles r
--       cross join (values ('staff.assignments.read'),
--                          ('staff.assignments.manage')) as p(key)
--      where r.organization_id = '<organization id>'
--        and r.key in ('owner', 'manager')
--        and r.archived_at is null
--     on conflict do nothing;
-- -----------------------------------------------------------------------------
