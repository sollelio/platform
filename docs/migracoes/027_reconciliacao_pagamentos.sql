-- ============================================================
-- 027 — Reconciliação retroactiva: povoa pagamentos_previstos e
-- pagamentos para os eventos já em curso, a partir do que já existe
-- hoje (valor_acordado, fase, pagamento_final) — SEM inventar nada
-- que não se saiba. Só corre depois da 025 (tabelas) e da 026
-- (recuperação de funções) já aplicadas.
--
-- Regras:
--
-- pagamentos_previstos (o PLANO) — um par "Sinal (50%)" +
--   "Remanescente (50%)" para TODO evento com valor_acordado > 0,
--   seja qual for a fase — é exactamente o que o código passa a gerar
--   sozinho daqui para a frente quando valor_acordado é gravado (ver
--   nota na 025), por isso a reconciliação espelha esse comportamento
--   em vez de inventar uma regra só para o passado. Remanescente leva
--   data_limite = data_evento − 2 dias quando há data_evento; o sinal
--   não tem uma data-alvo formal, fica sem data_limite.
--
-- pagamentos (dinheiro RECEBIDO, reconstituido = true) — só se cria
--   quando o estado actual já implica que o dinheiro entrou:
--     sinal        — fase actual em ('cliente','projecto','contrato')
--                     [FASES_POS_SINAL]: o botão "Sinal recebido" já
--                     avançou a fase, logo o sinal entrou. Data =
--                     created_at da submissão — a aproximação mais
--                     próxima que existe (não há registo da data real
--                     da transição de fase). Nunca se inventa uma
--                     data mais precisa que esta.
--     remanescente — pagamento_final = true, INDEPENDENTE da fase
--                     actual (a flag não se apaga mesmo que o negócio
--                     tenha sido depois marcado perdido). Data = null
--                     — não se sabe quando; reconstituido = true
--                     explica o porquê (ver CHECK da 025).
--   Fora destes dois sinais, não se cria pagamento nenhum — dado
--   ausente é melhor que dado inventado. Um evento em 'interessado',
--   'orcamento' ou 'sinal' com valor_acordado preenchido fica só com
--   o PLANO (previstos), sem nenhum pagamento — porque nenhum
--   dinheiro está confirmado como tendo entrado.
--
-- Idempotente: cada INSERT verifica `not exists` antes de escrever,
-- por isso corrê-la duas vezes não duplica nada.
-- ============================================================

-- 1) Plano — sinal (50%)
insert into public.pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
select
  s.id,
  'Sinal (50%)',
  round(s.valor_acordado / 2, 2),
  null,
  1
from public.submissions s
where s.valor_acordado > 0
  and not exists (
    select 1 from public.pagamentos_previstos pp
    where pp.submission_id = s.id and pp.descricao = 'Sinal (50%)'
  );

-- 2) Plano — remanescente (50%), com prazo 48h antes do evento quando
--    há data_evento
insert into public.pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
select
  s.id,
  'Remanescente (50%)',
  round(s.valor_acordado / 2, 2),
  case when s.data_evento is not null then s.data_evento - interval '2 days' else null end,
  2
from public.submissions s
where s.valor_acordado > 0
  and not exists (
    select 1 from public.pagamentos_previstos pp
    where pp.submission_id = s.id and pp.descricao = 'Remanescente (50%)'
  );

-- 3) Dinheiro reconstituído — sinal (fase já passou de "sinal")
insert into public.pagamentos
  (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
select
  s.id,
  (select pp.id from public.pagamentos_previstos pp
    where pp.submission_id = s.id and pp.descricao = 'Sinal (50%)'),
  round(s.valor_acordado / 2, 2),
  s.created_at::date,
  'Desconhecido (reconstituído)',
  'sinal',
  true
from public.submissions s
where s.valor_acordado > 0
  and s.fase in ('cliente', 'projecto', 'contrato')
  and not exists (
    select 1 from public.pagamentos p
    where p.submission_id = s.id and p.origem = 'sinal'
  );

-- 4) Dinheiro reconstituído — remanescente (pagamento_final = true)
insert into public.pagamentos
  (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
select
  s.id,
  (select pp.id from public.pagamentos_previstos pp
    where pp.submission_id = s.id and pp.descricao = 'Remanescente (50%)'),
  round(s.valor_acordado / 2, 2),
  null,
  'Desconhecido (reconstituído)',
  'remanescente',
  true
from public.submissions s
where s.valor_acordado > 0
  and s.pagamento_final = true
  and not exists (
    select 1 from public.pagamentos p
    where p.submission_id = s.id and p.origem = 'remanescente'
  );
