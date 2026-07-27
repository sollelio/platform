-- ============================================================
-- 041 — um plano só: unique (submission_id, ordem) nos previstos
--
-- OPCIONAL, decisão do Hélio (apanhado na revisão do Lote 2C): o
-- gerarPrevistos é check-then-insert sem lock — duas primeiras
-- gravações do valor em dois separadores podem inserir DOIS planos
-- (duas linhas ordem=1), e a sincronização/registo do sinal passam a
-- escolher uma delas arbitrariamente. O índice único fecha a corrida
-- na origem e dá determinismo a todas as leituras `ordem = 1`.
--
-- Com o índice, a segunda inserção concorrente falha ruidosamente
-- (23505) em vez de duplicar — o guardarValorAcordado já engole e
-- regista esse erro sem incomodar (o plano da primeira fica), e o
-- botão "Gerar plano" mostra o erro. Nenhuma alteração de código é
-- necessária; DESACOPLADA do deploy (segura antes ou depois).
--
-- 1) DETEÇÃO primeiro — o CREATE UNIQUE falha se já existirem
--    duplicados; com linhas aqui, resolve-se à mão antes:
select submission_id, ordem, count(*) as quantos, array_agg(id) as previstos
  from public.pagamentos_previstos
 group by submission_id, ordem
having count(*) > 1;

-- 2) O índice (idempotente).
create unique index if not exists pagamentos_previstos_submissao_ordem_unq
  on public.pagamentos_previstos (submission_id, ordem);
