-- Step 3.6-B1 · core permission catalogue verification
--
-- Verifies the four core Platform/IAM permission rows seeded by migration
-- 20260824004513_v2_core_permission_catalogue, and nothing beyond them.
--
-- Deliberately EXTENSION-TOLERANT. This suite must keep passing as the
-- platform grows, so it never constrains global state:
--   * it does not assert a total row count for public.permissions — later
--     product and engine migrations add their own domain permissions;
--   * it does not assert that no other permission key exists;
--   * it does not pin the exact column list of public.permissions — a future
--     migration may add a column without invalidating the B1 contract;
--   * it does not require any other A2 table to stay empty — later migrations
--     may legitimately seed roles, organizations or audit rows.
-- Every assertion below is filtered to the four core keys this step owns.
--
-- Catalogue and aggregate assertions only: no application data, no PII.
-- Transaction-wrapped and rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- the four keys this step owns; every assertion below filters to this set
create temporary table core_keys(key text primary key) on commit drop;
insert into core_keys(key) values
  ('organization.read'), ('organization.manage'), ('members.manage'), ('audit.read');

-- ---------------------------------------------------------------------------
-- 1 · the B1 migration is present in local history
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260824004513'),
  'history contains the core permission catalogue migration 20260824004513');
select ok(exists(select 1 from supabase_migrations.schema_migrations
    where version = '20260822112333'),
  'history still contains the A2 foundation it depends on');

-- ---------------------------------------------------------------------------
-- 2 · all four core rows are present — filtered, so extra catalogue rows
--     added by later migrations cannot break this
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.permissions p where p.key in (select key from core_keys)),
  4::bigint,
  'the four core permission keys are present exactly once each');

select is(
  (select array_agg(p.key order by p.key) from public.permissions p
    where p.key in (select key from core_keys)),
  array['audit.read', 'members.manage', 'organization.manage', 'organization.read'],
  'the four core keys are exactly the contracted ones');

-- ---------------------------------------------------------------------------
-- 3 · exact area and description of every contracted row
-- ---------------------------------------------------------------------------
select is(
  (select p.area from public.permissions p where p.key = v.key), v.area,
  'area of ' || v.key)
from (values
  ('organization.read',   'organization'),
  ('organization.manage', 'organization'),
  ('members.manage',      'members'),
  ('audit.read',          'audit')) as v(key, area);

select is(
  (select p.description from public.permissions p where p.key = v.key), v.description,
  'description of ' || v.key)
from (values
  ('organization.read',
   'Read organization identity, settings, roles, and membership metadata.'),
  ('organization.manage',
   'Manage organization identity, settings, and lifecycle.'),
  ('members.manage',
   'Manage organization memberships, roles, and permission assignments.'),
  ('audit.read',
   'Read organization audit events.')) as v(key, description);

-- ---------------------------------------------------------------------------
-- 4 · namespace and grouping invariants, scoped to the four core rows only
-- ---------------------------------------------------------------------------
select is((select count(*) from public.permissions p
    where p.key in (select key from core_keys)
      and p.key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  0::bigint, 'every core key is namespaced as area.action');
select is((select count(*) from public.permissions p
    where p.key in (select key from core_keys)
      and p.area !~ '^[a-z][a-z0-9_]*$'),
  0::bigint, 'every core area is a lower snake_case token');
select is((select count(*) from public.permissions p
    where p.key in (select key from core_keys)
      and split_part(p.key, '.', 1) <> p.area),
  0::bigint, 'the key namespace always equals the area column, for the core rows');
select is(
  (select array_agg(distinct p.area order by p.area) from public.permissions p
    where p.key in (select key from core_keys)),
  array['audit', 'members', 'organization'],
  'the core rows span exactly three areas');
select is((select count(*) from public.permissions p
    where p.key in (select key from core_keys) and p.area = 'organization'),
  2::bigint, 'the organization area groups exactly two core permissions');

-- ---------------------------------------------------------------------------
-- 5 · every core description is present and non-blank
-- ---------------------------------------------------------------------------
select is((select count(*) from public.permissions p
    where p.key in (select key from core_keys)
      and (p.description is null or btrim(p.description) = '')),
  0::bigint, 'no core description is null or blank');

-- ---------------------------------------------------------------------------
-- 6 · the catalogue is code-owned and platform-global. These are structural
--     invariants, not a column inventory: a future migration may add columns,
--     but it must never scope this catalogue to an organization or a role.
-- ---------------------------------------------------------------------------
select hasnt_column('public'::name, 'permissions'::name, 'organization_id'::name,
  'permissions has no organization_id: the catalogue is platform-global');
select hasnt_column('public'::name, 'permissions'::name, 'role_id'::name,
  'permissions has no role_id: assignment lives in role_permissions');

select * from finish();
rollback;
