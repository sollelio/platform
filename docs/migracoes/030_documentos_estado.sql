-- ============================================================
-- 030 — O percurso de cada documento: gerar → enviar → assinar.
--
-- Cinco botões com o mesmo peso não diziam qual era o próximo. Em
-- lista, cada documento mostra onde parou — mas para isso é preciso
-- saber onde parou, e a tabela `documentos` só sabia que existe:
--   tipo · submission_id · dados · created_at · updated_at
--
-- O "estado" que a lista de documentos mostrava até aqui era o
-- `submissions.status` do EVENTO copiado para cada linha (Recebido /
-- Em Preparação / …) — informação do evento, nunca do documento.
--
-- Dois carimbos chegam, porque só há dois factos que a app não
-- consegue deduzir:
--   gerado   → já se sabe: a linha existe, com o created_at.
--   enviado  → enviado_em. Ninguém sabe que a Nádia carregou em
--              "enviar" no WhatsApp dela a não ser que ela o diga.
--   assinado → assinado_em. Idem, e vale como "aceite" no orçamento.
--
-- Ambos NULL por omissão e preenchidos por gesto explícito. Nada de
-- backfill: um documento antigo aparece como gerado e mais nada, que
-- é a verdade — dado ausente é melhor que dado inventado, a mesma
-- regra da coluna `data` em pagamentos (migração 025).
--
-- IF NOT EXISTS porque o esquema base de `documentos` é anterior a
-- esta pasta de migrações e a coluna pode já ter sido criada à mão.
-- ============================================================

alter table public.documentos
  add column if not exists enviado_em timestamptz,
  add column if not exists assinado_em timestamptz;

comment on column public.documentos.enviado_em is
  'Quando foi enviado ao cliente. NULL = ainda não. Marcado à mão.';
comment on column public.documentos.assinado_em is
  'Quando foi assinado/aceite pelo cliente. NULL = ainda não. Marcado à mão.';
