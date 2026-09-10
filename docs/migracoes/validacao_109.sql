-- ============================================================
-- Validação da 109 no TEST real (e depois em PROD) — corre-a o Hélio
-- no SQL editor, ANTES e DEPOIS da 109, e compara os números.
-- (A 109 já foi validada de ponta a ponta em PGlite —
--  scripts/testar-migracao-109.mjs, 13/13 ✓ — isto é a confirmação
--  no ambiente verdadeiro.)
-- ============================================================

-- ── A fotografia (correr ANTES e DEPOIS — tem de dar IGUAL) ─────────
select
  (select count(*) from public.submissions)                               as submissions,
  (select count(*) from public.submissions where fase = 'interessado')   as interessados,
  (select count(*) from public.clientes)                                 as clientes,
  (select count(*) from public.notas_evento)                             as notas;

select fase, count(*) from public.submissions group by fase order by 2 desc;

-- ── SÓ DEPOIS da 109 ────────────────────────────────────────────────
-- As colunas novas existem e nascem vazias:
select
  count(*) filter (where perdido_em is not null)   as perdidos_carimbados,  -- 0
  count(*) filter (where motivo_perda is not null) as com_motivo            -- 0
from public.submissions;

-- O CHECK do motivo está vivo (isto TEM de dar erro — não é um bug):
-- update public.submissions set motivo_perda = 'xpto' where false is true; -- inofensivo
-- (para testar a sério: update ... set motivo_perda='xpto' where id='<um id>'; → deve recusar)

-- A prova do contacto repetido (o fix do «autor»): submete DUAS vezes
-- o mesmo telefone + a mesma data no /interesse de TEST e confirma:
select corpo, criado_por, created_at
  from public.notas_evento
 where corpo like 'Contacto repetido%'
 order by created_at desc limit 5;
-- → deve aparecer 1 linha por repetição, criado_por null (porta pública).
