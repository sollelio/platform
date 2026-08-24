-- Step 3.6-A3 · 001 — catalogue verification against contract v1
-- Runs as postgres; read-only against catalogs; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- ---------------------------------------------------------------------------
-- 1 · the eleven A2 tables exist, and nothing beyond legacy+A2 exists
-- ---------------------------------------------------------------------------
select has_table('public'::name, u.t, 'table exists: ' || u.t)
from unnest(array['user_profiles','platform_operators','organizations',
  'organization_memberships','roles','permissions','role_permissions',
  'membership_roles','support_access_grants','support_access_grant_permissions',
  'audit_events']::name[]) as u(t);

select is(
  (select count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  45::bigint,
  'exactly 45 base tables in public (34 legacy + 11 A2)');

-- ---------------------------------------------------------------------------
-- 2 · RLS enabled on all 11; FORCE on none
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('user_profiles','platform_operators','organizations',
       'organization_memberships','roles','permissions','role_permissions',
       'membership_roles','support_access_grants','support_access_grant_permissions',
       'audit_events')
     and c.relrowsecurity and not c.relforcerowsecurity),
  11::bigint,
  'all 11 A2 tables have RLS enabled and none has FORCE RLS');

-- ---------------------------------------------------------------------------
-- 3 · exactly the 9 A2 functions, with the contracted properties
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in
     ('is_platform_admin','shares_organization','has_permission','access_mode',
      'enforce_organization_time_zone','enforce_organization_closed_terminal',
      'enforce_membership_revoke_only','enforce_support_grant_revoke_only',
      'enforce_support_grant_permission_same_transaction')),
  9::bigint,
  'exactly 9 A2 functions, no overloads');

-- the four authorization helpers: STABLE, SECURITY DEFINER, closed search_path
select is((select p.provolatile from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), 's'::"char", 'STABLE: ' || u.f)
from unnest(array['public.is_platform_admin()','public.shares_organization(uuid)',
  'public.has_permission(uuid,text)','public.access_mode(uuid)']) as u(f);
select is((select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), true, 'SECURITY DEFINER: ' || u.f)
from unnest(array['public.is_platform_admin()','public.shares_organization(uuid)',
  'public.has_permission(uuid,text)','public.access_mode(uuid)']) as u(f);
select is((select p.proconfig from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), array['search_path=pg_catalog'], 'closed search_path: ' || u.f)
from unnest(array['public.is_platform_admin()','public.shares_organization(uuid)',
  'public.has_permission(uuid,text)','public.access_mode(uuid)']) as u(f);

-- the five enforcement functions: invoker rights, closed search_path, trigger type
select is((select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), false, 'invoker rights: ' || u.f)
from unnest(array['public.enforce_organization_time_zone()',
  'public.enforce_organization_closed_terminal()','public.enforce_membership_revoke_only()',
  'public.enforce_support_grant_revoke_only()',
  'public.enforce_support_grant_permission_same_transaction()']) as u(f);
select is((select p.proconfig from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), array['search_path=pg_catalog'], 'closed search_path: ' || u.f)
from unnest(array['public.enforce_organization_time_zone()',
  'public.enforce_organization_closed_terminal()','public.enforce_membership_revoke_only()',
  'public.enforce_support_grant_revoke_only()',
  'public.enforce_support_grant_permission_same_transaction()']) as u(f);
select is((select p.prorettype::regtype::text from pg_catalog.pg_proc p where p.oid = to_regprocedure(u.f)), 'trigger', 'returns trigger: ' || u.f)
from unnest(array['public.enforce_organization_time_zone()',
  'public.enforce_organization_closed_terminal()','public.enforce_membership_revoke_only()',
  'public.enforce_support_grant_revoke_only()',
  'public.enforce_support_grant_permission_same_transaction()']) as u(f);

-- ---------------------------------------------------------------------------
-- 4 · exactly 5 triggers, on the contracted tables
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_trigger g
   where g.tgrelid = ('public.' || v.t)::regclass and not g.tgisinternal),
  v.n,
  'trigger count on ' || v.t)
from (values
  ('organizations', 2::bigint), ('organization_memberships', 1::bigint),
  ('support_access_grants', 1::bigint), ('support_access_grant_permissions', 1::bigint),
  ('user_profiles', 0::bigint), ('platform_operators', 0::bigint), ('roles', 0::bigint),
  ('permissions', 0::bigint), ('role_permissions', 0::bigint),
  ('membership_roles', 0::bigint), ('audit_events', 0::bigint)) as v(t, n);

-- ---------------------------------------------------------------------------
-- 5 · exactly 31 policies, all TO authenticated, none for anon,
--     with exactly the contracted command coverage
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'public' and tablename in ('user_profiles','platform_operators',
     'organizations','organization_memberships','roles','permissions','role_permissions',
     'membership_roles','support_access_grants','support_access_grant_permissions','audit_events')),
  31::bigint, 'exactly 31 policies on the 11 A2 tables');

select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'public' and tablename in ('user_profiles','platform_operators',
     'organizations','organization_memberships','roles','permissions','role_permissions',
     'membership_roles','support_access_grants','support_access_grant_permissions','audit_events')
     and roles <> array['authenticated']::name[]),
  0::bigint, 'every A2 policy targets exactly {authenticated}');

select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'public' and tablename in ('user_profiles','platform_operators',
     'organizations','organization_memberships','roles','permissions','role_permissions',
     'membership_roles','support_access_grants','support_access_grant_permissions','audit_events')
     and 'anon' = any(roles)),
  0::bigint, 'no anon policy on any A2 table');

select is(
  (select array_agg(p.cmd order by p.cmd) from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = v.t),
  v.cmds,
  'policy command coverage on ' || v.t)
from (values
  ('user_profiles',                    array['INSERT','SELECT','UPDATE']),
  ('platform_operators',               array['INSERT','SELECT','UPDATE']),
  ('organizations',                    array['INSERT','SELECT','UPDATE']),
  ('organization_memberships',         array['INSERT','SELECT','UPDATE']),
  ('roles',                            array['INSERT','SELECT','UPDATE']),
  ('permissions',                      array['DELETE','INSERT','SELECT','UPDATE']),
  ('role_permissions',                 array['DELETE','INSERT','SELECT']),
  ('membership_roles',                 array['DELETE','INSERT','SELECT']),
  ('support_access_grants',            array['INSERT','SELECT','UPDATE']),
  ('support_access_grant_permissions', array['INSERT','SELECT']),
  ('audit_events',                     array['SELECT'])) as v(t, cmds);

-- ---------------------------------------------------------------------------
-- 6 · the four contracted indexes
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from pg_catalog.pg_indexes
  where schemaname='public' and tablename='support_access_grants'
    and indexdef like '%(organization_id, operator_user_id)%'
    and indexdef like '%WHERE (revoked_at IS NULL)%'),
  'partial index on active grants (organization_id, operator_user_id) WHERE revoked_at IS NULL');
select ok(exists(select 1 from pg_catalog.pg_indexes
  where schemaname='public' and tablename='audit_events'
    and indexdef like '%(organization_id, occurred_at DESC)%'),
  'audit index (organization_id, occurred_at DESC)');
select ok(exists(select 1 from pg_catalog.pg_indexes
  where schemaname='public' and tablename='audit_events'
    and indexdef like '%(root_type, root_id, occurred_at DESC)%'),
  'audit index (root_type, root_id, occurred_at DESC)');
select ok(exists(select 1 from pg_catalog.pg_indexes
  where schemaname='public' and tablename='audit_events'
    and indexdef like '%(actor_support_grant_id)%'
    and indexdef like '%WHERE (actor_support_grant_id IS NOT NULL)%'),
  'partial audit index on actor_support_grant_id');

-- ---------------------------------------------------------------------------
-- 7 · SQL privileges exactly as contract v1
-- ---------------------------------------------------------------------------
-- table-level SELECT/INSERT/DELETE for authenticated; UPDATE never table-wide
select is(has_table_privilege('authenticated', 'public.' || v.t, 'SELECT'), v.sel, 'authenticated SELECT on ' || v.t)
from (values ('user_profiles',true),('platform_operators',true),('organizations',true),
  ('organization_memberships',true),('roles',true),('permissions',true),('role_permissions',true),
  ('membership_roles',true),('support_access_grants',true),('support_access_grant_permissions',true),
  ('audit_events',true)) as v(t, sel);
select is(has_table_privilege('authenticated', 'public.' || v.t, 'INSERT'), v.ins, 'authenticated INSERT on ' || v.t)
from (values ('user_profiles',true),('platform_operators',true),('organizations',true),
  ('organization_memberships',true),('roles',true),('permissions',true),('role_permissions',true),
  ('membership_roles',true),('support_access_grants',true),('support_access_grant_permissions',true),
  ('audit_events',false)) as v(t, ins);
select is(has_table_privilege('authenticated', 'public.' || v.t, 'DELETE'), v.del, 'authenticated DELETE on ' || v.t)
from (values ('user_profiles',false),('platform_operators',false),('organizations',false),
  ('organization_memberships',false),('roles',false),('permissions',true),('role_permissions',true),
  ('membership_roles',true),('support_access_grants',false),('support_access_grant_permissions',false),
  ('audit_events',false)) as v(t, del);
select is(has_table_privilege('authenticated', 'public.' || u.t, 'UPDATE'), false, 'no table-wide UPDATE on ' || u.t)
from unnest(array['user_profiles','platform_operators','organizations',
  'organization_memberships','roles','permissions','role_permissions',
  'membership_roles','support_access_grants','support_access_grant_permissions',
  'audit_events']) as u(t);

-- exact column-level UPDATE sets
select is(
  (select array_agg(c.column_name::text order by c.column_name::text)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v.t
      and has_column_privilege('authenticated', 'public.' || v.t, c.column_name::text, 'UPDATE')),
  v.cols,
  'updatable columns on ' || v.t)
from (values
  ('user_profiles',            array['display_name','full_name','locale','time_zone','updated_at']),
  ('platform_operators',       array['platform_role','revoked_at']),
  ('organizations',            array['access_code_prefix','closed_at','currency','iban','jurisdiction',
                                     'legal_address','legal_owner_name','locale','logo_path','mbway_number',
                                     'name','slogan','slug','status','tagline_line_1','tagline_line_2',
                                     'tax_id','time_zone','updated_at','website_domain','whatsapp_number']),
  ('organization_memberships', array['revoked_at','status']),
  ('roles',                    array['archived_at','description','name']),
  ('permissions',              array['area','description']),
  ('support_access_grants',    array['revoked_at','revoked_by'])) as v(t, cols);

-- and no UPDATE at all, not even by column, on the immutable-association tables
select is(has_any_column_privilege('authenticated', 'public.' || u.t, 'UPDATE'), false,
  'no column UPDATE at all on ' || u.t)
from unnest(array['role_permissions','membership_roles',
  'support_access_grant_permissions','audit_events']) as u(t);

-- anon has nothing
select is(has_table_privilege('anon', 'public.' || u.t, 'SELECT,INSERT,UPDATE,DELETE'), false,
  'anon has no privilege on ' || u.t)
from unnest(array['user_profiles','platform_operators','organizations',
  'organization_memberships','roles','permissions','role_permissions',
  'membership_roles','support_access_grants','support_access_grant_permissions',
  'audit_events']) as u(t);

-- function EXECUTE: authenticated gets exactly the four helpers
select is(has_function_privilege('authenticated', to_regprocedure(v.f), 'EXECUTE'), v.exp,
  'authenticated EXECUTE on ' || v.f)
from (values
  ('public.is_platform_admin()', true),
  ('public.shares_organization(uuid)', true),
  ('public.has_permission(uuid,text)', true),
  ('public.access_mode(uuid)', true),
  ('public.enforce_organization_time_zone()', false),
  ('public.enforce_organization_closed_terminal()', false),
  ('public.enforce_membership_revoke_only()', false),
  ('public.enforce_support_grant_revoke_only()', false),
  ('public.enforce_support_grant_permission_same_transaction()', false)) as v(f, exp);
select is(has_function_privilege('anon', to_regprocedure(u.f), 'EXECUTE'), false,
  'anon cannot execute ' || u.f)
from unnest(array['public.is_platform_admin()','public.shares_organization(uuid)',
  'public.has_permission(uuid,text)','public.access_mode(uuid)',
  'public.enforce_organization_time_zone()','public.enforce_organization_closed_terminal()',
  'public.enforce_membership_revoke_only()','public.enforce_support_grant_revoke_only()',
  'public.enforce_support_grant_permission_same_transaction()']) as u(f);
-- PUBLIC (grantee oid 0) appears in no A2 function ACL
select is(
  (select count(*) from pg_catalog.pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid in (to_regprocedure('public.is_platform_admin()'),
                   to_regprocedure('public.shares_organization(uuid)'),
                   to_regprocedure('public.has_permission(uuid,text)'),
                   to_regprocedure('public.access_mode(uuid)'),
                   to_regprocedure('public.enforce_organization_time_zone()'),
                   to_regprocedure('public.enforce_organization_closed_terminal()'),
                   to_regprocedure('public.enforce_membership_revoke_only()'),
                   to_regprocedure('public.enforce_support_grant_revoke_only()'),
                   to_regprocedure('public.enforce_support_grant_permission_same_transaction()'))
     and a.grantee = 0),
  0::bigint, 'PUBLIC holds no privilege on any A2 function');

-- ---------------------------------------------------------------------------
-- 8 · migration history
-- ---------------------------------------------------------------------------
select ok(exists(select 1 from supabase_migrations.schema_migrations where version = '20260821024034'),
  'history contains the legacy baseline 20260821024034');
select ok(exists(select 1 from supabase_migrations.schema_migrations where version = '20260822112333'),
  'history contains the A2 foundation 20260822112333');
-- The total migration count is deliberately NOT asserted: later migrations
-- must be able to extend the chain without breaking this suite. Only the
-- presence of the two migrations this suite verifies is required.
select is(
  (select count(*) from supabase_migrations.schema_migrations
    where version in ('20260821024034', '20260822112333')),
  2::bigint,
  'both required migrations are present exactly once');

select * from finish();
rollback;
