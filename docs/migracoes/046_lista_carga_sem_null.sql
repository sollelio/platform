-- =====================================================================
-- 046 — lista_carga (e irmãs) sem NULL — OPCIONAL, desacoplada
--
-- PORQUÊ: a regra da casa diz que a conferência "O que sai" e a Lista
-- de Carga impressa dão SEMPRE o mesmo número. O código já lê a flag
-- da mesma maneira nos dois lados (truthy: NULL comporta-se como
-- "fora da carga", que é o que a checkbox da ficha sempre mostrou).
-- Esta migração torna a divergência ESTRUTURALMENTE impossível:
-- NULL deixa de existir na coluna.
--
-- O QUE FAZ:
--   1. NULL → false (o comportamento que essas linhas SEMPRE tiveram
--      no ecrã e no papel — não muda nada do que a Nádia vê);
--   2. DEFAULT + NOT NULL nas três flags de lista.
--
-- A app nunca escreve NULL (escreve sempre booleanos explícitos), por
-- isso o NOT NULL não parte nenhuma escrita existente.
--
-- IDEMPOTENTE: o UPDATE só toca em NULLs (2ª corrida: zero); os ALTER
-- são repetíveis sem erro.
-- =====================================================================

update public.evento_materiais set lista_carga = false where lista_carga is null;
update public.evento_materiais set lista_montagem = false where lista_montagem is null;
update public.evento_materiais set lista_higienizacao = false where lista_higienizacao is null;

alter table public.evento_materiais
  alter column lista_carga set default true,
  alter column lista_carga set not null,
  alter column lista_montagem set default true,
  alter column lista_montagem set not null,
  alter column lista_higienizacao set default false,
  alter column lista_higienizacao set not null;

-- ---------------------------------------------------------------------
-- DETEÇÃO (último statement): prova de que não resta nenhum NULL.
-- As três contagens têm de vir a 0.
-- ---------------------------------------------------------------------
select
  count(*) filter (where lista_carga is null) as carga_null,
  count(*) filter (where lista_montagem is null) as montagem_null,
  count(*) filter (where lista_higienizacao is null) as higienizacao_null,
  count(*) as total_linhas
from public.evento_materiais;
