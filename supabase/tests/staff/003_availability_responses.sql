-- Operational Staff MVP · Step 4 — availability responses.
-- Every write goes through answer_consultation_task as `anon`, holding nothing
-- but a token, because that is exactly what a consulted person holds. Synthetic
-- fixtures only; no real person is named. Everything rolls back.
begin;
select plan(57);

create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- privilege surface: the relation is readable by the backoffice and writable
-- by nobody except the function
-- ---------------------------------------------------------------------------
select has_table('public', 'staff_availability_responses', 'the response relation exists');
select ok((select relrowsecurity from pg_class where relname='staff_availability_responses'
            and relnamespace='public'::regnamespace), 'row level security is enabled on it');
select ok(not (select relforcerowsecurity from pg_class where relname='staff_availability_responses'
            and relnamespace='public'::regnamespace), 'FORCE is not set, so the definer function can read');
select is((select count(*)::int from information_schema.role_table_grants
            where table_name='staff_availability_responses' and grantee='anon'),
          0, 'anon holds no privilege at all on the response relation');
select is((select count(*)::int from information_schema.role_table_grants
            where table_name='staff_availability_responses' and grantee='authenticated'
              and privilege_type in ('INSERT','UPDATE','DELETE')),
          0, 'authenticated may read answers but never write them');
select is((select count(*)::int from pg_policies where schemaname='public'
            and tablename='staff_availability_responses' and cmd <> 'SELECT'),
          0, 'no policy exists for any command other than SELECT');
select ok((select count(*) > 0 from information_schema.role_routine_grants
            where grantee='anon' and routine_name='answer_consultation_task'),
          'anon may execute the answer function — a consulted person has no account');

-- ---------------------------------------------------------------------------
-- fixture: two organizations; Org A runs a consultation over two events
-- ---------------------------------------------------------------------------
insert into auth.users (id, created_at) values
  ('5b400000-0000-4000-8000-0000000000a0', now()),
  ('5b400000-0000-4000-8000-0000000000b0', now());
insert into public.user_profiles (user_id, display_name) values
  ('5b400000-0000-4000-8000-0000000000a0','UA'),
  ('5b400000-0000-4000-8000-0000000000b0','UB');
insert into public.tenants (id, slug, nome, prefixo) values
  ('5b400000-0000-4000-8000-0000000000a1','b4-org-a','Org A','QOA'),
  ('5b400000-0000-4000-8000-0000000000b1','b4-org-b','Org B','QOB');
insert into public.organizations
  (id, slug, name, status, access_code_prefix, locale, currency, time_zone) values
  ('5b400000-0000-4000-8000-0000000000a1','b4-org-a','Org A','active','QOA','pt-PT','EUR','Europe/Lisbon'),
  ('5b400000-0000-4000-8000-0000000000b1','b4-org-b','Org B','active','QOB','pt-PT','EUR','Europe/Lisbon');
insert into public.roles (id, organization_id, key, name, is_system) values
  ('5b400000-0000-4000-8000-0000000000a2','5b400000-0000-4000-8000-0000000000a1','owner','Owner',true),
  ('5b400000-0000-4000-8000-0000000000b2','5b400000-0000-4000-8000-0000000000b1','owner','Owner',true);
insert into public.organization_memberships (id, organization_id, user_id, status, joined_at) values
  ('5b400000-0000-4000-8000-00000000ab01','5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-0000000000a0','active',now()),
  ('5b400000-0000-4000-8000-00000000ab02','5b400000-0000-4000-8000-0000000000b1','5b400000-0000-4000-8000-0000000000b0','active',now());
insert into public.membership_roles (membership_id, role_id, organization_id) values
  ('5b400000-0000-4000-8000-00000000ab01','5b400000-0000-4000-8000-0000000000a2','5b400000-0000-4000-8000-0000000000a1'),
  ('5b400000-0000-4000-8000-00000000ab02','5b400000-0000-4000-8000-0000000000b2','5b400000-0000-4000-8000-0000000000b1');
insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r
 cross join unnest(array['staff.read','staff.manage','staff.tasks.read','staff.tasks.manage',
                         'staff.consultations.read','staff.consultations.manage']) as k
 where r.key = 'owner';

insert into public.submissions (id, tenant_id, data_evento) values
  ('5b400000-0000-4000-8000-0000000000f1','5b400000-0000-4000-8000-0000000000a1', current_date + 30),
  ('5b400000-0000-4000-8000-0000000000f2','5b400000-0000-4000-8000-0000000000a1', current_date + 60),
  ('5b400000-0000-4000-8000-0000000000f8','5b400000-0000-4000-8000-0000000000a1', current_date + 90),
  ('5b400000-0000-4000-8000-0000000000f9','5b400000-0000-4000-8000-0000000000b1', current_date + 30);
insert into public.staff_functions (id, organization_id, name, area) values
  ('5b400000-0000-4000-8000-000000000101','5b400000-0000-4000-8000-0000000000a1','Servico de mesa','Sala'),
  ('5b400000-0000-4000-8000-000000000102','5b400000-0000-4000-8000-0000000000a1','Empratamento','Cozinha'),
  ('5b400000-0000-4000-8000-000000000109','5b400000-0000-4000-8000-0000000000b1','Servico de mesa','Sala');
insert into public.staff_members (id, organization_id, display_name, engagement, may_be_consulted) values
  ('5b400000-0000-4000-8000-000000000201','5b400000-0000-4000-8000-0000000000a1','Pessoa Sala','core',true),
  ('5b400000-0000-4000-8000-000000000202','5b400000-0000-4000-8000-0000000000a1','Pessoa Cozinha','core',true),
  ('5b400000-0000-4000-8000-000000000209','5b400000-0000-4000-8000-0000000000b1','Pessoa Org B','core',true);
insert into public.staff_member_functions (organization_id, staff_member_id, staff_function_id) values
  ('5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-000000000201','5b400000-0000-4000-8000-000000000101'),
  ('5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-000000000202','5b400000-0000-4000-8000-000000000102'),
  ('5b400000-0000-4000-8000-0000000000b1','5b400000-0000-4000-8000-000000000209','5b400000-0000-4000-8000-000000000109');
-- t1, t3: Sala.  t2: Cozinha.  t8: Sala, but on an event NOT covered.
insert into public.event_tasks
  (id, organization_id, submission_id, staff_function_id, title, starts_at, minimum_people) values
  ('5b400000-0000-4000-8000-000000000301','5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-0000000000f1',
   '5b400000-0000-4000-8000-000000000101','Servico ao jantar', now() + interval '30 days', 4),
  ('5b400000-0000-4000-8000-000000000302','5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-0000000000f1',
   '5b400000-0000-4000-8000-000000000102','Empratar', now() + interval '30 days', 2),
  ('5b400000-0000-4000-8000-000000000303','5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-0000000000f2',
   '5b400000-0000-4000-8000-000000000101','Servico ao almoco', now() + interval '60 days', 3),
  ('5b400000-0000-4000-8000-000000000308','5b400000-0000-4000-8000-0000000000a1','5b400000-0000-4000-8000-0000000000f8',
   '5b400000-0000-4000-8000-000000000101','Evento nao coberto', now() + interval '90 days', 2),
  ('5b400000-0000-4000-8000-000000000309','5b400000-0000-4000-8000-0000000000b1','5b400000-0000-4000-8000-0000000000f9',
   '5b400000-0000-4000-8000-000000000109','Tarefa de outra casa', now() + interval '30 days', 2);

set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000a0');
select public.create_staff_consultation('5b400000-0000-4000-8000-0000000000a1','Outubro',null,
    array['5b400000-0000-4000-8000-0000000000f1','5b400000-0000-4000-8000-0000000000f2']::uuid[],
    array['5b400000-0000-4000-8000-000000000201','5b400000-0000-4000-8000-000000000202']::uuid[]);
reset role;

create temporary table pg_temp.t as
  select m.display_name, r.token
    from public.staff_consultation_recipients r
    join public.staff_members m on m.id = r.staff_member_id;
grant select on pg_temp.t to anon;
create or replace function pg_temp.tok(n text) returns text language sql stable as $$
  select token from pg_temp.t where display_name = n $$;
grant execute on function pg_temp.tok(text) to anon;

-- ---------------------------------------------------------------------------
-- the three states, saved one at a time
-- ---------------------------------------------------------------------------
set local role anon;

select is(public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #> '{eventos,0,tarefas,0,resposta}',
          'null'::jsonb, 'a question nobody has answered comes back explicitly unanswered');
select is((public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,0,respondidas}')::int,
          0, 'and the event card starts at zero answered');

select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','available') -> 'estado',
          '"guardada"'::jsonb, 'an available answer is saved');
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000303','unavailable') -> 'estado',
          '"guardada"'::jsonb, 'an unavailable answer is saved');
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Cozinha'),
            '5b400000-0000-4000-8000-000000000302','partial',
            now() + interval '30 days 4 hours', null, 'Chego do outro servico') -> 'estado',
          '"guardada"'::jsonb, 'a partial answer with only a lower bound is saved');
reset role;
select is((select count(*)::int from public.staff_availability_responses), 3,
          'three answers exist, one row per question');
select is((select state from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000302'),
          'partial', 'the partial answer kept its state');
select ok((select available_from is not null and available_until is null
             from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000302'),
          'a one-sided window is stored as one-sided, not filled in');
select is((select note from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000302'),
          'Chego do outro servico', 'the note rides along with the window');

-- the upper-bound-only shape, and both bounds
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','partial',
            null, now() + interval '30 days 6 hours') -> 'estado',
          '"guardada"'::jsonb, 'a partial answer with only an upper bound is saved');
reset role;
select ok((select available_from is null and available_until is not null
             from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'the upper-bound-only window is stored as such');
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','partial',
            now() + interval '30 days 2 hours', now() + interval '30 days 6 hours') -> 'estado',
          '"guardada"'::jsonb, 'a partial answer with both bounds is saved');
reset role;
select ok((select available_from is not null and available_until is not null
             from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'both bounds are stored');

-- ---------------------------------------------------------------------------
-- progressive saving, reload, and changing an answer
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.staff_availability_responses), 3,
          'changing an answer updates the same row instead of adding one');

set local role anon;
-- reload: the door hands the saved answers straight back
select is(public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,0,tarefas,0,resposta,estado}',
          'partial', 'reopening the link reloads the saved answer');
select ok((public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,0,tarefas,0,resposta,de}') is not null,
          'and reloads its window too');
select is((public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,0,respondidas}')::int,
          1, 'the first event card reports one answered');
select is((public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,0,total}')::int,
          1, 'out of the one question that person has on it');
select is((public.staff_consultation_view(pg_temp.tok('Pessoa Sala')) #>> '{eventos,1,respondidas}')::int,
          1, 'and the second card is answered too — progress is per event');

-- changing an answer back
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','available') -> 'estado',
          '"guardada"'::jsonb, 'an answer can be changed while the link is valid');
reset role;
select is((select state from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'available', 'the change took');
select ok((select available_from is null and available_until is null
             from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'and switching away from partial clears the window rather than leaving it dangling');

-- idempotence: the same save twice is one row and the same content
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','available') -> 'estado',
          '"guardada"'::jsonb, 'the identical save repeated is accepted');
reset role;
select is((select count(*)::int from public.staff_availability_responses), 3,
          'and adds no row — a retry or a double tap is safe');

-- ---------------------------------------------------------------------------
-- validation of the partial boundary
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000301','partial', null, null)$$,
  'PARTIAL_NEEDS_BOUNDARY', 'a partial answer with neither bound is refused');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000301','partial',
      now() + interval '31 days', now() + interval '30 days')$$,
  'WINDOW_INVERTED', 'a window that ends before it starts is refused');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000301','talvez')$$,
  'INVALID_STATE', 'a state outside the three is refused');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000301','available', null, null, repeat('x', 281))$$,
  'NOTE_TOO_LONG', 'an over-long note is refused');
reset role;
-- a window on a whole yes is dropped rather than stored as noise
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','available',
            now() + interval '30 days', now() + interval '31 days') -> 'estado',
          '"guardada"'::jsonb, 'a window sent with a whole yes is accepted');
reset role;
select ok((select available_from is null and available_until is null
             from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'but not stored: a window belongs to a partial answer and nothing else');

-- the CHECK is the backstop, independent of the function
select throws_ok(
  $$insert into public.staff_availability_responses
      (organization_id, recipient_id, event_task_id, state, available_from)
    select '5b400000-0000-4000-8000-0000000000a1', r.id,
           '5b400000-0000-4000-8000-000000000303', 'available', now()
      from public.staff_consultation_recipients r limit 1$$,
  '23514', null, 'the relation itself refuses a window on a non-partial answer');
select throws_ok(
  $$insert into public.staff_availability_responses
      (organization_id, recipient_id, event_task_id, state)
    select '5b400000-0000-4000-8000-0000000000a1', r.id,
           '5b400000-0000-4000-8000-000000000303', 'partial'
      from public.staff_consultation_recipients r limit 1$$,
  '23514', null, 'and refuses a partial answer with no window');

-- ---------------------------------------------------------------------------
-- what a token may not reach
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000302','available')$$,
  'TASK_NOT_AVAILABLE', 'a recipient cannot answer a task their capabilities do not cover');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000308','available')$$,
  'TASK_NOT_AVAILABLE', 'nor a task on an event this consultation does not cover');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000309','available')$$,
  'TASK_NOT_AVAILABLE', 'nor a task belonging to another organization');
select throws_ok(
  $$select public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
      '5b400000-0000-4000-8000-000000000999','available')$$,
  'TASK_NOT_AVAILABLE', 'nor a task that does not exist — the refusals are indistinguishable');
select is(public.answer_consultation_task('nao-e-um-token-mas-tem-comprimento-suficiente-mesmo',
            '5b400000-0000-4000-8000-000000000301','available') -> 'estado',
          '"terminado"'::jsonb, 'an unknown token is refused without confirming any token exists');
select is(public.answer_consultation_task(null,
            '5b400000-0000-4000-8000-000000000301','available') -> 'estado',
          '"terminado"'::jsonb, 'a null token is refused');

-- one recipient never sees or touches another's word
select is((select count(*)::int from jsonb_array_elements(
             public.staff_consultation_view(pg_temp.tok('Pessoa Cozinha')) -> 'eventos') ev
           where ev #>> '{tarefas,0,titulo}' = 'Servico ao jantar'),
          0, 'the Cozinha person is not even shown the Sala task');
select is(public.staff_consultation_view(pg_temp.tok('Pessoa Cozinha')) #>> '{eventos,0,tarefas,0,resposta,nota}',
          'Chego do outro servico', 'each door shows its own answer');
select is((select count(*)::int from pg_temp.t d
            where public.staff_consultation_view(d.token)::text like '%Chego do outro servico%'
              and d.display_name = 'Pessoa Sala'),
          0, 'and never the other person''s');
reset role;

-- ---------------------------------------------------------------------------
-- a door that is closed is read-only
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000a0');
update public.staff_consultation_recipients set revoked_at = now(), revoked_reason = 'teste'
 where staff_member_id = '5b400000-0000-4000-8000-000000000201';
reset role;
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Sala'),
            '5b400000-0000-4000-8000-000000000301','unavailable') -> 'estado',
          '"terminado"'::jsonb, 'a revoked recipient cannot write');
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Cozinha'),
            '5b400000-0000-4000-8000-000000000302','available') -> 'estado',
          '"guardada"'::jsonb, 'and the other recipient is unaffected by that revocation');
reset role;
select is((select state from public.staff_availability_responses
            where event_task_id='5b400000-0000-4000-8000-000000000301'),
          'available', 'the revoked recipient''s existing answer is untouched');

set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000a0');
update public.staff_consultations set closed_at = now(), closed_reason = 'teste';
reset role;
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Cozinha'),
            '5b400000-0000-4000-8000-000000000302','unavailable') -> 'estado',
          '"terminado"'::jsonb, 'a closed consultation cannot be written to');
reset role;

set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000a0');
update public.staff_consultations set closed_at = null, closed_reason = null;
reset role;
-- and once every covered event is concluded
update public.submissions set fase = 'contrato', status = 'Concluído'
 where id in ('5b400000-0000-4000-8000-0000000000f1','5b400000-0000-4000-8000-0000000000f2');
set local role anon;
select is(public.answer_consultation_task(pg_temp.tok('Pessoa Cozinha'),
            '5b400000-0000-4000-8000-000000000302','unavailable') -> 'estado',
          '"terminado"'::jsonb, 'a consultation whose events are all concluded is read-only');
select is(public.staff_consultation_view(pg_temp.tok('Pessoa Cozinha')) -> 'estado',
          '"terminado"'::jsonb, 'and its door reads terminated, exactly as Step 3 decided');
reset role;

-- ---------------------------------------------------------------------------
-- organization isolation of the stored answers
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000b0');
select is((select count(*)::int from public.staff_availability_responses), 0,
          'Organization B reads no Organization A answer');
reset role;
set local role authenticated;
select pg_temp.become('5b400000-0000-4000-8000-0000000000a0');
select ok((select count(*) > 0 from public.staff_availability_responses),
          'and a permitted Organization A user reads their own');
select throws_ok(
  $$update public.staff_availability_responses set state = 'unavailable'$$,
  '42501', null, 'not even a permitted backoffice user may rewrite somebody''s answer');
reset role;

select * from finish();
rollback;
