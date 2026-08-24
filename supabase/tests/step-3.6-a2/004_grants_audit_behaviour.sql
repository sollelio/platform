-- Step 3.6-A3 · 004 — actor attribution, append-and-revoke support grants,
-- same-transaction grant permissions, column-level immutability, append-only
-- audit, actor-correlation checks. Synthetic UUIDs only; fully rolled back.
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
  ('a0000000-0000-4000-8000-000000000001'), -- u_admin: platform admin
  ('a0000000-0000-4000-8000-000000000002'), -- u_admin2: profile only (mismatch target)
  ('a0000000-0000-4000-8000-000000000003'), -- u_sup1: support operator
  ('a0000000-0000-4000-8000-00000000000b'), -- u_newop: future operator
  ('a0000000-0000-4000-8000-000000000006'), -- u_mgr: members.manage
  ('a0000000-0000-4000-8000-000000000007'), -- u_read: membership target
  ('a0000000-0000-4000-8000-000000000008'); -- u_plain: membership target
insert into public.user_profiles (user_id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-00000000000b'),
  ('a0000000-0000-4000-8000-000000000006'),
  ('a0000000-0000-4000-8000-000000000007'),
  ('a0000000-0000-4000-8000-000000000008');

insert into public.organizations (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('b0000000-0000-4000-8000-000000000001', 'org-a', 'Org A', 'active', 'ORGA', 'pt-PT', 'EUR', 'Europe/Lisbon');

insert into public.platform_operators (user_id, platform_role) values
  ('a0000000-0000-4000-8000-000000000001', 'admin'),
  ('a0000000-0000-4000-8000-000000000003', 'support');

-- members.manage is seeded by the core permission catalogue migration; only
-- the test-only probe permission is inserted here.
insert into public.permissions (key, area, description) values
  ('perm.sup',       'test',    'support-path probe');

insert into public.roles (id, organization_id, key, name) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'manager', 'Manager');
insert into public.role_permissions (role_id, permission_key) values
  ('d0000000-0000-4000-8000-000000000001', 'members.manage');
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'active', now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- authenticated INSERT actor attribution
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000001');
select lives_ok($q$
  insert into public.platform_operators (user_id, platform_role, granted_by)
  values ('a0000000-0000-4000-8000-00000000000b', 'support', 'a0000000-0000-4000-8000-000000000001') $q$,
  'admin registers an operator attributed to self');
select throws_ok($q$
  insert into public.platform_operators (user_id, platform_role, granted_by)
  values ('a0000000-0000-4000-8000-000000000008', 'support', 'a0000000-0000-4000-8000-000000000002') $q$,
  '42501', null, 'platform_operators.granted_by must equal auth.uid()');
reset role;
select ok(exists(select 1 from public.platform_operators
  where user_id = 'a0000000-0000-4000-8000-00000000000b'), 'operator row was inserted');

select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select lives_ok($q$
  insert into public.organization_memberships (id, organization_id, user_id, status, joined_at, created_by)
  values ('c0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000007', 'active', now(), 'a0000000-0000-4000-8000-000000000006') $q$,
  'manager creates a membership attributed to self');
select throws_ok($q$
  insert into public.organization_memberships (id, organization_id, user_id, status, joined_at, created_by)
  values ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000008', 'active', now(), 'a0000000-0000-4000-8000-000000000001') $q$,
  '42501', null, 'organization_memberships.created_by must equal auth.uid()');
reset role;

-- ---------------------------------------------------------------------------
-- support grants: attribution, no self-grant, same-transaction permissions,
-- revocation attribution, append-and-revoke
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000001');
select lives_ok($q$
  insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_by, expires_at)
  values ('e0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000003',
          'b0000000-0000-4000-8000-000000000001', 'attribution probe',
          'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour') $q$,
  'admin creates a grant attributed to self');
select throws_ok($q$
  insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_by, expires_at)
  values ('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000003',
          'b0000000-0000-4000-8000-000000000001', 'attribution probe',
          'a0000000-0000-4000-8000-000000000002', now() + interval '1 hour') $q$,
  '42501', null, 'support_access_grants.granted_by must equal auth.uid()');
select throws_ok($q$
  insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_by, expires_at)
  values ('e0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001',
          'b0000000-0000-4000-8000-000000000001', 'attribution probe',
          'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour') $q$,
  '23514', null, 'no self-grant (check constraint)');

select lives_ok($q$
  insert into public.support_access_grant_permissions (grant_id, permission_key)
  values ('e0000000-0000-4000-8000-000000000010', 'perm.sup') $q$,
  'grant permissions attach in the creating transaction');

select throws_ok($q$
  update public.support_access_grants
     set revoked_at = now(), revoked_by = 'a0000000-0000-4000-8000-000000000002'
   where id = 'e0000000-0000-4000-8000-000000000010' $q$,
  '42501', null, 'revoked_by must equal auth.uid()');
select lives_ok($q$
  update public.support_access_grants
     set revoked_at = now(), revoked_by = 'a0000000-0000-4000-8000-000000000001'
   where id = 'e0000000-0000-4000-8000-000000000010' $q$,
  'admin revokes with self attribution');
reset role;
select ok((select revoked_at is not null from public.support_access_grants
  where id = 'e0000000-0000-4000-8000-000000000010'), 'the grant really is revoked');

select throws_ok($q$
  update public.support_access_grants
     set revoked_at = null, revoked_by = null
   where id = 'e0000000-0000-4000-8000-000000000010' $q$,
  'P0001', null, 'un-revoking is forbidden (append-and-revoke)');
select throws_ok($q$
  update public.support_access_grants
     set expires_at = now() + interval '2 hours'
   where id = 'e0000000-0000-4000-8000-000000000010' $q$,
  'P0001', null, 'expiry is immutable');
select throws_ok($q$
  insert into public.support_access_grant_permissions (grant_id, permission_key)
  values ('e0000000-0000-4000-8000-000000000010', 'members.manage') $q$,
  'P0001', null, 'permissions cannot attach to a revoked grant');

-- a grant born in an earlier transaction can never be widened later
insert into public.support_access_grants (id, operator_user_id, organization_id, reason, granted_at, granted_by, expires_at)
values ('e0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000003',
        'b0000000-0000-4000-8000-000000000001', 'earlier-transaction artefact',
        now() - interval '1 hour', 'a0000000-0000-4000-8000-000000000001', now() + interval '1 hour');
select throws_ok($q$
  insert into public.support_access_grant_permissions (grant_id, permission_key)
  values ('e0000000-0000-4000-8000-000000000013', 'perm.sup') $q$,
  'P0001', null, 'widening outside the creating transaction is rejected');

-- ---------------------------------------------------------------------------
-- column-level UPDATE privileges enforce immutability for authenticated
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000001');
select throws_ok($q$
  update public.support_access_grants set reason = 'rewritten'
   where id = 'e0000000-0000-4000-8000-000000000013' $q$,
  '42501', null, 'grant reason is not updatable by authenticated');
select throws_ok($q$
  update public.permissions set key = 'perm.renamed' where key = 'perm.sup' $q$,
  '42501', null, 'permission key is immutable for authenticated');
select throws_ok($q$
  update public.roles set key = 'renamed'
   where id = 'd0000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'role key is immutable for authenticated');
select throws_ok($q$
  update public.user_profiles set user_id = 'a0000000-0000-4000-8000-000000000002'
   where user_id = 'a0000000-0000-4000-8000-000000000001' $q$,
  '42501', null, 'profile user_id is immutable for authenticated');
reset role;

-- ---------------------------------------------------------------------------
-- audit_events is append-only for authenticated
-- ---------------------------------------------------------------------------
select pg_temp.become('a0000000-0000-4000-8000-000000000006');
select throws_ok($q$
  insert into public.audit_events (organization_id, actor_kind, actor_user_id, action, root_type, entity_type)
  values ('b0000000-0000-4000-8000-000000000001', 'user', 'a0000000-0000-4000-8000-000000000006',
          'probe.event', 'probe', 'probe') $q$,
  '42501', null, 'authenticated cannot insert audit events');
select throws_ok($q$ update public.audit_events set actor_label = 'x' $q$,
  '42501', null, 'authenticated cannot update audit events');
select throws_ok($q$ delete from public.audit_events $q$,
  '42501', null, 'authenticated cannot delete audit events');
reset role;

-- actor-correlation checks behave (backend inserts, as table owner)
select lives_ok($q$
  insert into public.audit_events (organization_id, actor_kind, action, root_type, entity_type)
  values ('b0000000-0000-4000-8000-000000000001', 'system', 'probe.system_event', 'probe', 'probe') $q$,
  'a clean system event is accepted');
select throws_ok($q$
  insert into public.audit_events (organization_id, actor_kind, action, root_type, entity_type)
  values ('b0000000-0000-4000-8000-000000000001', 'user', 'probe.user_event', 'probe', 'probe') $q$,
  '23514', null, 'a user event without actor_user_id is rejected');
select throws_ok($q$
  insert into public.audit_events (organization_id, actor_kind, actor_user_id, action, root_type, entity_type)
  values ('b0000000-0000-4000-8000-000000000001', 'system', 'a0000000-0000-4000-8000-000000000001',
          'probe.system_event', 'probe', 'probe') $q$,
  '23514', null, 'a system event carrying an actor uuid is rejected');

select * from finish();
rollback;
