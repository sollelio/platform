-- =============================================================================
-- Sollelio v2 — Operational Staff MVP · Step 1 · Staff and Function catalogues
-- Migration: 20260827122046_staff_catalogue.sql
--
-- Additive only. Creates three relations, their RLS policies, column-scoped
-- grants and two permission-catalogue rows. It alters no Point 1 object and
-- depends on no Events Core relation.
--
-- DOMAIN, stated so it is not re-derived later:
--   * A staff member is an operational PERSON, not an authorization role.
--   * A staff function is an operational CAPABILITY ("what can this person
--     do?"), not an RBAC permission. Assignments answer capability only; what,
--     when and how many is a future event-task concern and is NOT modelled here.
--   * Most staff members have NO platform account. user_id is nullable, and a
--     staff member is never required to have one.
--   * A backoffice user may ALSO be a staff member: user_id links the two
--     without merging them.
--   * engagement is an ENGAGEMENT CATEGORY (responsible / core / occasional),
--     entirely separate from the is_active lifecycle.
--   * may_be_consulted is separate again: a person can be assignable to work
--     while never receiving an availability consultation. It is a per-person
--     value set through the UI — no person is named in this migration.
--
-- TENANCY: organization_id is explicit on all three relations, every
-- cross-relation foreign key is composite on (id, organization_id), and every
-- policy is has_permission(organization_id, key). No cross-organization row is
-- reachable, and no organization identifier is hardcoded.
--
-- AUDIT: Point 1 ships the audit_events RELATION but no reusable per-row audit
-- trigger helper — that helper belongs to the paused Events Core E1. This
-- migration therefore records actor attribution on the rows themselves
-- (created_by / updated_by, the A2 convention) and deliberately installs no
-- audit trigger, rather than inventing a second mechanism that would collide
-- with E1 when it resumes.
--
-- All identifiers and comments are English; user-facing language is unchanged.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Permission catalogue — two rows, the minimum to view and manage Staff.
--    Written in the B1 idiom: a single insert, no ON CONFLICT.
--
--    A catalogue row grants NOTHING on its own. No role_permissions row is
--    seeded here, deliberately: enabling the module for one organization is a
--    separate, explicit grant against that organization's own roles (roles are
--    per-organization), so the module is never switched on for every
--    organization at once. See the note at the end of this file.
-- -----------------------------------------------------------------------------
insert into public.permissions (key, area, description) values
    ('staff.read',   'staff', 'Read the operational staff catalogue and each person''s functions.'),
    ('staff.manage', 'staff', 'Create and update staff members and operational functions, assign functions, and deactivate or reactivate them.');


-- -----------------------------------------------------------------------------
-- 2. Relations.
-- -----------------------------------------------------------------------------

-- 2.1 staff_functions — an operational capability, grouped by area.
create table if not exists public.staff_functions (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null
                    references public.organizations (id) on delete restrict,
    name            text not null check (btrim(name) <> ''),
    area            text not null check (btrim(area) <> ''),
    is_active       boolean not null default true,
    sort_order      int not null default 0,
    created_at      timestamptz not null default now(),
    created_by      uuid null references public.user_profiles (user_id) on delete set null,
    updated_at      timestamptz null,
    updated_by      uuid null references public.user_profiles (user_id) on delete set null,
    constraint staff_functions_organization_name_key unique (organization_id, name),
    -- composite-FK enabler: lets the association table pin both sides to one organization
    constraint staff_functions_id_organization_key   unique (id, organization_id)
);

-- 2.2 staff_members — an operational person.
create table if not exists public.staff_members (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null
                     references public.organizations (id) on delete restrict,
    -- the name exactly as the business writes and uses it; never normalized
    display_name     text not null check (btrim(display_name) <> ''),
    email            text null,
    phone            text null,
    engagement       text not null default 'occasional'
                     check (engagement in ('responsible', 'core', 'occasional')),
    is_active        boolean not null default true,
    -- whether this person may receive a FUTURE availability consultation.
    -- Separate from is_active and from engagement: a person may be fully
    -- active and assignable and still never be consulted.
    may_be_consulted boolean not null default true,
    notes            text null,
    -- optional link to a platform identity. NULL for most staff, who have no
    -- account at all; set where a backoffice user is also a staff member.
    user_id          uuid null references public.user_profiles (user_id) on delete set null,
    created_at       timestamptz not null default now(),
    created_by       uuid null references public.user_profiles (user_id) on delete set null,
    updated_at       timestamptz null,
    updated_by       uuid null references public.user_profiles (user_id) on delete set null,
    constraint staff_members_id_organization_key unique (id, organization_id)
);

-- one staff row per platform identity per organization; unlinked rows are
-- unconstrained, because most people have no account
create unique index if not exists staff_members_organization_user_uniq
    on public.staff_members (organization_id, user_id) where user_id is not null;

-- 2.3 staff_member_functions — the organization-safe association.
create table if not exists public.staff_member_functions (
    staff_member_id   uuid not null,
    staff_function_id uuid not null,
    -- explicit tenant ownership: the association carries its own organization
    -- and both composite FKs pin it to the same one, so a row can never join
    -- a person of one organization to a function of another
    organization_id   uuid not null
                      references public.organizations (id) on delete restrict,
    assigned_at       timestamptz not null default now(),
    assigned_by       uuid null references public.user_profiles (user_id) on delete set null,
    constraint staff_member_functions_pkey primary key (staff_member_id, staff_function_id),
    constraint staff_member_functions_member_fkey
        foreign key (staff_member_id, organization_id)
        references public.staff_members (id, organization_id) on delete cascade,
    constraint staff_member_functions_function_fkey
        foreign key (staff_function_id, organization_id)
        references public.staff_functions (id, organization_id) on delete restrict
);


-- -----------------------------------------------------------------------------
-- 3. Indexes — organization-leading reads, and support for every FK a delete
--    on a parent would otherwise have to scan.
-- -----------------------------------------------------------------------------
create index if not exists staff_functions_organization_area_idx
    on public.staff_functions (organization_id, area, sort_order, name);
create index if not exists staff_functions_created_by_idx on public.staff_functions (created_by);
create index if not exists staff_functions_updated_by_idx on public.staff_functions (updated_by);

create index if not exists staff_members_organization_name_idx
    on public.staff_members (organization_id, display_name);
create index if not exists staff_members_user_idx       on public.staff_members (user_id);
create index if not exists staff_members_created_by_idx on public.staff_members (created_by);
create index if not exists staff_members_updated_by_idx on public.staff_members (updated_by);

create index if not exists staff_member_functions_function_idx
    on public.staff_member_functions (staff_function_id, organization_id);
create index if not exists staff_member_functions_organization_idx
    on public.staff_member_functions (organization_id);
create index if not exists staff_member_functions_assigned_by_idx
    on public.staff_member_functions (assigned_by);


-- -----------------------------------------------------------------------------
-- 4. RLS. ENABLE only — FORCE is deliberately not set, matching the Point 1
--    convention: the owner must stay exempt so a migration can seed or repair
--    rows. has_permission(organization_id, key) is the only predicate; no
--    policy tests a role name.
-- -----------------------------------------------------------------------------
alter table public.staff_functions        enable row level security;
alter table public.staff_members          enable row level security;
alter table public.staff_member_functions enable row level security;

drop policy if exists staff_functions_select on public.staff_functions;
create policy staff_functions_select on public.staff_functions for select
    using (public.has_permission(organization_id, 'staff.read')
        or public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_functions_insert on public.staff_functions;
create policy staff_functions_insert on public.staff_functions for insert
    with check (public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_functions_update on public.staff_functions;
create policy staff_functions_update on public.staff_functions for update
    using      (public.has_permission(organization_id, 'staff.manage'))
    with check (public.has_permission(organization_id, 'staff.manage'));
-- no DELETE policy: a function is deactivated, never deleted, so history that
-- references it stays readable

drop policy if exists staff_members_select on public.staff_members;
create policy staff_members_select on public.staff_members for select
    using (public.has_permission(organization_id, 'staff.read')
        or public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_members_insert on public.staff_members;
create policy staff_members_insert on public.staff_members for insert
    with check (public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_members_update on public.staff_members;
create policy staff_members_update on public.staff_members for update
    using      (public.has_permission(organization_id, 'staff.manage'))
    with check (public.has_permission(organization_id, 'staff.manage'));
-- no DELETE policy: a person is deactivated, never deleted

drop policy if exists staff_member_functions_select on public.staff_member_functions;
create policy staff_member_functions_select on public.staff_member_functions for select
    using (public.has_permission(organization_id, 'staff.read')
        or public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_member_functions_insert on public.staff_member_functions;
create policy staff_member_functions_insert on public.staff_member_functions for insert
    with check (public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_member_functions_delete on public.staff_member_functions;
create policy staff_member_functions_delete on public.staff_member_functions for delete
    using (public.has_permission(organization_id, 'staff.manage'));
-- no UPDATE policy: an assignment is added or removed, never edited in place


-- -----------------------------------------------------------------------------
-- 5. Privileges — explicit revoke, then column-scoped grants. created_at and
--    created_by appear in no grant; updated_at and updated_by appear in no
--    insert. anon receives nothing.
-- -----------------------------------------------------------------------------
revoke all on table public.staff_functions        from public, anon, authenticated;
revoke all on table public.staff_members          from public, anon, authenticated;
revoke all on table public.staff_member_functions from public, anon, authenticated;

grant select on public.staff_functions to authenticated;
grant insert (organization_id, name, area, is_active, sort_order)
      on public.staff_functions to authenticated;
grant update (name, area, is_active, sort_order, updated_at, updated_by)
      on public.staff_functions to authenticated;

grant select on public.staff_members to authenticated;
grant insert (organization_id, display_name, email, phone, engagement,
              is_active, may_be_consulted, notes, user_id)
      on public.staff_members to authenticated;
-- NOT organization_id: a person never moves between organizations
grant update (display_name, email, phone, engagement, is_active,
              may_be_consulted, notes, user_id, updated_at, updated_by)
      on public.staff_members to authenticated;

grant select on public.staff_member_functions to authenticated;
grant insert (staff_member_id, staff_function_id, organization_id, assigned_by)
      on public.staff_member_functions to authenticated;
grant delete on public.staff_member_functions to authenticated;


-- -----------------------------------------------------------------------------
-- 6. Enabling the module for ONE organization.
--
-- Deliberately NOT done here. public.roles is per-organization, so granting
-- these two keys is a per-organization act; doing it in the migration would
-- switch Staff on for every organization that exists now or later. The
-- operator enables it for a single organization with:
--
--   insert into public.role_permissions (role_id, permission_key)
--   select r.id, k.key
--     from public.roles r
--     cross join (values ('staff.read'), ('staff.manage')) as k(key)
--    where r.organization_id = <the organization's id>
--      and r.key in ('owner', 'manager');
--
-- No organization identifier is written into this file.
-- -----------------------------------------------------------------------------
