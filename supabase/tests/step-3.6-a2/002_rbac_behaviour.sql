-- Step 3.6-A3 · 002 — RBAC behaviour: has_permission, access_mode, archived
-- roles, manager visibility. Synthetic UUIDs only; fully rolled back.
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
-- seed (as postgres; synthetic identities)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000001'), -- u_admin: platform admin
  ('a0000000-0000-4000-8000-000000000003'), -- u_sup1: support op, valid grant
  ('a0000000-0000-4000-8000-000000000004'), -- u_sup2: support op, gets revoked
  ('a0000000-0000-4000-8000-000000000005'), -- u_sup3: support op, expired grant
  ('a0000000-0000-4000-8000-00000000000d'), -- u_sup4: support op, revoked grant
  ('a0000000-0000-4000-8000-000000000006'), -- u_mgr: members.manage only
  ('a0000000-0000-4000-8000-000000000007'), -- u_read: member of suspended org
  ('a0000000-0000-4000-8000-000000000008'), -- u_plain: member with probe role
  ('a0000000-0000-4000-8000-000000000009'); -- u_both: member AND support op
insert into public.user_profiles (user_id)
  select id from auth.users where id::text like 'a0000000-%';

insert into public.organizations (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('b0000000-0000-4000-8000-000000000001', 'org-a', 'Org A', 'active',    'ORGA', 'pt-PT', 'EUR', 'Europe/Lisbon'),
  ('b0000000-0000-4000-8000-000000000002', 'org-s', 'Org S', 'suspended', 'ORGS', 'pt-PT', 'EUR', 'Europe/Lisbon');

insert into public.platform_operators (user_id, platform_role) values
  ('a0000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-000000000003', 'support'),
  ('a0000000-0000-4000-8000-000000000004', 'support'),
  ('a0000000-0000-4000-8000-000000000005', 'support'),
  ('a0000000-0000-4000-8000-00000000000d', 'support'),
  ('a0000000-0000-4000-8000-000000000009', 'support');

-- organization.read, organization.manage, members.manage and audit.read are
-- seeded by the core permission catalogue migration; only the test-only probe
-- permissions are inserted here.
insert into public.permissions (key, area, description) values
  ('perm.test',           'test',         'membership-path probe'),
  ('perm.sup',            'test',         'support-path probe');

insert into public.roles (id, organization_id, key, name) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'manager', 'Manager'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'reader',  'Reader'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'probe',   'Probe'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'sreader', 'S Reader');
insert into public.role_permissions (role_id, permission_key) values
  ('d0000000-0000-4000-8000-000000000001', 'members.manage'),
  ('d0000000-0000-4000-8000-000000000002', 'organization.read'),
  ('d0000000-0000-4000-8000-000000000003', 'perm.test'),
  ('d0000000-0000-4000-8000-000000000004', 'organization.read');

insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'active', now()),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000007', 'active', now()),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000008', 'active', now()),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'active', now()),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000007', 'active', now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002');

insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_by, expires_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'behaviour probe', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'behaviour probe', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'behaviour probe', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', 'behaviour probe', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour');
-- expired grant: explicit past validity window (seeded as an earlier-transaction artefact)
insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_at, granted_by, expires_at) values
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'behaviour probe', now() - interval '2 hours', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 hour');
-- already-revoked grant
insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_by, expires_at, revoked_at, revoked_by) values
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000001', 'behaviour probe', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour', now(), 'a0000000-0000-4000-8000-000000000001');
-- support permission set for the valid grant (same transaction: guard must accept)
insert into public.support_access_grant_permissions (grant_id, permission_key) values
  ('e0000000-0000-4000-8000-000000000001', 'perm.sup'),
  ('e0000000-0000-4000-8000-000000000005', 'perm.sup');

-- ---------------------------------------------------------------------------
-- has_permission: archived roles stop granting immediately
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000008');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'perm.test'), true,
  'assigned non-archived role grants the permission');
reset role;
update public.roles set archived_at = now() where id = 'd0000000-0000-4000-8000-000000000003';
select pg_temp.become('a0000000-0000-4000-8000-000000000008');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'perm.test'), false,
  'archiving the role removes the permission immediately');
reset role;

-- ---------------------------------------------------------------------------
-- archived roles cannot receive new assignments; live roles can
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select throws_ok($q$
  insert into public.membership_roles (membership_id, role_id, organization_id, granted_by)
  values ('c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003',
          'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $q$,
  '42501', null, 'an archived role cannot receive a new assignment');
select lives_ok($q$
  insert into public.membership_roles (membership_id, role_id, organization_id, granted_by)
  values ('c0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',
          'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $q$,
  'a live role can be assigned with granted_by = self');
reset role;
select ok(exists(select 1 from public.membership_roles
  where membership_id = 'c0000000-0000-4000-8000-000000000002'
    and role_id = 'd0000000-0000-4000-8000-000000000002'),
  'the live assignment really was inserted');

-- ---------------------------------------------------------------------------
-- access_mode: cumulative support requirements and membership precedence
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000003');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'support',
  'active org + unrevoked operator + valid grant => support');
select is(public.access_mode('b0000000-0000-4000-8000-000000000002'), 'none',
  'suspended organization never yields support');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'perm.sup'), true,
  'support path grants the explicitly listed permission');
select is(public.has_permission('b0000000-0000-4000-8000-000000000002', 'perm.sup'), false,
  'support path denied on the suspended organization');
reset role;

select pg_temp.become('a0000000-0000-4000-8000-000000000005');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'none',
  'expired grant => none');
reset role;

select pg_temp.become('a0000000-0000-4000-8000-00000000000d');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'none',
  'revoked grant => none');
reset role;

update public.platform_operators set revoked_at = now()
 where user_id = 'a0000000-0000-4000-8000-000000000004';
select pg_temp.become('a0000000-0000-4000-8000-000000000004');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'none',
  'revoked operator => none even with a valid grant');
reset role;

select pg_temp.become('a0000000-0000-4000-8000-000000000009');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'membership',
  'membership takes precedence over a valid support grant');
reset role;

-- revoking the grant kills the support permission
update public.support_access_grants
   set revoked_at = now(), revoked_by = 'a0000000-0000-4000-8000-000000000001'
 where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.become('a0000000-0000-4000-8000-000000000003');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'perm.sup'), false,
  'revoking the grant removes its permissions');
select is(public.access_mode('b0000000-0000-4000-8000-000000000001'), 'none',
  'and access_mode returns to none');
reset role;

-- membership path also dies with a non-active organization
select pg_temp.become('a0000000-0000-4000-8000-000000000007');
select is(public.has_permission('b0000000-0000-4000-8000-000000000002', 'organization.read'), false,
  'membership path denied on a suspended organization');
reset role;

-- ---------------------------------------------------------------------------
-- manager with members.manage but WITHOUT organization.read
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'organization.read'), false,
  'fixture check: the manager really lacks organization.read');
select ok(exists(select 1 from public.roles
  where organization_id = 'b0000000-0000-4000-8000-000000000001'),
  'manager sees the organization roles');
select ok(exists(select 1 from public.organization_memberships
  where organization_id = 'b0000000-0000-4000-8000-000000000001'
    and user_id <> 'a0000000-0000-4000-8000-000000000006'),
  'manager sees other members');
select ok(exists(select 1 from public.membership_roles
  where organization_id = 'b0000000-0000-4000-8000-000000000001'
    and membership_id <> 'c0000000-0000-4000-8000-000000000001'),
  'manager sees other assignments');
select ok(exists(select 1 from public.role_permissions
  where role_id = 'd0000000-0000-4000-8000-000000000002'),
  'manager sees role_permissions');
select lives_ok($q$
  insert into public.role_permissions (role_id, permission_key)
  values ('d0000000-0000-4000-8000-000000000001', 'audit.read') $q$,
  'manager can add a role permission');
select lives_ok($q$
  delete from public.role_permissions
  where role_id = 'd0000000-0000-4000-8000-000000000001' and permission_key = 'audit.read' $q$,
  'manager can remove it again');
reset role;

select * from finish();
rollback;
