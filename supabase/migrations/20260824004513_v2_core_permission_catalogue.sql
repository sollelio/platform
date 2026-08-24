-- =============================================================================
-- Sollelio v2 — Step 3.6-B1 · core permission catalogue
-- Migration: 20260824004513_v2_core_permission_catalogue.sql
--
-- Seeds the initial, code-owned core permission catalogue: the four
-- Platform/IAM permission keys that the Step 3.6-A2 row level security
-- policies already reference by name. Until these rows exist, every A2 policy
-- that resolves through public.has_permission denies access, because the
-- permission key it looks for is absent from the catalogue.
--
-- public.permissions is a platform-global, CODE-OWNED catalogue. It is not
-- organization data: it carries no organization_id, no role assignment and no
-- tenant scoping. Rows enter it only through controlled migrations like this
-- one, never through a seed file, a fixture or an application write path.
--
-- Scope of this migration: the four core Platform/IAM permissions and nothing
-- else. Domain-specific permissions — events, forms, documents, ledger,
-- notifications, and every other product or engine concern — are deliberately
-- NOT added here. Each one is added by the migration of the product or engine
-- that owns it, so that a permission and the code enforcing it always arrive
-- together and remain reviewable as one unit.
--
-- Fail-closed: this is an INITIAL catalogue seed. If public.permissions
-- already holds any row, the migration aborts rather than adding to, merging
-- with or silently diverging from an unexpected pre-existing catalogue. There
-- is no ON CONFLICT clause: a duplicate key must fail loudly.
--
-- The only relation written by this migration is public.permissions.
-- =============================================================================

-- Guard: refuse to run against a non-empty catalogue.
do $$
begin
    if exists (select 1 from public.permissions) then
        raise exception
            'public.permissions is not empty: this migration seeds the INITIAL core permission catalogue and refuses to run against a pre-existing catalogue';
    end if;
end;
$$;

insert into public.permissions (key, area, description) values
    ('organization.read',
     'organization',
     'Read organization identity, settings, roles, and membership metadata.'),
    ('organization.manage',
     'organization',
     'Manage organization identity, settings, and lifecycle.'),
    ('members.manage',
     'members',
     'Manage organization memberships, roles, and permission assignments.'),
    ('audit.read',
     'audit',
     'Read organization audit events.');
