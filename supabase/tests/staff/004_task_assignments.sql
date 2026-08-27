-- Operational Staff MVP · Step 5 — manual task assignments.
-- Assigning runs as the ordinary `authenticated` role with auth.uid()
-- impersonated, so the real permission check and the real grants are what is
-- under test. Synthetic fixtures only; no real person is named. All rolls back.
begin;
select plan(49);

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- privilege surface
-- ---------------------------------------------------------------------------
select has_table('public', 'event_task_assignments', 'the assignment relation exists');
select ok((select relrowsecurity from pg_class where relname='event_task_assignments'
            and relnamespace='public'::regnamespace), 'row level security is enabled');
select ok(not (select relforcerowsecurity from pg_class where relname='event_task_assignments'
            and relnamespace='public'::regnamespace), 'FORCE is not set');
select is((select count(*)::int from information_schema.role_table_grants
            where table_name='event_task_assignments' and grantee='anon'),
          0, 'anon holds no privilege on assignments');
select is((select count(*)::int from information_schema.role_routine_grants
            where grantee='anon' and routine_name='assign_staff_to_task'),
          0, 'a consultation token cannot reach the assign function: anon has no execute');
select is((select count(*)::int from information_schema.role_table_grants
            where table_name='event_task_assignments' and grantee='authenticated'
              and privilege_type in ('INSERT','UPDATE')),
          0, 'authenticated may never insert or update an assignment directly');
select is((select count(*)::int from pg_policies where schemaname='public'
            and tablename='event_task_assignments' and cmd in ('INSERT','UPDATE')),
          0, 'and no INSERT or UPDATE policy exists');
select is((select count(*)::int from public.permissions
            where key in ('staff.assignments.read','staff.assignments.manage')),
          2, 'the two Step 5 permission rows are seeded');
select is((select count(*)::int from public.role_permissions
            where permission_key like 'staff.assignments.%'),
          0, 'and are granted to no role by the migration');

-- ---------------------------------------------------------------------------
-- fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, created_at) values
  ('5b500000-0000-4000-8000-0000000000a0', now()),
  ('5b500000-0000-4000-8000-0000000000b0', now()),
  ('5b500000-0000-4000-8000-0000000000c0', now());
insert into public.user_profiles (user_id, display_name) values
  ('5b500000-0000-4000-8000-0000000000a0','UA'),
  ('5b500000-0000-4000-8000-0000000000b0','UB'),
  ('5b500000-0000-4000-8000-0000000000c0','UC');
insert into public.tenants (id, slug, nome, prefixo) values
  ('5b500000-0000-4000-8000-0000000000a1','b5-org-a','Org A','ROA'),
  ('5b500000-0000-4000-8000-0000000000b1','b5-org-b','Org B','ROB');
insert into public.organizations
  (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('5b500000-0000-4000-8000-0000000000a1','b5-org-a','Org A','active','ROA','pt-PT','EUR','Europe/Lisbon'),
  ('5b500000-0000-4000-8000-0000000000b1','b5-org-b','Org B','active','ROB','pt-PT','EUR','Europe/Lisbon');
insert into public.roles (id, organization_id, key, name, is_system) values
  ('5b500000-0000-4000-8000-0000000000a2','5b500000-0000-4000-8000-0000000000a1','owner','Owner',true),
  ('5b500000-0000-4000-8000-0000000000b2','5b500000-0000-4000-8000-0000000000b1','owner','Owner',true),
  ('5b500000-0000-4000-8000-0000000000c2','5b500000-0000-4000-8000-0000000000a1','viewer','Viewer',false);
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('5b500000-0000-4000-8000-00000000ab01','5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-0000000000a0','active',now()),
  ('5b500000-0000-4000-8000-00000000ab02','5b500000-0000-4000-8000-0000000000b1','5b500000-0000-4000-8000-0000000000b0','active',now()),
  ('5b500000-0000-4000-8000-00000000ab03','5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-0000000000c0','active',now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('5b500000-0000-4000-8000-00000000ab01','5b500000-0000-4000-8000-0000000000a2','5b500000-0000-4000-8000-0000000000a1'),
  ('5b500000-0000-4000-8000-00000000ab02','5b500000-0000-4000-8000-0000000000b2','5b500000-0000-4000-8000-0000000000b1'),
  ('5b500000-0000-4000-8000-00000000ab03','5b500000-0000-4000-8000-0000000000c2','5b500000-0000-4000-8000-0000000000a1');
insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r
 cross join unnest(array['staff.read','staff.manage','staff.tasks.read','staff.tasks.manage',
                         'staff.consultations.read','staff.consultations.manage',
                         'staff.assignments.read','staff.assignments.manage']) as k
 where r.key = 'owner';

insert into public.submissions (id, tenant_id, data_evento) values
  ('5b500000-0000-4000-8000-0000000000f1','5b500000-0000-4000-8000-0000000000a1', current_date + 30),
  ('5b500000-0000-4000-8000-0000000000f9','5b500000-0000-4000-8000-0000000000b1', current_date + 30);
insert into public.staff_functions (id, organization_id, name, area) values
  ('5b500000-0000-4000-8000-000000000101','5b500000-0000-4000-8000-0000000000a1','Servico de mesa','Sala'),
  ('5b500000-0000-4000-8000-000000000102','5b500000-0000-4000-8000-0000000000a1','Empratamento','Cozinha'),
  ('5b500000-0000-4000-8000-000000000109','5b500000-0000-4000-8000-0000000000b1','Servico de mesa','Sala');
-- Sala1..3 hold Sala; Cozinha holds only the kitchen function; Responsavel is
-- the never-consulted case; Inactiva has left.
insert into public.staff_members (id, organization_id, display_name, engagement, may_be_consulted, is_active) values
  ('5b500000-0000-4000-8000-000000000201','5b500000-0000-4000-8000-0000000000a1','Sala Um','core',true,true),
  ('5b500000-0000-4000-8000-000000000202','5b500000-0000-4000-8000-0000000000a1','Sala Dois','core',true,true),
  ('5b500000-0000-4000-8000-000000000203','5b500000-0000-4000-8000-0000000000a1','Sala Tres','occasional',true,true),
  ('5b500000-0000-4000-8000-000000000204','5b500000-0000-4000-8000-0000000000a1','Pessoa Cozinha','core',true,true),
  ('5b500000-0000-4000-8000-000000000205','5b500000-0000-4000-8000-0000000000a1','Responsavel','responsible',false,true),
  ('5b500000-0000-4000-8000-000000000206','5b500000-0000-4000-8000-0000000000a1','Pessoa Inactiva','occasional',true,false),
  ('5b500000-0000-4000-8000-000000000209','5b500000-0000-4000-8000-0000000000b1','Pessoa Org B','core',true,true);
insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id) values
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000201','5b500000-0000-4000-8000-000000000101'),
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000202','5b500000-0000-4000-8000-000000000101'),
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000203','5b500000-0000-4000-8000-000000000101'),
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000204','5b500000-0000-4000-8000-000000000102'),
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000205','5b500000-0000-4000-8000-000000000101'),
  ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000206','5b500000-0000-4000-8000-000000000101'),
  ('5b500000-0000-4000-8000-0000000000b1','5b500000-0000-4000-8000-000000000209','5b500000-0000-4000-8000-000000000109');
-- the task needs 2 people, runs 18:00-23:00
insert into public.event_tasks
  (id, organization_id, submission_id, staff_function_id, title, starts_at, ends_at, minimum_people) values
  ('5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-0000000000f1',
   '5b500000-0000-4000-8000-000000000101','Servico ao jantar',
   (current_date + 30 + time '18:00')::timestamptz, (current_date + 30 + time '23:00')::timestamptz, 2),
  ('5b500000-0000-4000-8000-000000000309','5b500000-0000-4000-8000-0000000000b1','5b500000-0000-4000-8000-0000000000f9',
   '5b500000-0000-4000-8000-000000000109','Tarefa de outra casa',
   (current_date + 30 + time '18:00')::timestamptz, null, 1);

-- ---------------------------------------------------------------------------
-- assigning, as a permitted user of Organization A
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b500000-0000-4000-8000-0000000000a0');

select isnt(public.assign_staff_to_task(
            '5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-000000000201'),
          null, 'a compatible active person is assigned');
select is((select count(*)::int from public.event_task_assignments), 1, 'the assignment exists');
select isnt(public.assign_staff_to_task(
            '5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-000000000202'),
          null, 'a second compatible person is assigned to the same task');
select isnt(public.assign_staff_to_task(
            '5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-000000000203'),
          null, 'and a third — the minimum is a floor, not a ceiling');
select is((select count(*)::int from public.event_task_assignments), 3,
          'three people are on a task whose minimum is two, and nothing objected');
select ok((select count(*) > (select minimum_people from public.event_tasks
                               where id='5b500000-0000-4000-8000-000000000301')
             from public.event_task_assignments),
          'being above the minimum is a fact the data carries, not an error');

-- idempotence
select is(public.assign_staff_to_task(
            '5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-000000000201'),
          (select id from public.event_task_assignments
            where staff_member_id='5b500000-0000-4000-8000-000000000201'),
          'assigning the same person again returns the same assignment');
select is((select count(*)::int from public.event_task_assignments), 3,
          'and adds no row');

-- the never-consulted person is still staff and may be assigned
select isnt(public.assign_staff_to_task(
            '5b500000-0000-4000-8000-000000000301','5b500000-0000-4000-8000-000000000205'),
          null, 'a compatible person who never receives consultations can still be assigned');

-- removal
select lives_ok(
  $$delete from public.event_task_assignments
     where staff_member_id = '5b500000-0000-4000-8000-000000000203'$$,
  'an assignment can be removed');
select is((select count(*)::int from public.event_task_assignments), 3, 'and the row is gone');

-- ---------------------------------------------------------------------------
-- what cannot be assigned
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000204')$$,
  'MEMBER_LACKS_FUNCTION', 'somebody without the required function cannot be assigned');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000206')$$,
  'MEMBER_INACTIVE', 'a deactivated person takes no new work');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000209')$$,
  'MEMBER_NOT_FOUND', 'a person from another organization cannot be assigned');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000309',
      '5b500000-0000-4000-8000-000000000201')$$,
  'PERMISSION_DENIED', 'a task from another organization cannot be staffed');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000999',
      '5b500000-0000-4000-8000-000000000201')$$,
  'PERMISSION_DENIED', 'nor a task that does not exist');
select throws_ok(
  $$insert into public.event_task_assignments (organization_id, event_task_id, staff_member_id)
    values ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000301',
            '5b500000-0000-4000-8000-000000000204')$$,
  '42501', null, 'and the capability gate cannot be walked around with a direct insert');

-- deactivating somebody does not disturb the work they were already down for
update public.staff_members set is_active = false
 where id = '5b500000-0000-4000-8000-000000000201';
select is((select count(*)::int from public.event_task_assignments
            where staff_member_id='5b500000-0000-4000-8000-000000000201'),
          1, 'deactivating a person leaves their existing assignment intact');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000201')$$,
  'MEMBER_INACTIVE', 'but they take no further work');
update public.staff_members set is_active = true
 where id = '5b500000-0000-4000-8000-000000000201';

-- taking a function away later does not rewrite history either
delete from public.staff_member_functions
 where staff_member_id = '5b500000-0000-4000-8000-000000000202'
   and staff_function_id = '5b500000-0000-4000-8000-000000000101';
select is((select count(*)::int from public.event_task_assignments
            where staff_member_id='5b500000-0000-4000-8000-000000000202'),
          1, 'removing a function from somebody does not delete what they were put down to do');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000202')$$,
  'MEMBER_LACKS_FUNCTION', 'though they can no longer be newly assigned to it');
insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id)
values ('5b500000-0000-4000-8000-0000000000a1','5b500000-0000-4000-8000-000000000202',
        '5b500000-0000-4000-8000-000000000101');
reset role;

-- ---------------------------------------------------------------------------
-- the states the grid must keep apart, and the warnings it must be able to see
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b500000-0000-4000-8000-0000000000a0');
select public.create_staff_consultation('5b500000-0000-4000-8000-0000000000a1','Setembro',null,
    array['5b500000-0000-4000-8000-0000000000f1']::uuid[],
    array['5b500000-0000-4000-8000-000000000201','5b500000-0000-4000-8000-000000000202',
          '5b500000-0000-4000-8000-000000000203']::uuid[]);
reset role;
create temporary table pg_temp.tok as
  select m.display_name, r.token from public.staff_consultation_recipients r
    join public.staff_members m on m.id = r.staff_member_id;
grant select on pg_temp.tok to anon;

set local role anon;
-- Um: unavailable.  Dois: partial 20:00 onwards (task starts 18:00).
-- Tres: available.  Responsavel: never consulted at all.
select is(public.answer_consultation_task(
            (select token from pg_temp.tok where display_name='Sala Um'),
            '5b500000-0000-4000-8000-000000000301','unavailable') -> 'estado',
          '"guardada"'::jsonb, 'one assigned person answers unavailable');
select is(public.answer_consultation_task(
            (select token from pg_temp.tok where display_name='Sala Dois'),
            '5b500000-0000-4000-8000-000000000301','partial',
            (current_date + 30 + time '20:00')::timestamptz, null) -> 'estado',
          '"guardada"'::jsonb, 'another answers partial from 20:00');
select is(public.answer_consultation_task(
            (select token from pg_temp.tok where display_name='Sala Tres'),
            '5b500000-0000-4000-8000-000000000301','available') -> 'estado',
          '"guardada"'::jsonb, 'a third answers available');
reset role;

set local role authenticated;
select pg_temp.become('5b500000-0000-4000-8000-0000000000a0');
-- the four states stay distinguishable in the data the grid reads
select is((select state from public.staff_availability_responses r
             join public.staff_consultation_recipients c on c.id = r.recipient_id
            where c.staff_member_id='5b500000-0000-4000-8000-000000000201'),
          'unavailable', 'unavailable is readable as itself');
select is((select state from public.staff_availability_responses r
             join public.staff_consultation_recipients c on c.id = r.recipient_id
            where c.staff_member_id='5b500000-0000-4000-8000-000000000202'),
          'partial', 'partial is readable as itself');
select is((select state from public.staff_availability_responses r
             join public.staff_consultation_recipients c on c.id = r.recipient_id
            where c.staff_member_id='5b500000-0000-4000-8000-000000000203'),
          'available', 'available is readable as itself');
select is((select count(*)::int from public.staff_consultation_recipients
            where staff_member_id='5b500000-0000-4000-8000-000000000205'),
          0, 'and the never-consulted person has no recipient row: unanswered and not-consulted are different facts');

-- assigned-unavailable and assigned-with-a-short-window are ALLOWED and visible
select is((select count(*)::int from public.event_task_assignments a
             join public.staff_availability_responses r on r.event_task_id = a.event_task_id
             join public.staff_consultation_recipients c
               on c.id = r.recipient_id and c.staff_member_id = a.staff_member_id
            where r.state = 'unavailable'),
          1, 'a person who answered unavailable is assigned, and that is detectable');
select ok((select r.available_from > t.starts_at
             from public.staff_availability_responses r
             join public.staff_consultation_recipients c on c.id = r.recipient_id
             join public.event_tasks t on t.id = r.event_task_id
            where c.staff_member_id='5b500000-0000-4000-8000-000000000202'),
          'the partial window starts after the task does — a conflict the grid can see');
select ok((select t.ends_at is not null from public.event_tasks t
            where t.id='5b500000-0000-4000-8000-000000000301'),
          'and the task has an end, so coverage is determinable rather than a guess');

-- assigned but never asked: allowed, and distinguishable from silence
select is((select count(*)::int from public.event_task_assignments
            where staff_member_id='5b500000-0000-4000-8000-000000000205'),
          1, 'the never-consulted person is assigned');

-- available-but-unassigned: Sala Tres said yes and was removed from the task
select is((select count(*)::int from public.staff_availability_responses r
             join public.staff_consultation_recipients c on c.id = r.recipient_id
            where r.state='available'
              and not exists (select 1 from public.event_task_assignments a
                               where a.event_task_id = r.event_task_id
                                 and a.staff_member_id = c.staff_member_id)),
          1, 'exactly one person answered available and is not assigned');

-- below minimum is a readable fact, and nothing blocked reaching it
delete from public.event_task_assignments
 where staff_member_id in ('5b500000-0000-4000-8000-000000000202',
                           '5b500000-0000-4000-8000-000000000205');
select is((select count(*)::int from public.event_task_assignments
            where event_task_id='5b500000-0000-4000-8000-000000000301'),
          1, 'one person remains on a task that needs two');
select ok((select count(*) < (select minimum_people from public.event_tasks
                               where id='5b500000-0000-4000-8000-000000000301')
             from public.event_task_assignments
            where event_task_id='5b500000-0000-4000-8000-000000000301'),
          'below minimum is detectable — and was never prevented');
reset role;

-- ---------------------------------------------------------------------------
-- isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b500000-0000-4000-8000-0000000000b0');
select is((select count(*)::int from public.event_task_assignments), 0,
          'Organization B reads no Organization A assignment');
reset role;
set local role authenticated;
select pg_temp.become('5b500000-0000-4000-8000-0000000000c0');
select is((select count(*)::int from public.event_task_assignments), 0,
          'a user without the assignments permission reads none in their own organization');
select throws_ok(
  $$select public.assign_staff_to_task('5b500000-0000-4000-8000-000000000301',
      '5b500000-0000-4000-8000-000000000203')$$,
  'PERMISSION_DENIED', 'nor may they assign anybody');
-- RLS FILTERS a delete rather than refusing it: with no row visible the
-- statement is a no-op. What matters is that nothing is destroyed.
select lives_ok(
  $$delete from public.event_task_assignments$$,
  'a delete by an unpermitted user raises nothing — the policy filters, it does not shout');
reset role;
select is((select count(*)::int from public.event_task_assignments), 1,
          'and it removed nothing: the assignment is untouched');

select * from finish();
rollback;
