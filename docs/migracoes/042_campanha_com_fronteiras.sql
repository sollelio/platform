-- ============================================================
-- 042 — a campanha passa a ser dona do seu dinheiro
--
-- O bug (diagnóstico Fase 1, família pagamentos-sem-campanha-id,
-- PREVENTIVO: produção tem 0 campanhas e 0 intenções — não há passado
-- para reparar): os pagamentos de contribuição não diziam de QUE
-- campanha vinham, e todas as somas (taça, RPC pública, auto-conclusão)
-- somavam por evento — uma segunda campanha do mesmo evento nascia já
-- cheia com o dinheiro da anterior e auto-marcava-se concluída sem uma
-- única contribuição nova.
--
-- Três peças:
--   1. pagamentos.campanha_id (SET NULL ao apagar a campanha — o
--      dinheiro real fica, como sempre) + backfill GUARDADO: só
--      preenche quando o evento tem UMA campanha (sem ambiguidade);
--      a deteção lista o que ficar de fora, para decisão manual.
--   2. contribuicao_registar v2: grava o campanha_id — da intenção
--      (autoritativo) no caminho da promessa, ou do p_campanha_id
--      validado no registo manual.
--   3. campanha_publica v2: a página pública soma SÓ os pagamentos da
--      própria campanha.
--
-- ⚠ ORDEM DE PUBLICAÇÃO: correr a 042 ANTES do deploy do código (e
-- idealmente `notify pgrst, 'reload schema';` a seguir, para o cache
-- do PostgREST acordar já). O código novo numa BD sem a 042 re-tenta
-- a assinatura da 039 (transacional, mas sem campanha_id — o filtro
-- da taça tolera órfãos e o backfill abaixo é re-corrível para os
-- apanhar depois). A direção inversa (BD nova + código antigo) é
-- segura para as PROMESSAS (o campanha_id vem da intenção); registos
-- MANUAIS nessa janela entram sem atribuição — re-correr o backfill
-- depois do deploy limpa-os.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, backfill re-corrível, DROP
-- IF EXISTS da assinatura antiga, CREATE OR REPLACE, grants
-- repetíveis. Correr em TEST 2×; produção decide o Hélio.
-- ============================================================

alter table public.pagamentos
  add column if not exists campanha_id uuid
    constraint pagamentos_campanha_fk
    references public.campanhas(id) on delete set null;

create index if not exists pagamentos_campanha_idx
  on public.pagamentos (campanha_id)
  where campanha_id is not null;

-- Backfill em duas passagens, ambas re-corríveis:
-- 1.ª — pela INTENÇÃO (autoritativa, mesmo em eventos com várias
--       campanhas): um pagamento nascido de uma promessa pertence à
--       campanha dessa promessa, sem ambiguidade possível.
update public.pagamentos p
   set campanha_id = i.campanha_id
  from public.campanha_intencoes i
 where p.campanha_id is null
   and p.intencao_id = i.id;

-- 2.ª — guardada: só onde não há ambiguidade (o evento tem UMA
--       campanha). Em produção é um no-op (0 campanhas); em TEST
--       resolve a campanha única. O que sobrar aparece na deteção do
--       FIM do ficheiro, para decisão manual.
update public.pagamentos p
   set campanha_id = c.id
  from public.campanhas c
 where p.campanha_id is null
   and p.origem = 'contribuicao'
   and c.submission_id = p.submission_id
   and (select count(*) from public.campanhas c2
         where c2.submission_id = p.submission_id) = 1;

-- ------------------------------------------------------------
-- contribuicao_registar v2 — a assinatura antiga sai para não haver
-- dois overloads (o PostgREST não saberia qual chamar).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.contribuicao_registar(uuid, numeric, text, date, text, text, uuid);

CREATE OR REPLACE FUNCTION public.contribuicao_registar(
  p_submission_id uuid,
  p_valor numeric,
  p_metodo text,
  p_data date,
  p_contribuinte text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_intencao_id uuid DEFAULT NULL,
  p_campanha_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_int campanha_intencoes;
  v_campanha uuid := null;
  -- p_valor deve chegar com 2 casas (o cliente pré-arredonda); o round
  -- aqui é rede de segurança, com half-away-from-zero do numeric.
  v_valor numeric := round(coalesce(p_valor, 0)::numeric, 2);
  v_resto numeric;
  v_previsto record;
  v_pago numeric;
  v_falta numeric;
  v_parte numeric;
  v_partes jsonb := '[]'::jsonb;
  v_linhas jsonb;
begin
  if p_submission_id is null or v_valor <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if p_metodo is null or btrim(p_metodo) = '' then
    raise exception 'METODO_EM_FALTA';
  end if;
  -- reconstituido=false exige data (CHECK da 025) — um registo ao
  -- vivo tem sempre data a sério.
  if p_data is null then
    raise exception 'DATA_EM_FALTA';
  end if;

  -- 1) Reclamar a intenção — o cadeado contra a dupla confirmação.
  --    O join à campanha garante que a promessa pertence MESMO a este
  --    evento; o campanha_id vem DELA (autoritativo).
  --    NOTA: INTENCAO_JA_RESOLVIDA cobre também intenção inexistente
  --    ou de outro evento — casos só alcançáveis por bug de chamada.
  if p_intencao_id is not null then
    update campanha_intencoes i
       set estado = 'confirmada',
           confirmada_em = now()
      from campanhas c
     where i.id = p_intencao_id
       and i.estado = 'pendente'
       and c.id = i.campanha_id
       and c.submission_id = p_submission_id
    returning i.* into v_int;
    if not found then
      raise exception 'INTENCAO_JA_RESOLVIDA';
    end if;
    v_campanha := v_int.campanha_id;
  elsif p_campanha_id is not null then
    -- Registo manual: a campanha indicada tem de ser deste evento.
    -- O ESTADO não se valida de propósito: registar numa campanha
    -- fechada/concluída é um acerto legítimo de backoffice (dinheiro
    -- que chegou tarde), e o histórico da campanha deve recebê-lo.
    select c.id into v_campanha
      from campanhas c
     where c.id = p_campanha_id
       and c.submission_id = p_submission_id;
    if v_campanha is null then
      raise exception 'CAMPANHA_INVALIDA';
    end if;
  end if;

  -- 2) Serializar CONTRIBUIÇÕES do mesmo evento: duas chamadas desta
  --    RPC esperam uma pela outra em vez de calcular ambas sobre o
  --    mesmo retrato. (Os inserts diretos de pagamentos — sinal/
  --    remanescente manuais — não passam por este cadeado; essa
  --    corrida pré-existente fica anotada para outro lote.)
  --    O ORDER BY dá ordem fixa aos locks — sem ele, dois planos
  --    diferentes podiam trancar as linhas por ordens opostas e
  --    deadlockar.
  perform 1
     from pagamentos_previstos
    where submission_id = p_submission_id
    order by id
      for update;

  -- 3) Imputação por ordem, com os números lidos AGORA.
  v_resto := v_valor;
  for v_previsto in
    select id, valor
      from pagamentos_previstos
     where submission_id = p_submission_id
     order by ordem
  loop
    exit when v_resto <= 0;
    select coalesce(sum(valor), 0) into v_pago
      from pagamentos
     where previsto_id = v_previsto.id;
    v_falta := round(v_previsto.valor - v_pago, 2);
    continue when v_falta <= 0;
    v_parte := round(least(v_resto, v_falta), 2);
    v_partes := v_partes
      || jsonb_build_object('previsto_id', v_previsto.id, 'valor', v_parte);
    v_resto := round(v_resto - v_parte, 2);
  end loop;
  -- excedente: para lá do plano inteiro fica sem previsto — o resumo
  -- soma-o na mesma
  if v_resto > 0 then
    v_partes := v_partes
      || jsonb_build_object('previsto_id', null, 'valor', v_resto);
  end if;

  -- 4) As linhas num só INSERT (mesmo created_at — a chave do
  --    agrupamento na UI), já com a campanha dona do dinheiro.
  --    Falhar aqui reverte também o claim do passo 1: tudo ou nada.
  with linhas as (
    insert into pagamentos
      (submission_id, previsto_id, valor, data, metodo, origem,
       contribuinte, notas, reconstituido, intencao_id, campanha_id)
    select p_submission_id,
           (e ->> 'previsto_id')::uuid,
           (e ->> 'valor')::numeric,
           p_data,
           p_metodo,
           'contribuicao',
           coalesce(p_contribuinte, v_int.nome),
           coalesce(p_notas, v_int.mensagem),
           false,
           p_intencao_id,
           v_campanha
      from jsonb_array_elements(v_partes) e
    returning *
  )
  select jsonb_agg(to_jsonb(l)) into v_linhas from linhas l;

  return coalesce(v_linhas, '[]'::jsonb);
end
$function$;

revoke all on function public.contribuicao_registar(uuid, numeric, text, date, text, text, uuid, uuid) from public, anon;
grant execute on function public.contribuicao_registar(uuid, numeric, text, date, text, text, uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- campanha_publica v2 — a página pública soma SÓ a própria campanha.
-- ------------------------------------------------------------
create or replace function public.campanha_publica(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'estado', c.estado,
    'pct', least(
      100,
      coalesce(round(100 * soma.total / c.objetivo), 0)
    ),
    'pessoas', coalesce(soma.pessoas, 0),
    'mensagem', c.mensagem,
    'como_contribuir', c.como_contribuir,
    'tipo_evento', et.nome,
    'data_evento', s.data_evento
  )
  from campanhas c
  join submissions s on s.id = c.submission_id
  left join event_types et on et.id = s.event_type_id
  left join lateral (
    select
      sum(p.valor) as total,
      count(distinct
        coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text
      ) as pessoas
    from pagamentos p
    where p.campanha_id = c.id
      and p.origem = 'contribuicao'
  ) soma on true
  where c.token = p_token;
$$;

revoke all on function public.campanha_publica(text) from public;
grant execute on function public.campanha_publica(text) to anon, authenticated;

-- ------------------------------------------------------------
-- DETEÇÃO — o ÚLTIMO statement de propósito: o SQL editor só mostra o
-- resultado do último, e este é o que interessa ver. Repetir esta
-- query como verificação separada depois do deploy do código (a
-- janela do fallback pode ter deixado linhas sem atribuição — o
-- backfill acima é re-corrível e apanha-as).
-- Duas verificações numa: pagamentos de contribuição órfãos + a FK
-- (o ADD COLUMN IF NOT EXISTS saltaria a constraint se a coluna já
-- existisse de outra proveniência).
-- ------------------------------------------------------------
select 'fk_em_falta' as tipo,
       null::uuid as id, null::uuid as submission_id,
       null::numeric as valor, null::timestamptz as created_at,
       null::bigint as campanhas_do_evento
 where not exists (
   select 1 from pg_constraint
    where conname = 'pagamentos_campanha_fk'
      and conrelid = 'public.pagamentos'::regclass
 )
union all
select 'pagamento_sem_campanha',
       p.id, p.submission_id, p.valor, p.created_at,
       (select count(*) from public.campanhas c2
         where c2.submission_id = p.submission_id)
  from public.pagamentos p
 where p.origem = 'contribuicao'
   and p.campanha_id is null;
