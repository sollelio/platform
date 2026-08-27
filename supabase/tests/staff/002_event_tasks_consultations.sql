-- Operational Staff MVP · Step 3 — event tasks, consultations and the public
-- door. Authorization assertions run as the ordinary `authenticated` role with
-- auth.uid() impersonated, and the public door is exercised as `anon`, so the
-- real policies and the real grants are the things under test. Synthetic
-- fixtures only; no real person is named. Everything rolls back.
begin;
select plan(65);

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- schema and privilege surface
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_tables where schemaname='public'
            and tablename in ('event_tasks','staff_consultations',
                              'staff_consultation_events','staff_consultation_recipients')),
          4, 'the four Step 3 relations exist');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relrowsecurity and c.relname in
              ('event_tasks','staff_consultations','staff_consultation_events','staff_consultation_recipients')),
          4, 'row level security is enabled on all four');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relforcerowsecurity and c.relname in
              ('event_tasks','staff_consultations','staff_consultation_events','staff_consultation_recipients')),
          0, 'FORCE row level security is set on none, so the definer functions can read');
select is((select count(*)::int from information_schema.role_table_grants
            where grantee='anon' and table_schema='public' and table_name in
              ('event_tasks','staff_consultations','staff_consultation_events','staff_consultation_recipients')),
          0, 'anon receives no privilege on any Step 3 relation');
select is((select count(*)::int from pg_policies where schemaname='public'
            and tablename in ('staff_consultations','staff_consultation_events',
                              'staff_consultation_recipients') and cmd='INSERT'),
          0, 'no INSERT policy exists on any consultation relation — the RPC is the only door');
select is((select count(*)::int from information_schema.role_table_grants
            where grantee='authenticated' and table_schema='public' and privilege_type='INSERT'
              and table_name in ('staff_consultations','staff_consultation_events',
                                 'staff_consultation_recipients')),
          0, 'authenticated holds no INSERT grant on any consultation relation either');
select is((select count(*)::int from public.permissions where key like 'staff.%'
            and key in ('staff.tasks.read','staff.tasks.manage',
                        'staff.consultations.read','staff.consultations.manage')),
          4, 'the four Step 3 permission rows are seeded');
select is((select count(*)::int from public.role_permissions where permission_key like 'staff.%'),
          0, 'the migration grants Staff to no role — enabling stays a per-organization act');
select is((select count(*)::int from pg_constraint
            where conrelid='public.submissions'::regclass and conname='submissions_id_tenant_key'),
          1, 'submissions carries the composite-FK enabler this migration added');
select is((select p.proname||':'||array_to_string(array(
             select unnest(string_to_array(pg_get_function_identity_arguments(p.oid), ', '))), '|')
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='staff_consultation_view'),
          'staff_consultation_view:p_token text',
          'the public door takes a token and nothing else');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='staff_consultation_view'),
          'the public door is SECURITY DEFINER');
select ok((select count(*) > 0 from information_schema.role_routine_grants
            where grantee='anon' and routine_name='staff_consultation_view'),
          'anon may execute the public door');
select is((select count(*)::int from information_schema.role_routine_grants
            where grantee='anon' and routine_name in
              ('create_staff_consultation','staff_consultation_token')),
          0, 'anon may execute neither the creation function nor the token generator');

-- ---------------------------------------------------------------------------
-- fixture: two organizations. Step 1 + Step 3 enabled for A only.
-- ---------------------------------------------------------------------------
insert into auth.users (id, created_at) values
  ('5b300000-0000-4000-8000-0000000000a0', now()),
  ('5b300000-0000-4000-8000-0000000000b0', now()),
  ('5b300000-0000-4000-8000-0000000000c0', now());
insert into public.user_profiles (user_id, display_name) values
  ('5b300000-0000-4000-8000-0000000000a0','UA'),
  ('5b300000-0000-4000-8000-0000000000b0','UB'),
  ('5b300000-0000-4000-8000-0000000000c0','UC');
-- tenants and organizations share the identifier: the C1 bootstrap preserves it
insert into public.tenants (id, slug, nome, prefixo) values
  ('5b300000-0000-4000-8000-0000000000a1','b3-org-a','Org A','BOA'),
  ('5b300000-0000-4000-8000-0000000000b1','b3-org-b','Org B','BOB');
insert into public.organizations
  (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('5b300000-0000-4000-8000-0000000000a1','b3-org-a','Org A','active','BOA','pt-PT','EUR','Europe/Lisbon'),
  ('5b300000-0000-4000-8000-0000000000b1','b3-org-b','Org B','active','BOB','pt-PT','EUR','Europe/Lisbon');
insert into public.roles (id, organization_id, key, name, is_system) values
  ('5b300000-0000-4000-8000-0000000000a2','5b300000-0000-4000-8000-0000000000a1','owner','Owner',true),
  ('5b300000-0000-4000-8000-0000000000b2','5b300000-0000-4000-8000-0000000000b1','owner','Owner',true),
  ('5b300000-0000-4000-8000-0000000000c2','5b300000-0000-4000-8000-0000000000a1','viewer','Viewer',false);
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('5b300000-0000-4000-8000-00000000ab01','5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000a0','active',now()),
  ('5b300000-0000-4000-8000-00000000ab02','5b300000-0000-4000-8000-0000000000b1','5b300000-0000-4000-8000-0000000000b0','active',now()),
  ('5b300000-0000-4000-8000-00000000ab03','5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000c0','active',now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('5b300000-0000-4000-8000-00000000ab01','5b300000-0000-4000-8000-0000000000a2','5b300000-0000-4000-8000-0000000000a1'),
  ('5b300000-0000-4000-8000-00000000ab02','5b300000-0000-4000-8000-0000000000b2','5b300000-0000-4000-8000-0000000000b1'),
  ('5b300000-0000-4000-8000-00000000ab03','5b300000-0000-4000-8000-0000000000c2','5b300000-0000-4000-8000-0000000000a1');
insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join unnest(array['staff.read','staff.manage','staff.tasks.read','staff.tasks.manage',
                          'staff.consultations.read','staff.consultations.manage']) as k
 where r.key = 'owner';

insert into public.event_types (id, nome, steps, tenant_id) values
  ('5b300000-0000-4000-8000-0000000000e9','Casamento','[]'::jsonb,'5b300000-0000-4000-8000-0000000000a1');
-- three future events for Org A, one for Org B
insert into public.submissions (id, tenant_id, data_evento, event_type_id) values
  ('5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000a1', current_date + 30, '5b300000-0000-4000-8000-0000000000e9'),
  ('5b300000-0000-4000-8000-0000000000f2','5b300000-0000-4000-8000-0000000000a1', current_date + 60, '5b300000-0000-4000-8000-0000000000e9'),
  ('5b300000-0000-4000-8000-0000000000f3','5b300000-0000-4000-8000-0000000000a1', current_date + 90, '5b300000-0000-4000-8000-0000000000e9'),
  ('5b300000-0000-4000-8000-0000000000f4','5b300000-0000-4000-8000-0000000000a1', null, null),
  ('5b300000-0000-4000-8000-0000000000f5','5b300000-0000-4000-8000-0000000000a1', current_date + 120, '5b300000-0000-4000-8000-0000000000e9'),
  ('5b300000-0000-4000-8000-0000000000f9','5b300000-0000-4000-8000-0000000000b1', current_date + 30, null);
insert into public.staff_functions (id, organization_id, name, area) values
  ('5b300000-0000-4000-8000-000000000101','5b300000-0000-4000-8000-0000000000a1','Serviço de mesa','Sala'),
  ('5b300000-0000-4000-8000-000000000102','5b300000-0000-4000-8000-0000000000a1','Empratamento','Cozinha'),
  ('5b300000-0000-4000-8000-000000000109','5b300000-0000-4000-8000-0000000000b1','Serviço de mesa','Sala');
insert into public.staff_members (id, organization_id, display_name, engagement, may_be_consulted) values
  ('5b300000-0000-4000-8000-000000000201','5b300000-0000-4000-8000-0000000000a1','Pessoa Sala','core',true),
  ('5b300000-0000-4000-8000-000000000202','5b300000-0000-4000-8000-0000000000a1','Pessoa Cozinha','occasional',true),
  ('5b300000-0000-4000-8000-000000000203','5b300000-0000-4000-8000-0000000000a1','Pessoa Responsavel','responsible',false),
  ('5b300000-0000-4000-8000-000000000209','5b300000-0000-4000-8000-0000000000b1','Pessoa Org B','core',true);
insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id) values
  ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-000000000201','5b300000-0000-4000-8000-000000000101'),
  ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-000000000202','5b300000-0000-4000-8000-000000000102'),
  ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-000000000203','5b300000-0000-4000-8000-000000000101');

-- ---------------------------------------------------------------------------
-- tasks, as an ordinary authenticated user of Organization A
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000a0');

select lives_ok(
  $$insert into public.event_tasks
      (organization_id, submission_id, staff_function_id, title, starts_at, minimum_people)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-000000000101','Servico ao jantar', now() + interval '30 days', 4),
           ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-000000000102','Empratar', now() + interval '60 days', 2),
           ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f3',
            '5b300000-0000-4000-8000-000000000101','Servico ao almoco', now() + interval '90 days', 3),
           ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f4',
            '5b300000-0000-4000-8000-000000000101','Servico sem data marcada', now() + interval '45 days', 2),
           ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f5',
            '5b300000-0000-4000-8000-000000000101','Servico ao lanche', now() + interval '120 days', 2)$$,
  'a permitted user records operational tasks on an event');
select lives_ok(
  $$insert into public.event_tasks
      (organization_id, submission_id, staff_function_id, title, starts_at)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-000000000101','Montagem na vespera', now() + interval '29 days')$$,
  'a task may fall before the event date');
select is((select minimum_people from public.event_tasks where title='Montagem na vespera'), 1,
          'minimum_people defaults to one and is a floor, not a cap');
select throws_ok(
  $$insert into public.event_tasks (organization_id, submission_id, staff_function_id, title, starts_at, minimum_people)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-000000000101','Zero', now(), 0)$$,
  '23514', null, 'a task cannot require fewer than one person');
select throws_ok(
  $$insert into public.event_tasks (organization_id, submission_id, staff_function_id, title, starts_at)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f9',
            '5b300000-0000-4000-8000-000000000101','Roubo', now())$$,
  '23503', null, 'a task cannot attach an Organization B event to Organization A');
select throws_ok(
  $$insert into public.event_tasks (organization_id, submission_id, staff_function_id, title, starts_at)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-000000000109','Roubo', now())$$,
  '23503', null, 'a task cannot require an Organization B capability');
select lives_ok(
  $$update public.event_tasks set is_active = false where title = 'Montagem na vespera'$$,
  'a task can be deactivated');
select lives_ok(
  $$update public.event_tasks set is_active = true where title = 'Montagem na vespera'$$,
  'a task can be reactivated');

-- ---------------------------------------------------------------------------
-- creating a consultation: the three invariants
-- ---------------------------------------------------------------------------
-- Cardinality: one or more DISTINCT events. Three is the batch the house
-- happens to work in, and the database must not encode that habit.
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      array[]::uuid[], array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'NEEDS_AT_LEAST_ONE_EVENT', 'a consultation with no event at all is refused');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      null::uuid[], array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'NEEDS_AT_LEAST_ONE_EVENT', 'a null event list is refused');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-0000000000f2']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'DUPLICATE_EVENTS', 'the same event twice is refused rather than quietly folded');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f9']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'EVENT_NOT_FOUND', 'an Organization B event cannot be covered by an Organization A consultation');
select lives_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Sem data',null,
      array['5b300000-0000-4000-8000-0000000000f4']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'an event without a formal date is covered like any other — tasks carry their own times');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000203']::uuid[])$$,
  'MEMBER_NOT_CONSULTABLE', 'a person marked never-consult receives no link, even though she works');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000209']::uuid[])$$,
  'MEMBER_NOT_CONSULTABLE', 'an Organization B person cannot be a recipient of an Organization A consultation');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'TITLE_REQUIRED', 'a consultation needs a title');
select is((select count(*)::int from public.staff_consultations), 1,
          'only the undated-event consultation survived; every refusal left nothing behind');
-- one, two, four: every size is valid, and the slots stay contiguous
select lives_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Um evento',null,
      array['5b300000-0000-4000-8000-0000000000f1']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'a consultation over a single event is valid');
select lives_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Dois eventos',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'a consultation over two events is valid');
select lives_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Cinco eventos',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3','5b300000-0000-4000-8000-0000000000f4',
            '5b300000-0000-4000-8000-0000000000f5']::uuid[],
      array['5b300000-0000-4000-8000-000000000201','5b300000-0000-4000-8000-000000000202']::uuid[])$$,
  'a consultation over five events is valid — there is no maximum');
select is((select string_agg(slot::text, ',' order by slot)
             from public.staff_consultation_events ce
             join public.staff_consultations c on c.id = ce.consultation_id
            where c.title = 'Cinco eventos'),
          '1,2,3,4,5', 'five covered events are slotted one to five');
select is((select count(*)::int from public.staff_consultation_events ce
             join public.staff_consultations c on c.id = ce.consultation_id
            where c.title = 'Um evento'), 1, 'the single-event consultation covers exactly its one event');
-- Clear the ground so the assertions below count only their own rows. This
-- runs as the OWNER on purpose: authenticated holds no delete grant on either
-- relation — a consultation is closed and a door revoked, never deleted — so
-- the housekeeping a test needs is not a privilege the application has.
reset role;
delete from public.staff_consultation_recipients r using public.staff_consultations c
 where c.id = r.consultation_id and c.title <> 'Setembro';
delete from public.staff_consultations where title <> 'Setembro';
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000a0');

select lives_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Setembro','Fim de semana cheio',
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000201','5b300000-0000-4000-8000-000000000202']::uuid[])$$,
  'a permitted user creates a consultation over three events, the usual batch');
select is((select count(*)::int from public.staff_consultation_events), 3, 'its three events are covered');
select is((select string_agg(slot::text, ',' order by slot) from public.staff_consultation_events), '1,2,3',
          'the covered events are slotted one to three in date order');
select is((select count(*)::int from public.staff_consultation_recipients), 2, 'one door per selected person');
select is((select count(distinct token)::int from public.staff_consultation_recipients), 2,
          'the two doors carry different tokens');
select ok((select bool_and(length(token) >= 43) from public.staff_consultation_recipients),
          'each token is at least 43 opaque characters');
select is((select count(*)::int from public.staff_consultation_recipients
            where staff_member_id = '5b300000-0000-4000-8000-000000000203'), 0,
          'the never-consult person holds no door');
reset role;

-- ---------------------------------------------------------------------------
-- Organization B sees none of it
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000b0');
select is((select count(*)::int from public.event_tasks), 0,
          'Organization B reads no Organization A task');
select is((select count(*)::int from public.staff_consultations), 0,
          'Organization B reads no Organization A consultation');
select is((select count(*)::int from public.staff_consultation_recipients), 0,
          'Organization B reads no Organization A door, and so no token');
select throws_ok(
  $$select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Assalto',null,
      array['5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
            '5b300000-0000-4000-8000-0000000000f3']::uuid[],
      array['5b300000-0000-4000-8000-000000000201']::uuid[])$$,
  'PERMISSION_DENIED', 'Organization B cannot create a consultation inside Organization A');
reset role;

-- a member of Organization A without the Step 3 permissions
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000c0');
select is((select count(*)::int from public.event_tasks), 0,
          'a user without the tasks permission reads no task in their own organization');
select is((select count(*)::int from public.staff_consultation_recipients), 0,
          'a user without the consultations permission reads no door');
select throws_ok(
  $$insert into public.event_tasks (organization_id, submission_id, staff_function_id, title, starts_at)
    values ('5b300000-0000-4000-8000-0000000000a1','5b300000-0000-4000-8000-0000000000f1',
            '5b300000-0000-4000-8000-000000000101','Nao autorizada', now())$$,
  '42501', null, 'a user without the tasks permission cannot record a task');
reset role;

-- ---------------------------------------------------------------------------
-- the public door, as anon
-- ---------------------------------------------------------------------------
create temporary table pg_temp.doors as
  select m.display_name, r.token
    from public.staff_consultation_recipients r
    join public.staff_members m on m.id = r.staff_member_id;
-- A temp table belongs to whoever created it and carries no default grant, so
-- the role under test has to be handed its own fixture explicitly. Scaffolding
-- only: nothing here relaxes a privilege the migration set.
grant select on pg_temp.doors to anon;

set local role anon;
select is(public.staff_consultation_view('nao-existe-este-token-de-todo-mesmo-assim') -> 'estado',
          '"terminado"'::jsonb, 'an unknown token is refused without confirming that any token exists');
select is(public.staff_consultation_view(null) -> 'estado', '"terminado"'::jsonb,
          'a null token is refused');

-- Sala person: events 1 and 3 carry a Sala task, event 2 does not
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Sala'),
          '"aberta"'::jsonb, 'a live door opens');
select is((select jsonb_array_length(public.staff_consultation_view(token) -> 'eventos')
             from pg_temp.doors where display_name='Pessoa Sala'),
          2, 'the Sala person sees only the two events that carry work she can do');
select is((select public.staff_consultation_view(token) #> '{pessoa,nome}' from pg_temp.doors where display_name='Pessoa Sala'),
          '"Pessoa Sala"'::jsonb, 'the door greets its own recipient');
select is((select jsonb_array_length(public.staff_consultation_view(token) -> 'eventos')
             from pg_temp.doors where display_name='Pessoa Cozinha'),
          1, 'the Cozinha person sees only the single event that carries kitchen work');
select is((select public.staff_consultation_view(token) #>> '{eventos,0,tarefas,0,funcao}'
             from pg_temp.doors where display_name='Pessoa Cozinha'),
          'Empratamento', 'and only the task matching her own capability');
select is((select count(*)::int from pg_temp.doors d
            where public.staff_consultation_view(d.token)::text like '%5b300000-0000-4000-8000-0000000000f%'),
          0, 'no door ever hands back an event identifier');
select is((select count(*)::int from pg_temp.doors d
            where public.staff_consultation_view(d.token)::text like '%Pessoa Cozinha%'
              and d.display_name = 'Pessoa Sala'),
          0, 'one recipient''s door never names another person');
reset role;

-- token isolation and lifetime, back as the operator
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000a0');
update public.staff_consultation_recipients set revoked_at = now(), revoked_reason = 'teste'
 where staff_member_id = '5b300000-0000-4000-8000-000000000201';
reset role;
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Sala'),
          '"terminado"'::jsonb, 'a revoked door closes');
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Cozinha'),
          '"aberta"'::jsonb, 'and the other person''s door is untouched by that revocation');
reset role;

-- Link lifetime. Concluded is the explicit state the house sets, and a date
-- that has merely passed is NOT it — the link must survive that.
update public.submissions set data_evento = current_date - 1
 where id in ('5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
              '5b300000-0000-4000-8000-0000000000f3');
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Cozinha'),
          '"aberta"'::jsonb,
          'a formal date that has passed does not close the link on its own');
reset role;

-- 'Concluído' is only settable from a post-sinal fase (submissions_status_pos_sinal)
update public.submissions set fase = 'contrato'
 where id in ('5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2',
              '5b300000-0000-4000-8000-0000000000f3');
-- conclude two of the three: one still open must keep the door open
update public.submissions set status = 'Concluído'
 where id in ('5b300000-0000-4000-8000-0000000000f1','5b300000-0000-4000-8000-0000000000f2');
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Cozinha'),
          '"aberta"'::jsonb,
          'while even one covered event is unconcluded the link stays open');
reset role;

update public.submissions set status = 'Concluído'
 where id = '5b300000-0000-4000-8000-0000000000f3';
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.doors where display_name='Pessoa Cozinha'),
          '"terminado"'::jsonb,
          'the link closes only once every covered event is concluded');
reset role;

-- The same rule, at a different size: a one-event consultation.
set local role authenticated;
select pg_temp.become('5b300000-0000-4000-8000-0000000000a0');
update public.submissions set status = null
 where id = '5b300000-0000-4000-8000-0000000000f5';
select public.create_staff_consultation('5b300000-0000-4000-8000-0000000000a1','Um so',null,
    array['5b300000-0000-4000-8000-0000000000f5']::uuid[],
    array['5b300000-0000-4000-8000-000000000201']::uuid[]);
reset role;
create temporary table pg_temp.porta_unica as
  select r.token from public.staff_consultation_recipients r
    join public.staff_consultations c on c.id = r.consultation_id
   where c.title = 'Um so';
grant select on pg_temp.porta_unica to anon;
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.porta_unica),
          '"aberta"'::jsonb,
          'a one-event link is open while its single event has no conclusion set');
reset role;
update public.submissions set fase = 'contrato', status = 'Concluído'
 where id = '5b300000-0000-4000-8000-0000000000f5';
set local role anon;
select is((select public.staff_consultation_view(token) -> 'estado' from pg_temp.porta_unica),
          '"terminado"'::jsonb,
          'and closes when that single event is concluded');
reset role;

select * from finish();
rollback;
