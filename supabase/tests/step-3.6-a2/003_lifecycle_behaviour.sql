-- Step 3.6-A3 · 003 — lifecycle behaviour: membership immutability and one-way
-- revocation, created_by SET NULL path, closed-organization terminality,
-- IANA time-zone validation. Synthetic UUIDs only; fully rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- seed
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000006'), -- u_mgr
  ('a0000000-0000-4000-8000-00000000000c'), -- u_victim
  ('a0000000-0000-4000-8000-00000000000a'), -- u_maker (creator, deleted later)
  ('a0000000-0000-4000-8000-00000000000e'); -- u_extra
insert into public.user_profiles (user_id) values
  ('a0000000-0000-4000-8000-000000000006'),
  ('a0000000-0000-4000-8000-00000000000c'),
  ('a0000000-0000-4000-8000-00000000000a'),
  ('a0000000-0000-4000-8000-00000000000e');

insert into public.organizations (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('b0000000-0000-4000-8000-000000000001', 'org-a', 'Org A', 'active', 'ORGA', 'pt-PT', 'EUR', 'Europe/Lisbon'),
  ('b0000000-0000-4000-8000-000000000003', 'org-c', 'Org C', 'active', 'ORGC', 'pt-PT', 'EUR', 'Europe/Lisbon');

insert into public.permissions (key, area, description) values
  ('members.manage', 'members', 'manage members and roles');
insert into public.roles (id, organization_id, key, name) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'manager', 'Manager');
insert into public.role_permissions (role_id, permission_key) values
  ('d0000000-0000-4000-8000-000000000001', 'members.manage');

insert into public.organization_memberships (id, organization_id, user_id, status, joined_at, created_by) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'active', now(), null),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000c', 'active', now(), 'a0000000-0000-4000-8000-00000000000a'),
  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000e', 'active', now(), null);
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- membership identity is immutable (trigger, tested as table owner)
-- ---------------------------------------------------------------------------
select throws_ok($q$
  update public.organization_memberships
     set id = 'c0000000-0000-4000-8000-000000000099'
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'P0001', null, 'membership id is immutable');
select throws_ok($q$
  update public.organization_memberships
     set user_id = 'a0000000-0000-4000-8000-000000000006'
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'P0001', null, 'membership user_id is immutable');
select throws_ok($q$
  update public.organization_memberships
     set joined_at = now() - interval '1 day'
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'P0001', null, 'membership joined_at is immutable');

-- ---------------------------------------------------------------------------
-- one-way lifecycle: the manager revokes through RLS + column privileges
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select lives_ok($q$
  update public.organization_memberships
     set status = 'revoked', revoked_at = now()
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'manager performs the one allowed lifecycle transition');
reset role;
select is((select status from public.organization_memberships
           where id = 'c0000000-0000-4000-8000-000000000005'), 'revoked',
  'the revocation was actually applied');

select throws_ok($q$
  update public.organization_memberships
     set status = 'active', revoked_at = null
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'P0001', null, 'reactivation is forbidden');
select throws_ok($q$
  update public.organization_memberships
     set revoked_at = revoked_at + interval '1 hour'
   where id = 'c0000000-0000-4000-8000-000000000005' $q$,
  'P0001', null, 'rewriting revoked_at is forbidden');
select throws_ok($q$
  update public.organization_memberships
     set status = 'revoked'
   where id = 'c0000000-0000-4000-8000-000000000007' $q$,
  'P0001', null, 'revocation without revoked_at is rejected');

-- ---------------------------------------------------------------------------
-- created_by ON DELETE SET NULL passes through the revoke-only trigger
-- ---------------------------------------------------------------------------
select is((select created_by from public.organization_memberships
           where id = 'c0000000-0000-4000-8000-000000000005'),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'created_by present before the deletion');
select lives_ok($q$
  delete from public.user_profiles
   where user_id = 'a0000000-0000-4000-8000-00000000000a' $q$,
  'deleting the creator profile succeeds (SET NULL path not blocked)');
select is((select created_by from public.organization_memberships
           where id = 'c0000000-0000-4000-8000-000000000005'), null,
  'created_by was set to null');
select is((select status from public.organization_memberships
           where id = 'c0000000-0000-4000-8000-000000000005'), 'revoked',
  'the membership row itself survived untouched');

-- column privileges stop authenticated from touching joined_at at all
select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select throws_ok($q$
  update public.organization_memberships
     set joined_at = now()
   where id = 'c0000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'authenticated lacks the joined_at column privilege');
reset role;

-- ---------------------------------------------------------------------------
-- closed organizations are terminal
-- ---------------------------------------------------------------------------
select lives_ok($q$
  update public.organizations
     set status = 'closed', closed_at = now()
   where id = 'b0000000-0000-4000-8000-000000000003' $q$,
  'closing an organization is allowed');
select throws_ok($q$
  update public.organizations
     set status = 'active', closed_at = null
   where id = 'b0000000-0000-4000-8000-000000000003' $q$,
  'P0001', null, 'a closed organization cannot be reopened');
select lives_ok($q$
  update public.organizations
     set name = 'Org C (arquivada)'
   where id = 'b0000000-0000-4000-8000-000000000003' $q$,
  'non-status updates on a closed organization remain possible (contract letter)');
select throws_ok($q$
  update public.organizations
     set status = 'closed'
   where id = 'b0000000-0000-4000-8000-000000000001' $q$,
  '23514', null, 'closing without closed_at violates the state-consistency check');

-- ---------------------------------------------------------------------------
-- IANA time-zone validation
-- ---------------------------------------------------------------------------
select throws_ok($q$
  insert into public.organizations (id, slug, name, status, access_code_prefix, locale, currency, time_zone)
  values ('b0000000-0000-4000-8000-000000000004', 'org-t', 'Org T', 'active', 'ORGT', 'pt-PT', 'EUR', 'Mars/Olympus') $q$,
  'P0001', null, 'an invalid IANA zone is rejected on insert');
select throws_ok($q$
  update public.organizations
     set time_zone = 'Europe/Atlantis'
   where id = 'b0000000-0000-4000-8000-000000000001' $q$,
  'P0001', null, 'an invalid IANA zone is rejected on update');
select lives_ok($q$
  update public.organizations
     set time_zone = 'Atlantic/Azores'
   where id = 'b0000000-0000-4000-8000-000000000001' $q$,
  'a valid IANA zone is accepted');

select * from finish();
rollback;
