-- ============================================================
-- limpeza_dados_teste.sql — APENAS NO AMBIENTE DE TESTE.
-- ⚠️ NUNCA correr em produção: apaga TODOS os dados de negócio.
--
-- Apaga tudo o que pertence a um evento ou a uma pessoa: pagamentos,
-- documentos, ficha de materiais, notas, notificações, convites,
-- reservas, eventos (submissions) e pessoas (clientes).
--
-- PRESERVA a configuração: modelos de evento, mensagens-tipo e o
-- inventário de materiais (`materiais`, com o stock e o por_confirmar,
-- que são dados de inventário e não do evento).
--
-- ------------------------------------------------------------
-- A ORDEM NÃO É DECORATIVA — é o que faz o script funcionar.
--
-- `pagamentos.submission_id` é ON DELETE **RESTRICT**, de propósito:
-- dinheiro registado é um facto contabilístico e não desaparece
-- porque alguém apagou o evento (migração 025). Consequência prática:
-- apagar `submissions` sem apagar `pagamentos` primeiro rebenta com
--
--   ERROR: update or delete on table "submissions" violates foreign
--   key constraint "pagamentos_submission_fk" on table "pagamentos"
--
-- e, como isto corre dentro de uma transacção, o `begin` faz rollback
-- de tudo: o script não apaga nada e parece que não fez nada.
--
-- As restantes dependentes ficam aqui EXPLÍCITAS mesmo quando são ON
-- DELETE CASCADE (notas_evento, notificacoes, pagamentos_previstos) ou
-- quando a acção não está declarada em lado nenhum — `documentos` e
-- `evento_materiais` são anteriores a esta pasta e o omisso do
-- Postgres é NO ACTION, que bloqueia tal como o RESTRICT. Escritas uma
-- a uma, o script funciona seja qual for a acção da FK e diz em voz
-- alta tudo o que destrói, que é o mínimo para um script destes.
-- ------------------------------------------------------------
--
-- NOTA (imagens): o Supabase já não permite DELETE direto em
-- storage.objects (trigger protect_delete). As imagens de teste
-- limpam-se pelo DASHBOARD: Storage → bucket "referencias" →
-- selecionar tudo → Delete; repetir para "propostas".
-- O bucket "materiais" NÃO se toca (inventário).
-- ============================================================

-- ------------------------------------------------------------
-- PRIMEIRO: corre SÓ este select e olha para os números.
--
-- É a única salvaguarda que funciona mesmo — na janela de SQL do
-- Supabase cada execução é a sua própria transacção, por isso uma
-- guarda com `set local` teria de se auto-autorizar dentro do próprio
-- script, o que não guarda nada. Ver os números antes guarda.
--
-- Se isto mostrar dezenas de eventos e pessoas com nomes a sério,
-- estás na base errada. Fecha e vai-te embora.
-- ------------------------------------------------------------
select
  (select count(*) from public.submissions) as eventos_a_apagar,
  (select count(*) from public.clientes)    as pessoas_a_apagar,
  (select count(*) from public.pagamentos)  as pagamentos_a_apagar;

-- ------------------------------------------------------------
-- DEPOIS: se os números batem certo com uma base de teste, corre daqui
-- para baixo.
-- ------------------------------------------------------------
begin;

-- 1. Netos do evento (o dinheiro primeiro — é o único RESTRICT)
delete from public.pagamentos;
delete from public.pagamentos_previstos;

-- 2. Filhos do evento
delete from public.documentos;
delete from public.evento_materiais;
delete from public.notas_evento;
delete from public.invites;
delete from public.reservas;

-- 2b. A caixa de entrada. `notificacoes.submission_id` aceita NULL, por
-- isso há avisos que não pertencem a evento nenhum e não caíam por
-- arrasto — numa limpeza de teste vão todos, senão fica um centro de
-- notificações a apontar para eventos que já não existem.
delete from public.notificacoes;

-- 3. Os eventos e, por fim, as pessoas
delete from public.submissions;
delete from public.clientes;

commit;

-- Verificação rápida (deve dar 0 em todas):
select
  (select count(*) from public.pagamentos)            as pagamentos,
  (select count(*) from public.pagamentos_previstos)  as previstos,
  (select count(*) from public.documentos)            as documentos,
  (select count(*) from public.evento_materiais)      as ficha_materiais,
  (select count(*) from public.notas_evento)          as notas,
  (select count(*) from public.notificacoes)          as notificacoes,
  (select count(*) from public.invites)               as invites,
  (select count(*) from public.reservas)              as reservas,
  (select count(*) from public.submissions)           as eventos,
  (select count(*) from public.clientes)              as pessoas;

-- E a confirmar que a configuração ficou intacta (deve dar > 0):
select
  (select count(*) from public.materiais)       as inventario,
  (select count(*) from public.event_types)     as modelos,
  (select count(*) from public.mensagens_tipo)  as mensagens_tipo;
