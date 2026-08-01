-- ============================================================================
-- 057 · Portal do Cliente — fase 3: documentos, verificação e assinatura
--
-- Três mesas novas e seis funções. O desenho segue as decisões fechadas:
--
--   · PUBLICAR é o acto que substitui a caixa «enviado» (nunca marcada uma
--     única vez nos 6 contratos): mostra o documento à cliente, CONGELA um
--     instantâneo, regista o momento — e carimba enviado_em, por isso a
--     etapa «Orçamento» da Jornada passa a acender com verdade.
--   · O instantâneo é OBRIGATÓRIO: os campos que a Nádia não toca são
--     recalculados ao vivo (visto nas fases anteriores), e o que a cliente
--     abre tem de ser o que lhe foi publicado, não o que os dados dizem hoje.
--   · O CÓDIGO não é automático: a cliente pede, o pedido cai na Caixa de
--     Entrada, a Nádia emite e envia pela conversa que já tem. A autorização
--     humana faz parte da prova (emitido_por, emitido_em).
--   · Código: dura 24 horas OU até ser usado. Usá-lo abre uma sessão de 60
--     minutos (o «usado_em» é o relógio da sessão) — senão, recarregar a
--     página a meio da leitura exigia pedir código novo.
--   · Aceitar/aprovar/assinar valem para UMA VERSÃO: publicar de novo cria
--     versão nova, sem actos — o acto reabre sozinho.
--   · ASSINAR o contrato TRANCA-O: um gatilho na base recusa qualquer
--     alteração posterior aos dados, mesmo vinda do backoffice.
--   · Euros só depois da verificação — mas O DOCUMENTO ABRE-SE SEMPRE: sem
--     sessão, o orçamento e o contrato saem VELADOS (sem os euros, cortados
--     no servidor). O projecto não tem valores («dinheiro é assunto do
--     orçamento», GerarProposta:17) e vem sempre inteiro. TODOS os actos
--     exigem sessão, nos três documentos — o trilho quer contacto verificado.
--   ⚠ O desenho dizia «o código dura trinta minutos»; a decisão fechada da
--     casa diz 24 horas («ela pode só ver o pedido à noite») e é a que vale
--     aqui. O texto do ecrã acompanha a decisão, não o desenho.
--
-- 🔴 submissions.id continua a não sair por nenhuma porta pública.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · As mesas ───────────────────────────────────────────────────────────

-- O instantâneo publicado. Uma linha por publicação; a versão em vigor de
-- cada tipo é a de maior número.
create table if not exists public.portal_publicacoes (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  documento_id  uuid references public.documentos(id) on delete set null,
  tipo          text not null check (tipo in ('orcamento', 'proposta', 'contrato')),
  versao        integer not null,
  instantaneo   jsonb not null,
  publicado_em  timestamptz not null default now(),
  publicado_por uuid,
  unique (submission_id, tipo, versao)
);

comment on table public.portal_publicacoes is
  'O que a cliente vê no acompanhamento: instantâneos congelados no momento '
  'de publicar. `documentos.dados` continua vivo; isto não.';

-- O pedido e a emissão do código de verificação.
create table if not exists public.portal_verificacoes (
  id          uuid primary key default gen_random_uuid(),
  acesso_id   uuid not null references public.portal_acessos(id) on delete cascade,
  contexto    text,
  pedido_em   timestamptz not null default now(),
  codigo      text,
  emitido_em  timestamptz,
  emitido_por uuid,
  expira_em   timestamptz,
  usado_em    timestamptz
);

comment on table public.portal_verificacoes is
  'Pedidos e emissões de código. O código guarda-se em claro DE PROPÓSITO: '
  'a Nádia tem de o ler para o enviar pelo WhatsApp; vive 24h, é curto e '
  'só o admin lê esta mesa. usado_em é também o relógio da sessão (60 min).';

-- O trilho de auditoria: cada acto da cliente, com a prova toda.
create table if not exists public.portal_actos (
  id              uuid primary key default gen_random_uuid(),
  publicacao_id   uuid not null references public.portal_publicacoes(id) on delete restrict,
  verificacao_id  uuid not null references public.portal_verificacoes(id) on delete restrict,
  acto            text not null check (acto in ('aceitou', 'pediu_alteracao', 'assinou')),
  nome_escrito    text not null,
  mensagem        text,
  ip              text,
  user_agent      text,
  criado_em       timestamptz not null default now()
);

comment on table public.portal_actos is
  'Aceitação electrónica com trilho: quem (nome escrito), por que sessão '
  'verificada (e por ela, quem emitiu o código e quando), IP, user-agent, '
  'que versão. on delete RESTRICT: prova não se apaga por arrasto.';

alter table public.portal_publicacoes  enable row level security;
alter table public.portal_verificacoes enable row level security;
alter table public.portal_actos        enable row level security;

drop policy if exists "admin acesso total" on public.portal_publicacoes;
create policy "admin acesso total" on public.portal_publicacoes
  for all to authenticated using (true) with check (true);
drop policy if exists "admin acesso total" on public.portal_verificacoes;
create policy "admin acesso total" on public.portal_verificacoes
  for all to authenticated using (true) with check (true);
drop policy if exists "admin acesso total" on public.portal_actos;
create policy "admin acesso total" on public.portal_actos
  for all to authenticated using (true) with check (true);

create index if not exists portal_publicacoes_evento_idx
  on public.portal_publicacoes (submission_id, tipo, versao desc);
create index if not exists portal_verificacoes_acesso_idx
  on public.portal_verificacoes (acesso_id, pedido_em desc);


-- ─── 2 · O tranco do contrato assinado ──────────────────────────────────────

alter table public.documentos
  add column if not exists trancado_em timestamptz;

comment on column public.documentos.trancado_em is
  'Carimbado quando o contrato é assinado no acompanhamento. A partir daí '
  'o gatilho recusa alterações aos dados e aos carimbos — mesmo do '
  'backoffice. Erro? Faz-se contrato novo; este fica como prova.';

create or replace function public.dlm_travar_documento_trancado()
returns trigger
language plpgsql
as $$
begin
  if old.trancado_em is not null and (
       new.dados       is distinct from old.dados
    or new.enviado_em  is distinct from old.enviado_em
    or new.assinado_em is distinct from old.assinado_em
    or new.trancado_em is distinct from old.trancado_em
  ) then
    raise exception 'DOCUMENTO_TRANCADO: este contrato foi assinado e não se altera. Para corrigir, faz-se um contrato novo.';
  end if;
  return new;
end
$$;

drop trigger if exists documentos_trancados on public.documentos;
create trigger documentos_trancados
  before update on public.documentos
  for each row
  execute function public.dlm_travar_documento_trancado();


-- ─── 3 · O lado da Nádia (authenticated, security invoker) ──────────────────

-- Publicar: congela e mostra. O primeiro publicar de cada documento carimba
-- também o enviado_em — é o acto de envio a sério, com efeito visível.
create or replace function public.dlm_portal_publicar(
  p_submission_id uuid,
  p_tipo          text,
  p_extra         jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc    public.documentos%rowtype;
  v_versao integer;
begin
  if p_tipo not in ('orcamento', 'proposta', 'contrato') then
    raise exception 'TIPO_INVALIDO';
  end if;

  select * into v_doc
    from public.documentos
   where tipo = p_tipo and submission_id = p_submission_id;
  if not found then
    raise exception 'SEM_DOCUMENTO: gera o documento primeiro.';
  end if;
  if v_doc.trancado_em is not null then
    raise exception 'CONTRATO_TRANCADO: está assinado; não há versões novas.';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.portal_publicacoes
   where submission_id = p_submission_id and tipo = p_tipo;

  -- O instantâneo leva os dados MAIS o texto fixo que o rodeia (cláusulas,
  -- condições), passado pelo backoffice em p_extra. Sem isto, mudar uma
  -- cláusula no código mudava um contrato já assinado — o congelamento
  -- tem de apanhar tudo o que se lê, não só o que se edita.
  insert into public.portal_publicacoes
    (submission_id, documento_id, tipo, versao, instantaneo, publicado_por)
  values
    (p_submission_id, v_doc.id, p_tipo, v_versao,
     coalesce(v_doc.dados, '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb),
     auth.uid());

  -- O primeiro envio é este. Não se reescreve: enviado_em é «quando foi
  -- enviado pela primeira vez», e versões seguintes não mudam a história.
  update public.documentos
     set enviado_em = coalesce(enviado_em, now())
   where id = v_doc.id;

  return jsonb_build_object('versao', v_versao, 'publicado_em', now());
end
$$;

revoke all     on function public.dlm_portal_publicar(uuid, text, jsonb) from public, anon;
grant  execute on function public.dlm_portal_publicar(uuid, text, jsonb) to authenticated;


-- Emitir o código de um pedido. Se já houver código válido, devolve ESSE —
-- carregar duas vezes não gera dois códigos diferentes em circulação.
create or replace function public.dlm_portal_emitir_codigo(p_verificacao_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_v public.portal_verificacoes%rowtype;
  v_codigo text;
begin
  select * into v_v from public.portal_verificacoes where id = p_verificacao_id;
  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if v_v.codigo is not null and v_v.usado_em is null and v_v.expira_em > now() then
    return v_v.codigo;
  end if;

  v_codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');

  update public.portal_verificacoes
     set codigo      = v_codigo,
         emitido_em  = now(),
         emitido_por = auth.uid(),
         expira_em   = now() + interval '24 hours',
         usado_em    = null
   where id = p_verificacao_id;

  return v_codigo;
end
$$;

revoke all     on function public.dlm_portal_emitir_codigo(uuid) from public, anon;
grant  execute on function public.dlm_portal_emitir_codigo(uuid) to authenticated;


-- ─── 4 · O lado da cliente (anon, security definer) ─────────────────────────

-- O acesso vivo por trás de um token, ou NULL. Partilhado pelas funções
-- públicas desta migração.
create or replace function public.dlm_portal_acesso_por_token(p_token text)
returns public.portal_acessos
language sql
stable
security definer
set search_path = public
as $$
  select a.* from public.portal_acessos a
   where a.token = p_token
     and length(coalesce(p_token, '')) >= 16
     and a.revogado_em is null
     and (a.expira_em is null or a.expira_em > now());
$$;

revoke all on function public.dlm_portal_acesso_por_token(text) from public, anon;
-- (interna: só as definer a chamam; nem o anon nem o authenticated precisam)


-- Pedir o código. Idempotente por acesso: um pedido pendente (ou um código
-- válido por usar) não gera segundo pedido nem segunda notificação — e
-- também é isso que trava spam de pedidos na Caixa de Entrada.
create or replace function public.dlm_portal_pedir_codigo(
  p_token    text,
  p_contexto text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_ev      public.submissions%rowtype;
  v_nome    text;
  v_pedido  uuid;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- Já há um pedido em aberto? Devolve-se «pedido» na mesma: para a
  -- cliente a resposta é igual, e a Nádia não recebe eco.
  select id into v_pedido
    from public.portal_verificacoes
   where acesso_id = v_acesso.id
     and (
       (emitido_em is null and pedido_em > now() - interval '24 hours')
       or (codigo is not null and usado_em is null and expira_em > now())
     )
   limit 1;
  if v_pedido is not null then
    return jsonb_build_object('estado', 'pedido');
  end if;

  insert into public.portal_verificacoes (acesso_id, contexto)
  values (v_acesso.id, nullif(btrim(coalesce(p_contexto, '')), ''))
  returning id into v_pedido;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('codigo_pedido',
     coalesce(v_nome, 'A cliente') || ' pediu o código de verificação',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('contexto', p_contexto, 'verificacao_id', v_pedido));

  return jsonb_build_object('estado', 'pedido');
end
$$;

revoke all     on function public.dlm_portal_pedir_codigo(text, text) from public;
grant  execute on function public.dlm_portal_pedir_codigo(text, text) to anon, authenticated;


-- Verificar. Código certo abre uma sessão de 60 minutos; dentro dela, o
-- MESMO código volta a entrar (recarregar a página a meio não pede novo).
-- Errado e expirado têm a mesma resposta: não se confirma nem se desmente.
create or replace function public.dlm_portal_verificar(
  p_token  text,
  p_codigo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_v      public.portal_verificacoes%rowtype;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_v
    from public.portal_verificacoes
   where acesso_id = v_acesso.id
     and codigo = btrim(coalesce(p_codigo, ''))
     and codigo is not null
     and emitido_em is not null
     and (
       (usado_em is null and expira_em > now())            -- primeiro uso
       or (usado_em is not null
           and usado_em > now() - interval '60 minutes')   -- sessão viva
     )
   order by pedido_em desc
   limit 1;

  if v_v.id is null then
    return jsonb_build_object('estado', 'codigo_invalido');
  end if;

  if v_v.usado_em is null then
    update public.portal_verificacoes
       set usado_em = now()
     where id = v_v.id;
    v_v.usado_em := now();
  end if;

  return jsonb_build_object(
    'estado', 'verificado',
    'verificacao', v_v.id,
    'valida_ate', v_v.usado_em + interval '60 minutes');
end
$$;

revoke all     on function public.dlm_portal_verificar(text, text) from public;
grant  execute on function public.dlm_portal_verificar(text, text) to anon, authenticated;


-- A sessão verificada por trás de (acesso, verificacao), ou NULL.
create or replace function public.dlm_portal_sessao(
  p_acesso_id uuid,
  p_verificacao uuid
) returns public.portal_verificacoes
language sql
stable
security definer
set search_path = public
as $$
  select v.* from public.portal_verificacoes v
   where v.id = p_verificacao
     and v.acesso_id = p_acesso_id
     and v.usado_em is not null
     and v.usado_em > now() - interval '60 minutes';
$$;

revoke all on function public.dlm_portal_sessao(uuid, uuid) from public, anon;


-- O VÉU DE VALOR. O desenho manda: «o documento abre-se sempre; o que se
-- vela são os números, um a um, no lugar exacto onde vão estar». Por isso
-- a leitura sem sessão não recusa o documento — devolve-o SEM os euros:
--   · chaves de dinheiro no topo (valor, valorExtenso) caem;
--   · em qualquer array de objectos (as linhas do orçamento), a chave
--     `valor` de cada elemento cai.
-- O véu corta no SERVIDOR, nunca por CSS: o que não sai, não se inspecciona.
create or replace function public.dlm_velar_instantaneo(p_dados jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_par record;
  v_arr jsonb;
  v_el  jsonb;
begin
  for v_par in select key, value from jsonb_each(coalesce(p_dados, '{}'::jsonb)) loop
    if v_par.key in ('valor', 'valorExtenso') then
      continue;
    elsif jsonb_typeof(v_par.value) = 'array' then
      v_arr := '[]'::jsonb;
      for v_el in select * from jsonb_array_elements(v_par.value) loop
        if jsonb_typeof(v_el) = 'object' then
          v_arr := v_arr || jsonb_build_array(v_el - 'valor');
        else
          v_arr := v_arr || jsonb_build_array(v_el);
        end if;
      end loop;
      v_out := v_out || jsonb_build_object(v_par.key, v_arr);
    else
      v_out := v_out || jsonb_build_object(v_par.key, v_par.value);
    end if;
  end loop;
  return v_out;
end
$$;

comment on function public.dlm_velar_instantaneo(jsonb) is
  'O véu de valor do portal: instantâneo sem euros, para leitura sem sessão '
  'verificada. Corta no servidor — o que não sai, não se inspecciona.';


-- A lista dos documentos publicados: só o estado, nunca o conteúdo.
create or replace function public.dlm_portal_documentos(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_docs   jsonb;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'tipo',          u.tipo,
             'versao',        u.versao,
             'publicado_em',  u.publicado_em,
             'n_versoes',     u.n_versoes,
             'precisa_codigo', u.tipo in ('orcamento', 'contrato'),
             'acto',          u.acto,
             'acto_em',       u.acto_em,
             'acto_nome',     u.acto_nome,
             -- O acto da VERSÃO ANTERIOR, quando a corrente ainda não tem
             -- resposta: é o que deixa dizer «a sua aceitação de 12 de
             -- Agosto fica onde está — esta versão pede uma resposta nova».
             'acto_anterior', case when u.acto is null and aa.acto is not null
               then jsonb_build_object('versao', aa.versao, 'acto', aa.acto,
                                       'acto_em', aa.criado_em)
               end
           ) order by array_position(
                       array['orcamento','proposta','contrato'], u.tipo))
    into v_docs
    from (
      select distinct on (p.tipo)
             p.tipo, p.versao, p.publicado_em, p.id,
             count(*) over (partition by p.tipo) as n_versoes,
             a.acto, a.criado_em as acto_em, a.nome_escrito as acto_nome
        from public.portal_publicacoes p
        left join lateral (
          -- o acto que conta é o último DESTA versão — versão nova, actos a zero
          select acto, criado_em, nome_escrito
            from public.portal_actos
           where publicacao_id = p.id
           order by criado_em desc
           limit 1
        ) a on true
       where p.submission_id = v_acesso.submission_id
       order by p.tipo, p.versao desc
    ) u
    left join lateral (
      select pa.acto, pa.criado_em, pp.versao
        from public.portal_actos pa
        join public.portal_publicacoes pp on pp.id = pa.publicacao_id
       where pp.submission_id = v_acesso.submission_id
         and pp.tipo = u.tipo and pp.versao < u.versao
         and pa.acto in ('aceitou', 'assinou')
       order by pa.criado_em desc
       limit 1
    ) aa on true;

  -- O estado do código, para os ecrãs da espera e do regresso. SEM o
  -- código, claro — só o que a cliente pode saber.
  return jsonb_build_object(
    'estado', 'activo',
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'verificacao', (
      select jsonb_build_object(
               'estado', case
                 when v.usado_em is not null
                      and v.usado_em > now() - interval '60 minutes'
                   then 'sessao'
                 when v.codigo is not null and v.usado_em is null
                      and v.expira_em > now()
                   then 'emitido'
                 when v.emitido_em is null
                      and v.pedido_em > now() - interval '24 hours'
                   then 'pedido'
                 else 'nenhum'
               end,
               'pedido_em', v.pedido_em)
        from public.portal_verificacoes v
       where v.acesso_id = v_acesso.id
       order by v.pedido_em desc
       limit 1));
end
$$;

revoke all     on function public.dlm_portal_documentos(text) from public;
grant  execute on function public.dlm_portal_documentos(text) to anon, authenticated;


-- Abrir um documento publicado. O DOCUMENTO ABRE-SE SEMPRE — sem sessão
-- verificada, o que sai é a variante VELADA: os serviços por inteiro, os
-- euros por fora (véu cortado no servidor, nunca por CSS). O projecto não
-- tem valores e vem sempre inteiro.
-- p_versao abre uma versão antiga («ver a versão 1, como a aceitou»);
-- por omissão vem a corrente.
create or replace function public.dlm_portal_ver_documento(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid default null,
  p_versao      integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_sessao  public.portal_verificacoes%rowtype;
  v_acto    record;
  v_velado  boolean := false;
  v_dados   jsonb;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
     and (p_versao is null or versao = p_versao)
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  v_dados := v_pub.instantaneo;
  if p_tipo in ('orcamento', 'contrato') then
    v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);
    if v_sessao.id is null then
      v_dados  := public.dlm_velar_instantaneo(v_dados);
      v_velado := true;
    end if;
  end if;

  select acto, criado_em, nome_escrito into v_acto
    from public.portal_actos
   where publicacao_id = v_pub.id
   order by criado_em desc
   limit 1;

  return jsonb_build_object(
    'estado',       'ok',
    'tipo',         v_pub.tipo,
    'versao',       v_pub.versao,
    'publicado_em', v_pub.publicado_em,
    'velado',       v_velado,
    'instantaneo',  v_dados,
    'acto',         case when v_acto.acto is null then null
                         else jsonb_build_object(
                                'acto',   v_acto.acto,
                                'quando', v_acto.criado_em,
                                'nome',   v_acto.nome_escrito) end);
end
$$;

revoke all     on function public.dlm_portal_ver_documento(text, text, uuid, integer) from public;
grant  execute on function public.dlm_portal_ver_documento(text, text, uuid, integer) to anon, authenticated;


-- O acto: aceitar, pedir alteração, assinar. Sempre com sessão verificada,
-- nos três documentos — o trilho exige o contacto confirmado.
create or replace function public.dlm_portal_acto(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid,
  p_acto        text,
  p_nome        text,
  p_mensagem    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_sessao  public.portal_verificacoes%rowtype;
  v_ev      public.submissions%rowtype;
  v_nome_cl text;
  v_ip      text;
  v_ua      text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);
  if v_sessao.id is null then
    return jsonb_build_object('estado', 'precisa_codigo');
  end if;

  if length(btrim(coalesce(p_nome, ''))) < 3 then
    return jsonb_build_object('estado', 'nome_em_falta');
  end if;

  -- O contrato ASSINA-SE (ou pede-se alteração); os outros aceitam-se.
  if p_acto not in ('aceitou', 'pediu_alteracao', 'assinou')
     or (p_acto = 'assinou'  and p_tipo <> 'contrato')
     or (p_acto = 'aceitou'  and p_tipo =  'contrato')
     or (p_acto = 'pediu_alteracao'
         and length(btrim(coalesce(p_mensagem, ''))) < 3)
  then
    return jsonb_build_object('estado', 'acto_invalido');
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  -- Aceitar/assinar duas vezes a MESMA versão não duplica o acto.
  if p_acto in ('aceitou', 'assinou') and exists (
       select 1 from public.portal_actos
        where publicacao_id = v_pub.id and acto = p_acto)
  then
    return jsonb_build_object('estado', 'ja_feito');
  end if;

  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, mensagem, ip, user_agent)
  values
    (v_pub.id, v_sessao.id, p_acto, btrim(p_nome),
     nullif(btrim(coalesce(p_mensagem, '')), ''), nullif(v_ip, ''), v_ua);

  -- Os efeitos no documento vivo: o aceite observado carimba assinado_em
  -- (deixou de ser marcação à mão — ver a nota da 030), e a assinatura do
  -- contrato TRANCA. O gatilho da secção 2 deixa passar este update porque
  -- old.trancado_em ainda é NULL.
  if p_acto = 'aceitou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now())
     where id = v_pub.documento_id;
  elsif p_acto = 'assinou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now()),
           trancado_em = now()
     where id = v_pub.documento_id;
  end if;

  -- O pedido de alteração merece Caixa de Entrada: é a cliente a falar.
  if p_acto = 'pediu_alteracao' then
    select * into v_ev from public.submissions where id = v_acesso.submission_id;
    select c.nome into v_nome_cl from public.clientes c where c.id = v_ev.cliente_id;
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('pedido_alteracao',
       coalesce(v_nome_cl, 'A cliente') || ' pediu uma alteração',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'mensagem', btrim(p_mensagem)));
  end if;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text) to anon, authenticated;


-- ─── 5 · O caminho do papel ─────────────────────────────────────────────────
--
-- «Também se faz à mão. Vale exactamente o mesmo — só leva mais um dia ou
-- dois.» A cliente descarrega, assina em papel, e CARREGA uma fotografia.
-- O balde é PRIVADO (só a Nádia lê); o anon só pode inserir, e só aqui.
-- A confirmação é dela: vê a fotografia, e marca o assinado no backoffice.

insert into storage.buckets (id, name, public)
values ('contratos-assinados', 'contratos-assinados', false)
on conflict (id) do nothing;

drop policy if exists "portal envia contrato assinado" on storage.objects;
create policy "portal envia contrato assinado" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'contratos-assinados');

drop policy if exists "admin le contratos assinados" on storage.objects;
create policy "admin le contratos assinados" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos-assinados');

-- Regista o carregamento e avisa a Caixa de Entrada. O caminho do ficheiro
-- é aleatório (gerado no browser, como as referências) — nunca o id.
create or replace function public.dlm_portal_registar_assinado_papel(
  p_token   text,
  p_caminho text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_nome   text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;
  if coalesce(btrim(p_caminho), '') = '' then
    return jsonb_build_object('estado', 'caminho_em_falta');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('contrato_papel',
     coalesce(v_nome, 'A cliente') || ' carregou o contrato assinado em papel',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('caminho', btrim(p_caminho)));

  return jsonb_build_object('estado', 'ok');
end
$$;

revoke all     on function public.dlm_portal_registar_assinado_papel(text, text) from public;
grant  execute on function public.dlm_portal_registar_assinado_papel(text, text) to anon, authenticated;


-- ============================================================================
-- 6 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 6.0 · ⭐ O véu: sem sessão, o documento vem mas os euros não.
--   select public.dlm_portal_ver_documento('<TOKEN>', 'orcamento');
--   -- Esperado: estado='ok', velado=true, instantaneo SEM `valor` em
--   -- nenhuma linha nem no topo. `grep` à mão: o resultado::text não pode
--   -- conter '"valor"'.

-- 6.1 · O circuito inteiro, à mão (substituir <TOKEN> e <EVENTO_ID>):
--   select public.dlm_portal_publicar('<EVENTO_ID>'::uuid, 'orcamento');
--   select public.dlm_portal_documentos('<TOKEN>');          -- lista, sem euros
--   select public.dlm_portal_ver_documento('<TOKEN>', 'orcamento');
--     -- → precisa_codigo
--   select public.dlm_portal_pedir_codigo('<TOKEN>', 'orcamento');
--   select id, contexto from portal_verificacoes order by pedido_em desc limit 1;
--   select public.dlm_portal_emitir_codigo('<VERIFICACAO_ID>'::uuid);
--   select public.dlm_portal_verificar('<TOKEN>', '<CODIGO>');
--   select public.dlm_portal_ver_documento('<TOKEN>', 'orcamento', '<VERIFICACAO_ID>'::uuid);
--     -- → ok, com o instantâneo

-- 6.2 · 🔴 O tranco. Assinar e depois tentar mexer:
--   select public.dlm_portal_acto('<TOKEN>','contrato','<VERIFICACAO_ID>'::uuid,
--                                 'assinou','Sofia Ramalho');
--   update documentos set dados = dados || '{"x":1}'
--    where tipo='contrato' and submission_id='<EVENTO_ID>'::uuid;
--   -- Esperado: ERRO «DOCUMENTO_TRANCADO». E o publicar também recusa:
--   select public.dlm_portal_publicar('<EVENTO_ID>'::uuid, 'contrato');
--   -- Esperado: ERRO «CONTRATO_TRANCADO».

-- 6.3 · A versão reabre o acto: publicar o orçamento outra vez (v2) e
--   voltar a dlm_portal_documentos — o acto tem de vir NULL.

-- 6.4 · 🔴 O id não sai por nenhuma das funções novas:
--   select (public.dlm_portal_documentos('<TOKEN>')::text
--           || public.dlm_portal_ver_documento('<TOKEN>','proposta')::text)
--          like '%<EVENTO_ID>%';
--   -- FALSE obrigatoriamente.

-- 6.5 · O instantâneo congela mesmo: alterar um campo do orçamento no
--   backoffice DEPOIS de publicar e reabrir no portal — tem de mostrar o
--   valor antigo (o publicado), não o novo.
