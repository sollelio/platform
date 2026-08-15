-- ============================================================================
-- 091 · O fim do `using (true)` — cada casa vê a sua
--
-- A 090 criou a coluna e carimbou tudo, sem mudar comportamento nenhum. Esta
-- muda: as trinta e cinco políticas que diziam `using (true)` passam a
-- perguntar de que casa é a linha. É a migração que dá sentido à anterior.
--
-- O `using (true)` não era desleixo — era a regra certa para uma casa só. A
-- RLS servia de portão entre quem entrou e quem não entrou, e mais nada era
-- preciso. O que muda não é a qualidade da regra: é o número de casas.
--
-- TRÊS FORMAS, e só três:
--   · RAIZ — a tabela tem tenant_id (a 090 pô-lo em dez; esta põe na décima
--     primeira, questionario_grupos).
--   · FOLHA — o tenant vem por ligação já existente, quase sempre
--     submission_id. Dar coluna própria a uma folha seria criar uma segunda
--     fonte de verdade para a mesma pergunta, e com ela a hipótese de
--     divergirem sem ninguém dar por isso.
--   · FOLHA DE SEGUNDO GRAU — portal_actos e portal_verificacoes não tocam
--     em submissions; chegam lá por portal_publicacoes e portal_acessos.
--
-- O `(select public.tenants_do_utilizador())` vai entre parênteses de
-- propósito: assim o planeador avalia a função UMA vez por consulta, em vez
-- de uma vez por linha.
--
-- NOMES UNIFORMIZADOS. A base tinha três convenções à mistura («admin acesso
-- total», «comunicados_equipa», «publico le tipos de evento»). Passa a
-- haver duas: `tenant_isolamento` para o que separa casas, `publico_*` para
-- o que o anon pode fazer. Quem ler pg_policies daqui a um ano percebe a
-- regra sem ler o corpo.
--
-- ── DÍVIDAS QUE ESTA MIGRAÇÃO NÃO PAGA (e é deliberado) ───────────────────
--
-- 1 · A política anon de event_types continua a ler TUDO. O formulário de
--     entrada (getTiposParaCaptacao) precisa dela e não tem âncora nenhuma
--     — nem token, nem código — de onde derivar a casa. Resolve-se na 092,
--     pondo o slug no endereço. Com uma casa só, não há exposição real.
--
-- 2 · As chaves de texto (app_config.chave, event_types.nome,
--     avaliacao_eixos.chave, questionario_grupos.chave) continuam únicas
--     GLOBALMENTE. A segunda casa que quiser um tipo «Casamento» leva um
--     erro. Vai na 093.
--
-- 3 · As três funções que recebem uuid e estão abertas ao anon continuam
--     abertas. RLS não as trava — SECURITY DEFINER ignora políticas por
--     definição. Vão na 092, e é lá que está o buraco a sério.
--
-- Nenhuma das três é regressão: são o estado de hoje, agora escrito.
-- ============================================================================

-- ── 1 · A décima primeira raiz ──────────────────────────────────────────────
--
-- Os grupos são os prazos que fecham secções do formulário antes do evento
-- («depois de 30 dias antes, este grupo fecha»). Quem os define é a Nádia,
-- logo são da casa. Ficou de fora da 090 porque só se percebeu depois, ao
-- ver que a tabela não tinha ligação nenhuma — nem coluna, nem caminho até
-- submissions. Uma tabela assim não admite política de tenant: qualquer
-- regra a tornaria invisível.

alter table public.questionario_grupos
  add column if not exists tenant_id uuid references public.tenants(id);

update public.questionario_grupos
   set tenant_id = (select id from public.tenants where slug = 'doluxoamesa')
 where tenant_id is null;

alter table public.questionario_grupos alter column tenant_id set not null;

create index if not exists questionario_grupos_tenant_idx
  on public.questionario_grupos (tenant_id);

-- ── 2 · Fora com as antigas ─────────────────────────────────────────────────
--
-- As trinta e cinco, pelo nome exacto que têm hoje. `if exists` porque esta
-- migração corre em teste e depois em produção, e uma segunda passagem não
-- deve rebentar.

drop policy if exists "admin acesso total"              on public.app_config;
drop policy if exists "admin acesso total"              on public.avaliacao_eixos;
drop policy if exists "admin acesso total"              on public.avaliacoes;
drop policy if exists "admin acesso total"              on public.campanha_intencoes;
drop policy if exists "admin acesso total"              on public.campanhas;
drop policy if exists "admin acesso total"              on public.clientes;
drop policy if exists "comunicado_destinatarios_equipa" on public.comunicado_destinatarios;
drop policy if exists "comunicado_modelos_equipa"       on public.comunicado_modelos;
drop policy if exists "comunicados_equipa"              on public.comunicados;
drop policy if exists "admin acesso total"              on public.documentos;
drop policy if exists "admin acesso total"              on public.event_types;
drop policy if exists "publico le tipos de evento"      on public.event_types;
drop policy if exists "admin acesso total"              on public.evento_fotografias;
drop policy if exists "admin acesso total"              on public.evento_materiais;
drop policy if exists "admin acesso total"              on public.form_errors;
drop policy if exists "publico regista erros"           on public.form_errors;
drop policy if exists "admin acesso total"              on public.invites;
drop policy if exists "admin acesso total"              on public.materiais;
drop policy if exists "admin acesso total"              on public.mensagens_tipo;
drop policy if exists "admin acesso total"              on public.notas_evento;
drop policy if exists "admin acesso total"              on public.notificacoes;
drop policy if exists "admin acesso total"              on public.pagamentos;
drop policy if exists "admin acesso total"              on public.pagamentos_previstos;
drop policy if exists "admin acesso total"              on public.portal_acessos;
drop policy if exists "admin acesso total"              on public.portal_actos;
drop policy if exists "admin le as leituras"            on public.portal_condicoes_lidas;
drop policy if exists "admin acesso total"              on public.portal_publicacoes;
drop policy if exists "admin anula confirmacoes"        on public.portal_sinal_confirmacoes;
drop policy if exists "admin le as confirmacoes"        on public.portal_sinal_confirmacoes;
drop policy if exists "admin acesso total"              on public.portal_verificacoes;
drop policy if exists "admin acesso total"              on public.questionario_grupos;
drop policy if exists "admin acesso total"              on public.questionario_pedidos;
drop policy if exists "admin acesso total"              on public.reservas;
drop policy if exists "admin acesso total"              on public.respostas_autoria;
drop policy if exists "admin acesso total"              on public.submissions;

-- E as novas, caso esta migração já tenha corrido antes:
drop policy if exists tenant_isolamento on public.app_config;
drop policy if exists tenant_isolamento on public.avaliacao_eixos;
drop policy if exists tenant_isolamento on public.avaliacoes;
drop policy if exists tenant_isolamento on public.campanha_intencoes;
drop policy if exists tenant_isolamento on public.campanhas;
drop policy if exists tenant_isolamento on public.clientes;
drop policy if exists tenant_isolamento on public.comunicado_destinatarios;
drop policy if exists tenant_isolamento on public.comunicado_modelos;
drop policy if exists tenant_isolamento on public.comunicados;
drop policy if exists tenant_isolamento on public.documentos;
drop policy if exists tenant_isolamento on public.event_types;
drop policy if exists tenant_isolamento on public.evento_fotografias;
drop policy if exists tenant_isolamento on public.evento_materiais;
drop policy if exists tenant_isolamento on public.invites;
drop policy if exists tenant_isolamento on public.materiais;
drop policy if exists tenant_isolamento on public.mensagens_tipo;
drop policy if exists tenant_isolamento on public.notas_evento;
drop policy if exists tenant_isolamento on public.notificacoes;
drop policy if exists tenant_isolamento on public.pagamentos;
drop policy if exists tenant_isolamento on public.pagamentos_previstos;
drop policy if exists tenant_isolamento on public.portal_acessos;
drop policy if exists tenant_isolamento on public.portal_actos;
drop policy if exists tenant_isolamento on public.portal_condicoes_lidas;
drop policy if exists tenant_isolamento on public.portal_publicacoes;
drop policy if exists tenant_isolamento on public.portal_sinal_confirmacoes;
drop policy if exists tenant_isolamento on public.portal_verificacoes;
drop policy if exists tenant_isolamento on public.questionario_grupos;
drop policy if exists tenant_isolamento on public.questionario_pedidos;
drop policy if exists tenant_isolamento on public.reservas;
drop policy if exists tenant_isolamento on public.respostas_autoria;
drop policy if exists tenant_isolamento on public.submissions;
drop policy if exists equipa_le_erros    on public.form_errors;
drop policy if exists publico_regista_erros on public.form_errors;
drop policy if exists publico_le_tipos_de_evento on public.event_types;

-- ── 3 · As raízes ───────────────────────────────────────────────────────────

create policy tenant_isolamento on public.submissions
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.clientes
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.materiais
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.app_config
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.avaliacao_eixos
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.mensagens_tipo
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.comunicados
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.comunicado_modelos
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.invites
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

create policy tenant_isolamento on public.questionario_grupos
  for all to authenticated
  using      (tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

-- event_types é a excepção: tenant_id nulo significa «modelo da plataforma».
-- Lê-se o que é global e o que é da casa; escreve-se SÓ na casa. O with
-- check sem o `is null` é o que impede alguém de criar um modelo global por
-- acidente — e um modelo global criado por acidente apareceria a todas as
-- casas de uma vez.
create policy tenant_isolamento on public.event_types
  for all to authenticated
  using      (tenant_id is null or tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

-- ── 4 · As folhas — o tenant vem por submission_id ──────────────────────────

create policy tenant_isolamento on public.avaliacoes
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = avaliacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = avaliacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.campanhas
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = campanhas.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = campanhas.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.documentos
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = documentos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = documentos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.evento_fotografias
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = evento_fotografias.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = evento_fotografias.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.evento_materiais
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = evento_materiais.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = evento_materiais.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.notas_evento
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = notas_evento.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = notas_evento.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.notificacoes
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = notificacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = notificacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.pagamentos
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = pagamentos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = pagamentos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.pagamentos_previstos
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = pagamentos_previstos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = pagamentos_previstos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.portal_acessos
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = portal_acessos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = portal_acessos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.portal_publicacoes
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = portal_publicacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = portal_publicacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.portal_sinal_confirmacoes
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = portal_sinal_confirmacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = portal_sinal_confirmacoes.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.questionario_pedidos
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = questionario_pedidos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = questionario_pedidos.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.respostas_autoria
  for all to authenticated
  using (exists (select 1 from public.submissions s
                  where s.id = respostas_autoria.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.submissions s
                  where s.id = respostas_autoria.submission_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

-- reservas está VAZIA hoje, e submission_id é nullable: uma reserva pode
-- existir antes do evento. Uma reserva sem evento ficaria invisível — o
-- `is null` evita isso. Quando reservas passar a ter uso a sério, provável
-- que precise de tenant_id próprio; com zero linhas, não vale antecipar.
create policy tenant_isolamento on public.reservas
  for all to authenticated
  using (submission_id is null or exists (
           select 1 from public.submissions s
            where s.id = reservas.submission_id
              and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (submission_id is null or exists (
           select 1 from public.submissions s
            where s.id = reservas.submission_id
              and s.tenant_id in (select public.tenants_do_utilizador())));

-- comunicado_destinatarios chega por comunicados, que É raiz — mais curto
-- do que passar por submissions, e submission_id aqui é nullable (um
-- destinatário pode ser um cliente sem evento).
create policy tenant_isolamento on public.comunicado_destinatarios
  for all to authenticated
  using (exists (select 1 from public.comunicados c
                  where c.id = comunicado_destinatarios.comunicado_id
                    and c.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.comunicados c
                  where c.id = comunicado_destinatarios.comunicado_id
                    and c.tenant_id in (select public.tenants_do_utilizador())));

-- campanha_intencoes: duas voltas — campanhas → submissions.
create policy tenant_isolamento on public.campanha_intencoes
  for all to authenticated
  using (exists (select 1 from public.campanhas c
                   join public.submissions s on s.id = c.submission_id
                  where c.id = campanha_intencoes.campanha_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.campanhas c
                   join public.submissions s on s.id = c.submission_id
                  where c.id = campanha_intencoes.campanha_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

-- ── 5 · As folhas de segundo grau ───────────────────────────────────────────
--
-- Estas três não tocam em submissions. portal_verificacoes chega por
-- portal_acessos; portal_actos por portal_publicacoes; portal_condicoes_lidas
-- tem as duas ligações e usa portal_acessos, a mais directa.

create policy tenant_isolamento on public.portal_verificacoes
  for all to authenticated
  using (exists (select 1 from public.portal_acessos pa
                   join public.submissions s on s.id = pa.submission_id
                  where pa.id = portal_verificacoes.acesso_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.portal_acessos pa
                   join public.submissions s on s.id = pa.submission_id
                  where pa.id = portal_verificacoes.acesso_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.portal_actos
  for all to authenticated
  using (exists (select 1 from public.portal_publicacoes pp
                   join public.submissions s on s.id = pp.submission_id
                  where pp.id = portal_actos.publicacao_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.portal_publicacoes pp
                   join public.submissions s on s.id = pp.submission_id
                  where pp.id = portal_actos.publicacao_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

create policy tenant_isolamento on public.portal_condicoes_lidas
  for all to authenticated
  using (exists (select 1 from public.portal_acessos pa
                   join public.submissions s on s.id = pa.submission_id
                  where pa.id = portal_condicoes_lidas.acesso_id
                    and s.tenant_id in (select public.tenants_do_utilizador())))
  with check (exists (select 1 from public.portal_acessos pa
                   join public.submissions s on s.id = pa.submission_id
                  where pa.id = portal_condicoes_lidas.acesso_id
                    and s.tenant_id in (select public.tenants_do_utilizador())));

-- ── 6 · O que fica fora do modelo de casas ──────────────────────────────────
--
-- form_errors é diagnóstico do developer, não dado de cliente: erros de
-- JavaScript no formulário, para se perceber o que rebentou. Não tem ligação
-- a nada e não faz sentido tê-la. Fica legível a quem entrou, e o anon
-- continua a poder escrever — de outro modo os erros deixavam de ser
-- registados, que é o oposto do propósito.
--
-- ⚠ ISTO É O CAMINHO MAIS FÁCIL PARA ENCHER OS 500 MB DO PLANO GRATUITO:
-- qualquer pessoa pode inserir linhas sem limite. Não se trata aqui porque
-- é problema de outra natureza (limite de escrita, não isolamento), mas
-- fica escrito para não se esquecer.

create policy equipa_le_erros on public.form_errors
  for all to authenticated
  using (true) with check (true);

create policy publico_regista_erros on public.form_errors
  for insert to anon
  with check (true);

-- A leitura anónima dos tipos de evento — o formulário de entrada precisa
-- dela para desenhar o select. Continua a ler TUDO: ver dívida 1 no
-- cabeçalho. Recriada só para uniformizar o nome.
create policy publico_le_tipos_de_evento on public.event_types
  for select to anon
  using (true);

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Trinta e duas tabelas, uma política de tenant cada (as três de
--     form_errors/event_types anónimas à parte):
--   select tablename, policyname from pg_policies
--    where schemaname='public' order by tablename, policyname;
--
-- 2 · Nenhuma política `true` sobrou onde não devia:
--   select tablename, policyname, qual from pg_policies
--    where schemaname='public' and qual = 'true'
--      and roles::text like '%authenticated%';
--   -- Esperado: SÓ form_errors
--
-- 3 · Os grupos ficaram carimbados:
--   select count(*) from questionario_grupos where tenant_id is null;
--   -- Esperado: 0
--
-- 4 · A APP — e desta vez a sério, ecrã a ecrã. Se uma política estiver
--     errada, o sintoma NÃO é um erro: é uma lista vazia. Os dados estão
--     lá; deixaram de ser vistos. Percorrer:
--       · lista de eventos, calendário, funil
--       · um evento aberto: materiais, pagamentos, documentos, notas
--       · comunicados e modelos
--       · o formulário público com um código real
--       · o portal do noivo com um token real
--       · criar qualquer coisa nova (um material, uma nota) — o with check
--         só se testa a escrever
-- ============================================================================

-- ============================================================================
-- REVERSÃO — se algo correr mal, correr isto e voltamos ao estado da 090
-- ============================================================================
-- Descomentar e correr. Repor `using (true)` devolve o comportamento
-- anterior sem restaurar backup nenhum: os dados não foram tocados.
--
-- do $$
-- declare t record;
-- begin
--   for t in select tablename from pg_policies
--             where schemaname='public' and policyname='tenant_isolamento'
--   loop
--     execute format('drop policy tenant_isolamento on public.%I', t.tablename);
--     execute format('create policy "admin acesso total" on public.%I
--                     for all to authenticated using (true) with check (true)',
--                    t.tablename);
--   end loop;
-- end $$;
-- ============================================================================