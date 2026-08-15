-- ============================================================================
-- 094 · O briefing sai da rua
--
-- A rota /briefing/:id era pública, com o uuid a fazer de chave — uma decisão
-- deliberada e defensável quando havia uma casa: o id é aleatório e não se
-- enumera. O que não sobrevive a várias casas é o resto: um uuid vale em
-- qualquer sessão, e formulario_briefing devolve a linha inteira.
--
-- A rota passou para dentro do ProtectedRoute (deploy ANTES desta migração).
-- A Nádia chega lá por um link do admin, onde já tem sessão, e imprime a
-- folha como sempre imprimiu. Ninguém de fora precisava dela.
--
-- dlm_fase_avancar_ate é a mais grave das três: SECURITY DEFINER, exposta ao
-- anon, e ESCREVE em submissions. Qualquer pessoa com um uuid avançava a
-- fase de qualquer evento. Não é chamada por nenhum frontend — só de dentro
-- de outras funções, onde o utilizador efectivo é postgres.
-- ============================================================================

revoke execute on function public.dlm_fase_avancar_ate(uuid, text) from anon;
revoke execute on function public.formulario_briefing(uuid)        from anon;
revoke execute on function public.briefing_materiais(uuid)         from anon;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Nenhuma das três responde ao anon:
--   select p.proname, array_to_string(array(
--            select r.rolname from pg_roles r
--             where r.rolname in ('anon','authenticated')
--               and has_function_privilege(r.rolname, p.oid, 'execute')), ', ')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('dlm_fase_avancar_ate','formulario_briefing','briefing_materiais');
--   -- Esperado: só authenticated nas três
--
-- 2 · A APP:
--   · abrir o briefing pelo link do admin — a folha completa, com materiais
--   · imprimir — o layout de impressão intacto
--   · em janela anónima, colar o endereço /briefing/<uuid> — deve mandar
--     para o login, não mostrar a folha
-- ============================================================================