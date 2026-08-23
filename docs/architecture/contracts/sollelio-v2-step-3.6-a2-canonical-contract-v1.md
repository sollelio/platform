# Sollelio v2 — Step 3.6-A2 Canonical Implementation Contract

Status: **approved implementation input**  
Date: 2026-08-22  
Scope: Platform / IAM / permission RBAC / temporary support access / audit foundation  
Target relation inventory: **62** (the earlier count of 63 was a clerical arithmetic error)

## 1. Authority and precedence

This document is the self-contained implementation contract for Step 3.6-A2. It merges the relevant parts of the frozen Step 3.4-D target schema with the Step 3.4-D.1 corrections and closes the SQL-level choices which those architecture reports intentionally left conceptual.

Precedence:

1. This Step 3.6-A2 contract for the migration in scope.
2. Step 3.4-D.1 corrections.
3. Step 3.4-D frozen target.
4. The canonical legacy baseline, only as a description of the legacy starting point.

Implementation-level names for constraints, indexes, triggers and policies were not frozen in Step 3.4. Claude Code may choose clear deterministic English names. Their behaviour must match this document exactly.

## 2. Migration boundary

Create one new migration after `20260821024034_legacy_production_baseline.sql` containing these eleven `public` relations:

1. `user_profiles`
2. `platform_operators`
3. `organizations`
4. `organization_memberships`
5. `roles`
6. `permissions`
7. `role_permissions`
8. `membership_roles`
9. `support_access_grants`
10. `support_access_grant_permissions`
11. `audit_events`

Also create only the authorization and enforcement functions/triggers required by this contract.

This migration is schema-only. It must not:

- seed permissions, roles, organizations, profiles, memberships or operators;
- backfill legacy data;
- create `organization_settings` (removed permanently);
- create `event_product_settings` (a later Events migration);
- create any Events, Forms, Documents, Ledger, Notification or Diagnostics relation;
- rename, alter, drop or write any legacy object;
- use blanket `IF NOT EXISTS` to conceal drift.

## 3. Global conventions

- New surrogate PKs: `uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- Shared/association PKs are as specified below.
- Instants: `timestamptz`.
- `created_at`: `timestamptz NOT NULL DEFAULT now()` when listed.
- `updated_at`: nullable `timestamptz` when listed. No automatic `updated_at` trigger is created in this migration.
- Open business labels use `text`; machine vocabularies use `text` plus checks.
- Organization-scoped roots expose `UNIQUE (id, organization_id)` where specified.
- No organization ID may default from `auth.uid()` or session state.
- `created_by`/`granted_by` actor columns never grant authorization.
- All new tables have RLS enabled. Do **not** use `FORCE ROW LEVEL SECURITY`; service-role/backend infrastructure must retain its normal PostgreSQL bypass.
- No policy is created for `anon`.
- Revoke table and function privileges from `PUBLIC`/`anon`, then grant only the operations listed in §7 to `authenticated`.
- Every `SECURITY DEFINER` function uses fully qualified object names and `SET search_path = pg_catalog` (or an equivalently closed path). Revoke EXECUTE from PUBLIC.

## 4. Exact relation contracts

### 4.1 `user_profiles`

- `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `full_name text NULL`
- `display_name text NULL`
- `locale text NULL`
- `time_zone text NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NULL`

No separate `id` and no `organization_id`.

### 4.2 `platform_operators`

- `user_id uuid PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE`
- `platform_role text NOT NULL CHECK (platform_role IN ('support','admin'))`
- `granted_at timestamptz NOT NULL DEFAULT now()`
- `granted_by uuid NULL REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT`
- `revoked_at timestamptz NULL`
- check: `revoked_at IS NULL OR revoked_at >= granted_at`

The row grants platform powers only. `support` grants no organization access by itself. A revoked operator is inactive. No direct DELETE policy is provided.

### 4.3 `organizations`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `slug text NOT NULL UNIQUE`, regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- `name text NOT NULL`
- `status text NOT NULL CHECK (status IN ('active','suspended','closed'))`
- `access_code_prefix text NOT NULL UNIQUE`, regex `^[A-Z]{2,6}$`
- `locale text NOT NULL`
- `currency char(3) NOT NULL`
- `time_zone text NOT NULL`
- nullable identity fields: `legal_owner_name`, `legal_address`, `tax_id`, `iban`, `mbway_number`, `jurisdiction`, `website_domain`, `whatsapp_number`, `logo_path`, `tagline_line_1`, `tagline_line_2`, `slogan` (all `text`)
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NULL`
- `closed_at timestamptz NULL`
- check: `(status = 'closed') = (closed_at IS NOT NULL)`
- `UNIQUE (id, organization_id)` does not apply because the root identifier itself is the organization ID; expose the PK `id` only.

`time_zone` must be an exact name present in `pg_timezone_names`, enforced by a constraint trigger or a `BEFORE INSERT OR UPDATE OF time_zone` trigger. A closed organization is terminal: an update may not move it out of `closed`. No hard-delete policy.

All policies and helpers use `organizations.id` as the organization identifier.

### 4.4 `organization_memberships`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT`
- `user_id uuid NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE`
- `status text NOT NULL CHECK (status IN ('active','revoked'))`
- `joined_at timestamptz NOT NULL`
- `revoked_at timestamptz NULL`
- `created_by uuid NULL REFERENCES public.user_profiles(user_id) ON DELETE SET NULL`
- `UNIQUE (organization_id, user_id)`
- `UNIQUE (id, organization_id)`
- check: `(status = 'revoked') = (revoked_at IS NOT NULL)`

Memberships are revoked, not deleted. `id`, `organization_id`, `user_id` and
`joined_at` are immutable. An enforcement trigger permits the lifecycle change
only from `(active, revoked_at NULL)` to `(revoked, revoked_at NOT NULL)` and
forbids reactivation or rewriting revocation metadata. It may allow an
otherwise unchanged lifecycle update so the `created_by ON DELETE SET NULL`
FK action can complete. No DELETE policy.

### 4.5 `roles`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT`
- `key text NOT NULL`, regex `^[a-z][a-z0-9_]*$`, and `CHECK (key NOT IN ('support','admin'))`
- `name text NOT NULL`
- `description text NULL`
- `is_system boolean NOT NULL DEFAULT false`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `archived_at timestamptz NULL`
- `UNIQUE (organization_id, key)`
- `UNIQUE (id, organization_id)`

Roles are organization-owned. `support` and `admin` are forbidden as seeded organization-role concepts; they belong exclusively to `platform_operators`. An archived role grants no permissions and cannot receive a new membership assignment. Existing assignment rows may remain so an audited unarchive can restore them deliberately. No DELETE policy; archive instead. System roles are not hard-deleted.

### 4.6 `permissions`

- `key text PRIMARY KEY`, namespaced regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`
- `area text NOT NULL`, regex `^[a-z][a-z0-9_]*$`
- `description text NOT NULL CHECK (btrim(description) <> '')`

This is a platform-global, code-owned catalogue. It remains empty in this migration and is seeded in the next controlled migration.

### 4.7 `role_permissions`

- `role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE`
- `permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE RESTRICT`
- `granted_at timestamptz NOT NULL DEFAULT now()`
- `PRIMARY KEY (role_id, permission_key)`

### 4.8 `membership_roles`

- `membership_id uuid NOT NULL`
- `role_id uuid NOT NULL`
- `organization_id uuid NOT NULL`
- `granted_at timestamptz NOT NULL DEFAULT now()`
- `granted_by uuid NULL REFERENCES public.user_profiles(user_id) ON DELETE SET NULL`
- `PRIMARY KEY (membership_id, role_id)`
- composite FK `(membership_id, organization_id) REFERENCES public.organization_memberships(id, organization_id) ON DELETE CASCADE`
- composite FK `(role_id, organization_id) REFERENCES public.roles(id, organization_id) ON DELETE RESTRICT`

These composite FKs are the database proof that membership and role belong to the same organization.

### 4.9 `support_access_grants`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `operator_user_id uuid NOT NULL REFERENCES public.platform_operators(user_id) ON DELETE RESTRICT`
- `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT`
- `reason text NOT NULL CHECK (btrim(reason) <> '')`
- `ticket_reference text NULL`
- `granted_at timestamptz NOT NULL DEFAULT now()`
- `granted_by uuid NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT`
- `expires_at timestamptz NOT NULL`
- `revoked_at timestamptz NULL`
- `revoked_by uuid NULL REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT`
- `created_at timestamptz NOT NULL DEFAULT now()`
- checks:
  - `expires_at > granted_at`
  - `granted_by <> operator_user_id`
  - `(revoked_at IS NULL) = (revoked_by IS NULL)`
  - `revoked_at IS NULL OR revoked_at >= granted_at`
- partial index `(organization_id, operator_user_id) WHERE revoked_at IS NULL`

Enforcement: an update may only perform the single transition `(revoked_at, revoked_by) = (NULL,NULL)` to `(non-null, non-null)`. It may not change identity, organization, operator, reason, ticket, grantor, grant time, expiry, or already-written revocation metadata. No DELETE policy. A wider or different scope is a new grant.

### 4.10 `support_access_grant_permissions`

- `grant_id uuid NOT NULL REFERENCES public.support_access_grants(id) ON DELETE CASCADE`
- `permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE RESTRICT`
- `PRIMARY KEY (grant_id, permission_key)`

Rows are immutable: no UPDATE or DELETE policy. Direct INSERT is platform-admin-only and is accepted only in the same transaction in which the parent grant was created (`parent.granted_at = transaction_timestamp()` and not revoked). This lets the backend create a grant and its complete permission set atomically while preventing later widening. Revoking or narrowing access means revoking the grant and, if necessary, creating a new one.

### 4.11 `audit_events`

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `occurred_at timestamptz NOT NULL DEFAULT now()`
- `organization_id uuid NULL` — deliberately no FK
- `actor_kind text NOT NULL CHECK` in: `user`, `client_portal`, `support_agent`, `automation`, `integration`, `system`, `anonymous`, `migration`
- actor correlation columns, all nullable and deliberately without FKs:
  - `actor_user_id uuid`
  - `actor_membership_id uuid`
  - `actor_support_grant_id uuid`
  - `actor_portal_access_id uuid`
  - `actor_integration_key text`
  - `actor_automation_key text`
  - `actor_label text`
- `action text NOT NULL`, namespaced regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`
- `root_type text NOT NULL CHECK (btrim(root_type) <> '')`
- `root_id uuid NULL`
- `entity_type text NOT NULL CHECK (btrim(entity_type) <> '')`
- `entity_id uuid NULL`
- `change jsonb NULL`
- `request_id text NULL`
- `ip inet NULL`
- `user_agent text NULL`
- indexes:
  - `(organization_id, occurred_at DESC)`
  - `(root_type, root_id, occurred_at DESC)`
  - partial `(actor_support_grant_id) WHERE actor_support_grant_id IS NOT NULL`

Use one exact actor-correlation check:

- `user`: `actor_user_id` required; `actor_membership_id` optional; all support/portal/integration/automation correlation columns null.
- `support_agent`: `actor_user_id` and `actor_support_grant_id` required; membership/portal/integration/automation correlation columns null.
- `client_portal`: `actor_portal_access_id` required; user/membership/support/integration/automation correlation columns null.
- `integration`: `actor_integration_key` required; all UUID actor correlations and automation key null.
- `automation`: `actor_automation_key` required; all UUID actor correlations and integration key null.
- `system`, `anonymous`, `migration`: all actor UUID correlations and integration/automation keys null.
- `actor_label` is always an optional immutable display snapshot and is not part of exclusivity.

`audit_events` is append-only. No UPDATE/DELETE policy and no authenticated INSERT policy. Backend/service and later audited domain doors insert rows. It intentionally survives deletion of source actors/entities.

## 5. Exact helper contracts

All four authorization helpers are `STABLE SECURITY DEFINER`, fully qualified, closed-search-path functions. NULL input returns a safe denial (`false` or `none`). They use `auth.uid()` only as actor identity, never to derive an organization.

### `is_platform_admin()`

Signature: `public.is_platform_admin() RETURNS boolean`.

True only when `auth.uid()` has a `platform_operators` row with `platform_role = 'admin'` and `revoked_at IS NULL`.

### `shares_organization(p_other_user_id uuid)`

Signature: `public.shares_organization(p_other_user_id uuid) RETURNS boolean`.

True for the current user itself, or when current user and the supplied user both have active memberships in the same active organization. Platform status is not a shortcut.

### `has_permission(p_organization_id uuid, p_permission_key text)`

Signature: `public.has_permission(p_organization_id uuid, p_permission_key text) RETURNS boolean`.

True when the target organization is active and either:

1. membership path: current user has an active membership in that organization and some assigned, non-archived role grants the requested permission; or
2. support path: current user is an unrevoked platform operator and has an unrevoked grant for that organization satisfying `granted_at <= now() < expires_at`, with the requested permission in `support_access_grant_permissions`.

Being a platform admin is **not** an automatic organization-data bypass.

### `access_mode(p_organization_id uuid)`

Signature: `public.access_mode(p_organization_id uuid) RETURNS text`.

Return exactly `membership`, `support`, or `none`. An active membership in an active organization returns `membership`; otherwise an unrevoked platform operator with an unrevoked, currently valid support grant for that same active organization returns `support`; otherwise `none`. Membership takes precedence. This function identifies the actor path; authorization still uses `has_permission`.

### Enforcement helpers

Trigger functions for IANA time-zone validation, closed-organization terminal state, membership revoke-only updates, support-grant revoke-only updates and same-transaction support-permission insertion are permitted and required. They are not public APIs: revoke EXECUTE from PUBLIC and do not grant them to `authenticated`.

## 6. RLS contract

Policy names are implementation-level. Expressions and command coverage below are authoritative.

### `user_profiles`

- SELECT: own row, or `shares_organization(user_id)`, or platform admin.
- INSERT: own row only (`user_id = auth.uid()`).
- UPDATE: own row only, with the same `WITH CHECK`.
- no DELETE.

### `platform_operators`

- SELECT/UPDATE: platform admin only.
- INSERT: platform admin only and `granted_by = auth.uid()` for an authenticated caller. Service-role bootstrap bypasses RLS.
- Bootstrap of the first admin is a later service-role operation.
- no DELETE.

### `organizations`

- SELECT: platform admin, `has_permission(id, 'organization.read')`, or `has_permission(id, 'organization.manage')`.
- INSERT: platform admin only.
- UPDATE: platform admin or `has_permission(id, 'organization.manage')`, with the equivalent `WITH CHECK`.
- no DELETE.

### `organization_memberships`

- SELECT: own membership, `has_permission(organization_id, 'organization.read')`, or `has_permission(organization_id, 'members.manage')`.
- INSERT: `has_permission(organization_id, 'members.manage')` and `created_by = auth.uid()` for an authenticated caller.
- UPDATE: `has_permission(organization_id, 'members.manage')`; column privileges and the revoke-only trigger limit the operation to `status`/`revoked_at` and prohibit reactivation.
- no DELETE.

### `roles`

- SELECT: `has_permission(organization_id, 'organization.read')` or `has_permission(organization_id, 'members.manage')`.
- INSERT/UPDATE: `has_permission(organization_id, 'members.manage')`.
- no DELETE.

### `permissions`

- SELECT: any authenticated user.
- INSERT/UPDATE/DELETE: platform admin only.

### `role_permissions`

Resolve organization through `roles`.

- SELECT: `has_permission(role.organization_id, 'organization.read')` or `has_permission(role.organization_id, 'members.manage')`.
- INSERT/DELETE: `has_permission(role.organization_id, 'members.manage')`.
- no UPDATE.

### `membership_roles`

- SELECT: the membership owner, `has_permission(organization_id, 'organization.read')`, or `has_permission(organization_id, 'members.manage')`.
- INSERT: `has_permission(organization_id, 'members.manage')`, `granted_by = auth.uid()` for an authenticated caller, and the target role exists in that organization with `archived_at IS NULL`.
- DELETE: `has_permission(organization_id, 'members.manage')`.
- no UPDATE.

### `support_access_grants`

- SELECT: platform admin, the row's operator, or `has_permission(organization_id, 'organization.manage')`.
- INSERT: platform admin only and `granted_by = auth.uid()` for an authenticated caller.
- UPDATE: platform admin only and `revoked_by = auth.uid()` for an authenticated caller; column privileges and the revoke-only trigger restrict the write to revocation metadata.
- no DELETE.

### `support_access_grant_permissions`

Resolve visibility through the parent grant.

- SELECT: platform admin, the parent grant's operator, or `has_permission(parent.organization_id, 'organization.manage')`.
- INSERT: platform admin only plus the same-transaction guard.
- no UPDATE/DELETE.

### `audit_events`

- SELECT: platform admin, or a non-null organization row for which `has_permission(organization_id, 'audit.read')` is true.
- no direct authenticated INSERT/UPDATE/DELETE.

## 7. SQL privileges

After revoking all privileges from `PUBLIC`, `anon` and `authenticated`, grant `authenticated` only the following. Column-level UPDATE grants are intentional identity/immutability enforcement, not merely least-privilege decoration:

- `user_profiles`: SELECT, INSERT; UPDATE only (`full_name`, `display_name`, `locale`, `time_zone`, `updated_at`)
- `platform_operators`: SELECT, INSERT; UPDATE only (`platform_role`, `revoked_at`)
- `organizations`: SELECT, INSERT; UPDATE all business/lifecycle columns except immutable `id` and `created_at`
- `organization_memberships`: SELECT, INSERT; UPDATE only (`status`, `revoked_at`)
- `roles`: SELECT, INSERT; UPDATE only (`name`, `description`, `archived_at`)
- `permissions`: SELECT, INSERT, DELETE; UPDATE only (`area`, `description`) — permission `key` is stable
- `role_permissions`: SELECT, INSERT, DELETE
- `membership_roles`: SELECT, INSERT, DELETE
- `support_access_grants`: SELECT, INSERT; UPDATE only (`revoked_at`, `revoked_by`)
- `support_access_grant_permissions`: SELECT, INSERT
- `audit_events`: SELECT

Grant EXECUTE on the four authorization helpers to `authenticated`; do not grant enforcement-trigger functions.

RLS remains the authorization decision layer over these SQL privileges.

## 8. Required static review output

Before any execution, Claude Code must report:

- migration path, SHA256, byte and line counts;
- exact table/function/trigger/policy/index inventory;
- grants/revokes and RLS state;
- proof that the baseline is byte-identical to HEAD;
- proof that no legacy relation is the target of DDL/DML;
- full diff;
- any implementation choice not explicitly covered here.

It must not run the migration locally or remotely, commit, push, link, repair history or install anything. Stop after attaching the migration for ChatGPT review.
