-- Operational Staff MVP · Step 6 — fixed team instructions, and the data an
-- individual plan is projected from. The projection itself is JavaScript and is
-- covered by src/lib/planoFormato.test.mjs; what belongs here is tenancy, the
-- shape of the settings relation, and that the assignment data a plan reads is
-- organization-isolated. Synthetic fixtures only; no real person or real
-- instruction wording is named. Everything rolls back.
begin;
select plan(40);

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- shape and privileges
-- ---------------------------------------------------------------------------
select has_table('public', 'staff_team_instructions', 'the instructions relation exists');
select ok((select relrowsecurity from pg_class where relname='staff_team_instructions'
            and relnamespace='public'::regnamespace), 'row level security is enabled');
select ok(not (select relforcerowsecurity from pg_class where relname='staff_team_instructions'
            and relnamespace='public'::regnamespace), 'FORCE is not set');
select is((select count(*)::int from information_schema.role_table_grants
            where table_name='staff_team_instructions' and grantee='anon'),
          0, 'anon holds no privilege on the instructions');
select is((select string_agg(a.attname, ',' order by a.attname)
             from pg_constraint c
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
            where c.conrelid='public.staff_team_instructions'::regclass and c.contype='p'),
          'organization_id',
          'the organization IS the key: one house, one set of instructions, nothing to disambiguate');
select is((select count(*)::int from information_schema.column_privileges
            where table_name='staff_team_instructions' and grantee='authenticated'
              and privilege_type='UPDATE' and column_name='organization_id'),
          0, 'organization_id is outside the update grant — instructions never move house');
select is((select count(*)::int from pg_policies where schemaname='public'
            and tablename='staff_team_instructions' and cmd='DELETE'),
          0, 'no DELETE policy: instructions are emptied, not removed');
-- Step 6 adds NO permission: the team catalogue keys already govern this
select is((select count(*)::int from public.permissions where key like 'staff.instructions%'
            or key like 'staff.plans%'),
          0, 'Step 6 introduces no new permission key');
select is((select count(*)::int from pg_tables where schemaname='public'
            and (tablename like '%plan%' or tablename like '%_plans')),
          0, 'and no plan relation: a plan is a live projection, never a stored snapshot');
-- there is no per-event override anywhere
select is((select count(*)::int from information_schema.columns
            where table_name='staff_team_instructions'
              and column_name in ('submission_id','event_id','event_task_id')),
          0, 'the instructions carry no event column — there is no per-event override');
select is((select count(*)::int from information_schema.columns
            where table_schema='public' and table_name='event_tasks'
              and column_name in ('standard_instructions','hot_weather_instructions')),
          0, 'and no task-level override either');

-- ---------------------------------------------------------------------------
-- fixture: two organizations
-- ---------------------------------------------------------------------------
insert into auth.users (id, created_at) values
  ('5b600000-0000-4000-8000-0000000000a0', now()),
  ('5b600000-0000-4000-8000-0000000000b0', now()),
  ('5b600000-0000-4000-8000-0000000000c0', now());
insert into public.user_profiles (user_id, display_name) values
  ('5b600000-0000-4000-8000-0000000000a0','UA'),
  ('5b600000-0000-4000-8000-0000000000b0','UB'),
  ('5b600000-0000-4000-8000-0000000000c0','UC');
insert into public.tenants (id, slug, nome, prefixo) values
  ('5b600000-0000-4000-8000-0000000000a1','b6-org-a','Org A','SOA'),
  ('5b600000-0000-4000-8000-0000000000b1','b6-org-b','Org B','SOB');
insert into public.organizations
  (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('5b600000-0000-4000-8000-0000000000a1','b6-org-a','Org A','active','SOA','pt-PT','EUR','Europe/Lisbon'),
  ('5b600000-0000-4000-8000-0000000000b1','b6-org-b','Org B','active','SOB','pt-PT','EUR','Europe/Lisbon');
insert into public.roles (id, organization_id, key, name, is_system) values
  ('5b600000-0000-4000-8000-0000000000a2','5b600000-0000-4000-8000-0000000000a1','owner','Owner',true),
  ('5b600000-0000-4000-8000-0000000000b2','5b600000-0000-4000-8000-0000000000b1','owner','Owner',true),
  ('5b600000-0000-4000-8000-0000000000c2','5b600000-0000-4000-8000-0000000000a1','viewer','Viewer',false);
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('5b600000-0000-4000-8000-00000000ab01','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000a0','active',now()),
  ('5b600000-0000-4000-8000-00000000ab02','5b600000-0000-4000-8000-0000000000b1','5b600000-0000-4000-8000-0000000000b0','active',now()),
  ('5b600000-0000-4000-8000-00000000ab03','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000c0','active',now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('5b600000-0000-4000-8000-00000000ab01','5b600000-0000-4000-8000-0000000000a2','5b600000-0000-4000-8000-0000000000a1'),
  ('5b600000-0000-4000-8000-00000000ab02','5b600000-0000-4000-8000-0000000000b2','5b600000-0000-4000-8000-0000000000b1'),
  ('5b600000-0000-4000-8000-00000000ab03','5b600000-0000-4000-8000-0000000000c2','5b600000-0000-4000-8000-0000000000a1');
insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r
 cross join unnest(array['staff.read','staff.manage','staff.tasks.read','staff.tasks.manage',
                         'staff.consultations.read','staff.consultations.manage',
                         'staff.assignments.read','staff.assignments.manage']) as k
 where r.key = 'owner';

-- two events for Org A, one for Org B
insert into public.submissions (id, tenant_id, data_evento) values
  ('5b600000-0000-4000-8000-0000000000f1','5b600000-0000-4000-8000-0000000000a1', current_date + 30),
  ('5b600000-0000-4000-8000-0000000000f2','5b600000-0000-4000-8000-0000000000a1', current_date + 60),
  ('5b600000-0000-4000-8000-0000000000f9','5b600000-0000-4000-8000-0000000000b1', current_date + 30);
insert into public.staff_functions (id, organization_id, name, area) values
  ('5b600000-0000-4000-8000-000000000101','5b600000-0000-4000-8000-0000000000a1','Servico de mesa','Sala'),
  ('5b600000-0000-4000-8000-000000000109','5b600000-0000-4000-8000-0000000000b1','Servico de mesa','Sala');
insert into public.staff_members (id, organization_id, display_name, engagement, may_be_consulted, is_active) values
  ('5b600000-0000-4000-8000-000000000201','5b600000-0000-4000-8000-0000000000a1','Pessoa Um','core',true,true),
  ('5b600000-0000-4000-8000-000000000202','5b600000-0000-4000-8000-0000000000a1','Pessoa Dois','core',true,true),
  ('5b600000-0000-4000-8000-000000000209','5b600000-0000-4000-8000-0000000000b1','Pessoa Org B','core',true,true);
insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id) values
  ('5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-000000000201','5b600000-0000-4000-8000-000000000101'),
  ('5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-000000000202','5b600000-0000-4000-8000-000000000101'),
  ('5b600000-0000-4000-8000-0000000000b1','5b600000-0000-4000-8000-000000000209','5b600000-0000-4000-8000-000000000109');
-- event f1: setup the day BEFORE, service on the day, collection the day AFTER
insert into public.event_tasks
  (id, organization_id, submission_id, staff_function_id, title, starts_at, ends_at, minimum_people) values
  ('5b600000-0000-4000-8000-000000000301','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000f1',
   '5b600000-0000-4000-8000-000000000101','Montagem',
   (current_date + 29 + time '09:00')::timestamptz, (current_date + 29 + time '13:00')::timestamptz, 1),
  ('5b600000-0000-4000-8000-000000000302','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000f1',
   '5b600000-0000-4000-8000-000000000101','Servico ao jantar',
   (current_date + 30 + time '18:00')::timestamptz, (current_date + 30 + time '23:00')::timestamptz, 2),
  ('5b600000-0000-4000-8000-000000000303','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000f1',
   '5b600000-0000-4000-8000-000000000101','Recolha',
   (current_date + 31 + time '10:00')::timestamptz, null, 1),
  ('5b600000-0000-4000-8000-000000000304','5b600000-0000-4000-8000-0000000000a1','5b600000-0000-4000-8000-0000000000f2',
   '5b600000-0000-4000-8000-000000000101','Servico noutro evento',
   (current_date + 60 + time '19:00')::timestamptz, null, 1),
  ('5b600000-0000-4000-8000-000000000309','5b600000-0000-4000-8000-0000000000b1','5b600000-0000-4000-8000-0000000000f9',
   '5b600000-0000-4000-8000-000000000109','Tarefa de outra casa',
   (current_date + 30 + time '18:00')::timestamptz, null, 1);

set local role authenticated;
select pg_temp.become('5b600000-0000-4000-8000-0000000000a0');
select public.assign_staff_to_task('5b600000-0000-4000-8000-000000000301','5b600000-0000-4000-8000-000000000201');
select public.assign_staff_to_task('5b600000-0000-4000-8000-000000000302','5b600000-0000-4000-8000-000000000201');
select public.assign_staff_to_task('5b600000-0000-4000-8000-000000000302','5b600000-0000-4000-8000-000000000202');
select public.assign_staff_to_task('5b600000-0000-4000-8000-000000000303','5b600000-0000-4000-8000-000000000201');
select public.assign_staff_to_task('5b600000-0000-4000-8000-000000000304','5b600000-0000-4000-8000-000000000201');

-- ---------------------------------------------------------------------------
-- the data a plan is projected from
-- ---------------------------------------------------------------------------
-- one person, one event: the plan's task set
select is((select count(*)::int from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f1'),
          3, 'the person has three assigned tasks in the first event');
-- and the same person in a second event is a SEPARATE set
select is((select count(*)::int from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f2'),
          1, 'and one in the second — two events, two plans, never combined');
select is((select count(distinct t.submission_id)::int from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'),
          2, 'the assignments span exactly two events');
-- one event, three operational dates, one plan
select is((select count(distinct (t.starts_at at time zone 'Europe/Lisbon')::date)::int
             from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f1'),
          3, 'those three tasks fall on three different operational dates');
-- The event's formal date is current_date + 30 by construction. It is compared
-- against a literal rather than joined from public.submissions on purpose: that
-- legacy relation gates on the LEGACY membership chain, not the v2 one this
-- fixture builds, so a Staff-side join to it reads nothing. The application
-- never makes that join either — the event's own page supplies its summary.
select is((select count(*)::int
             from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f1'
              and (t.starts_at at time zone 'Europe/Lisbon')::date < current_date + 30),
          1, 'a task starts before the formal event date and is still part of the plan');
select is((select count(*)::int
             from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000201'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f1'
              and (t.starts_at at time zone 'Europe/Lisbon')::date > current_date + 30),
          1, 'and one after it, also part of the same plan');
-- co-workers are only those on the SAME task
select is((select count(*)::int from public.event_task_assignments
            where event_task_id='5b600000-0000-4000-8000-000000000302'), 2,
          'two people share the dinner task');
select is((select count(*)::int from public.event_task_assignments
            where event_task_id='5b600000-0000-4000-8000-000000000301'), 1,
          'and the setup task is one person alone — no co-worker to name');
select is((select count(*)::int from public.event_task_assignments a
             join public.event_tasks t on t.id = a.event_task_id
            where a.staff_member_id='5b600000-0000-4000-8000-000000000202'
              and t.submission_id='5b600000-0000-4000-8000-0000000000f1'),
          1, 'the second person is on one task only: their plan never inherits the first''s');

-- an assigned person who answered unavailable still has their assignment
select public.create_staff_consultation('5b600000-0000-4000-8000-0000000000a1','Setembro',null,
    array['5b600000-0000-4000-8000-0000000000f1']::uuid[],
    array['5b600000-0000-4000-8000-000000000201']::uuid[]);
reset role;
create temporary table pg_temp.tk as
  select r.token from public.staff_consultation_recipients r
   where r.staff_member_id = '5b600000-0000-4000-8000-000000000201';
grant select on pg_temp.tk to anon;
set local role anon;
select is(public.answer_consultation_task((select token from pg_temp.tk),
            '5b600000-0000-4000-8000-000000000302','unavailable') -> 'estado',
          '"guardada"'::jsonb, 'the assigned person answers unavailable');
reset role;
set local role authenticated;
select pg_temp.become('5b600000-0000-4000-8000-0000000000a0');
select is((select count(*)::int from public.event_task_assignments
            where staff_member_id='5b600000-0000-4000-8000-000000000201'
              and event_task_id='5b600000-0000-4000-8000-000000000302'),
          1, 'and keeps the assignment: availability never removes anybody from a plan');

-- a deactivated person keeps theirs too
update public.staff_members set is_active = false
 where id = '5b600000-0000-4000-8000-000000000202';
select is((select count(*)::int from public.event_task_assignments
            where staff_member_id='5b600000-0000-4000-8000-000000000202'),
          1, 'a deactivated person keeps the assignment they already held');
update public.staff_members set is_active = true
 where id = '5b600000-0000-4000-8000-000000000202';

-- ---------------------------------------------------------------------------
-- the instructions themselves
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.staff_team_instructions
      (organization_id, standard_instructions, hot_weather_instructions)
    values ('5b600000-0000-4000-8000-0000000000a1','TEXTO NORMAL DE TESTE','TEXTO DE CALOR DE TESTE')$$,
  'a permitted user writes the house instructions');
select lives_ok(
  $$update public.staff_team_instructions
       set standard_instructions = 'OUTRO TEXTO', hot_weather_instructions = null
     where organization_id = '5b600000-0000-4000-8000-0000000000a1'$$,
  'and can rewrite them, or clear the hot-weather half alone');
select is((select hot_weather_instructions from public.staff_team_instructions
            where organization_id='5b600000-0000-4000-8000-0000000000a1'),
          null, 'the cleared half is null, not an empty string');
select throws_ok(
  $$insert into public.staff_team_instructions (organization_id, standard_instructions)
    values ('5b600000-0000-4000-8000-0000000000a1','')$$,
  '23514', null, 'a blank string is refused: "not written" and "written, empty" stay different');
select throws_ok(
  $$insert into public.staff_team_instructions (organization_id, standard_instructions)
    values ('5b600000-0000-4000-8000-0000000000a1','SEGUNDA LINHA')$$,
  '23505', null, 'a second row for the same house is impossible — the organization is the key');
select throws_ok(
  $$insert into public.staff_team_instructions (organization_id, standard_instructions)
    values ('5b600000-0000-4000-8000-0000000000a1', repeat('x', 4001))$$,
  '23514', null, 'and an unbounded wall of text is refused');
select throws_ok(
  $$update public.staff_team_instructions
       set organization_id = '5b600000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'instructions cannot be moved to another house');
reset role;

-- Organization B is separate in every direction
set local role authenticated;
select pg_temp.become('5b600000-0000-4000-8000-0000000000b0');
select is((select count(*)::int from public.staff_team_instructions), 0,
          'Organization B reads none of Organization A''s instructions');
select lives_ok(
  $$insert into public.staff_team_instructions (organization_id, standard_instructions)
    values ('5b600000-0000-4000-8000-0000000000b1','TEXTO DA OUTRA CASA')$$,
  'and keeps its own, entirely separate');
select is((select count(*)::int from public.staff_team_instructions), 1,
          'seeing only its own row');
select is((select count(*)::int from public.event_task_assignments), 0,
          'Organization B reads no Organization A assignment, so can build no plan from one');
select is((select count(*)::int from public.event_tasks
            where organization_id = '5b600000-0000-4000-8000-0000000000a1'),
          0, 'nor any Organization A task');
select is((select count(*)::int from public.event_tasks), 1,
          'it sees exactly its own one task, and no more');
select is((select count(*)::int from public.staff_members), 1,
          'and only its own staff');
select throws_ok(
  $$insert into public.staff_team_instructions (organization_id, standard_instructions)
    values ('5b600000-0000-4000-8000-0000000000a1','ASSALTO')$$,
  '42501', null, 'and cannot write instructions into Organization A');
reset role;

-- a user of Organization A without the staff permission sees nothing
set local role authenticated;
select pg_temp.become('5b600000-0000-4000-8000-0000000000c0');
select is((select count(*)::int from public.staff_team_instructions), 0,
          'a user without staff.read sees no instructions in their own organization');
select is((select count(*)::int from public.event_task_assignments), 0,
          'and no assignments, so no plan');
reset role;

select * from finish();
rollback;
