-- =============================================================================
-- Sollelio v2 — Operational Staff MVP · Step 4 · Availability responses
-- Migration: 20260827182507_staff_availability_responses.sql
--
-- Additive. Creates one relation, one public write function, and replaces the
-- Step 3 read function so a reopened link comes back with its saved answers.
-- It alters no Point 1 object, changes no Step 3 rule, and depends on no Events
-- Core relation.
--
-- DOMAIN: every compatible task a recipient is shown is ONE question, answered
-- on its own. Three states, and the third carries structure:
--   available   — can do the task as scheduled;
--   unavailable — cannot;
--   partial     — can, but only inside a window.
-- A partial answer is NOT free text. It stores available_from and/or
-- available_until as real timestamps, because the coverage and assignment work
-- that comes later has to REASON about the limit — "só depois das 22h" in a
-- note is a sentence no query can use. The note stays, for the part of the
-- reason that is genuinely prose.
--
-- PROGRESSIVE: one row per (recipient, task), written the moment the person
-- taps. Nobody has to reach the end of a consultation for the first answer to
-- count, and the unique key makes a repeated save an update rather than a
-- duplicate — retries, double taps and a flaky phone connection all converge on
-- the same row.
--
-- TENANCY: organization_id is carried explicitly and both FKs are composite, so
-- an answer cannot join a recipient of one organization to a task of another.
-- §2.0 adds the enabler the Step 3 relation lacked; that relation is otherwise
-- untouched.
--
-- THE DOOR: answers are written ONLY by public.answer_consultation_task. The
-- relation has no insert, update or delete grant and no such policy, for anon
-- or for authenticated. The function resolves the recipient from the token
-- alone and re-derives the organization, the consultation and the task's
-- eligibility from that; nothing the client sends about who it is, which
-- organization it belongs to or which consultation it is answering is trusted
-- or even read. Backoffice roles get SELECT, gated by the Step 3 permission.
--
-- AUDIT: as in Steps 1 and 3, attribution lives on the rows and no audit
-- trigger is installed; the reusable helper belongs to E1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Relations.
-- -----------------------------------------------------------------------------

-- 1.0 The Step 3 recipient gains the composite-FK enabler it did not need until
--     now. Additive: it creates a unique index and changes no row.
alter table public.staff_consultation_recipients
    add constraint staff_consultation_recipients_id_organization_key unique (id, organization_id);

-- 1.1 staff_availability_responses — one person's answer to one question.
create table if not exists public.staff_availability_responses (
    id uuid not null default gen_random_uuid(),
    organization_id uuid not null references public.organizations (id) on delete restrict,
    recipient_id uuid not null,
    event_task_id uuid not null,
    state text not null
        constraint staff_availability_responses_state_known
        check (state in ('available', 'unavailable', 'partial')),
    available_from timestamptz,
    available_until timestamptz,
    note text
        constraint staff_availability_responses_note_short
        check (note is null or length(note) <= 280),
    answered_at timestamptz not null default now(),
    updated_at timestamptz,
    constraint staff_availability_responses_pkey primary key (id),
    -- one answer per question: this is what makes a repeated save idempotent
    constraint staff_availability_responses_question_unique unique (recipient_id, event_task_id),
    -- a window belongs to a partial answer and to nothing else, and one side of
    -- it is enough — "from 22h onwards" and "until 18h" are both real answers
    constraint staff_availability_responses_window_matches_state check (
        case state
            when 'partial' then available_from is not null or available_until is not null
            else available_from is null and available_until is null
        end
    ),
    constraint staff_availability_responses_window_ordered check (
        available_from is null or available_until is null or available_until >= available_from
    ),
    constraint staff_availability_responses_recipient_fkey
        foreign key (recipient_id, organization_id)
        references public.staff_consultation_recipients (id, organization_id) on delete cascade,
    -- a task that is deleted takes its answers with it: the question is gone
    constraint staff_availability_responses_task_fkey
        foreign key (event_task_id, organization_id)
        references public.event_tasks (id, organization_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- 2. Indexes — the recipient's own answers, and the per-task read Step 5 will
--    want, plus support for every FK a parent delete would otherwise scan.
-- -----------------------------------------------------------------------------

create index if not exists staff_availability_responses_recipient_idx
    on public.staff_availability_responses (recipient_id, organization_id);
create index if not exists staff_availability_responses_task_idx
    on public.staff_availability_responses (event_task_id, organization_id);
create index if not exists staff_availability_responses_organization_idx
    on public.staff_availability_responses (organization_id, answered_at desc);

-- -----------------------------------------------------------------------------
-- 3. Row level security. Enable, never force, as in Steps 1 and 3.
-- -----------------------------------------------------------------------------

alter table public.staff_availability_responses enable row level security;

drop policy if exists staff_availability_responses_select on public.staff_availability_responses;
create policy staff_availability_responses_select on public.staff_availability_responses for select
    using (public.has_permission(organization_id, 'staff.consultations.read')
        or public.has_permission(organization_id, 'staff.consultations.manage'));
-- no INSERT, UPDATE or DELETE policy: an answer is the recipient's own word,
-- written through answer_consultation_task and by nothing else. The backoffice
-- reads answers; it does not put words in anybody's mouth.

-- -----------------------------------------------------------------------------
-- 4. Privileges.
-- -----------------------------------------------------------------------------

revoke all on table public.staff_availability_responses from public, anon, authenticated;
grant select on public.staff_availability_responses to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Answering one question. The only write path.
--
--    Everything is re-derived from the token: the recipient, the organization,
--    the consultation, and whether this particular task was ever this person's
--    to answer. The caller supplies a token and a task id; it is believed about
--    neither. Every way a task can fail to be answerable — it belongs to
--    another organization, to an event this consultation does not cover, to an
--    event already concluded, to a capability this person does not hold, or it
--    simply does not exist — returns the SAME code, so the answer never maps
--    out what is on the other side.
-- -----------------------------------------------------------------------------

create or replace function public.answer_consultation_task(
    p_token text,
    p_event_task_id uuid,
    p_state text,
    p_available_from timestamptz default null,
    p_available_until timestamptz default null,
    p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
    v_recipient uuid;
    v_org uuid;
    v_consultation uuid;
    v_member uuid;
    v_from timestamptz;
    v_until timestamptz;
    v_note text;
begin
    -- the same gate the read uses, so a door that will not open cannot be
    -- written through either
    select r.id, r.organization_id, r.consultation_id, r.staff_member_id
      into v_recipient, v_org, v_consultation, v_member
      from public.staff_consultation_recipients r
      join public.staff_consultations c
        on c.id = r.consultation_id and c.organization_id = r.organization_id
      join public.staff_members m
        on m.id = r.staff_member_id and m.organization_id = r.organization_id
      join public.organizations o
        on o.id = r.organization_id
     where r.token = p_token
       and length(coalesce(p_token, '')) >= 32
       and r.revoked_at is null
       and c.closed_at is null
       and m.is_active
       and m.may_be_consulted
       and o.status = 'active';

    if v_recipient is null then
        return jsonb_build_object('estado', 'terminado');
    end if;

    -- and the consultation must still cover something unconcluded, exactly as
    -- the read decides: a link whose events are all done is read-only
    if not exists (
        select 1
          from public.staff_consultation_events ce
          join public.submissions s
            on s.id = ce.submission_id and s.tenant_id = v_org
         where ce.consultation_id = v_consultation
           and coalesce(s.status, '') <> 'Concluído'
    ) then
        return jsonb_build_object('estado', 'terminado');
    end if;

    if p_state is null or p_state not in ('available', 'unavailable', 'partial') then
        raise exception 'INVALID_STATE';
    end if;

    if not exists (
        select 1
          from public.event_tasks t
          join public.staff_consultation_events ce
            on ce.submission_id = t.submission_id
           and ce.organization_id = t.organization_id
          join public.submissions s
            on s.id = ce.submission_id and s.tenant_id = v_org
          join public.staff_member_functions mf
            on mf.staff_function_id = t.staff_function_id
           and mf.organization_id = t.organization_id
         where t.id = p_event_task_id
           and t.organization_id = v_org
           and t.is_active
           and ce.consultation_id = v_consultation
           and mf.staff_member_id = v_member
           and coalesce(s.status, '') <> 'Concluído'
    ) then
        raise exception 'TASK_NOT_AVAILABLE';
    end if;

    if p_state = 'partial' then
        v_from := p_available_from;
        v_until := p_available_until;
        if v_from is null and v_until is null then
            raise exception 'PARTIAL_NEEDS_BOUNDARY';
        end if;
        if v_from is not null and v_until is not null and v_until < v_from then
            raise exception 'WINDOW_INVERTED';
        end if;
    else
        -- a window on a whole yes or a flat no is not an answer, it is noise
        v_from := null;
        v_until := null;
    end if;

    v_note := nullif(btrim(coalesce(p_note, '')), '');
    if length(coalesce(v_note, '')) > 280 then
        raise exception 'NOTE_TOO_LONG';
    end if;

    insert into public.staff_availability_responses
        (organization_id, recipient_id, event_task_id, state,
         available_from, available_until, note)
    values (v_org, v_recipient, p_event_task_id, p_state, v_from, v_until, v_note)
    on conflict (recipient_id, event_task_id) do update
       set state           = excluded.state,
           available_from  = excluded.available_from,
           available_until = excluded.available_until,
           note            = excluded.note,
           updated_at      = now();

    return jsonb_build_object(
        'estado', 'guardada',
        'resposta', jsonb_build_object(
            'tarefa', p_event_task_id,
            'estado', p_state,
            'de',     v_from,
            'ate',    v_until,
            'nota',   v_note));
end;
$$;

comment on function public.answer_consultation_task(text, uuid, text, timestamptz, timestamptz, text) is
    'The only write path for an availability answer. Resolves the recipient from the opaque token and re-derives organization, consultation and task eligibility from it; trusts no identifier supplied by the caller. Idempotent on (recipient, task).';

revoke all on function public.answer_consultation_task(text, uuid, text, timestamptz, timestamptz, text)
    from public, anon, authenticated;
grant execute on function public.answer_consultation_task(text, uuid, text, timestamptz, timestamptz, text) to anon;
grant execute on function public.answer_consultation_task(text, uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.answer_consultation_task(text, uuid, text, timestamptz, timestamptz, text) to service_role;

-- -----------------------------------------------------------------------------
-- 6. The public door, replaced.
--
--    Same gate, same projection, same silence about identifiers as Step 3 —
--    with two additions a returning recipient needs: each task now carries its
--    own saved answer, or null where none was given, and each event carries how
--    many of its questions are answered. That is what lets somebody close the
--    page halfway and come back to exactly where they left off, and it is the
--    only reason this function is being replaced.
--
--    The answer joined here is the DOOR'S OWN. recipient_id is bound to the row
--    the token resolved, so one person's link can never surface another's word.
-- -----------------------------------------------------------------------------

create or replace function public.staff_consultation_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
    with door as (
        select r.id as recipient_id, r.staff_member_id, r.organization_id,
               c.id as consultation_id, c.title, c.notes
          from public.staff_consultation_recipients r
          join public.staff_consultations c
            on c.id = r.consultation_id and c.organization_id = r.organization_id
          join public.staff_members m
            on m.id = r.staff_member_id and m.organization_id = r.organization_id
          join public.organizations o
            on o.id = r.organization_id
         where r.token = p_token
           and length(coalesce(p_token, '')) >= 32
           and r.revoked_at is null
           and c.closed_at is null
           and m.is_active
           and m.may_be_consulted
           and o.status = 'active'
    ),
    covered as (
        select ce.slot, s.id as submission_id, s.data_evento, s.status, et.nome as event_type
          from door d
          join public.staff_consultation_events ce
            on ce.consultation_id = d.consultation_id and ce.organization_id = d.organization_id
          join public.submissions s
            on s.id = ce.submission_id and s.tenant_id = d.organization_id
          left join public.event_types et
            on et.id = s.event_type_id and et.tenant_id = d.organization_id
    ),
    -- The link stays open while ANY covered event is still unconcluded, for
    -- any number of covered events. Concluded is the explicit state the house
    -- sets by hand; a date that has passed is not it, and a state left unset
    -- keeps the door open rather than shutting it on a guess.
    live as (
        select * from covered
         where coalesce(status, '') <> 'Concluído'
    ),
    -- only the tasks this person's own capabilities cover, each with this
    -- person's own answer where one exists
    matched as (
        select l.slot, l.data_evento, l.event_type,
               t.id, t.title, t.starts_at, t.ends_at, t.minimum_people,
               f.name as function_name, f.area as function_area,
               a.state, a.available_from, a.available_until, a.note
          from door d
          join live l on true
          join public.event_tasks t
            on t.submission_id = l.submission_id and t.organization_id = d.organization_id
           and t.is_active
          join public.staff_member_functions mf
            on mf.staff_function_id = t.staff_function_id
           and mf.organization_id = d.organization_id
           and mf.staff_member_id = d.staff_member_id
          join public.staff_functions f
            on f.id = t.staff_function_id and f.organization_id = d.organization_id
          left join public.staff_availability_responses a
            on a.event_task_id = t.id
           and a.recipient_id = d.recipient_id
           and a.organization_id = d.organization_id
    ),
    -- an event with no compatible task is not exposed at all
    grouped as (
        select m.slot, m.data_evento, m.event_type,
               count(*) filter (where m.state is not null) as answered,
               count(*) as total,
               jsonb_agg(jsonb_build_object(
                   'id', m.id, 'titulo', m.title,
                   'inicio', m.starts_at, 'fim', m.ends_at,
                   'minimo', m.minimum_people,
                   'funcao', m.function_name, 'area', m.function_area,
                   'resposta', case when m.state is null then null else
                       jsonb_build_object(
                           'estado', m.state,
                           'de',     m.available_from,
                           'ate',    m.available_until,
                           'nota',   m.note)
                   end
               ) order by m.starts_at, m.title) as tarefas
          from matched m
         group by m.slot, m.data_evento, m.event_type
    )
    select case when exists (select 1 from live) then
        (select jsonb_build_object(
            'estado', 'aberta',
            'consulta', jsonb_build_object('titulo', d.title, 'nota', d.notes),
            'pessoa',   jsonb_build_object('nome', m.display_name),
            'eventos',  coalesce((
                select jsonb_agg(jsonb_build_object(
                           'ordem', g.slot, 'data', g.data_evento,
                           'tipo', g.event_type,
                           'respondidas', g.answered, 'total', g.total,
                           'tarefas', g.tarefas
                       ) order by g.data_evento, g.slot)
                  from grouped g), '[]'::jsonb)
         )
           from door d
           join public.staff_members m on m.id = d.staff_member_id)
    else jsonb_build_object('estado', 'terminado') end;
$$;

comment on function public.staff_consultation_view(text) is
    'Public door for one consultation recipient. Resolves only from the opaque token; returns the minimum projection the page paints, each task carrying that recipient''s own saved answer, and never an organization, event or person identifier.';
