-- ============================================================
-- Validação da 110 no TEST real (e depois em PROD) — corre-a o Hélio
-- no SQL editor, ANTES e DEPOIS da 110, e compara.
-- (A 110 já foi validada de ponta a ponta em PGlite —
--  scripts/testar-migracao-110.mjs, 28/28 ✓ — isto é a confirmação
--  no ambiente verdadeiro.)
-- ============================================================

-- ── A fotografia (ANTES e DEPOIS — tem de dar IGUAL) ────────────────
select
  (select count(*) from public.submissions)                        as submissions,
  (select count(*) from public.submissions where criado_por is not null) as com_criado_por,
  (select count(*) from public.clientes)                           as clientes;

-- ── SÓ DEPOIS da 110 ────────────────────────────────────────────────
-- As três colunas existem e o histórico nasce a NULL (sem backfill):
select
  count(*) filter (where submissao_superficie is not null) as atribuidas,   -- 0 logo a seguir
  count(*) filter (where submissao_superficie is null)     as historicas    -- = submissions
from public.submissions;

-- As constraints e o gatilho estão vivos:
select conname from pg_constraint
 where conrelid = 'public.submissions'::regclass and conname like 'submissions_submissao_%'
 order by 1;                                                                -- 5 linhas
select tgname from pg_trigger
 where tgrelid = 'public.submissions'::regclass
   and tgname in ('submissions_atribuicao_imutavel', 'submissions_autoria_imutavel');   -- 2 linhas

-- A captação continua pública (anon + authenticated) e nada mais:
select grantee, privilege_type from information_schema.routine_privileges
 where routine_name = 'captacao_submeter' order by 1;

-- ── A prova de ponta a ponta (depois de submeter no TEST) ──────────
-- 1. /interesse numa janela anónima → public_form · unknown · unidentified, criado_por NULL
-- 2. /interesse com sessão (atalho «Preencher formulário público») → public_form · internal_user · internal_entry_point, criado_por = o teu uuid
-- 3. «+ Registar pedido» → admin_form · internal_user · admin_form, criado_por = o teu uuid
select s.created_at, s.submissao_superficie, s.submissao_autor_tipo,
       s.submissao_atribuicao, s.criado_por
  from public.submissions s
 where s.submissao_superficie is not null
 order by s.created_at desc
 limit 10;

-- O gatilho recusa reescrever (isto TEM de dar ATRIBUICAO_IMUTAVEL):
-- update public.submissions set submissao_autor_tipo = 'prospect' where id = '<um id acima>';
-- E o autor (isto TEM de dar AUTORIA_IMUTAVEL, a partir da app com sessão):
-- update public.submissions set criado_por = null where id = '<um id acima>';
