-- semear-comunicado-condicoes.sql
--
-- SEMEAR O PRIMEIRO COMUNICADO — as «Condições para a montagem e recolha».
--
-- ⚠️ ISTO NÃO É UMA MIGRAÇÃO e não entra na cadeia numerada, de propósito:
-- as migrações são o esquema do produto, e o produto (Celebra) vai ser
-- vendido a outros negócios — nenhum deles quer nascer com o texto da Do
-- Luxo à Mesa dentro. Conteúdo de um negócio nunca vive na cadeia que
-- todos correm. Corre-se UMA vez por ambiente, à mão, como a limpeza.
--
-- SEMEIA MENOS DO QUE PARECE, e é essa a intenção: só a folha, POR
-- PUBLICAR — sem token, sem molde, sem lista, sem regra de público. Os
-- gestos são o produto: publicar, recortar, congelar, expedir e o convite
-- ao molde no fim são exactamente o que a anfitriã precisa de
-- experimentar — e a única prova real de que funcionam. O que a seed lhe
-- tira é só a transcrição de onze blocos no telemóvel.
--
-- A mensagem da conversa vai semeada também ({NOME} e {LINK_FOLHA}, a
-- gramática da casa) — ela edita-a no ecrã da mensagem antes de enviar.
--
-- O event_type_id do Casamento NÃO se resolve aqui: difere entre TEST e
-- produção, e uma seed que o cravasse partia num dos dois. O recorte é
-- dela — três toques.
--
-- O conteúdo é o da seed do desenho (fase 1), byte a byte — gerado das
-- fixtures para não haver transcrição nova, e CONFERIDO contra o PDF
-- real que circula («Guia de Preparação», 04/08/2026): os nove blocos
-- de texto são idênticos palavra a palavra; os dois separadores de
-- grupo («A montagem» / «A recolha») são a arrumação que o Design
-- acrescentou e o dono aprovou na fase 1.
--
-- Requer as migrações 079 E 080 (a coluna `registo` nasce na 080).
--
-- Idempotente pelo título: correr duas vezes não duplica a folha.

insert into public.comunicados (titulo, subtitulo, registo, blocos, mensagem)
select
  'Condições para a montagem e recolha do vosso dia',
  'Uma folha da Do Luxo à Mesa para os noivos — e para o espaço, a wedding planner e os fornecedores com quem a partilharem.',
  'aviso',
  '[{"id":"b1","rotulo":"","texto":"Queridos noivos,\n\nPara garantir que o vosso cenário de sonho seja preparado com organização, segurança e dentro dos horários previstos, pedimos a vossa colaboração na partilha destas orientações com o espaço, wedding planner (caso exista) e restantes fornecedores."},{"id":"b2","rotulo":"Nota importante","texto":"A nossa equipa é exclusivamente responsável pelo design, montagem e estética dos elementos decorativos contratados à nossa empresa. Não coordenamos nem supervisionamos serviços prestados por terceiros."},{"id":"b3","rotulo":"A montagem","texto":""},{"id":"b4","rotulo":"Responsabilidade do espaço","texto":"O mobiliário deverá encontrar-se previamente montado e posicionado na disposição final acordada antes da chegada da nossa equipa."},{"id":"b5","rotulo":"Disponibilidade do espaço","texto":"O espaço deverá encontrar-se totalmente desimpedido e disponível para o início da montagem no horário acordado."},{"id":"b6","rotulo":"Zonas de trabalho","texto":"As áreas destinadas à decoração deverão estar livres de pessoas e de materiais alheios à nossa montagem."},{"id":"b7","rotulo":"A recolha","texto":""},{"id":"b8","rotulo":"Recolha de material","texto":"No final do evento, procederemos exclusivamente à desmontagem e recolha dos materiais pertencentes à nossa empresa."},{"id":"b9","rotulo":"Serviços de terceiros","texto":"A colocação, remoção e destino final de flores, adereços e restantes materiais pertencentes ao cliente ou a outros fornecedores não fazem parte dos nossos serviços."},{"id":"b10","rotulo":"Limpeza","texto":"A limpeza do espaço após o evento, bem como a eliminação de resíduos gerados por outros fornecedores, não está incluída nos nossos serviços."},{"id":"b11","rotulo":"Agradecimento","texto":"Agradecemos a vossa compreensão e colaboração. Estas orientações permitem-nos dedicar toda a nossa atenção à criação de um ambiente elegante e memorável para o vosso grande dia."}]'::jsonb,
  'Olá, {NOME}! Preparámos uma folha com as condições para a montagem e a recolha do vosso grande dia. Pode abri-la aqui — e partilhá-la com o espaço, a wedding planner e os restantes fornecedores: {LINK_FOLHA}'
where not exists (
  select 1 from public.comunicados
   where titulo = 'Condições para a montagem e recolha do vosso dia'
);

-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═════════════════════════════════════════════════════════════
--
-- 1) A folha está lá, por publicar e sem nada resolvido:
--      select titulo, registo, jsonb_array_length(blocos) as blocos,
--             token, publicado_em, publico, modelo_id
--        from comunicados
--       where titulo like 'Condições para a montagem%';
--      → 1 linha · registo 'aviso' · 11 blocos · token/publicado_em/
--        publico/modelo_id todos NULL
--
-- 2) Correr este ficheiro OUTRA VEZ não cria segunda linha (o guarda
--    do título).
--
-- 3) A prova que interessa é no ecrã: abrir a folha no separador
--    Comunicados, entrar no editor e na pré-visualização SEM lhe tocar —
--    se renderizar certo, a forma dos blocos está confirmada de ponta a
--    ponta, do desenho da fase 1 ao que a base guarda hoje.
