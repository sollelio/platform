-- ============================================================================
-- 107 · O que a varredura dos comentários encontrou na base
--
-- A curadoria das decisões enterradas em comentários de função (16/08/2026)
-- devolveu três coisas que só se corrigem em SQL. Nenhuma é urgente; todas
-- são falsidades de pequena escala que envelhecem mal.
--
-- Uma delas é minha e vale dizê-lo: a 103 concedeu `dlm_comunicado_ver` ao
-- `authenticated`, contra uma recusa explícita e fundamentada da 085. Não
-- foi decisão nova — foi reversão acidental, ao repor grants a correr
-- depois da 101 ter fechado tudo. A varredura apanhou-a porque comparou o
-- que está na base com o que as migrações dizem, em vez de confiar em
-- qualquer uma das duas.
-- ============================================================================

-- ── 1 · A espreitadela não conta como leitura ───────────────────────────────
--
-- A decisão da 085 é a que fica: se o backoffice chamar esta função, a
-- espreitadela da Nádia conta como leitura de cliente, e a contagem que a
-- folha mostra passa a incluir quem a escreveu. A pré-visualização do
-- backoffice lê a tabela; a folha pública chama a função.
--
-- Repor a recusa não parte nada: o frontend nunca chegou a usar a porta
-- pelo lado autenticado.

revoke execute on function public.dlm_comunicado_ver(text) from authenticated;

-- ── 2 · Os carimbos deixaram de ser à mão ───────────────────────────────────
--
-- Os dois comentários datam de quando a Nádia marcava o envio e a
-- assinatura à mão na ficha. Desde a 057 quem os carimba é o servidor —
-- publicar É o envio, e o acto da cliente É a assinatura.
--
-- Um comentário que descreve um fluxo que já não existe é pior do que
-- comentário nenhum: quem o ler vai procurar o gesto manual que ele promete.

comment on column public.documentos.enviado_em is
  'Quando o documento ficou à espera da cliente. Carimbado pelo servidor ao publicar (dlm_portal_publicar, 057) — publicar é o envio. NULL = ainda não publicado.';

comment on column public.documentos.assinado_em is
  'Quando a cliente assinou ou aceitou. Carimbado pelo acto dela (dlm_portal_acto, 059) ou pela confirmação do papel (dlm_portal_confirmar_papel, 074). NULL = ainda não.';

-- ── 3 · A função que ficou sem chamador ─────────────────────────────────────
--
-- `dlm_velar_instantaneo` velava os valores dos documentos publicados — o
-- véu que a 086 matou quando o contrato passou a sair inteiro pela ligação
-- privada. O último chamador vivo era a versão 083 do
-- `dlm_portal_ver_documento`; a 086 redefiniu-o sem ela.
--
-- NÃO se apaga aqui. Fica marcada, e a decisão de a remover é da limpeza —
-- apagar uma função a meio de uma migração que veio corrigir comentários é
-- misturar dois riscos, e a casa já aprendeu isso três vezes.

comment on function public.dlm_velar_instantaneo(jsonb) is
  '⛔ SEM CHAMADOR desde a 086 — o véu do contrato morreu e o último chamador (dlm_portal_ver_documento, versão da 083) foi redefinido sem ela. Verificado por varredura às 86 migrações e ao src em 16/08/2026. Candidata a remoção na próxima limpeza; não se apaga aqui para não misturar riscos.';

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · A porta da folha voltou a ser só do anon:
--   select has_function_privilege('anon','public.dlm_comunicado_ver(text)','execute') as anon,
--          has_function_privilege('authenticated','public.dlm_comunicado_ver(text)','execute') as equipa;
--   -- Esperado: true, false
--
-- 2 · Os comentários dizem a verdade:
--   select column_name, col_description(
--            'public.documentos'::regclass, ordinal_position) as comentario
--     from information_schema.columns
--    where table_schema='public' and table_name='documentos'
--      and column_name in ('enviado_em','assinado_em');
--
-- 3 · A APP: abrir uma folha de comunicado pelo endereço público (conta
--   leitura, como sempre) e a pré-visualização no backoffice (não conta).
--   O contador de leituras não deve subir com a espreitadela.
-- ============================================================================