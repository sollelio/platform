-- ============================================================================
-- 105 · Quem fez isto
--
-- O sistema não sabe quem criou nada. As contas do Hélio e da Nádia
-- separaram-se na 090, mas duas contas dão dois logins, não histórico: uma
-- linha criada ontem não diz por quem, e a saudação do admin dizia «Nádia»
-- cravado no código porque não havia outro sítio de onde tirar um nome.
--
-- Esta migração faz UMA coisa: regista quem CRIOU cada linha. Não regista
-- quem alterou — o livro de auditoria fica por escrever, e o desenho dele
-- está no fim deste ficheiro com a razão de não estar feito.
--
-- ── PORQUÊ SÓ A CRIAÇÃO ──────────────────────────────────────────────────
--
-- O `criado_por` é a peça que fica CARA se ficar por fazer: acrescentá-lo
-- daqui a um ano obriga a decidir o que pôr nas linhas antigas, e quanto
-- mais tempo passar, mais linhas sem autor. Isso é dívida.
--
-- O livro não é: começa a registar no dia em que for ligado, e as linhas
-- anteriores nunca teriam registo de qualquer maneira. Construí-lo antes de
-- existir uma pergunta real («quem mudou este valor?») costuma produzir uma
-- tabela que guarda o que era fácil de guardar, não o que faz falta saber.
--
-- ── O PADRÃO JÁ EXISTIA ──────────────────────────────────────────────────
--
-- `evento_fotografias.criado_por` é uuid desde antes desta série — nunca
-- foi preenchida (a tabela está vazia), mas a convenção estava escolhida.
-- Esta migração estende-a em vez de inventar outra.
--
-- ── O QUE NÃO LEVA A COLUNA, e é deliberado ──────────────────────────────
--
-- Tudo o que nasce do lado público: portal_actos, portal_verificacoes,
-- portal_condicoes_lidas, portal_sinal_confirmacoes, campanha_intencoes,
-- avaliacoes, form_errors. Ali o autor não é um utilizador autenticado — as
-- funções correm SECURITY DEFINER, e `auth.uid()` é null. Uma coluna sempre
-- nula é pior do que coluna nenhuma: promete uma resposta que nunca dá.
--
-- E as folhas que herdam contexto: `evento_materiais` e
-- `pagamentos_previstos` nascem com o evento, não por gesto próprio. Quem
-- criou o evento criou-as.
-- ============================================================================

-- ── 1 · A coluna, nas treze que a merecem ───────────────────────────────────
--
-- `on delete set null`, nunca cascade: apagar um utilizador não pode apagar
-- o trabalho dele. Perde-se o nome, fica a linha — que é o comportamento
-- certo quando alguém sai da equipa.
--
-- Nullable para sempre, de propósito. As linhas de hoje não têm autor e
-- inventá-lo seria mentir; as que nascem do lado público também não terão.
-- `null` lê-se como «não se sabe», e é uma resposta honesta.

alter table public.submissions        add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.clientes           add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.materiais          add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.event_types        add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.comunicados        add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.comunicado_modelos add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.invites            add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.pagamentos         add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.documentos         add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.mensagens_tipo     add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.questionario_grupos add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.app_config         add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.avaliacao_eixos    add column if not exists criado_por uuid references auth.users(id) on delete set null;

-- ── 2 · O default ───────────────────────────────────────────────────────────
--
-- O mesmo padrão do `tenant_id` na 092: a coluna preenche-se sozinha a
-- partir da sessão, e o frontend não precisa de saber que existe. Sem
-- sessão, `auth.uid()` devolve null — que é exactamente o que queremos das
-- escritas públicas.
--
-- `evento_fotografias` entra aqui: a coluna já existia e nunca foi ligada.

alter table public.submissions        alter column criado_por set default auth.uid();
alter table public.clientes           alter column criado_por set default auth.uid();
alter table public.materiais          alter column criado_por set default auth.uid();
alter table public.event_types        alter column criado_por set default auth.uid();
alter table public.comunicados        alter column criado_por set default auth.uid();
alter table public.comunicado_modelos alter column criado_por set default auth.uid();
alter table public.invites            alter column criado_por set default auth.uid();
alter table public.pagamentos         alter column criado_por set default auth.uid();
alter table public.documentos         alter column criado_por set default auth.uid();
alter table public.mensagens_tipo     alter column criado_por set default auth.uid();
alter table public.questionario_grupos alter column criado_por set default auth.uid();
alter table public.app_config         alter column criado_por set default auth.uid();
alter table public.avaliacao_eixos    alter column criado_por set default auth.uid();
alter table public.evento_fotografias alter column criado_por set default auth.uid();

-- ── 3 · As notas do evento ──────────────────────────────────────────────────
--
-- `notas_evento.autor` era texto, e o front lia `entrada.autor || "Nádia"` —
-- o nome da primeira casa cravado como omissão. A tabela está VAZIA, o que
-- faz deste o momento mais barato que alguma vez haverá para a corrigir.
--
-- Uma nota tem um autor, e o autor é quem estava com sessão. Duas colunas
-- para a mesma pergunta é o que se evita em todo o lado; aqui não se
-- convive, substitui-se.
--
-- ⚠ O NotasEvento.jsx tem de ir junto: o `entrada.autor` deixa de existir e
-- o nome passa a resolver-se pelo uuid.

alter table public.notas_evento add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table public.notas_evento alter column criado_por set default auth.uid();
alter table public.notas_evento drop column if exists autor;

-- ── 4 · O nome de quem tem sessão ───────────────────────────────────────────
--
-- A saudação do admin dizia «Boa noite, Nádia» com o nome no código. Depois
-- da 099 passou a vir de `casa.titular` — e isso está errado por outra
-- razão, que só se vê com uma equipa: o titular é quem ASSINA os contratos,
-- não quem está com sessão aberta. Numa casa com três pessoas, todas seriam
-- saudadas pelo nome da dona.
--
-- Esta função responde à pergunta certa. Devolve o nome dos metadados do
-- utilizador; se não houver, a parte do email antes do @; se não houver
-- sessão, null — e a saudação fica «Boa noite», que é o que já acontece com
-- a casa suspensa e lê bem.

create or replace function public.nome_do_utilizador()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(split_part(u.email, '@', 1), ''))
    from auth.users u
   where u.id = auth.uid();
$$;

revoke all     on function public.nome_do_utilizador() from public, anon;
grant  execute on function public.nome_do_utilizador() to authenticated;

comment on function public.nome_do_utilizador() is
  'O nome de quem tem sessão — para a saudação do admin. NÃO confundir com tenants.titular, que é quem assina os contratos: com uma equipa de três, são pessoas diferentes.';

-- ── 5 · O nome legível de um autor ──────────────────────────────────────────
--
-- O `criado_por` guarda um uuid; os ecrãs precisam de um nome. Sem isto,
-- cada sítio que mostre autoria faria a sua própria junção a `auth.users` —
-- e `auth.users` não é legível pela RLS normal, portanto cada um inventaria
-- a sua função.
--
-- Só devolve nome de quem partilha casa com quem pergunta. Um uuid de outra
-- casa devolve null, mesmo que exista.

create or replace function public.nome_do_autor(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(split_part(u.email, '@', 1), ''))
    from auth.users u
   where u.id = p_user
     and exists (
       select 1 from public.memberships m
        where m.user_id = p_user
          and m.tenant_id in (select public.tenants_do_utilizador()));
$$;

revoke all     on function public.nome_do_autor(uuid) from public, anon;
grant  execute on function public.nome_do_autor(uuid) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · As colunas existem, com default:
--   select table_name, column_name, column_default
--     from information_schema.columns
--    where table_schema='public' and column_name='criado_por'
--    order by table_name;
--   -- Esperado: 15 linhas, todas com default auth.uid()
--
-- 2 · O `autor` das notas desapareceu:
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='notas_evento'
--      and column_name='autor';
--   -- Esperado: 0
--
-- 3 · O nome NÃO responde no SQL Editor (auth.uid() é null lá) —
--   confirma-se na app. Aqui devolve null e está certo:
--   select public.nome_do_utilizador();
--
-- 4 · A APP:
--   · criar um cliente e um material — depois:
--     select nome, criado_por from clientes order by created_at desc limit 2;
--     O criado_por deve trazer o uuid da conta com sessão.
--   · a saudação do Início deve dizer o nome de quem entrou
--   · escrever uma nota num evento (o NotasEvento.jsx tem de ir junto)
-- ============================================================================

-- ============================================================================
-- O LIVRO, POR ESCREVER — o desenho, para quem lhe pegar
-- ============================================================================
-- Esta migração regista quem CRIOU. Quem ALTEROU fica por fazer, e não é
-- esquecimento.
--
-- O QUE FALTA: uma tabela de auditoria (linha por escrita: tabela, id,
-- coluna, valor anterior, autor, instante) com triggers nas que importam —
-- submissions, pagamentos, documentos, clientes.
--
-- POR QUE NÃO SE FEZ AGORA, e é o que interessa saber:
--
--   1. As escritas do portal e do formulário NÃO TÊM auth.uid(). As 29
--      funções SECURITY DEFINER correm como `postgres`, e uma auditoria
--      ingénua registaria «postgres» em tudo o que a noiva escreve —
--      inútil, e pior do que não registar, porque parece registo. Cada
--      função pública teria de declarar o autor explicitamente: são 29
--      funções a tocar, e é aí que está o trabalho.
--
--   2. Uma linha por update cresce sem limite. Com 500 MB de plano
--      gratuito e `submissions` a ter 56 colunas, a retenção tem de ser
--      decidida ANTES de ligar, não depois de encher.
--
--   3. Uma tabela desenhada sem pergunta concreta guarda o que é fácil de
--      guardar, não o que faz falta saber. O momento certo é quando
--      existir uma discussão real sobre quem mudou um valor.
--
-- O PRECEDENTE que já existe: `respostas_autoria` faz exactamente isto para
-- um caso — uma linha por escrita, com o valor anterior e o lado que
-- escreveu ('cliente' ou 'equipa'). Quem construir o livro deve começar por
-- lá: o padrão está provado e o vocabulário também.
-- ============================================================================