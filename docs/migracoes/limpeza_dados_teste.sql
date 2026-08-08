-- ============================================================
-- limpeza_dados_teste.sql — APENAS NO AMBIENTE DE TESTE.
-- ⚠️ NUNCA correr em produção: apaga TODOS os dados de negócio.
--
-- Apaga tudo o que pertence a um evento ou a uma pessoa: pagamentos,
-- documentos, ficha de materiais, notas, notificações, convites,
-- reservas, campanhas de contribuição, todo o portal do cliente
-- (acessos, verificações, publicações, actos, leituras de condições,
-- confirmações de sinal), fotografias do dia, avaliações, o trilho de
-- autoria e os pedidos do questionário, os comunicados enviados com as
-- suas listas de destinatários, os erros de formulário, os eventos
-- (submissions) e as pessoas (clientes).
--
-- PRESERVA a configuração: modelos de evento (`event_types`),
-- mensagens-tipo, o inventário de materiais (`materiais`, com o stock
-- e o por_confirmar, que são dados de inventário e não do evento),
-- `app_config`, os grupos de prazo do questionário
-- (`questionario_grupos`, semeados na 062), o mapa serviço→eixo da
-- avaliação (`avaliacao_eixos`, semeado na 066) e os moldes de
-- comunicado (`comunicado_modelos`, 081 — o molde é da casa, não de
-- um evento).
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
-- O portal repetiu a mesma decisão para a PROVA — «prova não se apaga
-- por arrasto» — e por isso tem mais quatro RESTRICT que ditam ordem:
--   · portal_actos.publicacao_id  → portal_publicacoes   RESTRICT (057)
--   · portal_actos.verificacao_id → portal_verificacoes  RESTRICT (057)
--   · portal_condicoes_lidas.acesso_id     → portal_acessos     RESTRICT (078)
--   · portal_condicoes_lidas.publicacao_id → portal_publicacoes RESTRICT (078)
--   · portal_sinal_confirmacoes.acesso_id     → portal_acessos  RESTRICT (083)
--   · portal_sinal_confirmacoes.submission_id → submissions     RESTRICT (083)
-- Logo: primeiro as três mesas de prova, depois verificações,
-- publicações e acessos, e só muito depois os eventos.
--
-- As restantes dependentes ficam aqui EXPLÍCITAS mesmo quando são ON
-- DELETE CASCADE (notas_evento, notificacoes, pagamentos_previstos,
-- campanhas, campanha_intencoes, evento_fotografias, avaliacoes,
-- respostas_autoria, questionario_pedidos, comunicado_destinatarios,
-- portal_acessos, portal_publicacoes, portal_verificacoes) ou quando a
-- acção não está declarada em lado nenhum — `documentos` e
-- `evento_materiais` são anteriores a esta pasta e o omisso do
-- Postgres é NO ACTION, que bloqueia tal como o RESTRICT. Escritas uma
-- a uma, o script funciona seja qual for a acção da FK e diz em voz
-- alta tudo o que destrói, que é o mínimo para um script destes.
--
-- Os SET NULL não ditam ordem mas ficam ditos, para ninguém os
-- procurar: pagamentos.previsto_id e pagamentos.intencao_id,
-- pagamentos.campanha_id (042), portal_publicacoes.documento_id,
-- avaliacoes.fotografia_id, comunicados.modelo_id,
-- comunicado_destinatarios.submission_id e .cliente_id.
--
-- As colunas novas em `submissions` (sinal_pagamento e
-- dia_guardado_ate, da 083; questionario_entregue_em, da 062) e em
-- `clientes` (recusou_promocoes_em, da 080) caem com as linhas — não
-- pedem nada a este script.
-- ------------------------------------------------------------
--
-- NOTA (a folha das Condições): apagar `comunicados` leva também a
-- folha semeada das «Condições para a montagem e recolha». Não é
-- acidente — é uma linha de dados como as outras. Para a repor,
-- volta-se a correr semear-comunicado-condicoes.sql (é idempotente
-- pelo título e corre-se por ambiente, tal como esta limpeza).
--
-- NOTA (imagens): o Supabase já não permite DELETE direto em
-- storage.objects (trigger protect_delete). As imagens de teste
-- limpam-se pelo DASHBOARD: Storage → bucket → selecionar tudo →
-- Delete, para cada um destes:
--   · "referencias"          (fotos de referência da captação)
--   · "propostas"            (imagens de proposta do evento)
--   · "contratos-assinados"  (papel digitalizado, 057/059)
--   · "fotografias"          (fotografias do dia, 065)
--   · "comunicados"          (imagens das folhas, 080) — ⚠️ SÓ depois
--     de confirmar que nenhum molde preservado tem blocos de imagem:
--       select nome from public.comunicado_modelos
--        where blocos::text like '%"tipo": "imagem"%'
--           or blocos::text like '%"tipo":"imagem"%';
--     Se devolver linhas, esses URLs apontam para este balde e o
--     molde ficava com a imagem partida — apaga tudo MENOS esses
--     ficheiros, ou aceita a perda de propósito.
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
  (select count(*) from public.submissions)    as eventos_a_apagar,
  (select count(*) from public.clientes)       as pessoas_a_apagar,
  (select count(*) from public.pagamentos)     as pagamentos_a_apagar,
  (select count(*) from public.portal_acessos) as portais_a_apagar,
  (select count(*) from public.comunicados)    as comunicados_a_apagar;

-- ------------------------------------------------------------
-- DEPOIS: se os números batem certo com uma base de teste, corre daqui
-- para baixo.
-- ------------------------------------------------------------
begin;

-- 1. O dinheiro primeiro (o RESTRICT original da casa, 025).
delete from public.pagamentos;
delete from public.pagamentos_previstos;

-- 2. A prova do portal — os três trilhos com RESTRICT que seguram
-- tudo o resto do portal (057, 078, 083). Sem estes três primeiro,
-- nem as publicações nem os acessos nem os eventos se deixam apagar.
delete from public.portal_actos;
delete from public.portal_condicoes_lidas;
delete from public.portal_sinal_confirmacoes;

-- 3. O resto do portal, de filho para pai: as verificações penduram
-- nos acessos, as publicações e os acessos penduram no evento.
delete from public.portal_verificacoes;
delete from public.portal_publicacoes;
delete from public.portal_acessos;

-- 4. A despedida: a avaliação antes das fotografias — o fotografia_id
-- é SET NULL e não bloqueava, mas apagar por esta ordem evita o passo
-- intermédio de avaliações a apontar para o nada.
delete from public.avaliacoes;
delete from public.evento_fotografias;

-- 5. O rasto do questionário (062): quem escreveu o quê, e os pedidos
-- de alteração a campo fechado. Os GRUPOS de prazo ficam — são regra
-- da casa, não resposta de cliente.
delete from public.respostas_autoria;
delete from public.questionario_pedidos;

-- 6. As campanhas de contribuição (033/035): intenções antes da
-- campanha (cascade, mas dito em voz alta), campanha antes do evento.
delete from public.campanha_intencoes;
delete from public.campanhas;

-- 7. Os comunicados (079/080): a lista congelada antes da folha.
-- Os MOLDES (comunicado_modelos) ficam — comunicados.modelo_id é SET
-- NULL, e um molde é configuração da casa. A folha semeada das
-- Condições vai junto; ver a NOTA no cabeçalho para a repor.
delete from public.comunicado_destinatarios;
delete from public.comunicados;

-- 8. Filhos do evento anteriores a esta pasta (acção omissa = NO
-- ACTION, que bloqueia como RESTRICT — por isso vêm antes do evento).
delete from public.documentos;
delete from public.evento_materiais;
delete from public.notas_evento;
delete from public.invites;
delete from public.reservas;

-- 8b. A caixa de entrada. `notificacoes.submission_id` aceita NULL, por
-- isso há avisos que não pertencem a evento nenhum e não caíam por
-- arrasto — numa limpeza de teste vão todos, senão fica um centro de
-- notificações a apontar para eventos que já não existem.
delete from public.notificacoes;

-- 8c. Os erros de formulário. Sem FK nenhuma, mas guardam o formData
-- de quem falhou a submeter — respostas de pessoas de teste são dados
-- de teste, e um painel de Início limpo não mostra erros de fantasmas.
delete from public.form_errors;

-- 9. Os eventos e, por fim, as pessoas
delete from public.submissions;
delete from public.clientes;

commit;

-- Verificação rápida (deve dar 0 em todas):
select
  (select count(*) from public.pagamentos)                as pagamentos,
  (select count(*) from public.pagamentos_previstos)      as previstos,
  (select count(*) from public.portal_actos)              as portal_actos,
  (select count(*) from public.portal_condicoes_lidas)    as condicoes_lidas,
  (select count(*) from public.portal_sinal_confirmacoes) as sinal_confirmacoes,
  (select count(*) from public.portal_verificacoes)       as verificacoes,
  (select count(*) from public.portal_publicacoes)        as publicacoes,
  (select count(*) from public.portal_acessos)            as acessos,
  (select count(*) from public.avaliacoes)                as avaliacoes,
  (select count(*) from public.evento_fotografias)        as fotografias,
  (select count(*) from public.respostas_autoria)         as autoria,
  (select count(*) from public.questionario_pedidos)      as pedidos;

select
  (select count(*) from public.campanha_intencoes)        as intencoes,
  (select count(*) from public.campanhas)                 as campanhas,
  (select count(*) from public.comunicado_destinatarios)  as destinatarios,
  (select count(*) from public.comunicados)               as comunicados,
  (select count(*) from public.documentos)                as documentos,
  (select count(*) from public.evento_materiais)          as ficha_materiais,
  (select count(*) from public.notas_evento)              as notas,
  (select count(*) from public.notificacoes)              as notificacoes,
  (select count(*) from public.form_errors)               as erros_form,
  (select count(*) from public.invites)                   as invites,
  (select count(*) from public.reservas)                  as reservas,
  (select count(*) from public.submissions)               as eventos,
  (select count(*) from public.clientes)                  as pessoas;

-- E a confirmar que a configuração ficou intacta (deve dar > 0 —
-- excepto `moldes`, que pode legitimamente ser 0 se nunca se guardou
-- um molde neste ambiente):
select
  (select count(*) from public.materiais)            as inventario,
  (select count(*) from public.event_types)          as modelos,
  (select count(*) from public.mensagens_tipo)       as mensagens_tipo,
  (select count(*) from public.app_config)           as app_config,
  (select count(*) from public.questionario_grupos)  as grupos_prazo,
  (select count(*) from public.avaliacao_eixos)      as eixos_avaliacao,
  (select count(*) from public.comunicado_modelos)   as moldes;
