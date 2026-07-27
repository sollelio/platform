-- ============================================================
-- 039 — confirmar/registar contribuições passa a ser transacional
--
-- Os bugs (diagnóstico Fase 1, família escrita-condicional-validada-
-- no-cliente):
--   1. Confirmar a mesma promessa em dois separadores DUPLICAVA o
--      dinheiro: o INSERT em pagamentos não tinha guarda nenhuma e o
--      carimbo da intenção era um UPDATE sem condição de estado.
--   2. A imputação (dividir a contribuição entre sinal e remanescente)
--      era calculada no browser sobre listas possivelmente velhas —
--      o previsto_id podia sair errado com dois separadores abertos.
--
-- A correção, numa RPC única e transacional:
--   • Reclamar a intenção com UPDATE condicional (estado='pendente')
--     — é este o cadeado contra a dupla confirmação: quem chega
--     segundo apanha INTENCAO_JA_RESOLVIDA e nada é inserido.
--   • A imputação por ordem é calculada AQUI, com os previstos e
--     pagamentos lidos dentro da transação (e os previstos trancados
--     com FOR UPDATE, para dois registos simultâneos do mesmo evento
--     não se imputarem em cima um do outro).
--   • Tudo ou nada: se o INSERT falhar, o claim da intenção reverte —
--     nunca fica promessa carimbada sem dinheiro, nem dinheiro sem
--     carimbo.
--
-- pagamentos.intencao_id: rastreio pagamento↔promessa (e matéria-prima
-- de auditorias). NOTA: não é um índice ÚNICO total de propósito — uma
-- contribuição divide-se legitimamente em DUAS linhas (parte no sinal,
-- parte no remanescente) da mesma intenção; a unicidade "uma promessa
-- → um registo" é garantida pelo claim condicional acima, dentro da
-- transação.
--
-- A imputação replica a decisão de 26/07/2026 (campanhas.js): enche
-- primeiro o sinal, depois o remanescente; o excedente fica numa linha
-- sem previsto; as linhas nascem no MESMO statement (mesmo created_at,
-- a chave do agrupamento da UI).
--
-- SECURITY INVOKER + revoke ao anon (convenção da 034/038): ferramenta
-- do backoffice, corre debaixo das RLS.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE, revoke/grant repetíveis. Correr em TEST 2×.
-- Produção decide o Hélio.
-- ============================================================

alter table public.pagamentos
  add column if not exists intencao_id uuid
    constraint pagamentos_intencao_fk
    references public.campanha_intencoes(id) on delete set null;

create index if not exists pagamentos_intencao_idx
  on public.pagamentos (intencao_id)
  where intencao_id is not null;

CREATE OR REPLACE FUNCTION public.contribuicao_registar(
  p_submission_id uuid,
  p_valor numeric,
  p_metodo text,
  p_data date,
  p_contribuinte text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_intencao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_int campanha_intencoes;
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
  --    evento (nunca se confirma a promessa de um evento no outro).
  --    NOTA: INTENCAO_JA_RESOLVIDA cobre também intenção inexistente
  --    ou de outro evento — casos só alcançáveis por bug de chamada
  --    (a lista da UI vem sempre da campanha do próprio evento).
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
  --    agrupamento na UI). Falhar aqui reverte também o claim do
  --    passo 1: tudo ou nada.
  with linhas as (
    insert into pagamentos
      (submission_id, previsto_id, valor, data, metodo, origem,
       contribuinte, notas, reconstituido, intencao_id)
    select p_submission_id,
           (e ->> 'previsto_id')::uuid,
           (e ->> 'valor')::numeric,
           p_data,
           p_metodo,
           'contribuicao',
           coalesce(p_contribuinte, v_int.nome),
           coalesce(p_notas, v_int.mensagem),
           false,
           p_intencao_id
      from jsonb_array_elements(v_partes) e
    returning *
  )
  select jsonb_agg(to_jsonb(l)) into v_linhas from linhas l;

  return coalesce(v_linhas, '[]'::jsonb);
end
$function$;

-- Os default privileges dão EXECUTE ao anon em funções novas — tira-se
-- (convenção da 034/038) e dá-se só ao backoffice.
revoke all on function public.contribuicao_registar(uuid, numeric, text, date, text, text, uuid) from public, anon;
grant execute on function public.contribuicao_registar(uuid, numeric, text, date, text, text, uuid) to authenticated;
