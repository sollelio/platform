-- ============================================================================
-- 062 · Questionário no portal — a estrutura (fase 5, bloco 1)
--
-- Só ESTRUTURA. Nem uma função, nem uma linha de projecção: as RPC vêm na
-- 063, depois de isto estar de pé e conferido. Correr esta sozinha não muda
-- nada no que já funciona — é só chão novo.
--
-- ─── O QUE A FASE 5 PRECISA E NÃO EXISTIA ──────────────────────────────────
--
-- 1 · GRUPOS DE PRAZO. O que já foi comprado, impresso ou carregado não pode
--     mudar à última hora. Mas o prazo não é do questionário: é de cada
--     grupo de respostas. Três grupos, três antecedências.
--
--     A marcação vive no PASSO do modelo (decidido a 01/08/2026), não no
--     campo: são ~5 decisões por modelo em vez de 40, a Nádia já pensa em
--     passos, e o desenho da revisão já agrupa por passos.
--
--     ⚠ UM PASSO SEM GRUPO NUNCA FECHA. Nada se tranca por omissão. Isto
--     não é um detalhe de implementação — é a regra: um campo fechado é
--     protecção da montagem, e protecção que ninguém pediu é castigo.
--
-- 2 · AUTORIA POR RESPOSTA. Os dois lados escrevem no mesmo sítio, e às
--     vezes a Nádia corrige o que a cliente escreveu porque combinaram
--     outra coisa ao telefone. A cliente tem de ver uma marca discreta a
--     dizê-lo.
--
--     `submissions.respostas` FICA COMO ESTÁ — um mapa plano, mexido por
--     `||`. Reestruturá-lo para levar autoria partia dezenas de leitores
--     (o briefing, a logística, os contratos, quatro projecções do portal).
--     A autoria vive AO LADO, numa tabela de trilho: uma linha por escrita,
--     com o valor anterior. De caminho ganha-se histórico, que o desenho
--     ainda não usa mas que a primeira discussão sobre «eu não escrevi
--     isso» vai pedir.
--
-- 3 · O CARIMBO DE ENTREGA no evento. Hoje o portal lê `min(invites.
--     preenchido_em)` — mas quem responder PELO PORTAL pode não ter convite
--     nenhum. O carimbo passa a viver no evento, e faz-se backfill do que
--     já existe para nada se perder.
--
-- 4 · OS PEDIDOS DE ALTERAÇÃO a campo fechado. Passado o prazo, alterar
--     continua possível — vira pedido em vez de mudar o valor sozinho. Isso
--     é estado, e estado precisa de sítio.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · Os grupos de prazo da casa ─────────────────────────────────────────
--
-- Três linhas, não três constantes no código: a Nádia muda um prazo sem
-- migração nenhuma quando o fornecedor de flores mudar de antecedência.

create table if not exists public.questionario_grupos (
  chave      text primary key,
  rotulo     text not null,
  dias_antes integer not null check (dias_antes >= 0),
  porque     text not null,
  ordem      integer not null
);

comment on table public.questionario_grupos is
  'Os grupos de prazo do questionário. Um passo do modelo aponta para um '
  'destes pela chave; passo sem grupo nunca fecha. O `porque` é o texto que '
  'a cliente lê quando encontra um campo fechado — e é por isso que é uma '
  'coluna e não uma constante: a razão material tem de poder mudar com o '
  'prazo.';

insert into public.questionario_grupos (chave, rotulo, dias_antes, porque, ordem)
values
  ('compras',  'Compras e stock', 14,
   'as flores e o material encomendam-se com duas semanas de antecedência', 1),
  ('producao', 'Produção',         7,
   'os textos vão para impressão uma semana antes',                        2),
  ('palavras', 'Palavras',         2,
   'a equipa recebe o briefing final dois dias antes',                     3)
on conflict (chave) do nothing;

alter table public.questionario_grupos enable row level security;
drop policy if exists "admin acesso total" on public.questionario_grupos;
create policy "admin acesso total" on public.questionario_grupos
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.questionario_grupos to authenticated;


-- ─── 2 · A autoria, ao lado das respostas ───────────────────────────────────

create table if not exists public.respostas_autoria (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  campo_id       text not null,
  autor          text not null check (autor in ('cliente', 'equipa')),
  autor_id       uuid,
  valor_anterior jsonb,
  escrito_em     timestamptz not null default now()
);

create index if not exists respostas_autoria_evento_idx
  on public.respostas_autoria (submission_id, campo_id, escrito_em desc);

comment on table public.respostas_autoria is
  'Quem escreveu cada resposta, quando, e o que lá estava antes. Uma linha '
  'por escrita — as respostas em si continuam em submissions.respostas, '
  'intocadas. `autor` é o LADO (cliente ou equipa), não a pessoa: é isso '
  'que a cliente precisa de ver, e a pessoa fica em autor_id para o '
  'backoffice.';

alter table public.respostas_autoria enable row level security;
drop policy if exists "admin acesso total" on public.respostas_autoria;
create policy "admin acesso total" on public.respostas_autoria
  for all to authenticated using (true) with check (true);


-- ─── 3 · O carimbo de entrega, no evento ────────────────────────────────────

alter table public.submissions
  add column if not exists questionario_entregue_em timestamptz;

comment on column public.submissions.questionario_entregue_em is
  'Quando o questionário ficou entregue. Vivia só em invites.preenchido_em, '
  'que não serve para quem responde pelo portal — essa pessoa pode não ter '
  'convite nenhum.';

-- Backfill: o que já foi entregue por convite não se perde nem se duplica.
update public.submissions s
   set questionario_entregue_em = i.quando
  from (
    select submission_id, min(preenchido_em) as quando
      from public.invites
     where preenchido_em is not null and submission_id is not null
     group by submission_id
  ) i
 where i.submission_id = s.id
   and s.questionario_entregue_em is null;


-- ─── 4 · Os pedidos de alteração a campo fechado ────────────────────────────

create table if not exists public.questionario_pedidos (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  campo_id      text not null,
  campo_label   text not null,
  pedido        text not null,
  pedido_em     timestamptz not null default now(),
  respondido_em timestamptz,
  respondido_por uuid
);

create index if not exists questionario_pedidos_por_responder_idx
  on public.questionario_pedidos (submission_id, pedido_em desc)
  where respondido_em is null;

comment on table public.questionario_pedidos is
  'Quando o prazo de um grupo já passou, alterar deixa de mudar o valor e '
  'passa a pedir. O `campo_label` guarda-se por extenso de propósito: o '
  'rótulo do modelo pode ser editado depois, e o pedido tem de continuar a '
  'dizer o que ela pediu na altura.';

alter table public.questionario_pedidos enable row level security;
drop policy if exists "admin acesso total" on public.questionario_pedidos;
create policy "admin acesso total" on public.questionario_pedidos
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.questionario_pedidos to authenticated;


-- ─── 5 · O anon não lê nada disto ───────────────────────────────────────────
--
-- Nenhum grant a anon, em nenhuma das três tabelas. Tudo o que a página
-- pública precisar passa pelas RPC da 063, com projecção explícita — a
-- regra da casa desde a 049.

revoke all on public.questionario_grupos  from anon;
revoke all on public.respostas_autoria    from anon;
revoke all on public.questionario_pedidos from anon;


-- ============================================================================
-- 6 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 6.1 · Os três grupos ficaram lá, pela ordem certa:
--   select ordem, chave, rotulo, dias_antes, porque
--     from questionario_grupos order by ordem;

-- 6.2 · O backfill apanhou os questionários já entregues.
--   ANTES esperava-se 5 em 13 eventos com questionário respondido:
--   select count(*) filter (where questionario_entregue_em is not null) as entregues,
--          count(*) as eventos
--     from submissions;
--   -- Se `entregues` vier a 0, o backfill não apanhou nada e é preciso ver
--   -- porquê ANTES de avançar para a 063 — não se constrói a leitura em
--   -- cima de um carimbo vazio.

-- 6.3 · E bate certo com o que havia nos convites:
--   select count(distinct submission_id) from invites
--    where preenchido_em is not null and submission_id is not null;
--   -- Tem de dar o mesmo número que o 6.2.

-- 6.4 · O anon não chega lá:
--   set role anon;
--   select * from questionario_grupos;   -- Esperado: ERRO de permissão
--   reset role;

-- 6.5 · Correr a migração DUAS vezes não duplica nada:
--   select count(*) from questionario_grupos;  -- Esperado: 3, sempre.
