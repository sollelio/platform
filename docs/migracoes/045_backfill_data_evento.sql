-- =====================================================================
-- 045 — Backfill único de data_evento a partir das respostas
--
-- PORQUÊ: a logística inteira (conferência "O que sai", alertas de
-- stock, janelas de buffer) lê APENAS a coluna submissions.data_evento.
-- Eventos antigos cuja data vive só no JSONB `respostas` (formulários
-- de antes da dupla fonte) nunca entram em nenhuma conta — a carrinha
-- pode partir sem os materiais deles e nenhum alerta dispara.
--
-- O QUE FAZ: para cada submission com data_evento NULL, resolve a data
-- EXACTAMENTE como o ecrã (getResumoSubmissao em submissionFields.js):
--   1º  o PRIMEIRO campo do modelo com papel = 'data' (pela posição);
--       se esse campo estiver vazio, desce de nível — se tiver valor,
--       é ESSE valor que conta (válido ou não), como no ecrã;
--   2º  o PRIMEIRO campo do modelo com type = 'date' (pela posição).
-- Só escreve valores em formato ISO (AAAA-MM-DD…): um "12/09/2026"
-- é ambíguo (o DateStyle MDY lia-o como 9 de dezembro) — fica NULL e
-- aparece na deteção final, para decisão manual.
--
-- O QUE NÃO FAZ (de propósito): não lê as chaves canónicas da captação
-- (respostas->>'dataEvento') no UPDATE — o ecrã também não as lê para a
-- data, e usá-las RESSUSCITARIA datas apagadas de propósito no drawer
-- (coluna → NULL, respostas ficam). Essas chaves aparecem na deteção
-- como candidatas, para o Hélio decidir caso a caso.
--
-- IDEMPOTENTE: só toca em linhas com data_evento NULL — a segunda
-- corrida encontra zero candidatas e não altera nada.
--
-- NÃO precisa de deploy acompanhado: o código já lê a coluna primeiro.
-- A deteção final é o ÚLTIMO statement (o SQL editor só mostra o
-- resultado do último).
-- =====================================================================

with campos_modelo as (
  -- Todos os campos candidatos do modelo, com a posição de cada um
  select
    s.id as submission_id,
    (campo.valor ->> 'papel') = 'data' as eh_papel_data,
    (campo.valor ->> 'type') = 'date' as eh_type_date,
    s.respostas ->> (campo.valor ->> 'id') as bruto,
    passo.ord as passo_ord,
    campo.ord as campo_ord
  from public.submissions s
  join public.event_types et on et.id = s.event_type_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(et.steps) = 'array' then et.steps else '[]'::jsonb end
  ) with ordinality as passo(valor, ord)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(passo.valor -> 'fields') = 'array'
         then passo.valor -> 'fields' else '[]'::jsonb end
  ) with ordinality as campo(valor, ord)
  where s.data_evento is null
    and s.respostas is not null
    and ((campo.valor ->> 'papel') = 'data' or (campo.valor ->> 'type') = 'date')
),
primeiro_papel as (
  -- O primeiro campo papel='data' POR POSIÇÃO (não "o primeiro com
  -- valor válido" — o ecrã não salta para o campo seguinte)
  select distinct on (submission_id) submission_id, bruto
  from campos_modelo
  where eh_papel_data
  order by submission_id, passo_ord, campo_ord
),
primeiro_date as (
  -- O primeiro campo type='date' POR POSIÇÃO
  select distinct on (submission_id) submission_id, bruto
  from campos_modelo
  where eh_type_date
  order by submission_id, passo_ord, campo_ord
),
escolhidas as (
  select
    coalesce(p.submission_id, d.submission_id) as submission_id,
    -- A escada do ecrã: o campo papel='data' com valor ganha; vazio,
    -- desce ao primeiro type='date'. Só ISO passa ao cast.
    (
      case
        when nullif(trim(coalesce(p.bruto, '')), '') is not null then
          case when trim(p.bruto) ~ '^\d{4}-\d{2}-\d{2}'
               then public.dlm_safe_date(trim(p.bruto)) end
        when nullif(trim(coalesce(d.bruto, '')), '') is not null then
          case when trim(d.bruto) ~ '^\d{4}-\d{2}-\d{2}'
               then public.dlm_safe_date(trim(d.bruto)) end
      end
    ) as data_encontrada
  from primeiro_papel p
  full join primeiro_date d using (submission_id)
)
update public.submissions s
set data_evento = e.data_encontrada
from escolhidas e
where s.id = e.submission_id
  and e.data_encontrada is not null
  and s.data_evento is null;

-- ---------------------------------------------------------------------
-- DETEÇÃO (último statement — é este resultado que o SQL editor mostra)
-- O que AINDA fica sem data depois do backfill. `data_candidata` é a
-- chave canónica da captação, se existir e for ISO — NÃO foi escrita
-- (podia ressuscitar uma data apagada de propósito); se alguma destas
-- linhas dever mesmo ter data, é decisão manual, caso a caso.
-- ---------------------------------------------------------------------
select
  s.id,
  s.created_at,
  s.fase,
  s.status,
  coalesce(
    nullif(trim(s.nome_noivo), ''),
    s.respostas ->> 'nomeDoCliente',
    '(sem nome)'
  ) as quem,
  (s.respostas is not null) as tem_respostas,
  case
    when coalesce(s.respostas ->> 'dataEvento', s.respostas ->> 'data_evento')
         ~ '^\d{4}-\d{2}-\d{2}'
    then public.dlm_safe_date(
      coalesce(s.respostas ->> 'dataEvento', s.respostas ->> 'data_evento')
    )
  end as data_candidata,
  coalesce(s.respostas ->> 'dataEvento', s.respostas ->> 'data_evento')
    as candidata_bruta
from public.submissions s
where s.data_evento is null
order by s.created_at desc;
