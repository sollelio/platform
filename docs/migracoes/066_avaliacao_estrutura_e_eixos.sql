-- ============================================================================
-- 066 · A avaliação — estrutura e eixos (fase 7, bloco 1)
--
-- Depois do evento, a cliente é convidada a avaliar: uma frase, algumas
-- linhas para puxar, e a fotografia preferida. Depois disso o portal
-- despede-se — e só mais tarde é que fecha.
--
-- Só ESTRUTURA e o MAPA. As RPC vêm na 067.
--
-- ─── OS EIXOS SAEM DOS SERVIÇOS, E OS SERVIÇOS FORAM CONTADOS ──────────────
--
-- Há eventos sem comida. Perguntar pelo sabor a quem comprou um cenário é
-- dizer que não se sabe o que se lhe vendeu. Os eixos saem de
-- `respostas.servicos`, que está preenchido em 13 de 13 eventos.
--
-- ⚠ O CATÁLOGO DO CÓDIGO NÃO É O QUE ESTÁ GUARDADO. O formulário oferece
--   hoje «Cenário fotografável»; os dez eventos que o contrataram têm
--   guardado «Cenário», e mais nada. Se o mapa fosse pelo catálogo, dez em
--   treze ficavam sem eixo nenhum.
--
--   Contagem real (01/08/2026): Cenário 10 · Mesa posta 9 · Buffet 6 ·
--   Balcão 1 · «Mesa do bolo da noiva» ZERO, apesar de estar no formulário.
--
--   Por isso um eixo aceita VÁRIAS cadeias — é o que torna o mapa capaz de
--   sobreviver a uma mudança de rótulo sem migração e sem perder histórico.
--
-- ⚠ A ORDEM É DO MAPA, NUNCA DO ARRAY. Um dos eventos tem
--   ["Cenário","Mesa posta"] e outros têm ["Mesa posta","Cenário"] — a
--   mesma compra por ordem diferente. Sem ordem própria, duas clientes com
--   o mesmo evento veriam as perguntas trocadas.
--
-- ─── A AUTORIZAÇÃO, E O LIMITE QUE ELA NÃO PODE ULTRAPASSAR ────────────────
--
-- A frase vai para o site com autorização dela. A FOTOGRAFIA NÃO SE LHE
-- PERGUNTA: se tiver convidados reconhecíveis, essas pessoas não
-- consentiram, e a anfitriã não pode consentir por elas.
--
-- Quem sabe se há gente reconhecível na fotografia é quem lá esteve. Por
-- isso `pode_publicar` vive na FOTOGRAFIA e marca-se no backoffice — e
-- nasce FALSA: nada é publicável até alguém ter olhado e dito que sim.
--
-- São duas decisões de duas pessoas diferentes, e é por isso que não
-- partilham interruptor.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O mapa serviço → eixo ──────────────────────────────────────────────

create table if not exists public.avaliacao_eixos (
  chave          text primary key,
  servicos       text[] not null default '{}',
  rotulo         text not null,
  ponta_esquerda text not null,
  ponta_direita  text not null,
  ordem          integer not null
);

comment on table public.avaliacao_eixos is
  'Que perguntas se fazem a quem contratou o quê. Vive em tabela e não em '
  'código porque o catálogo de serviços muda — e mudou já: o formulário diz '
  '«Cenário fotografável» e os dados dizem «Cenário».';

comment on column public.avaliacao_eixos.servicos is
  'As cadeias que trazem este eixo, TAL COMO ESTÃO GUARDADAS em '
  'respostas.servicos. Várias por eixo de propósito: é assim que um rótulo '
  'novo entra sem deixar o histórico para trás. VAZIO quer dizer SEMPRE.';

comment on column public.avaliacao_eixos.ordem is
  'A ordem das perguntas sai daqui, nunca da ordem do array do evento — que '
  'varia de cliente para cliente para a mesma compra.';

insert into public.avaliacao_eixos
  (chave, servicos, rotulo, ponta_esquerda, ponta_direita, ordem)
values
  ('mesa',
   array['Mesa posta'],
   'A mesa que encontrou',
   'ficou como combinámos', 'parou as pessoas à entrada', 1),

  -- Duas cadeias, um eixo: «Cenário» é o que está guardado nos dez eventos,
  -- «Cenário fotografável» é o que o formulário passou a escrever.
  ('cenario',
   array['Cenário', 'Cenário fotografável'],
   'O cenário',
   'ficou bonito', 'toda a gente quis uma fotografia lá', 2),

  ('comida',
   array['Buffet'],
   'A comida',
   'correu bem', 'ainda hoje falam dela', 3),

  ('servico',
   array['Balcão'],
   'A equipa em serviço',
   'fizeram o que era preciso', 'nem se deram por eles', 4),

  ('bolo',
   array['Mesa do bolo da noiva'],
   'A mesa do bolo',
   'ficou como imaginava', 'foi o momento da noite', 5),

  -- SEMPRE, seja o que for que ela contratou. É o que a casa vende de
  -- facto, e é a resposta que vale mais — por isso fecha, depois de um
  -- filete, e é a única com `servicos` vazio.
  ('tranquilidade',
   '{}',
   'A tranquilidade com que passou o dia',
   'estive atenta a tudo', 'esqueci-me de vigiar', 99)
on conflict (chave) do nothing;

alter table public.avaliacao_eixos enable row level security;
drop policy if exists "admin acesso total" on public.avaliacao_eixos;
create policy "admin acesso total" on public.avaliacao_eixos
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.avaliacao_eixos to authenticated;
revoke all on public.avaliacao_eixos from anon;


-- ─── 2 · A avaliação ────────────────────────────────────────────────────────

create table if not exists public.avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique
                references public.submissions(id) on delete cascade,
  frase         text,
  eixos         jsonb not null default '[]'::jsonb,
  fotografia_id uuid references public.evento_fotografias(id) on delete set null,
  publicacao_autorizada boolean not null default false,
  nome_como     text not null default 'completo'
                check (nome_como in ('completo', 'primeiro', 'anonimo')),
  criada_em     timestamptz not null default now(),
  publicada_em  timestamptz
);

comment on table public.avaliacoes is
  'Uma por evento (unique). Gravá-la NÃO revoga o acesso — fechar a porta a '
  'quem acabou de dar uma frase e uma fotografia é o gesto errado no momento '
  'errado. O portal entra em despedida e vive até ao fim do prazo.';

comment on column public.avaliacoes.eixos is
  'As respostas dos deslizadores: [{chave, rotulo, valor}], valor de 0 a 100. '
  'JSONB e não colunas — o catálogo de serviços vai mudar, e um eixo novo '
  'não pode pedir migração.';

comment on column public.avaliacoes.publicacao_autorizada is
  'A autorização DELA, e só sobre AS PALAVRAS. Nasce falsa: nada vem '
  'pré-marcado. A fotografia decide-se noutro sítio e por outra pessoa — ver '
  'evento_fotografias.pode_publicar.';

comment on column public.avaliacoes.fotografia_id is
  'A preferida DELA. Escolher não é autorizar: uma fotografia pode ser a '
  'preferida e não ser publicável, que é o caso normal quando tem convidados.';

comment on column public.avaliacoes.publicada_em is
  'Quando foi mesmo para o site. Fica por preencher até o site existir — a '
  'captação constrói-se agora, a ponte faz-se depois.';

create index if not exists avaliacoes_por_publicar_idx
  on public.avaliacoes (criada_em desc)
  where publicacao_autorizada and publicada_em is null;

alter table public.avaliacoes enable row level security;
drop policy if exists "admin acesso total" on public.avaliacoes;
create policy "admin acesso total" on public.avaliacoes
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.avaliacoes to authenticated;
revoke all on public.avaliacoes from anon;


-- ─── 3 · A fotografia que pode ir para o site ───────────────────────────────
--
-- Decisão DA CASA, não dela. Nasce falsa.

alter table public.evento_fotografias
  add column if not exists pode_publicar boolean not null default false;

comment on column public.evento_fotografias.pode_publicar is
  'Se esta fotografia pode ir para o site público. Marca-se no backoffice, '
  'porque só quem lá esteve sabe se há convidados reconhecíveis — e a '
  'anfitriã não pode consentir por eles. NASCE FALSA: nada é publicável até '
  'alguém ter olhado e dito que sim.';


-- ─── 4 · O motivo «avaliado» sobrevive, a significar outra coisa ────────────

comment on column public.portal_acessos.motivo is
  'Porque é que o acesso foi revogado: prazo · manual · avaliado. '
  'ATENÇÃO (066): «avaliado» já NÃO é automático. Estava no plano que o '
  'acesso morresse ao gravar a avaliação, e mudou — o portal passa a um '
  'estado de despedida que vive até ao fim do prazo. O valor fica '
  'disponível para revogação à mão por esse motivo, e mais nada.';


-- ============================================================================
-- 5 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 5.1 · 🔴 O MAPA COBRE OS 13 EVENTOS. Nenhum pode ficar sem eixos:
--   with servicos as (
--     select s.id,
--            array_agg(v #>> '{}') as lista
--       from public.submissions s
--       cross join lateral jsonb_array_elements(
--         case when jsonb_typeof(s.respostas->'servicos') = 'array'
--              then s.respostas->'servicos' else '[]'::jsonb end) as t(v)
--      group by s.id)
--   select count(*) filter (where n = 0) as sem_eixo_nenhum,
--          count(*) filter (where n = 1) as so_a_tranquilidade,
--          min(n) as minimo, max(n) as maximo
--     from (
--       select sv.id,
--              (select count(*) from public.avaliacao_eixos e
--                where e.servicos = '{}' or e.servicos && sv.lista) as n
--         from servicos sv) c;
--   -- Esperado: sem_eixo_nenhum = 0, so_a_tranquilidade = 0,
--   --           minimo = 2 (um serviço + tranquilidade), maximo = 4.

-- 5.2 · E vê-se evento a evento que perguntas sairiam (sem nomes):
--   with servicos as (
--     select s.id, array_agg(v #>> '{}') as lista
--       from public.submissions s
--       cross join lateral jsonb_array_elements(
--         case when jsonb_typeof(s.respostas->'servicos') = 'array'
--              then s.respostas->'servicos' else '[]'::jsonb end) as t(v)
--      group by s.id)
--   select dense_rank() over (order by sv.id) as evento,
--          sv.lista,
--          (select string_agg(e.rotulo, ' · ' order by e.ordem)
--             from public.avaliacao_eixos e
--            where e.servicos = '{}' or e.servicos && sv.lista) as perguntas
--     from servicos sv order by evento;
--   -- A tranquilidade tem de aparecer em TODAS as linhas, sempre no fim.

-- 5.3 · Nenhuma fotografia nasce publicável:
--   select count(*) filter (where pode_publicar) from evento_fotografias;
--   -- Esperado: 0.

-- 5.4 · O anon não lê nada disto:
--   set role anon;
--   select * from avaliacoes;        -- Esperado: ERRO
--   select * from avaliacao_eixos;   -- Esperado: ERRO
--   reset role;

-- 5.5 · Uma avaliação por evento:
--   insert into avaliacoes (submission_id) values ('<EVENTO>'::uuid);
--   insert into avaliacoes (submission_id) values ('<EVENTO>'::uuid);
--   -- A segunda tem de falhar por unicidade. Apagar a de teste no fim.

-- 5.6 · Correr a migração duas vezes não duplica o mapa:
--   select count(*) from avaliacao_eixos;   -- Esperado: 6, sempre.
