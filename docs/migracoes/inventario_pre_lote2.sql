-- ============================================================
-- INVENTÁRIO PRÉ-LOTE 2 — só SELECTs, seguro para PRODUÇÃO e TEST.
--
-- Porquê antes da migração 040: um CHECK duro sobre fase/status
-- passaria em TEST e falharia em produção se lá existirem pares
-- inválidos — a limpeza tem de vir na mesma migração, ANTES do CHECK,
-- e só se sabe o que limpar depois de olhar. Corre isto nos DOIS
-- ambientes e manda os resultados.
--
-- Vocabulário real (confirmado no código):
--   fase    ∈ interessado, orcamento, sinal, cliente, projecto,
--             contrato, perdido        (CHECK da migração 016)
--   status  ∈ Recebido, Em Preparação, Confirmado, Concluído (ou NULL)
--   pós-sinal: fases cliente/projecto/contrato;
--              estados Em Preparação/Confirmado/Concluído.
--   "Recebido" é o estado NEUTRO de partida, livre em qualquer fase.
-- ============================================================

-- A. Pares fase/status inválidos (estado pós-sinal com fase que não é
--    pós-sinal), separando o caso 'perdido' — o desenho do CHECK vai
--    isentá-lo (histórico de um evento que já esteve em preparação).
select fase,
       status,
       count(*)                       as quantos,
       array_agg(id)                  as eventos
  from submissions
 where status in ('Em Preparação', 'Confirmado', 'Concluído')
   and fase not in ('cliente', 'projecto', 'contrato')
 group by fase, status
 order by fase, status;

-- B. Fases fora do vocabulário (ou NULL) — os "legados" que bloqueiam
--    a Jornada e saem como «está em "null"» nas mensagens.
select coalesce(fase, '(null)') as fase,
       count(*)                 as quantos,
       array_agg(id)            as eventos
  from submissions
 where fase is null
    or fase not in ('interessado','orcamento','sinal','cliente',
                    'projecto','contrato','perdido')
 group by fase;

-- C. A "mentira comercial" que já existe hoje: eventos com dinheiro
--    registado mas fase pré-sinal (contam como negociação no funil).
--    Contexto para a decisão da recuperação informada do 2A.
select s.id,
       s.fase,
       s.status,
       s.data_evento,
       count(p.id)    as n_pagamentos,
       sum(p.valor)   as total_pago
  from submissions s
  join pagamentos p on p.submission_id = s.id
 where s.fase in ('interessado', 'orcamento', 'sinal')
 group by s.id, s.fase, s.status, s.data_evento
 order by total_pago desc;

-- D. (Para o 2C) Sinais divergentes: o previsto ordem 1 vs metade do
--    valor acordado, e o que entrou de facto ligado a esse previsto.
--    É o retrato do gerarPrevistos insert-once: planos que ficaram
--    para trás quando o valor acordado mudou.
select s.id,
       s.valor_acordado,
       round(s.valor_acordado / 2, 2)          as metade_atual,
       pp.valor                                as sinal_previsto,
       round(pp.valor - s.valor_acordado / 2, 2) as diferenca,
       coalesce(sum(p.valor), 0)               as sinal_recebido
  from submissions s
  join pagamentos_previstos pp
    on pp.submission_id = s.id and pp.ordem = 1
  left join pagamentos p on p.previsto_id = pp.id
 where s.valor_acordado is not null
 group by s.id, s.valor_acordado, pp.valor
having abs(pp.valor - s.valor_acordado / 2) >= 0.01
 order by abs(pp.valor - s.valor_acordado / 2) desc;

-- E. Já agora, na mesma ida: a Parte 1 da 037 (convites órfãos e
--    duplicados) nunca foi corrida em produção — corre-a também e
--    manda esses resultados juntos.
