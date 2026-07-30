-- ============================================================================
-- 048 · invites.preenchido_em
--
-- Regista QUANDO o questionário foi entregue. Hoje esse momento não fica em
-- lado nenhum: o RPC da 020 muda `status` para 'Preenchido' e não escreve
-- carimbo. `submissions.created_at` não serve de substituto — só coincide nos
-- formulários órfãos.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- Read-write, mas não destrutiva: só acrescenta.
-- ============================================================================


-- ─── 1 · A coluna ───────────────────────────────────────────────────────────

alter table public.invites
  add column if not exists preenchido_em timestamptz;

comment on column public.invites.preenchido_em is
  'Momento em que o questionário foi entregue. Escrito por gatilho na '
  'transição de status para Preenchido — é facto observado, não marcação '
  'à mão. NULL nos formulários entregues antes da migração 048 (com alvo), '
  'e recuperado dos órfãos pelo passo 3.';


-- ─── 2 · O gatilho ──────────────────────────────────────────────────────────
--
-- Porquê um gatilho e não uma linha no RPC da 020: o gatilho apanha TODOS os
-- caminhos que ponham o status em 'Preenchido' — o RPC público, o backoffice,
-- uma correcção à mão na consola — e não pode ser esquecido por um caminho
-- futuro. Também não obriga a reescrever uma função cujo corpo inteiro seria
-- preciso repetir num CREATE OR REPLACE.

create or replace function public.dlm_marcar_preenchido()
returns trigger
language plpgsql
as $$
begin
  -- Só na transição PARA 'Preenchido', e só se ainda não houver carimbo.
  -- Nunca sobrepõe um valor existente: reprocessar não reescreve história.
  if new.status = 'Preenchido'
     and new.preenchido_em is null
     and (tg_op = 'INSERT' or old.status is distinct from 'Preenchido')
  then
    new.preenchido_em := now();
  end if;
  return new;
end;
$$;

comment on function public.dlm_marcar_preenchido() is
  'Carimba invites.preenchido_em na transição para status = Preenchido.';

drop trigger if exists invites_marcar_preenchido on public.invites;

create trigger invites_marcar_preenchido
  before insert or update on public.invites
  for each row
  execute function public.dlm_marcar_preenchido();


-- ─── 3 · Recuperação parcial do passado — OPCIONAL ──────────────────────────
--
-- Num formulário ÓRFÃO (submission_alvo_id IS NULL) o RPC cria o contacto e o
-- evento no mesmo instante em que recebe as respostas: submissions.created_at
-- É o momento da entrega. Nesses, a data é recuperável sem inventar nada.
--
-- Nos formulários COM alvo, o evento já existia semanas antes. Aí não há nada
-- a recuperar — e pôr lá uma data errada seria pior do que deixar NULL.
--
-- Idempotente (o `preenchido_em is null` impede segunda passagem).
-- Correr só se concordares com o raciocínio acima.

update public.invites i
   set preenchido_em = s.created_at
  from public.submissions s
 where i.submission_id     = s.id
   and i.status            = 'Preenchido'
   and i.preenchido_em is null
   and i.submission_alvo_id is null;


-- ─── 4 · Verificação — correr depois, read-only ─────────────────────────────

-- 4.1 · A coluna e o gatilho existem?
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'invites'
--      and column_name  = 'preenchido_em';
--
--   select tgname, tgenabled
--     from pg_trigger
--    where tgrelid = 'public.invites'::regclass
--      and not tgisinternal;

-- 4.2 · Quantos ficaram com data e quantos ficaram sem?
--   select status,
--          count(*)                                   as total,
--          count(preenchido_em)                       as com_data,
--          count(*) - count(preenchido_em)            as sem_data,
--          count(*) filter (where submission_alvo_id is null) as orfaos
--     from public.invites
--    group by status
--    order by total desc;

-- 4.3 · Teste do gatilho em ambiente de TESTE, dentro de transação
--       abortada — não deixa rasto:
--   begin;
--     update public.invites
--        set status = 'Preenchido'
--      where status <> 'Preenchido'
--      returning id, status, preenchido_em;
--   rollback;


-- ============================================================================
-- NOTA que fica registada aqui de propósito
--
-- `invites.status` é texto livre, sem CHECK, com default 'Pendente'. O gatilho
-- depende da grafia exacta 'Preenchido'. Se algum caminho futuro escrever
-- 'preenchido' ou 'PREENCHIDO', o carimbo não é escrito e ninguém dá por isso.
--
-- Não se põe um CHECK nesta migração para não arriscar rejeitar valores já
-- existentes que não conhecemos. Fica como dívida consciente: correr
--   select distinct status, count(*) from public.invites group by status;
-- e, se só houver 'Pendente' e 'Preenchido', vale a pena o CHECK numa 049.
-- ============================================================================