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
-- Quando o CHECK rejeitar uma escrita (23514), a app traduz para a
-- barra de erro da casa (mensagemCheckFaseStatus em lib/clientes.js):
-- «Este estado só é possível depois do sinal — a fase do evento já
-- não o permite. Recarrega a página.» — nunca o erro cru do Postgres.
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

-- 2) Os dois CHECKs, com nome próprio (o código distingue-os na
--    tradução do 23514).
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
