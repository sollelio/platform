-- ============================================================================
-- 087 · «Mesa do bolo da noiva» passa a «Mesa do bolo»
--
-- O rótulo no formulário /interesse encolheu (palavra do Hélio,
-- 10/08/2026): nem toda a mesa do bolo é de noiva — um batizado ou um
-- aniversário também a têm.
--
-- O código já escreve «Mesa do bolo» nos pedidos novos. O mapa das
-- avaliações foi desenhado para isto (066): um eixo aceita VÁRIAS
-- cadeias, e uma mudança de rótulo entra juntando a cadeia nova ao eixo
-- «bolo» — sem migração de dados e sem deixar o histórico para trás
-- (que à contagem de 01/08/2026 era ZERO eventos com a cadeia antiga,
-- mas a antiga fica na mesma: apagar cadeias é que seria perder).
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================

update public.avaliacao_eixos
   set servicos = array_append(servicos, 'Mesa do bolo')
 where chave = 'bolo'
   and not ('Mesa do bolo' = any(servicos));


-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 1 · O eixo conhece as duas cadeias, a antiga e a nova:
--   select servicos from public.avaliacao_eixos where chave = 'bolo';
--   -- Esperado: {"Mesa do bolo da noiva","Mesa do bolo"}

-- 2 · Correr duas vezes não duplica a cadeia:
--   select array_length(servicos, 1) from public.avaliacao_eixos
--    where chave = 'bolo';
--   -- Esperado: 2, sempre.
