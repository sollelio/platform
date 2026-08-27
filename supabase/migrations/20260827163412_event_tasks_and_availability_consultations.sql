-- =============================================================================
-- Sollelio v2 — Operational Staff MVP · Step 3 · Event tasks and availability
-- consultations
-- Migration: 20260827163412_event_tasks_and_availability_consultations.sql
--
-- Additive. Creates four relations, one token generator, one creation function,
-- one public read function, their RLS policies, column-scoped grants and four
-- permission-catalogue rows. It alters no Point 1 object and depends on no
-- Events Core relation. It adds exactly one constraint to a legacy relation,
-- public.submissions — see TENANCY below.
--
-- DOMAIN: a staff FUNCTION is a capability (Step 1). A TASK is concrete work on
-- one event: what, when, which capability it requires, and how many people it
-- needs at a minimum. minimum_people is a FLOOR, never a maximum, and nothing
-- here recommends or assigns anybody — assignment is a later step. A task's own
-- schedule is stored on the task because it may fall before or after the
-- event's formal date (loading in, striking down), so it cannot be derived from
-- the event.
--
-- A CONSULTATION asks a set of people whether they are available across one or
-- more existing events. There is no maximum: three is the batch size the house
-- happens to work in, which is a habit and not a rule, so the database refuses
-- only the empty set and repeated events. Each selected person gets one
-- RECIPIENT row carrying an opaque token — their private door. Answers are NOT
-- modelled here.
--
-- EVENT: the event is the LEGACY relation public.submissions. Step 3 reuses the
-- records the business already keeps; it introduces no second event table and
-- takes no dependency on the paused Events Core E1.
--
-- TENANCY: every relation carries organization_id explicitly and every FK is
-- composite, so no row can reach across organizations even if the application
-- passes the wrong id. public.submissions carried only its primary key, so §2.0
-- adds unique (id, tenant_id) to it — additive, no data change — which is what
-- lets the composite FKs pin an event to one organization structurally rather
-- than by convention. submissions.tenant_id IS an organizations.id: the C1
-- bootstrap preserved the identifier.
--
-- CREATION PATH: consultations, their covered events and their recipients have
-- NO insert grant and NO insert policy. The only way to create them is
-- public.create_staff_consultation, a SECURITY DEFINER function that enforces
-- the three invariants a CHECK cannot express: at least one distinct event,
-- every recipient consultable, every recipient with at least one compatible
-- task.
-- Closing the ordinary write door is what makes those invariants hold.
--
-- CONCLUDED: a link stays open until EVERY event it covers is concluded, and
-- concluded means the one explicit state the application already has —
-- status = 'Concluído', the value the house sets by hand. A date that has
-- passed is deliberately NOT the same thing; the baseline says so outright
-- ("Uma data que passou NÃO é um evento que aconteceu"), and an event whose
-- date slipped is exactly the one still worth asking about. Where the state is
-- simply unset, the link stays OPEN: closing a door early costs somebody their
-- answer, leaving it open costs nothing. Nor is an undated event refused —
-- tasks carry their own times, so nothing here needs the event's formal date.
--
-- AUDIT: as in Step 1, actor attribution is recorded on the rows themselves and
-- no audit trigger is installed; the reusable helper belongs to E1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permission catalogue. Seeded here, in the migration of the module that
--    owns them, and granted to nobody — see §7.
-- -----------------------------------------------------------------------------

insert into public.permissions (key, area, description) values
    ('staff.tasks.read',           'staff', 'Read the operational tasks recorded on an event.'),
    ('staff.tasks.manage',         'staff', 'Create, update, deactivate and reactivate the operational tasks of an event.'),
    ('staff.consultations.read',   'staff', 'Read availability consultations and their recipient links.'),
    ('staff.consultations.manage', 'staff', 'Create availability consultations, and close or revoke them.');

-- -----------------------------------------------------------------------------
-- 2. Relations.
-- -----------------------------------------------------------------------------

-- 2.0 The legacy event gains the composite-FK enabler. Additive: it creates a
--     unique index and changes no row. public.submissions is otherwise
--     untouched — no column, policy, grant or trigger of it is altered.
alter table public.submissions
    add constraint submissions_id_tenant_key unique (id, tenant_id);

-- 2.0b The recipient token. 32 random bytes rendered base64url — 43 opaque
--     characters, the only credential a consulted person ever holds. Generated
--     in the database so no client ever chooses a token.
create or replace function public.staff_consultation_token()
returns text
language sql
volatile
set search_path = pg_catalog
as $$
    select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

-- 2.1 event_tasks — concrete work on one event, requiring one capability.
create table if not exists public.event_tasks (
    id uuid not null default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    submission_id uuid not null,
    staff_function_id uuid not null,
    title text not null constraint event_tasks_title_not_blank check (btrim(title) <> ''),
    notes text,
    starts_at timestamptz not null,
    ends_at timestamptz,
    -- a floor, never a maximum: more people than this may end up assigned
    minimum_people integer not null default 1
        constraint event_tasks_minimum_people_positive check (minimum_people >= 1),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    created_by uuid references public.user_profiles (user_id) on delete set null,
    updated_at timestamptz,
    updated_by uuid references public.user_profiles (user_id) on delete set null,
    constraint event_tasks_pkey primary key (id),
    constraint event_tasks_window_ordered check (ends_at is null or ends_at >= starts_at),
    -- composite-FK enabler: lets a later relation pin both sides to one organization
    constraint event_tasks_id_organization_key unique (id, organization_id),
    -- the event is the legacy record, pinned to the same organization
    constraint event_tasks_submission_fkey
        foreign key (submission_id, organization_id)
        references public.submissions (id, tenant_id) on delete cascade,
    -- a capability is deactivated, never deleted, so a task may safely outlive its use
    constraint event_tasks_function_fkey
        foreign key (staff_function_id, organization_id)
        references public.staff_functions (id, organization_id) on delete restrict
);

-- 2.2 staff_consultations — one availability question over exactly three events.
create table if not exists public.staff_consultations (
    id uuid not null default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    title text not null constraint staff_consultations_title_not_blank check (btrim(title) <> ''),
    notes text,
    created_at timestamptz not null default now(),
    created_by uuid references public.user_profiles (user_id) on delete set null,
    closed_at timestamptz,
    closed_reason text,
    constraint staff_consultations_pkey primary key (id),
    constraint staff_consultations_closed_with_reason
        check ((closed_at is null) = (closed_reason is null)),
    constraint staff_consultations_id_organization_key unique (id, organization_id)
);

-- 2.3 staff_consultation_events — the covered events. slot fixes the order the
--     covered events are read in and keeps them distinct within a consultation;
--     it caps nothing, because the number of events is not capped.
create table if not exists public.staff_consultation_events (
    consultation_id uuid not null,
    submission_id uuid not null,
    organization_id uuid not null references public.organizations (id) on delete restrict,
    slot smallint not null constraint staff_consultation_events_slot_positive check (slot >= 1),
    constraint staff_consultation_events_pkey primary key (consultation_id, submission_id),
    constraint staff_consultation_events_slot_unique unique (consultation_id, slot),
    constraint staff_consultation_events_consultation_fkey
        foreign key (consultation_id, organization_id)
        references public.staff_consultations (id, organization_id) on delete cascade,
    constraint staff_consultation_events_submission_fkey
        foreign key (submission_id, organization_id)
        references public.submissions (id, tenant_id) on delete cascade
);

-- 2.4 staff_consultation_recipients — one private door per consulted person.
create table if not exists public.staff_consultation_recipients (
    id uuid not null default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    consultation_id uuid not null,
    staff_member_id uuid not null,
    token text not null default public.staff_consultation_token(),
    created_at timestamptz not null default now(),
    created_by uuid references public.user_profiles (user_id) on delete set null,
    revoked_at timestamptz,
    revoked_reason text,
    constraint staff_consultation_recipients_pkey primary key (id),
    constraint staff_consultation_recipients_token_key unique (token),
    constraint staff_consultation_recipients_token_length check (length(token) >= 32),
    constraint staff_consultation_recipients_revoked_with_reason
        check ((revoked_at is null) = (revoked_reason is null)),
    -- one door per person per consultation
    constraint staff_consultation_recipients_person_unique unique (consultation_id, staff_member_id),
    constraint staff_consultation_recipients_consultation_fkey
        foreign key (consultation_id, organization_id)
        references public.staff_consultations (id, organization_id) on delete cascade,
    -- a person is deactivated, never deleted
    constraint staff_consultation_recipients_member_fkey
        foreign key (staff_member_id, organization_id)
        references public.staff_members (id, organization_id) on delete restrict
);

-- -----------------------------------------------------------------------------
-- 3. Indexes — organization-leading reads, and support for every FK a delete
--    on a parent would otherwise have to scan.
-- -----------------------------------------------------------------------------

create index if not exists event_tasks_organization_submission_idx
    on public.event_tasks (organization_id, submission_id, starts_at, title);
create index if not exists event_tasks_submission_idx
    on public.event_tasks (submission_id, organization_id);
create index if not exists event_tasks_function_idx
    on public.event_tasks (staff_function_id, organization_id);
create index if not exists event_tasks_created_by_idx  on public.event_tasks (created_by);
create index if not exists event_tasks_updated_by_idx  on public.event_tasks (updated_by);

create index if not exists staff_consultations_organization_idx
    on public.staff_consultations (organization_id, created_at desc);
create index if not exists staff_consultations_created_by_idx on public.staff_consultations (created_by);

create index if not exists staff_consultation_events_submission_idx
    on public.staff_consultation_events (submission_id, organization_id);
create index if not exists staff_consultation_events_organization_idx
    on public.staff_consultation_events (organization_id, consultation_id);

create index if not exists staff_consultation_recipients_consultation_idx
    on public.staff_consultation_recipients (consultation_id, organization_id);
create index if not exists staff_consultation_recipients_member_idx
    on public.staff_consultation_recipients (staff_member_id, organization_id);
create index if not exists staff_consultation_recipients_created_by_idx
    on public.staff_consultation_recipients (created_by);

-- -----------------------------------------------------------------------------
-- 4. Row level security. As in Step 1: enable, never force, so the owning role
--    stays exempt and the policies may call has_permission without recursion.
-- -----------------------------------------------------------------------------

alter table public.event_tasks                    enable row level security;
alter table public.staff_consultations            enable row level security;
alter table public.staff_consultation_events      enable row level security;
alter table public.staff_consultation_recipients  enable row level security;

drop policy if exists event_tasks_select on public.event_tasks;
create policy event_tasks_select on public.event_tasks for select
    using (public.has_permission(organization_id, 'staff.tasks.read')
        or public.has_permission(organization_id, 'staff.tasks.manage'));
drop policy if exists event_tasks_insert on public.event_tasks;
create policy event_tasks_insert on public.event_tasks for insert
    with check (public.has_permission(organization_id, 'staff.tasks.manage'));
drop policy if exists event_tasks_update on public.event_tasks;
create policy event_tasks_update on public.event_tasks for update
    using      (public.has_permission(organization_id, 'staff.tasks.manage'))
    with check (public.has_permission(organization_id, 'staff.tasks.manage'));
drop policy if exists event_tasks_delete on public.event_tasks;
create policy event_tasks_delete on public.event_tasks for delete
    using (public.has_permission(organization_id, 'staff.tasks.manage'));

-- A consultation is created only through create_staff_consultation (§5), so the
-- three relations below carry no INSERT policy at all. Reading is gated on the
-- consultations permission; closing and revoking are the only ordinary writes.
drop policy if exists staff_consultations_select on public.staff_consultations;
create policy staff_consultations_select on public.staff_consultations for select
    using (public.has_permission(organization_id, 'staff.consultations.read')
        or public.has_permission(organization_id, 'staff.consultations.manage'));
drop policy if exists staff_consultations_update on public.staff_consultations;
create policy staff_consultations_update on public.staff_consultations for update
    using      (public.has_permission(organization_id, 'staff.consultations.manage'))
    with check (public.has_permission(organization_id, 'staff.consultations.manage'));
-- no INSERT policy: creation goes through create_staff_consultation, which is
-- what enforces exactly three events and a consultable, compatible recipient
-- no DELETE policy: a consultation is closed, never deleted — people were told

drop policy if exists staff_consultation_events_select on public.staff_consultation_events;
create policy staff_consultation_events_select on public.staff_consultation_events for select
    using (public.has_permission(organization_id, 'staff.consultations.read')
        or public.has_permission(organization_id, 'staff.consultations.manage'));
-- no INSERT, UPDATE or DELETE policy: the covered set is fixed when the
-- consultation is created and never edited afterwards

drop policy if exists staff_consultation_recipients_select on public.staff_consultation_recipients;
create policy staff_consultation_recipients_select on public.staff_consultation_recipients for select
    using (public.has_permission(organization_id, 'staff.consultations.read')
        or public.has_permission(organization_id, 'staff.consultations.manage'));
drop policy if exists staff_consultation_recipients_update on public.staff_consultation_recipients;
create policy staff_consultation_recipients_update on public.staff_consultation_recipients for update
    using      (public.has_permission(organization_id, 'staff.consultations.manage'))
    with check (public.has_permission(organization_id, 'staff.consultations.manage'));
-- no INSERT policy: a door is minted only by create_staff_consultation
-- no DELETE policy: a door is revoked, never deleted

-- -----------------------------------------------------------------------------
-- 5. Creating a consultation. The single door: it mints the covered set and the
--    recipient tokens in one transaction and enforces the invariants no CHECK
--    can express. It authorises through has_permission exactly as a
--    policy would, so being SECURITY DEFINER buys atomicity, not privilege.
-- -----------------------------------------------------------------------------

create or replace function public.create_staff_consultation(
    p_organization_id uuid,
    p_title text,
    p_notes text,
    p_submission_ids uuid[],
    p_staff_member_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
    v_actor uuid := auth.uid();
    v_consultation uuid;
    v_wanted int;
    v_covered int;
    v_member uuid;
begin
    if not public.has_permission(p_organization_id, 'staff.consultations.manage') then
        raise exception 'PERMISSION_DENIED';
    end if;

    if p_title is null or btrim(p_title) = '' then
        raise exception 'TITLE_REQUIRED';
    end if;

    -- At least one. There is no maximum: three is the batch the house works
    -- in, not a rule the database has any business holding.
    if p_submission_ids is null or array_length(p_submission_ids, 1) is null then
        raise exception 'NEEDS_AT_LEAST_ONE_EVENT';
    end if;

    -- Repeats are refused rather than quietly folded: a caller that sent the
    -- same event twice asked for something it did not get, and would otherwise
    -- only find out by collapsing on the primary key.
    v_wanted := (select count(distinct s) from unnest(p_submission_ids) as s);
    if v_wanted <> array_length(p_submission_ids, 1) then
        raise exception 'DUPLICATE_EVENTS';
    end if;

    if p_staff_member_ids is null or array_length(p_staff_member_ids, 1) is null then
        raise exception 'NO_RECIPIENTS';
    end if;

    -- every event must belong to this organization. The caller's ids are never
    -- trusted: they are re-resolved against submissions.tenant_id here.
    select count(*) into v_covered
      from public.submissions s
     where s.id = any (p_submission_ids)
       and s.tenant_id = p_organization_id;
    if v_covered <> v_wanted then
        raise exception 'EVENT_NOT_FOUND';
    end if;

    insert into public.staff_consultations (organization_id, title, notes, created_by)
    values (p_organization_id, btrim(p_title), nullif(btrim(coalesce(p_notes, '')), ''), v_actor)
    returning id into v_consultation;

    insert into public.staff_consultation_events (consultation_id, submission_id, organization_id, slot)
    select v_consultation, s.id, p_organization_id,
           (row_number() over (order by s.data_evento nulls last, s.id))::smallint
      from public.submissions s
     where s.id = any (p_submission_ids)
       and s.tenant_id = p_organization_id;

    foreach v_member in array p_staff_member_ids loop
        -- consultable is a per-person decision, separate from active and from
        -- engagement: a person may be assignable to work and never consulted
        if not exists (
            select 1 from public.staff_members m
             where m.id = v_member
               and m.organization_id = p_organization_id
               and m.is_active
               and m.may_be_consulted
        ) then
            raise exception 'MEMBER_NOT_CONSULTABLE';
        end if;

        -- a door that would open onto nothing is not minted
        if not exists (
            select 1
              from public.event_tasks t
              join public.staff_consultation_events ce
                on ce.submission_id = t.submission_id
               and ce.organization_id = t.organization_id
              join public.staff_member_functions mf
                on mf.staff_function_id = t.staff_function_id
               and mf.organization_id = t.organization_id
             where ce.consultation_id = v_consultation
               and mf.staff_member_id = v_member
               and t.is_active
        ) then
            raise exception 'MEMBER_WITHOUT_MATCHING_TASKS';
        end if;

        insert into public.staff_consultation_recipients
            (organization_id, consultation_id, staff_member_id, created_by)
        values (p_organization_id, v_consultation, v_member, v_actor);
    end loop;

    return v_consultation;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. The public door. Resolves exclusively from the token: no organization,
--    event or person identifier is accepted from the caller, and none of those
--    identifiers is handed back. Every failure — unknown token, revoked door,
--    closed consultation, suspended house, all events spent — collapses to the
--    same answer, so the response never confirms that a token exists.
-- -----------------------------------------------------------------------------

create or replace function public.staff_consultation_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
    with door as (
        select r.id as recipient_id, r.staff_member_id, r.organization_id,
               c.id as consultation_id, c.title, c.notes
          from public.staff_consultation_recipients r
          join public.staff_consultations c
            on c.id = r.consultation_id and c.organization_id = r.organization_id
          join public.staff_members m
            on m.id = r.staff_member_id and m.organization_id = r.organization_id
          join public.organizations o
            on o.id = r.organization_id
         where r.token = p_token
           and length(coalesce(p_token, '')) >= 32
           and r.revoked_at is null
           and c.closed_at is null
           and m.is_active
           and m.may_be_consulted
           and o.status = 'active'
    ),
    covered as (
        select ce.slot, s.id as submission_id, s.data_evento, s.status, et.nome as event_type
          from door d
          join public.staff_consultation_events ce
            on ce.consultation_id = d.consultation_id and ce.organization_id = d.organization_id
          join public.submissions s
            on s.id = ce.submission_id and s.tenant_id = d.organization_id
          left join public.event_types et
            on et.id = s.event_type_id and et.tenant_id = d.organization_id
    ),
    -- The link stays open while ANY covered event is still unconcluded, for
    -- any number of covered events. Concluded is the explicit state the house
    -- sets by hand; a date that has passed is not it, and a state left unset
    -- keeps the door open rather than shutting it on a guess.
    live as (
        select * from covered
         where coalesce(status, '') <> 'Concluído'
    ),
    -- only the tasks this person's own capabilities cover
    matched as (
        select l.slot, l.data_evento, l.event_type,
               t.id, t.title, t.starts_at, t.ends_at, t.minimum_people,
               f.name as function_name, f.area as function_area
          from door d
          join live l on true
          join public.event_tasks t
            on t.submission_id = l.submission_id and t.organization_id = d.organization_id
           and t.is_active
          join public.staff_member_functions mf
            on mf.staff_function_id = t.staff_function_id
           and mf.organization_id = d.organization_id
           and mf.staff_member_id = d.staff_member_id
          join public.staff_functions f
            on f.id = t.staff_function_id and f.organization_id = d.organization_id
    ),
    -- an event with no compatible task is not exposed at all
    grouped as (
        select m.slot, m.data_evento, m.event_type,
               jsonb_agg(jsonb_build_object(
                   'id', m.id, 'titulo', m.title,
                   'inicio', m.starts_at, 'fim', m.ends_at,
                   'minimo', m.minimum_people,
                   'funcao', m.function_name, 'area', m.function_area
               ) order by m.starts_at, m.title) as tarefas
          from matched m
         group by m.slot, m.data_evento, m.event_type
    )
    select case when exists (select 1 from live) then
        (select jsonb_build_object(
            'estado', 'aberta',
            'consulta', jsonb_build_object('titulo', d.title, 'nota', d.notes),
            'pessoa',   jsonb_build_object('nome', m.display_name),
            'eventos',  coalesce((
                select jsonb_agg(jsonb_build_object(
                           'ordem', g.slot, 'data', g.data_evento,
                           'tipo', g.event_type, 'tarefas', g.tarefas
                       ) order by g.data_evento, g.slot)
                  from grouped g), '[]'::jsonb)
         )
           from door d
           join public.staff_members m on m.id = d.staff_member_id)
    else jsonb_build_object('estado', 'terminado') end;
$$;

comment on function public.staff_consultation_view(text) is
    'Public door for one consultation recipient. Resolves only from the opaque token; returns the minimum projection the page paints and never an organization, event or person identifier.';

-- -----------------------------------------------------------------------------
-- 7. Privileges. The baseline's standing ALTER DEFAULT PRIVILEGES hands anon
--    full rights on every new public table, so each relation is revoked first
--    and then granted back column by column, to authenticated only.
-- -----------------------------------------------------------------------------

revoke all on table public.event_tasks                    from public, anon, authenticated;
revoke all on table public.staff_consultations            from public, anon, authenticated;
revoke all on table public.staff_consultation_events      from public, anon, authenticated;
revoke all on table public.staff_consultation_recipients  from public, anon, authenticated;

grant select on public.event_tasks to authenticated;
grant insert (organization_id, submission_id, staff_function_id, title, notes,
              starts_at, ends_at, minimum_people, is_active)
      on public.event_tasks to authenticated;
-- NOT organization_id and NOT submission_id: a task never moves organization,
-- and never moves event — it is deleted and rewritten instead
grant update (staff_function_id, title, notes, starts_at, ends_at,
              minimum_people, is_active, updated_at, updated_by)
      on public.event_tasks to authenticated;
grant delete on public.event_tasks to authenticated;

-- No INSERT anywhere below: create_staff_consultation is the only creation path.
grant select on public.staff_consultations to authenticated;
grant update (closed_at, closed_reason) on public.staff_consultations to authenticated;
grant select on public.staff_consultation_events to authenticated;
grant select on public.staff_consultation_recipients to authenticated;
grant update (revoked_at, revoked_reason) on public.staff_consultation_recipients to authenticated;

-- The token generator is a column default, never called from outside.
revoke all on function public.staff_consultation_token() from public, anon, authenticated;

revoke all on function public.create_staff_consultation(uuid, text, text, uuid[], uuid[])
    from public, anon, authenticated;
grant execute on function public.create_staff_consultation(uuid, text, text, uuid[], uuid[])
    to authenticated;

-- The only object in this migration anon may touch, and the only one that has
-- to be: a consulted person has no account.
revoke all on function public.staff_consultation_view(text) from public, anon, authenticated;
grant execute on function public.staff_consultation_view(text) to anon;
grant execute on function public.staff_consultation_view(text) to authenticated;
grant execute on function public.staff_consultation_view(text) to service_role;

-- -----------------------------------------------------------------------------
-- 8. Enabling the module for ONE organization.
--
-- This migration seeds the permission catalogue and grants it to nobody, so
-- applying it changes what no existing user can do. To switch the module on for
-- a single organization, run the following with that organization's id — never
-- as part of this migration, and never for every organization at once:
--
--     insert into public.role_permissions (role_id, permission_key)
--     select r.id, p.key
--       from public.roles r
--       cross join (values ('staff.tasks.read'), ('staff.tasks.manage'),
--                          ('staff.consultations.read'),
--                          ('staff.consultations.manage')) as p(key)
--      where r.organization_id = '<organization id>'
--        and r.key in ('owner', 'manager')
--        and r.archived_at is null
--     on conflict do nothing;
--
-- Step 1's staff.read / staff.manage are enabled the same way and are what the
-- catalogue screen needs; the keys above are what the task and consultation
-- screens need.
-- -----------------------------------------------------------------------------
