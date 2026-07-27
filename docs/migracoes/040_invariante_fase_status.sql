-- ============================================================
-- 040 — o invariante fase/status entra na base de dados
--
-- O bug (diagnóstico Fase 1, família invariante-fase-status): fase e
-- status eram duas colunas sem guarda nenhuma na BD — perder e
-- recuperar um evento em preparação persistia o par inválido
-- (fase='interessado' + status='Em Preparação'), que a própria UI
-- depois bloqueava.
--
-- O invariante, com os valores REAIS das colunas:
--   status ∈ {Em Preparação, Confirmado, Concluído}  (pós-sinal)
--     ⇒ fase ∈ {cliente, projecto, contrato}  OU  fase = 'perdido'.
--   'Recebido' é o estado NEUTRO, livre em qualquer fase — o nome é
--   infeliz (não significa "sinal recebido"), mas é o vocabulário
--   existente (faseConfig.js, STATUS_OPTIONS).
--   'perdido' fica ISENTO de propósito: marcar perdido preserva o
--   status como histórico ("estava em preparação quando se perdeu"),
--   e é ele que permite à recuperação devolver o que existia.
--
-- SEM passo de limpeza, por decisão do Hélio: o inventário
-- (inventario_pre_lote2.sql) devolveu zero pares inválidos e zero
-- fases nulas/legadas em PRODUÇÃO e em TEST (sanidade confirmada por
-- contagens brutas). A rede continua cá: se algum dado discordar, o
-- próprio ADD CONSTRAINT falha ruidosamente e nada fica meio-migrado.
--
-- Os NULL do status morrem aqui (pedido do Hélio): 'Recebido', NULL e
-- ausente eram tratados como a mesma coisa em três sítios do código
-- (FunilBoard:296, clientes.js:427, InicioTab:269-270) — normalizar
-- para 'Recebido' + DEFAULT + NOT NULL mata o caso especial de vez e
-- deixa o CHECK ser estreito.
--
-- E os NULL da FASE morrem pelo mesmo motivo — apanhado pelo Hélio:
-- um CHECK passa quando a expressão dá NULL (não só quando dá
-- verdadeiro), por isso com fase nullable o invariante ficava
-- contornável para sempre (status operacional + fase NULL → `false or
-- NULL` → NULL → aceite). Em vez de remendar a expressão com um
-- `is not null`, mata-se a causa: fase NOT NULL + DEFAULT
-- 'interessado' (a fase de entrada, o mesmo fallback do faseDe do
-- funil) + CHECK de vocabulário próprio — a 016 que guardava a fase
-- perdeu-se do repositório, e assim o par fica guardado dos dois
-- lados por migrações que existem.
--
-- Quando o CHECK rejeitar uma escrita (23514), a app traduz para a
-- barra de erro da casa (mensagemCheckFaseStatus em lib/clientes.js):
-- «Este estado só é possível depois do sinal — a fase do evento já
-- não o permite. Recarrega a página.» — nunca o erro cru do Postgres.
--
-- ⚠ ACOPLADA AO CÓDIGO DO 2A (commit 60f8b47) — NÃO CORRER EM
-- PRODUÇÃO SOZINHA. O updateFase antigo escreve só {fase}: recuperar
-- um perdido pós-sinal produziria exatamente o par que este CHECK
-- proíbe, e a recuperação passaria a falhar na cara da Nádia (com o
-- erro por traduzir, ainda por cima — a tradução do 23514 também vive
-- no código novo). Produção: só no momento da publicação, JUNTO com o
-- código. (As 036/038/039 não têm esta condição — o código novo tem
-- fallback para BD antiga, e a BD nova é inofensiva para código
-- antigo. Esta é a única do lote em que a BD manda no código.)
-- O PLANO DE RECUO está no fim do ficheiro — testado ANTES da
-- publicação, nunca improvisado no dia.
--
-- Idempotente: UPDATE condicionado, SET DEFAULT/NOT NULL repetíveis,
-- constraints guardadas por IF NOT EXISTS. Correr em TEST 2×;
-- produção decide o Hélio.
--
-- Correr como UM SÓ bloco (o begin/commit abaixo garante-o mesmo fora
-- do SQL editor): statement a statement haveria uma janela entre o
-- UPDATE e o SET NOT NULL em que um insert público sem status podia
-- entrar como NULL e fazer falhar o passo seguinte.
-- ============================================================

begin;

-- 1) Fim do caso especial: NULL passa a 'Recebido' — o estado neutro
--    que o código já assumia.
update public.submissions
   set status = 'Recebido'
 where status is null;

alter table public.submissions
  alter column status set default 'Recebido';

alter table public.submissions
  alter column status set not null;

-- 2) O mesmo para a FASE (inventário: zero NULL nos dois ambientes;
--    todos os escritores da app definem a fase explicitamente — o
--    DEFAULT é rede para chamadores futuros).
update public.submissions
   set fase = 'interessado'
 where fase is null;

alter table public.submissions
  alter column fase set default 'interessado';

alter table public.submissions
  alter column fase set not null;

-- 3) Os CHECKs, com nome próprio (o código distingue-os na tradução
--    do 23514). Com status e fase NOT NULL, nenhuma expressão pode
--    dar NULL — o invariante não tem buraco.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_status_valido'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_status_valido
      check (status in ('Recebido', 'Em Preparação', 'Confirmado', 'Concluído'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_fase_valida'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_fase_valida
      check (fase in ('interessado', 'orcamento', 'sinal', 'cliente',
                      'projecto', 'contrato', 'perdido'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_status_pos_sinal'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_status_pos_sinal
      check (
        status not in ('Em Preparação', 'Confirmado', 'Concluído')
        or fase in ('cliente', 'projecto', 'contrato', 'perdido')
      );
  end if;
end $$;

commit;

-- ============================================================
-- PLANO DE RECUO (se o CÓDIGO for revertido com o CHECK vivo)
--
-- Reverter o deploy com os CHECKs ativos recria a condição que parte:
-- o updateFase antigo escreve só {fase} e a recuperação de perdidos
-- pós-sinal falha no CHECK do PAR. O recuo é largar APENAS esse — o
-- submissions_status_pos_sinal é a única constraint acoplada ao
-- código novo. Os CHECKs de vocabulário (status_valido, fase_valida)
-- e os DEFAULT/NOT NULL ficam: o código antigo só escreve valores dos
-- vocabulários e nunca envia NULL explícito (verificado escritor a
-- escritor, importador incluído), e largá-los ressuscitava os casos
-- especiais que esta migração matou.
--
-- Prova em TEST antes da publicação, o ciclo completo:
--   1.ª execução da 040 → recuo (descomentar e correr) → 040 outra
--   vez — três execuções limpas provam aplicação, recuo e
--   re-aplicação sem estado meio-migrado.
--
-- begin;
-- alter table public.submissions
--   drop constraint if exists submissions_status_pos_sinal;
-- commit;
-- ============================================================
