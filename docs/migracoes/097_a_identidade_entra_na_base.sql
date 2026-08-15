-- ============================================================================
-- 097 · A identidade entra na base
--
-- A decisão de 04/08 («a costura da marca é costura, não camada») previu
-- isto: «o dia do segundo negócio, a camada entra ali sem reescrever nada».
-- Esse dia chegou com a 090, e a camada ficou por entrar — src/lib/casa.js
-- continua a ser a identidade de UMA casa, cravada em JavaScript.
--
-- O QUE ISTO ARRISCA, se ficar como está: a segunda casa entra, tudo parece
-- funcionar, e o portal dela mostra o WhatsApp e o IBAN da Do Luxo à Mesa às
-- clientes dela. Um noivo transfere o sinal para a conta errada. Ao
-- contrário das chaves únicas — que rebentam com um erro visível —, esta
-- falha é silenciosa e o dinheiro já foi.
--
-- Esta migração NÃO muda comportamento. Cria as colunas, copia para lá os
-- valores que hoje vivem no casa.js, e sai. O frontend continua a ler do
-- ficheiro; os dois passam a dizer o mesmo. A troca de fonte é a 099.
--
-- ── O QUE NÃO ENTRA, e porquê ────────────────────────────────────────────
-- · FONTE_ASSINATURA_CASA — é sistema de desenho da Sollelio, não
--   identidade do cliente. A decisão de 04/08 já deixou paleta e
--   tipografias de fora, e pela mesma razão.
-- · TITULO_BACKOFFICE — diz «Sistema DLM». É o nome do PRODUTO visto por
--   dentro, não o do cliente; passa a dizer Celebra na 099.
-- · As assinaturas compostas (ASSINATURA_FOLHA, ASSINATURA_PUBLICA,
--   ASSINATURA_TITULAR, RODAPE_MARCA_ORCAMENTO) — são derivações, não
--   dados. Continuam a derivar, no casa.js, a partir do que receberem.
-- ============================================================================

-- ── 1 · As colunas ──────────────────────────────────────────────────────────
--
-- Nomes em português, como o resto do schema. O `titular` é a pessoa que
-- assina (Nádia Schultz); o `nome` da casa continua a ser o nome comercial
-- («Do Luxo à Mesa») — são coisas diferentes e o casa.js confundia-as sob
-- EMPRESA.nome e EMPRESA.designacao.

alter table public.tenants add column if not exists titular          text;
alter table public.tenants add column if not exists morada           text;
alter table public.tenants add column if not exists nif              text;
alter table public.tenants add column if not exists iban             text;
alter table public.tenants add column if not exists mbway            text;
alter table public.tenants add column if not exists foro             text;
alter table public.tenants add column if not exists dominio          text;
alter table public.tenants add column if not exists whatsapp         text;
alter table public.tenants add column if not exists logo_url         text;
alter table public.tenants add column if not exists linha_actividade text;
alter table public.tenants add column if not exists linha_by         text;
alter table public.tenants add column if not exists slogan           text;

comment on column public.tenants.titular  is 'Quem assina os contratos — a 2.ª contraente. Diferente de `nome`, que é o nome comercial.';
comment on column public.tenants.whatsapp is 'Canónico, com indicativo e sem sinais: 351927177190. O wa.me usa-o tal e qual.';
comment on column public.tenants.mbway    is 'Com espaços, para ler. Quem copia recebe-o sem eles — a regra vive no front.';
comment on column public.tenants.logo_url is 'Endereço público no Storage (bucket identidade). Nulo enquanto o upload não acontecer.';

-- ── 2 · Os valores da Do Luxo à Mesa ────────────────────────────────────────
--
-- Copiados do casa.js byte a byte, incluindo os espaços do IBAN e do MB Way
-- — as folhas imprimem-nos assim e a 099 não pode mudar um pixel.
--
-- O logo_url fica NULO de propósito: o ficheiro ainda está em
-- src/assets/logo.png e o upload é passo à parte (ver o fim). Enquanto for
-- nulo, o front cai no logo do repositório, que é o comportamento de hoje.

update public.tenants set
  titular          = 'Nádia Schultz',
  morada           = 'Rua dos Moinhos nº 31 - Ericeira',
  nif              = '243705689',
  iban             = 'PT50 0193 0000 1050 1570 8076 8',
  mbway            = '927 177 190',
  foro             = 'comarca de Sintra',
  dominio          = 'doluxoamesa.pt',
  whatsapp         = '351927177190',
  linha_actividade = 'Decoração e aluguer para eventos',
  linha_by         = 'by Luxury Events',
  slogan           = 'Planeamos cada detalhe. Criamos memórias inesquecíveis.'
where slug = 'doluxoamesa';

-- ── 3 · O balde do logótipo ─────────────────────────────────────────────────
--
-- Público para LER, fechado para enumerar — o padrão que a decisão de
-- 01/08 fixou para as fotografias («o primeiro balde da casa que nasce
-- fechado, em vez de o ser depois de aberto»). Um logótipo é para aparecer
-- em folhas públicas e no cartão do WhatsApp; a lista de quem cá está
-- dentro não é para ninguém.
--
-- Escrever é só pela service_role: trocar o logótipo de uma casa é acto de
-- plataforma. Quando houver ecrã de definições, a política abre-se para o
-- dono da casa — e aí o caminho tem de começar pelo slug dela.

insert into storage.buckets (id, name, public)
values ('identidade', 'identidade', true)
on conflict (id) do nothing;

-- ── 4 · A identidade, para o lado público ───────────────────────────────────
--
-- O portal, a folha e o formulário não têm sessão: precisam da identidade
-- da casa para desenhar cabeçalhos, assinaturas e o número do WhatsApp.
-- Projecção explícita, o padrão do dlm_portal_ver — o slug, o estado e o
-- id NÃO saem, e nada aqui é segredo: são os dados que a casa imprime nas
-- folhas que entrega.

create or replace function public.identidade_da_casa(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nome',             t.nome,
           'titular',          t.titular,
           'morada',           t.morada,
           'nif',              t.nif,
           'iban',             t.iban,
           'mbway',            t.mbway,
           'foro',             t.foro,
           'dominio',          t.dominio,
           'whatsapp',         t.whatsapp,
           'logo_url',         t.logo_url,
           'linha_actividade', t.linha_actividade,
           'linha_by',         t.linha_by,
           'slogan',           t.slogan)
    from public.tenants t
   where t.id = p_tenant and t.estado = 'activo';
$$;

revoke all on function public.identidade_da_casa(uuid) from public;

comment on function public.identidade_da_casa(uuid) is
  'A identidade de uma casa, para as projecções públicas a embutirem. Não se concede ao anon: recebe um uuid, e um uuid vindo de fora não se aceita. Quem a chama são as RPCs públicas, que já resolveram a casa pelo token ou pelo slug.';

-- A gémea pelo slug, essa sim para o anon — o pedido de orçamento precisa
-- da identidade ANTES de existir qualquer registo de onde a deduzir.
create or replace function public.identidade_da_casa_por_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_da_casa(public.tenant_por_slug(p_slug));
$$;

revoke all     on function public.identidade_da_casa_por_slug(text) from public;
grant  execute on function public.identidade_da_casa_por_slug(text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · A casa ficou preenchida:
--   select nome, titular, nif, iban, whatsapp, dominio from tenants;
--
-- 2 · A identidade sai pelo slug (é o caminho do anon):
--   select public.identidade_da_casa_por_slug('doluxoamesa');
--   select public.identidade_da_casa_por_slug('inexistente');  -- null
--
-- 3 · O balde existe e é público para ler:
--   select id, public from storage.buckets where id = 'identidade';
--
-- 4 · A APP: nada mudou. Esta migração não toca em comportamento nenhum —
--   o casa.js continua a mandar. Se algo mudou, algo está errado.
-- ============================================================================