-- ============================================================================
-- 095 · Uma só disputa do dia
--
-- A 093 acrescentou p_tenant ao dlm_dia_estado, mas com DEFAULT — e um
-- default cria SOBRECARGA, não substituição. Ficaram duas funções com o
-- mesmo nome: a de três argumentos, com escopo, e a antiga de dois, sem
-- escopo nenhum.
--
-- O dlm_portal_ver chama-a com dois argumentos, e por isso continua a
-- resolver para a antiga: o portal de um noivo veria dias ocupados por
-- eventos de outra casa, com o nome da cliente rival. É exactamente a fuga
-- que a 093 existiu para fechar, deixada em aberto por uma assinatura.
-- ============================================================================

drop function if exists public.dlm_dia_estado(date, uuid);