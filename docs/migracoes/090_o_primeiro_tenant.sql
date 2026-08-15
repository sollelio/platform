-- ============================================================================
-- 090 · O primeiro tenant — a coluna que separa as casas
--
-- Decisão (15/08/2026): o gestor deixa de servir uma casa e passa a servir
-- várias. Até aqui, «um cliente» era um pressuposto tão fundo que nunca
-- precisou de ser escrito: uma base de dados por casa, e a RLS a separar
-- apenas quem entrou de quem não entrou.
--
-- Esta migração NÃO muda o comportamento de nada. Cria a estrutura, carimba
-- tudo o que existe como sendo da Do Luxo à Mesa, e sai. As políticas
-- continuam `using (true)` até à 091 — de propósito: uma migração que
-- adiciona colunas e outra que muda quem vê o quê são dois riscos
-- diferentes, e misturá-los seria não saber qual falhou.
--
-- A coluna entra em DEZ tabelas — as raízes. As restantes vinte e duas
-- chegam ao tenant por caminho já existente (avaliacoes → submissions,
-- campanha_intencoes → campanhas → submissions, portal_* → submissions).
-- Dar coluna própria a uma folha seria criar uma segunda fonte de verdade
-- para a mesma pergunta, e com ela a hipótese de divergirem.
--
-- SOBRE `event_types`: os seis modelos são da Nádia — moldados aos serviços
-- que ela vende, todos com eventos ligados. Vão todos para o tenant dela.
-- Nenhum fica como modelo da plataforma: o trabalho dela não é ponto de
-- partida para um concorrente. A coluna admite tenant_id nulo (= modelo da
-- casa Sollelio) para o dia em que se escreverem modelos genéricos de raiz.
-- ============================================================================

-- ── 1 · As casas ────────────────────────────────────────────────────────────

create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  nome       text not null,
  prefixo    text unique not null,
  locale     text not null default 'pt-PT',
  moeda      text not null default 'EUR',
  estado     text not null default 'activo',
  criado_em  timestamptz not null default now(),
  constraint tenants_slug_formato    check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  constraint tenants_prefixo_formato check (prefixo ~ '^[A-Z]{2,6}$'),
  constraint tenants_estado_valido   check (estado in ('activo','suspenso','encerrado'))
);

comment on table  public.tenants           is 'Uma casa — a empresa de eventos que usa o gestor. A Sollelio não é um tenant.';
comment on column public.tenants.prefixo   is 'O prefixo dos códigos de convite: DLM-WK6Q-49TE. Era literal no código; passa a ser dado.';
comment on column public.tenants.locale    is 'pt-PT ou pt-BR — muda vocabulário e formatos, não a língua.';

alter table public.tenants enable row level security;

-- ── 2 · Quem entra em que casa ──────────────────────────────────────────────
--
-- Tabela de junção, e não uma coluna em auth.users, porque um dia a mesma
-- pessoa poderá administrar duas casas — e porque a chave primária composta
-- torna impossível duplicar a relação.
--
-- O papel entra com um valor por omissão e SEM uso: hoje há uma conta só, e
-- desenhar hierarquia para uma pessoa seria inventar requisitos. A coluna
-- existe para que acrescentá-la depois não obrigue a mexer nas políticas.

create table if not exists public.memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  papel      text not null default 'dono',
  criado_em  timestamptz not null default now(),
  primary key (user_id, tenant_id),
  constraint memberships_papel_valido check (papel in ('dono','gestor','equipa'))
);

create index if not exists memberships_tenant_idx on public.memberships (tenant_id);

alter table public.memberships enable row level security;

-- ── 3 · A Do Luxo à Mesa, e a conta que já existe ───────────────────────────
--
-- Idempotente de propósito: esta migração corre em teste e depois em
-- produção, e um `on conflict do nothing` evita que a segunda passagem
-- rebente. O mesmo vale para o backfill mais abaixo.

insert into public.tenants (slug, nome, prefixo, locale, moeda)
values ('doluxoamesa', 'Do Luxo à Mesa', 'DLM', 'pt-PT', 'EUR')
on conflict (slug) do nothing;

insert into public.memberships (user_id, tenant_id, papel)
select u.id, t.id, 'dono'
  from auth.users u
 cross join public.tenants t
 where u.email = 'doluxoamesa@gmail.com'
   and t.slug  = 'doluxoamesa'
on conflict do nothing;

-- ── 3b · A conta do developer, separada da conta da casa ────────────────────
--
-- Até aqui havia uma conta só, partilhada. Duas pessoas atrás das mesmas
-- credenciais significa que a Nádia não pode mudar a password sem cortar o
-- acesso ao developer, e que os logs de autenticação não distinguem quem
-- entrou. A conta cria-se pelo dashboard (Authentication → Users); aqui só
-- se liga à casa.
--
-- A membership do developer é TEMPORÁRIA por desenho: quando existir uma
-- segunda casa, cria-se um tenant de demonstração da Sollelio para testes e
-- esta linha sai. Ver dados de um cliente passa a ser acto deliberado pela
-- service_role, não o modo normal de trabalhar.

insert into public.memberships (user_id, tenant_id, papel)
select u.id, t.id, 'gestor'
  from auth.users u
 cross join public.tenants t
 where u.email = 'heliu.schultz@gmail.com'
   and t.slug  = 'doluxoamesa'
on conflict do nothing;

-- ── 4 · A coluna nas dez raízes ─────────────────────────────────────────────
--
-- Nullable AGORA, not null no fim — a ordem que permite adicionar a coluna a
-- uma tabela com dados sem a reescrever à força.

alter table public.submissions        add column if not exists tenant_id uuid references public.tenants(id);
alter table public.clientes           add column if not exists tenant_id uuid references public.tenants(id);
alter table public.materiais          add column if not exists tenant_id uuid references public.tenants(id);
alter table public.event_types        add column if not exists tenant_id uuid references public.tenants(id);
alter table public.app_config         add column if not exists tenant_id uuid references public.tenants(id);
alter table public.avaliacao_eixos    add column if not exists tenant_id uuid references public.tenants(id);
alter table public.mensagens_tipo     add column if not exists tenant_id uuid references public.tenants(id);
alter table public.comunicados        add column if not exists tenant_id uuid references public.tenants(id);
alter table public.comunicado_modelos add column if not exists tenant_id uuid references public.tenants(id);
alter table public.invites            add column if not exists tenant_id uuid references public.tenants(id);

-- ── 5 · O carimbo ───────────────────────────────────────────────────────────
--
-- Tudo o que existe é da Do Luxo à Mesa. Não há ambiguidade a resolver, e é
-- por isso que esta migração se faz AGORA e não daqui a seis meses: com duas
-- casas na base, cada linha destas exigiria uma pergunta.

do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = 'doluxoamesa';
  if v_tenant is null then
    raise exception 'O tenant doluxoamesa não existe — a migração não pode continuar';
  end if;

  update public.submissions        set tenant_id = v_tenant where tenant_id is null;
  update public.clientes           set tenant_id = v_tenant where tenant_id is null;
  update public.materiais          set tenant_id = v_tenant where tenant_id is null;
  update public.event_types        set tenant_id = v_tenant where tenant_id is null;
  update public.app_config         set tenant_id = v_tenant where tenant_id is null;
  update public.avaliacao_eixos    set tenant_id = v_tenant where tenant_id is null;
  update public.mensagens_tipo     set tenant_id = v_tenant where tenant_id is null;
  update public.comunicados        set tenant_id = v_tenant where tenant_id is null;
  update public.comunicado_modelos set tenant_id = v_tenant where tenant_id is null;
  update public.invites            set tenant_id = v_tenant where tenant_id is null;
end
$$;

-- ── 6 · Agora obrigatória ───────────────────────────────────────────────────
--
-- Nove das dez. `event_types` fica nullable: tenant_id nulo é a forma de
-- dizer «modelo da plataforma», e uma restrição não-nula fecharia essa porta
-- antes de ela chegar a ser aberta.

alter table public.submissions        alter column tenant_id set not null;
alter table public.clientes           alter column tenant_id set not null;
alter table public.materiais          alter column tenant_id set not null;
alter table public.app_config         alter column tenant_id set not null;
alter table public.avaliacao_eixos    alter column tenant_id set not null;
alter table public.mensagens_tipo     alter column tenant_id set not null;
alter table public.comunicados        alter column tenant_id set not null;
alter table public.comunicado_modelos alter column tenant_id set not null;
alter table public.invites            alter column tenant_id set not null;

-- ── 7 · Os índices ──────────────────────────────────────────────────────────
--
-- Cada política da 091 vai filtrar por tenant_id. Sem índice, cada consulta
-- passa a varrer a tabela inteira — e o custo cresce com o número de casas,
-- que é exactamente o que esta migração existe para permitir.

create index if not exists submissions_tenant_idx        on public.submissions (tenant_id);
create index if not exists clientes_tenant_idx           on public.clientes (tenant_id);
create index if not exists materiais_tenant_idx          on public.materiais (tenant_id);
create index if not exists event_types_tenant_idx        on public.event_types (tenant_id);
create index if not exists app_config_tenant_idx         on public.app_config (tenant_id);
create index if not exists avaliacao_eixos_tenant_idx    on public.avaliacao_eixos (tenant_id);
create index if not exists mensagens_tipo_tenant_idx     on public.mensagens_tipo (tenant_id);
create index if not exists comunicados_tenant_idx        on public.comunicados (tenant_id);
create index if not exists comunicado_modelos_tenant_idx on public.comunicado_modelos (tenant_id);
create index if not exists invites_tenant_idx            on public.invites (tenant_id);

-- ── 8 · A pergunta que as políticas da 091 vão fazer ────────────────────────
--
-- Uma função, não a subconsulta repetida em trinta e duas políticas: quando
-- o desenho mudar (papéis, uma casa suspensa que perde acesso), muda aqui e
-- em mais lado nenhum.
--
-- STABLE permite ao planeador chamá-la uma vez por consulta em vez de uma
-- vez por linha. SECURITY DEFINER porque memberships terá RLS própria, e
-- sem isto a função não se conseguiria ler a si mesma — recursão.

create or replace function public.tenants_do_utilizador()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and t.estado = 'activo';
$$;

revoke all     on function public.tenants_do_utilizador() from public;
grant  execute on function public.tenants_do_utilizador() to authenticated;

comment on function public.tenants_do_utilizador() is
  'As casas a que a sessão actual pertence. Uma casa suspensa não devolve nada — suspender corta o acesso sem apagar dados.';

-- ── 9 · As duas tabelas novas, fechadas ─────────────────────────────────────
--
-- A app não lê nenhuma das duas hoje. Ficam legíveis para quem lá dentro
-- está, e escrever é só pela service_role — criar casas é acto de
-- plataforma, não de utilizador.

create policy tenants_leitura on public.tenants
  for select to authenticated
  using (id in (select public.tenants_do_utilizador()));

create policy memberships_leitura on public.memberships
  for select to authenticated
  using (tenant_id in (select public.tenants_do_utilizador()));

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · O tenant existe e tem a conta ligada:
--   select t.slug, t.prefixo, count(m.user_id) as contas
--     from tenants t left join memberships m on m.tenant_id = t.id
--    group by t.slug, t.prefixo;
--   -- Esperado: doluxoamesa | DLM | 1
--
-- 2 · Não sobrou nenhuma linha órfã (deve devolver ZERO linhas):
--   select 'submissions' t, count(*) n from submissions where tenant_id is null
--   union all select 'clientes',   count(*) from clientes           where tenant_id is null
--   union all select 'materiais',  count(*) from materiais          where tenant_id is null
--   union all select 'event_types',count(*) from event_types        where tenant_id is null
--   union all select 'app_config', count(*) from app_config         where tenant_id is null
--   union all select 'avaliacao_eixos',    count(*) from avaliacao_eixos    where tenant_id is null
--   union all select 'mensagens_tipo',     count(*) from mensagens_tipo     where tenant_id is null
--   union all select 'comunicados',        count(*) from comunicados        where tenant_id is null
--   union all select 'comunicado_modelos', count(*) from comunicado_modelos where tenant_id is null
--   union all select 'invites',            count(*) from invites            where tenant_id is null;
--
-- 3 · A função responde (com sessão da Nádia aberta, não pelo SQL Editor —
--     o editor corre como service_role e auth.uid() vem null):
--   select public.tenants_do_utilizador();
--   -- Esperado: uma linha, o uuid do tenant
--
-- 4 · A APP: abrir o admin e confirmar que TUDO continua igual — lista de
--     eventos, calendário, materiais, formulário público, portal do noivo.
--     Esta migração não muda comportamento nenhum. Se alguma coisa mudou,
--     alguma coisa está errada.
-- ============================================================================