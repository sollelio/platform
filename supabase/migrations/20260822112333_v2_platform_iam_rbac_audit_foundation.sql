-- =============================================================================
-- Sollelio v2 — Step 3.6-A2 · Platform / IAM / RBAC / Audit foundation
-- Migration: 20260822112333_v2_platform_iam_rbac_audit_foundation.sql
--
-- Implements, exactly and only, the Step 3.6-A2 canonical implementation
-- contract, version 1 (sollelio-v2-step-3.6-a2-canonical-contract-v1.md,
-- SHA256 6dfae1d7daa0f83242595c7562fced414912fb4dbe48d1d832fb4d313d4d7b06),
-- which merges the frozen Step 3.4-D target schema with the Step 3.4-D.1
-- corrections for this scope and closes the SQL-level choices.
--
-- Contents, side by side with the untouched legacy schema:
--   §1  eleven new public relations:
--       user_profiles, platform_operators, organizations,
--       organization_memberships, roles, permissions, role_permissions,
--       membership_roles, support_access_grants,
--       support_access_grant_permissions, audit_events
--   §2  four STABLE SECURITY DEFINER authorization helpers:
--       is_platform_admin(), shares_organization(uuid),
--       has_permission(uuid, text), access_mode(uuid)
--   §3  five enforcement trigger functions and their triggers
--   §4  row level security (ENABLE, never FORCE) and policies
--   §5  SQL privileges (revoke from PUBLIC/anon/authenticated, then the
--       contract's minimal grants to authenticated)
--
-- This migration is schema-only. It seeds no rows, backfills nothing, and
-- neither reads, alters, drops nor writes any legacy object. Organization is
-- the domain concept; no organization identifier ever defaults from session
-- state. audit_events is append-only and deliberately has no actor FKs.
-- =============================================================================

-- =============================================================================
-- §1 · Relations
-- =============================================================================

-- §1.1 user_profiles — one profile row per auth user. No separate id and no
-- organization_id: profiles are platform-level, organization access is decided
-- exclusively through organization_memberships.
create table public.user_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    full_name text,
    display_name text,
    locale text,
    time_zone text,
    created_at timestamptz not null default now(),
    updated_at timestamptz
);

-- §1.2 platform_operators — platform powers only. A row here grants no
-- organization access by itself; support access always requires an explicit
-- support_access_grant. A revoked operator is inactive.
create table public.platform_operators (
    user_id uuid primary key references public.user_profiles (user_id) on delete cascade,
    platform_role text not null
        constraint platform_operators_platform_role_check
        check (platform_role in ('support', 'admin')),
    granted_at timestamptz not null default now(),
    granted_by uuid references public.user_profiles (user_id) on delete restrict,
    revoked_at timestamptz,
    constraint platform_operators_revoked_after_granted
        check (revoked_at is null or revoked_at >= granted_at)
);

-- §1.3 organizations — the domain root. The PK id is the organization
-- identifier used by every policy and helper. A closed organization is
-- terminal (enforced by trigger in §3). time_zone must be an exact IANA name
-- present in pg_timezone_names (enforced by trigger in §3).
create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    slug text not null
        constraint organizations_slug_format
        check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    name text not null,
    status text not null
        constraint organizations_status_check
        check (status in ('active', 'suspended', 'closed')),
    access_code_prefix text not null
        constraint organizations_access_code_prefix_format
        check (access_code_prefix ~ '^[A-Z]{2,6}$'),
    locale text not null,
    currency char(3) not null,
    time_zone text not null,
    legal_owner_name text,
    legal_address text,
    tax_id text,
    iban text,
    mbway_number text,
    jurisdiction text,
    website_domain text,
    whatsapp_number text,
    logo_path text,
    tagline_line_1 text,
    tagline_line_2 text,
    slogan text,
    created_at timestamptz not null default now(),
    updated_at timestamptz,
    closed_at timestamptz,
    constraint organizations_slug_unique unique (slug),
    constraint organizations_access_code_prefix_unique unique (access_code_prefix),
    constraint organizations_closed_state_consistent
        check ((status = 'closed') = (closed_at is not null))
);

-- §1.4 organization_memberships — the single origin of per-organization
-- authorization. Memberships are revoked, never deleted; identity columns and
-- joined_at are immutable and the lifecycle transition is one-way (enforced by
-- trigger in §3). UNIQUE (id, organization_id) is the composite target that
-- lets child tables prove organization consistency at the database level.
create table public.organization_memberships (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    user_id uuid not null references public.user_profiles (user_id) on delete cascade,
    status text not null
        constraint organization_memberships_status_check
        check (status in ('active', 'revoked')),
    joined_at timestamptz not null,
    revoked_at timestamptz,
    created_by uuid references public.user_profiles (user_id) on delete set null,
    constraint organization_memberships_org_user_unique unique (organization_id, user_id),
    constraint organization_memberships_id_org_unique unique (id, organization_id),
    constraint organization_memberships_revoked_state_consistent
        check ((status = 'revoked') = (revoked_at is not null))
);

-- §1.5 roles — organization-owned role definitions. 'support' and 'admin' are
-- forbidden keys: those concepts belong exclusively to platform_operators and
-- are never organization roles. Roles are archived, never deleted. An archived
-- role grants no permissions and cannot receive new membership assignments;
-- existing assignment rows may remain so an audited unarchive can restore them
-- deliberately.
create table public.roles (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    key text not null
        constraint roles_key_format
        check (key ~ '^[a-z][a-z0-9_]*$')
        constraint roles_key_not_platform
        check (key not in ('support', 'admin')),
    name text not null,
    description text,
    is_system boolean not null default false,
    created_at timestamptz not null default now(),
    archived_at timestamptz,
    constraint roles_org_key_unique unique (organization_id, key),
    constraint roles_id_org_unique unique (id, organization_id)
);

-- §1.6 permissions — the platform-global, code-owned permission catalogue.
-- Deliberately left empty here; it is seeded by the next controlled migration.
create table public.permissions (
    key text primary key
        constraint permissions_key_format
        check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    area text not null
        constraint permissions_area_format
        check (area ~ '^[a-z][a-z0-9_]*$'),
    description text not null
        constraint permissions_description_not_blank
        check (btrim(description) <> '')
);

-- §1.7 role_permissions — which permissions a role grants.
create table public.role_permissions (
    role_id uuid not null references public.roles (id) on delete cascade,
    permission_key text not null references public.permissions (key) on delete restrict,
    granted_at timestamptz not null default now(),
    constraint role_permissions_pkey primary key (role_id, permission_key)
);

-- §1.8 membership_roles — role assignments. The two composite foreign keys
-- are the database proof that the membership and the role belong to the same
-- organization; organization_id can never be forged independently.
create table public.membership_roles (
    membership_id uuid not null,
    role_id uuid not null,
    organization_id uuid not null,
    granted_at timestamptz not null default now(),
    granted_by uuid references public.user_profiles (user_id) on delete set null,
    constraint membership_roles_pkey primary key (membership_id, role_id),
    constraint membership_roles_membership_same_org
        foreign key (membership_id, organization_id)
        references public.organization_memberships (id, organization_id) on delete cascade,
    constraint membership_roles_role_same_org
        foreign key (role_id, organization_id)
        references public.roles (id, organization_id) on delete restrict
);

-- §1.9 support_access_grants — append + revoke. A grant is immutable except
-- for the single revocation transition (enforced by trigger in §3). A wider
-- or different scope is always a new grant. A grant with no permission rows
-- grants zero access. No self-grant.
create table public.support_access_grants (
    id uuid primary key default gen_random_uuid(),
    operator_user_id uuid not null references public.platform_operators (user_id) on delete restrict,
    organization_id uuid not null references public.organizations (id) on delete restrict,
    reason text not null
        constraint support_access_grants_reason_not_blank
        check (btrim(reason) <> ''),
    ticket_reference text,
    granted_at timestamptz not null default now(),
    granted_by uuid not null references public.user_profiles (user_id) on delete restrict,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    revoked_by uuid references public.user_profiles (user_id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint support_access_grants_expires_after_granted
        check (expires_at > granted_at),
    constraint support_access_grants_no_self_grant
        check (granted_by <> operator_user_id),
    constraint support_access_grants_revocation_pair
        check ((revoked_at is null) = (revoked_by is null)),
    constraint support_access_grants_revoked_after_granted
        check (revoked_at is null or revoked_at >= granted_at)
);

create index support_access_grants_active_org_operator_idx
    on public.support_access_grants (organization_id, operator_user_id)
    where revoked_at is null;

-- §1.10 support_access_grant_permissions — the explicit permission set of a
-- grant. Rows are immutable and may only be inserted in the same transaction
-- that created the parent grant (enforced by trigger in §3), so a grant and
-- its complete permission set are created atomically and never widened later.
create table public.support_access_grant_permissions (
    grant_id uuid not null references public.support_access_grants (id) on delete cascade,
    permission_key text not null references public.permissions (key) on delete restrict,
    constraint support_access_grant_permissions_pkey primary key (grant_id, permission_key)
);

-- §1.11 audit_events — append-only audit trail. Deliberately no foreign keys
-- to organizations, actors or entities: audit rows must survive deletion of
-- their sources. Exactly one actor-correlation shape is valid per actor_kind.
create table public.audit_events (
    id uuid primary key default gen_random_uuid(),
    occurred_at timestamptz not null default now(),
    organization_id uuid,
    actor_kind text not null
        constraint audit_events_actor_kind_check
        check (actor_kind in (
            'user', 'client_portal', 'support_agent', 'automation',
            'integration', 'system', 'anonymous', 'migration'
        )),
    actor_user_id uuid,
    actor_membership_id uuid,
    actor_support_grant_id uuid,
    actor_portal_access_id uuid,
    actor_integration_key text,
    actor_automation_key text,
    actor_label text,
    action text not null
        constraint audit_events_action_format
        check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    root_type text not null
        constraint audit_events_root_type_not_blank
        check (btrim(root_type) <> ''),
    root_id uuid,
    entity_type text not null
        constraint audit_events_entity_type_not_blank
        check (btrim(entity_type) <> ''),
    entity_id uuid,
    change jsonb,
    request_id text,
    ip inet,
    user_agent text,
    -- actor_label is an optional immutable display snapshot for every kind
    -- and takes no part in the exclusivity rules below.
    constraint audit_events_actor_correlation check (
        case actor_kind
            when 'user' then
                actor_user_id is not null
                and actor_support_grant_id is null
                and actor_portal_access_id is null
                and actor_integration_key is null
                and actor_automation_key is null
            when 'support_agent' then
                actor_user_id is not null
                and actor_support_grant_id is not null
                and actor_membership_id is null
                and actor_portal_access_id is null
                and actor_integration_key is null
                and actor_automation_key is null
            when 'client_portal' then
                actor_portal_access_id is not null
                and actor_user_id is null
                and actor_membership_id is null
                and actor_support_grant_id is null
                and actor_integration_key is null
                and actor_automation_key is null
            when 'integration' then
                actor_integration_key is not null
                and actor_user_id is null
                and actor_membership_id is null
                and actor_support_grant_id is null
                and actor_portal_access_id is null
                and actor_automation_key is null
            when 'automation' then
                actor_automation_key is not null
                and actor_user_id is null
                and actor_membership_id is null
                and actor_support_grant_id is null
                and actor_portal_access_id is null
                and actor_integration_key is null
            else
                -- system, anonymous, migration
                actor_user_id is null
                and actor_membership_id is null
                and actor_support_grant_id is null
                and actor_portal_access_id is null
                and actor_integration_key is null
                and actor_automation_key is null
        end
    )
);

create index audit_events_org_occurred_idx
    on public.audit_events (organization_id, occurred_at desc);

create index audit_events_root_occurred_idx
    on public.audit_events (root_type, root_id, occurred_at desc);

create index audit_events_support_grant_idx
    on public.audit_events (actor_support_grant_id)
    where actor_support_grant_id is not null;

-- =============================================================================
-- §2 · Authorization helpers
--
-- All four are STABLE SECURITY DEFINER with a closed search_path and fully
-- qualified references. NULL input returns a safe denial. auth.uid() is used
-- only as actor identity, never to derive an organization. Because these
-- functions are owned by the migration role (which owns the tables and is not
-- subject to their RLS — FORCE ROW LEVEL SECURITY is deliberately not used),
-- calling them from policies cannot recurse into RLS.
-- =============================================================================

-- True only for an unrevoked platform operator with platform_role = 'admin'.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
    select exists (
        select 1
        from public.platform_operators po
        where po.user_id = auth.uid()
          and po.platform_role = 'admin'
          and po.revoked_at is null
    );
$$;

-- True for the current user itself, or when the current user and the supplied
-- user each hold an active membership in the same active organization.
-- Platform status is not a shortcut.
create function public.shares_organization(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
    select case
        when p_other_user_id is null or auth.uid() is null then false
        when p_other_user_id = auth.uid() then true
        else exists (
            select 1
            from public.organization_memberships mine
            join public.organization_memberships other
              on other.organization_id = mine.organization_id
            join public.organizations org
              on org.id = mine.organization_id
            where mine.user_id = auth.uid()
              and mine.status = 'active'
              and other.user_id = p_other_user_id
              and other.status = 'active'
              and org.status = 'active'
        )
    end;
$$;

-- True when the target organization is active and the current user reaches
-- the permission either through an active membership whose assigned,
-- non-archived roles grant it, or through an unrevoked, currently valid
-- support grant that lists it explicitly. An archived role immediately stops
-- granting permissions. Platform admin is not an automatic organization-data
-- bypass.
create function public.has_permission(p_organization_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
    select case
        when p_organization_id is null
          or p_permission_key is null
          or auth.uid() is null then false
        else
            exists (
                select 1
                from public.organizations org
                where org.id = p_organization_id
                  and org.status = 'active'
            )
            and (
                exists (
                    select 1
                    from public.organization_memberships m
                    join public.membership_roles mr
                      on mr.membership_id = m.id
                    join public.roles r
                      on r.id = mr.role_id
                    join public.role_permissions rp
                      on rp.role_id = r.id
                    where m.organization_id = p_organization_id
                      and m.user_id = auth.uid()
                      and m.status = 'active'
                      and r.organization_id = p_organization_id
                      and r.archived_at is null
                      and rp.permission_key = p_permission_key
                )
                or exists (
                    select 1
                    from public.platform_operators po
                    join public.support_access_grants g
                      on g.operator_user_id = po.user_id
                    join public.support_access_grant_permissions gp
                      on gp.grant_id = g.id
                    where po.user_id = auth.uid()
                      and po.revoked_at is null
                      and g.organization_id = p_organization_id
                      and g.revoked_at is null
                      and g.granted_at <= now()
                      and now() < g.expires_at
                      and gp.permission_key = p_permission_key
                )
            )
    end;
$$;

-- Returns exactly 'membership', 'support' or 'none'. Membership takes
-- precedence over support. 'support' requires cumulatively: an active target
-- organization, an unrevoked platform operator row for the current user, and
-- an unrevoked grant for that same organization currently inside its validity
-- window. This function identifies the actor path only; authorization
-- decisions always go through has_permission.
create function public.access_mode(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
    select case
        when p_organization_id is null or auth.uid() is null then 'none'
        when exists (
            select 1
            from public.organization_memberships m
            join public.organizations org
              on org.id = m.organization_id
            where m.organization_id = p_organization_id
              and m.user_id = auth.uid()
              and m.status = 'active'
              and org.status = 'active'
        ) then 'membership'
        when exists (
            select 1
            from public.support_access_grants g
            join public.platform_operators po
              on po.user_id = g.operator_user_id
            join public.organizations org
              on org.id = g.organization_id
            where g.organization_id = p_organization_id
              and g.operator_user_id = auth.uid()
              and po.revoked_at is null
              and org.status = 'active'
              and g.revoked_at is null
              and g.granted_at <= now()
              and now() < g.expires_at
        ) then 'support'
        else 'none'
    end;
$$;

-- =============================================================================
-- §3 · Enforcement trigger functions and triggers
--
-- These are not public APIs: EXECUTE is revoked from PUBLIC in §5 and they are
-- never granted to authenticated. They run with invoker rights, so any lookup
-- they perform is itself subject to RLS and fails closed.
-- =============================================================================

-- organizations.time_zone must be an exact name present in pg_timezone_names.
create function public.enforce_organization_time_zone()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if new.time_zone is null or not exists (
        select 1
        from pg_catalog.pg_timezone_names tz
        where tz.name = new.time_zone
    ) then
        raise exception
            'organizations.time_zone must be an exact IANA time zone name present in pg_timezone_names (got: %)',
            new.time_zone;
    end if;
    return new;
end;
$$;

create trigger organizations_time_zone_valid
    before insert or update of time_zone on public.organizations
    for each row
    execute function public.enforce_organization_time_zone();

-- A closed organization is terminal: no update may move it out of 'closed'.
create function public.enforce_organization_closed_terminal()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if old.status = 'closed' and new.status is distinct from 'closed' then
        raise exception
            'organizations: a closed organization is terminal and cannot leave the closed status';
    end if;
    return new;
end;
$$;

create trigger organizations_closed_is_terminal
    before update on public.organizations
    for each row
    execute function public.enforce_organization_closed_terminal();

-- organization_memberships updates keep identity immutable and allow only the
-- one-way lifecycle transition (status, revoked_at): ('active', NULL) ->
-- ('revoked', non-null). Reactivation and rewriting already-written revocation
-- metadata are forbidden. An update that leaves both lifecycle columns
-- untouched is allowed so the created_by ON DELETE SET NULL FK action can
-- complete.
create function public.enforce_membership_revoke_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if new.id is distinct from old.id
        or new.organization_id is distinct from old.organization_id
        or new.user_id is distinct from old.user_id
        or new.joined_at is distinct from old.joined_at
    then
        raise exception
            'organization_memberships: id, organization_id, user_id and joined_at are immutable';
    end if;
    if new.status is not distinct from old.status
        and new.revoked_at is not distinct from old.revoked_at
    then
        return new;
    end if;
    if not (old.status = 'active' and old.revoked_at is null
            and new.status = 'revoked' and new.revoked_at is not null)
    then
        raise exception
            'organization_memberships: the only lifecycle change allowed is the one-way revocation (active, NULL) -> (revoked, non-null); reactivation and rewriting revocation metadata are forbidden';
    end if;
    return new;
end;
$$;

create trigger organization_memberships_revoke_only
    before update on public.organization_memberships
    for each row
    execute function public.enforce_membership_revoke_only();

-- support_access_grants updates may only perform the single revocation
-- transition (revoked_at, revoked_by): (NULL, NULL) -> (non-null, non-null).
-- Identity, organization, operator, reason, ticket, grantor, grant time,
-- expiry, creation time and already-written revocation metadata are immutable.
create function public.enforce_support_grant_revoke_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if new.id is distinct from old.id
        or new.operator_user_id is distinct from old.operator_user_id
        or new.organization_id is distinct from old.organization_id
        or new.reason is distinct from old.reason
        or new.ticket_reference is distinct from old.ticket_reference
        or new.granted_at is distinct from old.granted_at
        or new.granted_by is distinct from old.granted_by
        or new.expires_at is distinct from old.expires_at
        or new.created_at is distinct from old.created_at
    then
        raise exception
            'support_access_grants: grants are append + revoke; only the revocation transition may be written';
    end if;
    if not (old.revoked_at is null and old.revoked_by is null
            and new.revoked_at is not null and new.revoked_by is not null)
    then
        raise exception
            'support_access_grants: an update must be exactly the revocation transition (revoked_at, revoked_by): (NULL, NULL) -> (non-null, non-null)';
    end if;
    return new;
end;
$$;

create trigger support_access_grants_revoke_only
    before update on public.support_access_grants
    for each row
    execute function public.enforce_support_grant_revoke_only();

-- support_access_grant_permissions rows are accepted only in the very
-- transaction that created the parent grant, and only while the parent is
-- unrevoked. This lets the backend create a grant and its complete permission
-- set atomically while preventing any later widening. Invoker rights: if RLS
-- hides the parent grant from the inserting user, the insert fails closed.
create function public.enforce_support_grant_permission_same_transaction()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
    v_granted_at timestamptz;
    v_revoked_at timestamptz;
begin
    select g.granted_at, g.revoked_at
      into v_granted_at, v_revoked_at
      from public.support_access_grants g
     where g.id = new.grant_id;

    if not found then
        raise exception
            'support_access_grant_permissions: parent grant % does not exist or is not visible',
            new.grant_id;
    end if;
    if v_revoked_at is not null then
        raise exception
            'support_access_grant_permissions: parent grant % is revoked',
            new.grant_id;
    end if;
    if v_granted_at is distinct from pg_catalog.transaction_timestamp() then
        raise exception
            'support_access_grant_permissions: permissions may only be attached in the same transaction that created grant %',
            new.grant_id;
    end if;
    return new;
end;
$$;

create trigger support_access_grant_permissions_same_transaction
    before insert on public.support_access_grant_permissions
    for each row
    execute function public.enforce_support_grant_permission_same_transaction();

-- =============================================================================
-- §4 · Row level security
--
-- ENABLE on every table; FORCE is deliberately not used so that owner and
-- service-role/backend infrastructure retain their normal PostgreSQL bypass.
-- No policy exists for anon. RLS is the authorization decision layer over the
-- SQL privileges granted in §5.
-- =============================================================================

alter table public.user_profiles enable row level security;
alter table public.platform_operators enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.support_access_grant_permissions enable row level security;
alter table public.audit_events enable row level security;

-- §4.1 user_profiles: own row, organization colleagues, or platform admin
-- may read; only the owner writes; no delete.
create policy user_profiles_select on public.user_profiles
    for select to authenticated
    using (
        user_id = auth.uid()
        or public.shares_organization(user_id)
        or public.is_platform_admin()
    );

create policy user_profiles_insert on public.user_profiles
    for insert to authenticated
    with check (user_id = auth.uid());

create policy user_profiles_update on public.user_profiles
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- §4.2 platform_operators: platform admin only. Bootstrap of the first admin
-- is a later service-role operation. No delete.
create policy platform_operators_select on public.platform_operators
    for select to authenticated
    using (public.is_platform_admin());

create policy platform_operators_insert on public.platform_operators
    for insert to authenticated
    with check (
        public.is_platform_admin()
        and granted_by = auth.uid()
    );

create policy platform_operators_update on public.platform_operators
    for update to authenticated
    using (public.is_platform_admin())
    with check (public.is_platform_admin());

-- §4.3 organizations: read via organization.read, manage via
-- organization.manage; creation is platform-admin only. No delete.
create policy organizations_select on public.organizations
    for select to authenticated
    using (
        public.is_platform_admin()
        or public.has_permission(id, 'organization.read')
        or public.has_permission(id, 'organization.manage')
    );

create policy organizations_insert on public.organizations
    for insert to authenticated
    with check (public.is_platform_admin());

create policy organizations_update on public.organizations
    for update to authenticated
    using (
        public.is_platform_admin()
        or public.has_permission(id, 'organization.manage')
    )
    with check (
        public.is_platform_admin()
        or public.has_permission(id, 'organization.manage')
    );

-- §4.4 organization_memberships: own membership or organization.read to see;
-- members.manage to write. Revoked, never deleted.
create policy organization_memberships_select on public.organization_memberships
    for select to authenticated
    using (
        user_id = auth.uid()
        or public.has_permission(organization_id, 'organization.read')
        or public.has_permission(organization_id, 'members.manage')
    );

create policy organization_memberships_insert on public.organization_memberships
    for insert to authenticated
    with check (
        public.has_permission(organization_id, 'members.manage')
        and created_by = auth.uid()
    );

create policy organization_memberships_update on public.organization_memberships
    for update to authenticated
    using (public.has_permission(organization_id, 'members.manage'))
    with check (public.has_permission(organization_id, 'members.manage'));

-- §4.5 roles: organization.read to see, members.manage to write. Archived,
-- never deleted.
create policy roles_select on public.roles
    for select to authenticated
    using (
        public.has_permission(organization_id, 'organization.read')
        or public.has_permission(organization_id, 'members.manage')
    );

create policy roles_insert on public.roles
    for insert to authenticated
    with check (public.has_permission(organization_id, 'members.manage'));

create policy roles_update on public.roles
    for update to authenticated
    using (public.has_permission(organization_id, 'members.manage'))
    with check (public.has_permission(organization_id, 'members.manage'));

-- §4.6 permissions: a readable platform-global catalogue; only platform
-- admins maintain it.
create policy permissions_select on public.permissions
    for select to authenticated
    using (true);

create policy permissions_insert on public.permissions
    for insert to authenticated
    with check (public.is_platform_admin());

create policy permissions_update on public.permissions
    for update to authenticated
    using (public.is_platform_admin())
    with check (public.is_platform_admin());

create policy permissions_delete on public.permissions
    for delete to authenticated
    using (public.is_platform_admin());

-- §4.7 role_permissions: the organization is resolved through roles. No
-- update: a mapping is added or removed.
create policy role_permissions_select on public.role_permissions
    for select to authenticated
    using (
        exists (
            select 1
            from public.roles r
            where r.id = role_permissions.role_id
              and (
                  public.has_permission(r.organization_id, 'organization.read')
                  or public.has_permission(r.organization_id, 'members.manage')
              )
        )
    );

create policy role_permissions_insert on public.role_permissions
    for insert to authenticated
    with check (
        exists (
            select 1
            from public.roles r
            where r.id = role_permissions.role_id
              and public.has_permission(r.organization_id, 'members.manage')
        )
    );

create policy role_permissions_delete on public.role_permissions
    for delete to authenticated
    using (
        exists (
            select 1
            from public.roles r
            where r.id = role_permissions.role_id
              and public.has_permission(r.organization_id, 'members.manage')
        )
    );

-- §4.8 membership_roles: the membership owner or organization.read to see;
-- members.manage to assign or remove. No update.
create policy membership_roles_select on public.membership_roles
    for select to authenticated
    using (
        exists (
            select 1
            from public.organization_memberships m
            where m.id = membership_roles.membership_id
              and m.user_id = auth.uid()
        )
        or public.has_permission(organization_id, 'organization.read')
        or public.has_permission(organization_id, 'members.manage')
    );

create policy membership_roles_insert on public.membership_roles
    for insert to authenticated
    with check (
        public.has_permission(organization_id, 'members.manage')
        and granted_by = auth.uid()
        and exists (
            select 1
            from public.roles r
            where r.id = membership_roles.role_id
              and r.organization_id = membership_roles.organization_id
              and r.archived_at is null
        )
    );

create policy membership_roles_delete on public.membership_roles
    for delete to authenticated
    using (public.has_permission(organization_id, 'members.manage'));

-- §4.9 support_access_grants: visible to platform admins, the grant's
-- operator, and the organization's managers. Created and revoked by platform
-- admins only; the revoke-only trigger supplies column-level immutability.
create policy support_access_grants_select on public.support_access_grants
    for select to authenticated
    using (
        public.is_platform_admin()
        or operator_user_id = auth.uid()
        or public.has_permission(organization_id, 'organization.manage')
    );

create policy support_access_grants_insert on public.support_access_grants
    for insert to authenticated
    with check (
        public.is_platform_admin()
        and granted_by = auth.uid()
    );

create policy support_access_grants_update on public.support_access_grants
    for update to authenticated
    using (public.is_platform_admin())
    with check (
        public.is_platform_admin()
        and revoked_by = auth.uid()
    );

-- §4.10 support_access_grant_permissions: visibility resolves through the
-- parent grant; insert is platform-admin only plus the same-transaction
-- trigger guard. Rows are immutable: no update, no delete.
create policy support_access_grant_permissions_select on public.support_access_grant_permissions
    for select to authenticated
    using (
        public.is_platform_admin()
        or exists (
            select 1
            from public.support_access_grants g
            where g.id = support_access_grant_permissions.grant_id
              and (
                  g.operator_user_id = auth.uid()
                  or public.has_permission(g.organization_id, 'organization.manage')
              )
        )
    );

create policy support_access_grant_permissions_insert on public.support_access_grant_permissions
    for insert to authenticated
    with check (public.is_platform_admin());

-- §4.11 audit_events: platform admins, and holders of audit.read for the
-- row's organization, may read. No direct authenticated insert, update or
-- delete: backend/service and later audited domain doors append rows.
create policy audit_events_select on public.audit_events
    for select to authenticated
    using (
        public.is_platform_admin()
        or (
            organization_id is not null
            and public.has_permission(organization_id, 'audit.read')
        )
    );

-- =============================================================================
-- §5 · SQL privileges
--
-- Revoke everything from PUBLIC, anon and authenticated, then grant back to
-- authenticated exactly the operations the contract lists. Column-level
-- UPDATE grants are intentional identity/immutability enforcement, not merely
-- least-privilege decoration. RLS remains the authorization decision layer
-- above these privileges. service_role is not touched: its bypass is
-- infrastructure, never functional logic.
-- =============================================================================

revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.platform_operators from public, anon, authenticated;
revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.organization_memberships from public, anon, authenticated;
revoke all on table public.roles from public, anon, authenticated;
revoke all on table public.permissions from public, anon, authenticated;
revoke all on table public.role_permissions from public, anon, authenticated;
revoke all on table public.membership_roles from public, anon, authenticated;
revoke all on table public.support_access_grants from public, anon, authenticated;
revoke all on table public.support_access_grant_permissions from public, anon, authenticated;
revoke all on table public.audit_events from public, anon, authenticated;

grant select, insert on table public.user_profiles to authenticated;
grant update (full_name, display_name, locale, time_zone, updated_at)
    on table public.user_profiles to authenticated;

grant select, insert on table public.platform_operators to authenticated;
grant update (platform_role, revoked_at)
    on table public.platform_operators to authenticated;

grant select, insert on table public.organizations to authenticated;
grant update (slug, name, status, access_code_prefix, locale, currency,
              time_zone, legal_owner_name, legal_address, tax_id, iban,
              mbway_number, jurisdiction, website_domain, whatsapp_number,
              logo_path, tagline_line_1, tagline_line_2, slogan, updated_at,
              closed_at)
    on table public.organizations to authenticated;

grant select, insert on table public.organization_memberships to authenticated;
grant update (status, revoked_at)
    on table public.organization_memberships to authenticated;

grant select, insert on table public.roles to authenticated;
grant update (name, description, archived_at)
    on table public.roles to authenticated;

grant select, insert, delete on table public.permissions to authenticated;
grant update (area, description)
    on table public.permissions to authenticated;

grant select, insert, delete on table public.role_permissions to authenticated;
grant select, insert, delete on table public.membership_roles to authenticated;

grant select, insert on table public.support_access_grants to authenticated;
grant update (revoked_at, revoked_by)
    on table public.support_access_grants to authenticated;

grant select, insert on table public.support_access_grant_permissions to authenticated;
grant select on table public.audit_events to authenticated;

-- Authorization helpers: callable by authenticated only.
revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.shares_organization(uuid) from public, anon, authenticated;
revoke all on function public.has_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.access_mode(uuid) from public, anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.access_mode(uuid) to authenticated;

-- Enforcement trigger functions: not public APIs; no grants to anyone. The
-- explicit authenticated revoke counters the baseline's default ACL, which
-- grants EXECUTE on new public functions to authenticated automatically.
revoke all on function public.enforce_organization_time_zone() from public, anon, authenticated;
revoke all on function public.enforce_organization_closed_terminal() from public, anon, authenticated;
revoke all on function public.enforce_membership_revoke_only() from public, anon, authenticated;
revoke all on function public.enforce_support_grant_revoke_only() from public, anon, authenticated;
revoke all on function public.enforce_support_grant_permission_same_transaction() from public, anon, authenticated;
