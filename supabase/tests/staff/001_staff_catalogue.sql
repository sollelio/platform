-- Operational Staff MVP · Step 1 — schema, RLS, tenancy and workflow.
-- Every authorization assertion runs as the ordinary `authenticated` role with
-- auth.uid() impersonated, so the real policies are evaluated. Synthetic
-- fixtures only; no real person is named. Everything rolls back.
begin;
select plan(29);

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- schema
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_tables where schemaname='public'
            and tablename in ('staff_members','staff_functions','staff_member_functions')),
          3, 'the three Staff relations exist');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relrowsecurity
              and c.relname in ('staff_members','staff_functions','staff_member_functions')),
          3, 'row level security is enabled on all three');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relforcerowsecurity
              and c.relname in ('staff_members','staff_functions','staff_member_functions')),
          0, 'FORCE row level security is set on none, matching the Point 1 convention');
select is((select count(*)::int from public.permissions where key in ('staff.read','staff.manage')),
          2, 'the two Staff permission rows are seeded');
select is((select count(*)::int from public.permissions p
            where p.key in ('staff.read','staff.manage') and split_part(p.key,'.',1) <> p.area),
          0, 'the Staff permission keys satisfy the Point 1 area convention');
-- the module is NOT switched on for anybody by the migration
select is((select count(*)::int from public.role_permissions
            where permission_key in ('staff.read','staff.manage')),
          0, 'the migration grants Staff to no role — enabling is a per-organization act');
select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'anon' and table_schema='public'
              and table_name in ('staff_members','staff_functions','staff_member_functions')),
          0, 'anon receives no privilege on any Staff relation');

-- ---------------------------------------------------------------------------
-- fixture: two organizations, and Staff enabled for A only
-- ---------------------------------------------------------------------------
insert into auth.users (id, created_at) values
  ('5aff0000-0000-4000-8000-0000000000a0', now()),
  ('5aff0000-0000-4000-8000-0000000000b0', now()),
  ('5aff0000-0000-4000-8000-0000000000c0', now());
insert into public.user_profiles (user_id, display_name) values
  ('5aff0000-0000-4000-8000-0000000000a0','UA'),
  ('5aff0000-0000-4000-8000-0000000000b0','UB'),
  ('5aff0000-0000-4000-8000-0000000000c0','UN');
insert into public.organizations
  (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('5aff0000-0000-4000-8000-0000000000a1','staff-org-a','Org A','active','SOA','pt-PT','EUR','Europe/Lisbon'),
  ('5aff0000-0000-4000-8000-0000000000b1','staff-org-b','Org B','active','SOB','pt-PT','EUR','Europe/Lisbon');
insert into public.roles (id, organization_id, key, name, is_system) values
  ('5aff0000-0000-4000-8000-0000000000a2','5aff0000-0000-4000-8000-0000000000a1','owner','Owner',true),
  ('5aff0000-0000-4000-8000-0000000000b2','5aff0000-0000-4000-8000-0000000000b1','owner','Owner',true);
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('5aff0000-0000-4000-8000-00000000ab01','5aff0000-0000-4000-8000-0000000000a1','5aff0000-0000-4000-8000-0000000000a0','active',now()),
  ('5aff0000-0000-4000-8000-00000000ab02','5aff0000-0000-4000-8000-0000000000b1','5aff0000-0000-4000-8000-0000000000b0','active',now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('5aff0000-0000-4000-8000-00000000ab01','5aff0000-0000-4000-8000-0000000000a2','5aff0000-0000-4000-8000-0000000000a1'),
  ('5aff0000-0000-4000-8000-00000000ab02','5aff0000-0000-4000-8000-0000000000b2','5aff0000-0000-4000-8000-0000000000b1');
-- the per-organization enablement: Org A only, Org B deliberately left without
insert into public.role_permissions (role_id, permission_key) values
  ('5aff0000-0000-4000-8000-0000000000a2','staff.read'),
  ('5aff0000-0000-4000-8000-0000000000a2','staff.manage');

select is(public.has_permission('5aff0000-0000-4000-8000-0000000000a1','staff.manage'), false,
          'has_permission is false before a session exists — the resolver is session-scoped');

-- ---------------------------------------------------------------------------
-- the full catalogue workflow, as an ordinary authenticated user of Org A
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5aff0000-0000-4000-8000-0000000000a0');

select ok(public.has_permission('5aff0000-0000-4000-8000-0000000000a1','staff.manage'),
          'a permitted backoffice user holds staff.manage in their own organization');

select lives_ok(
  $$insert into public.staff_functions (organization_id, name, area, sort_order)
    values ('5aff0000-0000-4000-8000-0000000000a1','Serviço de mesa','Sala',1),
           ('5aff0000-0000-4000-8000-0000000000a1','Empratamento','Cozinha',1)$$,
  'a permitted user creates operational functions');

-- a staff member with NO platform account at all
select lives_ok(
  $$insert into public.staff_members (organization_id, display_name, engagement, may_be_consulted)
    values ('5aff0000-0000-4000-8000-0000000000a1','Pessoa Sem Conta','occasional',true)$$,
  'a staff member needs no auth account — user_id stays NULL');
select is((select count(*)::int from public.staff_members where user_id is null), 1,
          'the account-less staff member exists with a null user_id');

-- a backoffice user who is ALSO a staff member, and who is never consulted
select lives_ok(
  $$insert into public.staff_members
      (organization_id, display_name, engagement, may_be_consulted, user_id)
    values ('5aff0000-0000-4000-8000-0000000000a1','Pessoa Com Conta','responsible',false,
            '5aff0000-0000-4000-8000-0000000000a0')$$,
  'a linked backoffice user can also exist as a staff member');
select is((select may_be_consulted from public.staff_members
            where user_id = '5aff0000-0000-4000-8000-0000000000a0'),
          false, 'a person may be assignable to work and still never be consulted');
select is((select engagement from public.staff_members
            where user_id = '5aff0000-0000-4000-8000-0000000000a0'),
          'responsible', 'engagement category is stored independently of the active lifecycle');

-- assignment and removal
select lives_ok(
  $$insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id)
    select '5aff0000-0000-4000-8000-0000000000a1', m.id, f.id
      from public.staff_members m, public.staff_functions f
     where m.display_name = 'Pessoa Sem Conta'$$,
  'a person can be assigned several functions');
select is((select count(*)::int from public.staff_member_functions), 2,
          'both assignments exist');
select lives_ok(
  $$delete from public.staff_member_functions smf
     using public.staff_functions f
     where smf.staff_function_id = f.id and f.name = 'Empratamento'$$,
  'an assignment can be removed');
select is((select count(*)::int from public.staff_member_functions), 1, 'one assignment remains');

-- deactivate / reactivate
select lives_ok(
  $$update public.staff_members set is_active = false where display_name = 'Pessoa Sem Conta'$$,
  'a staff member can be deactivated');
select lives_ok(
  $$update public.staff_members set is_active = true where display_name = 'Pessoa Sem Conta'$$,
  'a staff member can be reactivated');
select lives_ok(
  $$update public.staff_functions set is_active = false where name = 'Empratamento'$$,
  'a function can be deactivated');

-- a person never moves organization
select throws_ok(
  $$update public.staff_members set organization_id = '5aff0000-0000-4000-8000-0000000000b1'
     where display_name = 'Pessoa Sem Conta'$$,
  '42501', null, 'organization_id is outside the update grant — a person cannot change organization');
reset role;

-- ---------------------------------------------------------------------------
-- tenancy: Organization B can neither read nor mutate Organization A
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5aff0000-0000-4000-8000-0000000000b0');
select is((select count(*)::int from public.staff_members), 0,
          'Organization B reads no Organization A staff member');
select is((select count(*)::int from public.staff_functions), 0,
          'Organization B reads no Organization A function');
select is((select count(*)::int from public.staff_member_functions), 0,
          'Organization B reads no Organization A assignment');
select throws_ok(
  $$insert into public.staff_members (organization_id, display_name, engagement)
    values ('5aff0000-0000-4000-8000-0000000000a1','Intruso','core')$$,
  '42501', null, 'Organization B cannot insert into Organization A');
reset role;

-- ---------------------------------------------------------------------------
-- a user without the Staff permission sees nothing, even in their own organization
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5aff0000-0000-4000-8000-0000000000c0');
select is((select count(*)::int from public.staff_members), 0,
          'a user with no Staff permission reads no staff member');
select throws_ok(
  $$insert into public.staff_functions (organization_id, name, area)
    values ('5aff0000-0000-4000-8000-0000000000a1','Intrusa','Sala')$$,
  '42501', null, 'a user with no Staff permission cannot create a function');
reset role;

select * from finish();
rollback;
