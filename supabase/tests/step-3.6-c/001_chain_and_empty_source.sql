-- Step 3.6-C · Layer A.1 + A.2 — migration chain and empty-source no-op
--
-- Contract: docs/architecture/contracts/sollelio-v2-step-3.6-c-bootstrap-contract-v6.md
-- (SHA256 83c988cf465aac6b302b2d17f0d1ab44e6e7daa0e4bff5f1938b1b8977e52d01), §11.1 A.1 and A.2.
--
-- Locally the legacy tables are empty after `db reset --no-seed`, so the
-- applied bootstrap is a genuine no-op. This file proves exactly that, and
-- proves the chain it depends on is present.
--
-- Deliberately EXTENSION-TOLERANT (the Step 3.6-B1.1 lesson, restated for
-- permissions in contract §6.2 item 6):
--   * it never asserts a total row count for public.permissions;
--   * it never asserts a global "every role has four permissions" invariant;
--   * it never pins a column list that a later migration may extend.
-- Every assertion is filtered to what this step owns.
--
-- Layer A contains NO negative/abort case. Contract §11.1 A.5: a failure
-- produced by a psql \i or \ir meta-command cannot be caught by throws_ok,
-- because psql expands the meta-command client-side and the server never sees
-- it. Every fail-closed case belongs to the Layer B exact-file harness.
--
-- Catalogue and aggregate assertions only: no application data, no PII.
-- Transaction-wrapped and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- ---------------------------------------------------------------------------
-- A.1 · migration-chain history
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260825103955'),
  'history contains the Step 3.6-C bootstrap migration 20260825103955');
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260824004513'),
  'history still contains the B1 core permission catalogue it depends on');
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260822112333'),
  'history still contains the A2 foundation it depends on');
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260821024034'),
  'history still contains the canonical legacy baseline');

-- the bootstrap is applied strictly after the catalogue it reads (P8)
select cmp_ok('20260825103955'::text, '>', '20260824004513'::text,
  'the bootstrap version sorts strictly after the B1 catalogue version');

-- ---------------------------------------------------------------------------
-- A.2 · empty-source no-op
--
-- The local database has no legacy rows, so the bootstrap must have inserted
-- nothing and fabricated nothing. Contract §9.3: the no-op is allowed only
-- when all three source counts and all ten scoped/excluded target counts are
-- zero, and target emptiness is asserted unconditionally.
-- ---------------------------------------------------------------------------

-- the three legacy sources really are empty locally, so this IS the
-- empty-source shape and the assertions below mean what they say
select is((select count(*) from public.tenants), 0::bigint,
  'empty-source shape: public.tenants holds no rows locally');
select is((select count(*) from public.memberships), 0::bigint,
  'empty-source shape: public.memberships holds no rows locally');
select is((select count(*) from auth.users), 0::bigint,
  'empty-source shape: auth.users holds no rows locally');

-- the seven populated targets are still empty (P1 held; nothing was fabricated)
select is((select count(*) from public.user_profiles), 0::bigint,
  'empty-source no-op: user_profiles is empty');
select is((select count(*) from public.organizations), 0::bigint,
  'empty-source no-op: organizations is empty');
select is((select count(*) from public.organization_memberships), 0::bigint,
  'empty-source no-op: organization_memberships is empty');
select is((select count(*) from public.roles), 0::bigint,
  'empty-source no-op: roles is empty');
select is((select count(*) from public.role_permissions), 0::bigint,
  'empty-source no-op: role_permissions is empty');
select is((select count(*) from public.membership_roles), 0::bigint,
  'empty-source no-op: membership_roles is empty');
select is((select count(*) from public.audit_events), 0::bigint,
  'empty-source no-op: audit_events is empty');

-- the three excluded relations are empty (P11a and P11b held)
select is((select count(*) from public.platform_operators), 0::bigint,
  'excluded: platform_operators is empty — no platform operator was bootstrapped');
select is((select count(*) from public.support_access_grants), 0::bigint,
  'excluded: support_access_grants is empty — no support access was bootstrapped');
select is((select count(*) from public.support_access_grant_permissions), 0::bigint,
  'excluded: support_access_grant_permissions is empty');

-- ---------------------------------------------------------------------------
-- contracted catalogue state this step depends on (P8), filtered to the four
-- core keys — never a total count of public.permissions
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.permissions
    where key in ('organization.read','organization.manage','members.manage','audit.read')),
  4::bigint,
  'P8 dependency: all four core Platform/IAM permission keys are present');

-- ---------------------------------------------------------------------------
-- the bootstrap wrote nothing to the deferred legacy relation either
-- ---------------------------------------------------------------------------
select is((select count(*) from public.app_config), 0::bigint,
  'deferred: public.app_config is untouched and empty locally');

select * from finish();
rollback;
