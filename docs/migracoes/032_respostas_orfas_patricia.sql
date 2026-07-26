-- ============================================================
-- 032 — Reatar as respostas órfãs do casamento da Patrícia (22/08/2026).
--
-- Em julho de 2026 o modelo Casamento foi editado e os ids dos campos
-- regeneraram-se a partir dos rótulos (era assim que o editor gravava;
-- corrigido entretanto — ids estáveis em EventTypeEditor.jsx). As
-- respostas dadas pela cliente ANTES dessa edição ficaram órfãs:
-- continuam no JSONB, mas nenhum ecrã as lê, porque o modelo já não
-- tem campos com aqueles ids.
--
-- Isto copia cada valor órfão para o id ACTUAL do campo equivalente:
--   nomeDaNoiva          → nomeDoNoiva            ("Ana")
--   nomeDoNoivo          → nomeDaNoivo            (EXCLUÍDO: valor "??")
--   formatoDasMesas      → formatoMesasConvidados ("redondas")
--   moradaExactaDoLocal  → moradaExactaDoLocalDoEvento
--
-- Regras (decididas a 26/07/2026):
--   • idempotente — só copia se o destino estiver vazio; correr duas
--     vezes é igual a correr uma;
--   • nunca sobrepõe — um destino já preenchido fica como está;
--   • o "??" do nome do noivo NÃO se copia: é placeholder, o campo
--     fica vazio para a Nádia preencher com o nome verdadeiro;
--   • as chaves órfãs originais FICAM no JSONB — são histórico;
--   • só este evento (WHERE id) — as outras ocorrências destas chaves
--     em produção pertencem a modelos que as têm como campos legítimos
--     (Noivado, Aniversário, Inauguração), nada a corrigir lá.
--
-- numeroDeMesas ("5") e notasSobreEstiloDaPlaca ("Espelho") não entram
-- aqui: os campos foram removidos do modelo, e o caminho de
-- recuperação é recriá-los com o rótulo exacto (com ids estáveis, o id
-- antigo regenera-se e as respostas reaparecem sozinhas) — pendente de
-- decisão de produto com a Nádia.
--
-- Ensaiada primeiro em test (26/07/2026) sobre uma cópia sintética da
-- linha, incluindo prova de idempotência; executada em produção com
-- instantâneo antes/depois.
-- ============================================================

update public.submissions
set respostas = respostas
  || case
       when coalesce(respostas->>'nomeDoNoiva', '') = ''
        and coalesce(respostas->>'nomeDaNoiva', '') <> ''
       then jsonb_build_object('nomeDoNoiva', respostas->'nomeDaNoiva')
       else '{}'::jsonb
     end
  || case
       when coalesce(respostas->>'nomeDaNoivo', '') = ''
        and coalesce(respostas->>'nomeDoNoivo', '') not in ('', '??')
       then jsonb_build_object('nomeDaNoivo', respostas->'nomeDoNoivo')
       else '{}'::jsonb
     end
  || case
       when coalesce(respostas->>'formatoMesasConvidados', '') = ''
        and coalesce(respostas->>'formatoDasMesas', '') <> ''
       then jsonb_build_object('formatoMesasConvidados', respostas->'formatoDasMesas')
       else '{}'::jsonb
     end
  || case
       when coalesce(respostas->>'moradaExactaDoLocalDoEvento', '') = ''
        and coalesce(respostas->>'moradaExactaDoLocal', '') <> ''
       then jsonb_build_object('moradaExactaDoLocalDoEvento', respostas->'moradaExactaDoLocal')
       else '{}'::jsonb
     end
where id = '9b37cc65-9ca4-4062-b707-0196bb3b5ed0';
