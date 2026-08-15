-- ============================================================================
-- 101 · O `revoke` que não revogava
--
-- A 094 fechou `dlm_fase_avancar_ate` ao anon. Correu em produção, foi
-- verificada, e a escrita anónima em `submissions` continua aberta hoje.
-- A 097 escreveu «não se concede ao anon» no comentário de
-- `identidade_da_casa` — e o anon executa-a. As sete funções que deviam
-- estar fechadas nesta série estão todas abertas.
--
-- ── PORQUÊ, e é preciso perceber para não repetir ────────────────────────
--
-- Uma função nova no schema `public` do Supabase nasce com DUAS concessões
-- de EXECUTE, de origens diferentes:
--
--   1. a `PUBLIC` — omissão do próprio Postgres para funções;
--   2. a `anon`, `authenticated` e `service_role` — do `alter default
--      privileges` que o Supabase deixa configurado no schema.
--
-- `revoke ... from public` tira a primeira e deixa a segunda.
-- `revoke ... from anon` tira a segunda e deixa a primeira — e como
-- `PUBLIC` significa «todos os papéis», o anon continua a ter acesso por
-- lá. Não se revoga a um papel o que foi concedido a todos.
--
-- Cada migração desta série fez UMA das duas e deu o trabalho por feito. A
-- verificação também mentiu: `has_function_privilege('anon', …)` devolve
-- true quando o acesso vem de PUBLIC, e nós lemos isso como «o revoke
-- falhou» em vez de «revogámos a metade errada».
--
-- ── O QUE ESTÁ EXPOSTO AGORA, em produção ────────────────────────────────
--
--   · `dlm_dia_estado` devolve `rival_nome`. Qualquer pessoa, com uma data,
--     descobre o NOME da cliente que tem esse dia reservado.
--   · `captacao_dedupe` devolve `cliente_id` e `evento_id`. Com um número
--     de telefone, descobre-se se aquela pessoa é cliente da casa e se tem
--     evento marcado.
--   · `dlm_fase_avancar_ate` ESCREVE em `submissions`. Com um uuid,
--     avança-se a fase de qualquer evento.
--   · `formulario_briefing` devolve a linha inteira — as 56 colunas, com
--     morada, contactos e configuração do sinal.
--   · `dlm_comunicado_publicar` e `dlm_comunicado_retirar` escrevem. São
--     INVOKER, portanto a RLS trava-as — mas estar aberto ao anon nunca foi
--     a intenção, e a RLS não devia ser a última linha.
--
-- Isto é anterior ao multi-tenant e independente dele.
-- ============================================================================

-- ── 1 · A forma correcta ────────────────────────────────────────────────────
--
-- As duas revogações, sempre juntas. `service_role` fica de fora de
-- propósito: continua a poder tudo, que é o que faz dela a porta do
-- dashboard.

-- Dados de clientes que saíam a quem não tem sessão
revoke all on function public.dlm_dia_estado(date, uuid, uuid)  from public, anon;
revoke all on function public.captacao_dedupe(text, date, uuid) from public, anon;
revoke all on function public.formulario_briefing(uuid)         from public, anon;
revoke all on function public.briefing_materiais(uuid)          from public, anon;

grant execute on function public.dlm_dia_estado(date, uuid, uuid)  to authenticated;
grant execute on function public.captacao_dedupe(text, date, uuid) to authenticated;
grant execute on function public.formulario_briefing(uuid)         to authenticated;
grant execute on function public.briefing_materiais(uuid)          to authenticated;

-- Escritas
revoke all on function public.dlm_fase_avancar_ate(uuid, text)  from public, anon;
revoke all on function public.dlm_comunicado_publicar(uuid)     from public, anon;
revoke all on function public.dlm_comunicado_retirar(uuid)      from public, anon;

grant execute on function public.dlm_fase_avancar_ate(uuid, text) to authenticated;
grant execute on function public.dlm_comunicado_publicar(uuid)    to authenticated;
grant execute on function public.dlm_comunicado_retirar(uuid)     to authenticated;

-- Resolutores de casa. Recebem um uuid ou dependem da sessão — nenhum faz
-- sentido chamado de fora. As portas públicas da identidade
-- (identidade_por_token, identidade_por_codigo, identidade_da_casa_por_slug)
-- são SECURITY DEFINER e chamam-nas por dentro, onde o utilizador efectivo
-- é o postgres. Fechá-las não parte nenhuma.
revoke all on function public.identidade_da_casa(uuid)      from public, anon;
revoke all on function public.identidade_conhecida(uuid)    from public, anon;
revoke all on function public.identidade_da_minha_casa()    from public, anon;
revoke all on function public.tenant_actual()               from public, anon;
revoke all on function public.tenants_do_utilizador()       from public, anon;
revoke all on function public.tenant_por_slug(text)         from public, anon;

grant execute on function public.identidade_da_minha_casa() to authenticated;
grant execute on function public.tenant_actual()            to authenticated;
grant execute on function public.tenants_do_utilizador()    to authenticated;

-- ── 2 · As funções de gatilho ───────────────────────────────────────────────
--
-- Devolvem `trigger` e rebentam se alguém as chamar directamente — o risco
-- é nulo. Fecham-se porque uma lista de «o que o anon pode executar» que
-- inclui ruído é uma lista que ninguém lê.

revoke all on function public.dlm_notificar_captacao()        from public, anon;
revoke all on function public.dlm_marcar_preenchido()         from public, anon;
revoke all on function public.dlm_travar_documento_trancado() from public, anon;
revoke all on function public.documentos_set_updated_at()     from public, anon;

-- ── 3 · Os geradores de token ───────────────────────────────────────────────
--
-- Devolvem uma cadeia aleatória e não escrevem nada — sozinhos não abrem
-- porta nenhuma. Mas um gerador de tokens exposto convida a tentativas, e
-- quem os precisa são as funções de publicação, que correm autenticadas.

revoke all on function public.dlm_token_portal()     from public, anon;
revoke all on function public.dlm_token_comunicado() from public, anon;

grant execute on function public.dlm_token_portal()     to authenticated;
grant execute on function public.dlm_token_comunicado() to authenticated;

-- ── 4 · A raiz do problema ──────────────────────────────────────────────────
--
-- Fechar estas dezanove não impede a vigésima. Enquanto a omissão do schema
-- conceder EXECUTE ao anon, cada função nova nasce aberta e depende de
-- alguém se lembrar — o que já falhou cinco vezes nesta série.
--
-- A partir daqui, uma função só responde ao anon se a migração o disser em
-- letra própria. O modo de falhar inverte-se: em vez de exposição
-- silenciosa, uma página pública que rebenta na primeira chamada. Barulhento
-- é preferível.
--
-- ⚠ CONSEQUÊNCIA PARA QUEM ESCREVER MIGRAÇÕES A SEGUIR: toda a RPC pública
-- precisa de `grant execute … to anon` explícito. Sem ele, o portal, o
-- formulário e o pedido deixam de funcionar.

alter default privileges in schema public
  revoke execute on functions from anon;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE, e a partir de agora em TODAS
-- ============================================================================
-- Esta consulta passa a fazer parte do fecho de qualquer migração que crie
-- ou altere funções. A lista abaixo é a das portas públicas legítimas: tudo
-- o que aparecer fora dela está aberto por engano.
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute')
--      and p.proname not in (
--        -- o portal do noivo
--        'dlm_portal_ver','dlm_portal_ver_documento','dlm_portal_documentos',
--        'dlm_portal_verificar','dlm_portal_pedir_codigo','dlm_portal_acto',
--        'dlm_portal_responder','dlm_portal_pedir_alteracao_campo',
--        'dlm_portal_questionario','dlm_portal_avaliacao','dlm_portal_avaliar',
--        'dlm_portal_condicoes_lidas','dlm_portal_confirmar_sinal',
--        'dlm_portal_registar_assinado_papel',
--        -- o formulário de convite
--        'formulario_validar_convite','formulario_submeter',
--        -- o pedido de orçamento
--        'captacao_submeter','tipos_de_evento_publicos',
--        -- a folha e a campanha
--        'dlm_comunicado_ver','campanha_publica','prometer_contribuicao',
--        -- a identidade, pelas três portas
--        'identidade_por_token','identidade_por_codigo',
--        'identidade_da_casa_por_slug',
--        -- ajudantes puros: recebem texto ou jsonb, não tocam em tabela
--        'dlm_safe_date','dlm_safe_int','dlm_safe_time','dlm_safe_uuid',
--        'dlm_txt','dlm_txt_array','dlm_velar_instantaneo',
--        'dlm_questionario_conta_campos','dlm_questionario_respondido',
--        'dlm_actualizar_campo','dlm_inserir_campo_antes'
--      )
--    order by p.proname;
--   -- Esperado: ZERO linhas
--
-- E o inverso — as portas públicas continuam de pé:
--   select has_function_privilege('anon','public.dlm_portal_ver(text)','execute');
--   -- Esperado: true
--
-- A APP, e desta vez o lado público inteiro:
--   · o portal de um noivo, com token real
--   · a folha de comunicado
--   · o formulário com um código
--   · /interesse/doluxoamesa — os tipos preenchem e submeter cria
--   · o admin: o aviso de disputa de data, e o briefing pelo link
-- ============================================================================