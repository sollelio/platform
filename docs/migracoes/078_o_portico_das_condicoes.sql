-- ============================================================================
-- 078 · o pórtico das condições — ler antes de abrir · e o portão do sinal
-- ============================================================================
-- O PROBLEMA: a Nádia perde tempo a lembrar clientes de pagar o sinal. O
-- orçamento diz tudo — a primeira condição é «Reserva mediante pagamento de
-- sinal de 50% do valor total» — mas quem abre a correr para ver o número
-- não a lê, e depois é ela quem anda atrás.
--
-- A DECISÃO (Hélio, 03/08/2026): o cliente só abre o orçamento no portal
-- depois de confirmar que leu e entendeu as condições. A confirmação fica
-- gravada com carimbo — prova real: o token privado, o IP, o user-agent e
-- o instante. Uma vez POR EVENTO, nunca por versão: quem leu as condições
-- leu-as; publicar a versão 2 não as torna por ler.
--
-- PORQUE NÃO portal_actos: o acto tem o invariante da 059 — «sessão
-- verificada OU confirmação humana» — e a leitura acontece ANTES do código,
-- sem sessão nenhuma. Diluir esse invariante para caber um acto menor seria
-- vandalismo. Mesa própria, prova própria.
--
-- SEM BACKFILL de propósito: o pórtico do front só se mostra a quem ainda
-- não respondeu (sem acto) — quem já aceitou ou pediu alteração não leva
-- pórtico, e por isso os eventos antigos não precisam de leitura fingida.
--
-- O SEGUNDO PORTÃO — A REGRA DA NÁDIA (Hélio, 03/08/2026): «o
-- acompanhamento compra-se com o sinal». Sem o sinal pago, o cliente vê
-- até ao orçamento, INCLUSIVE — e a etapa do sinal, que é o próximo passo
-- e o apelo. Do orçamento para lá — contrato, projecto, preparação,
-- grande dia, documentos que não o orçamento — NADA aparece: nem etapas
-- «por acontecer», nem carimbos, nem entradas na lista. Com o sinal pago,
-- tudo abre. A inferência de «sinal pago» é UMA SÓ, a da etapa 3 da
-- jornada (077): o carimbo do sinal, uma fase que já só existe depois
-- dele, ou qualquer pagamento de origem 'sinal' — igual nos três sítios
-- que o portão toca (secções 3 · 4 · 5).
--
-- Correr DEPOIS da 077. Idempotente. Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · A mesa da prova ────────────────────────────────────────────────────

create table if not exists public.portal_condicoes_lidas (
  id            uuid primary key default gen_random_uuid(),
  acesso_id     uuid not null references public.portal_acessos(id) on delete restrict,
  publicacao_id uuid not null references public.portal_publicacoes(id) on delete restrict,
  ip            text,
  user_agent    text,
  criado_em     timestamptz not null default now()
);

comment on table public.portal_condicoes_lidas is
  'O pórtico das condições: a confirmação de que o cliente leu e entendeu '
  'as condições do orçamento ANTES de o abrir. Prova pré-código — o token '
  'privado, o IP, o user-agent e o carimbo. Uma leitura vale para o EVENTO '
  'inteiro, nunca por versão. on delete RESTRICT: prova não se apaga por '
  'arrasto.';

comment on column public.portal_condicoes_lidas.acesso_id is
  'A ligação privada por onde a confirmação entrou. Sem sessão verificada, '
  'o token É a prova de quem esteve do outro lado.';
comment on column public.portal_condicoes_lidas.publicacao_id is
  'A publicação de orçamento que estava em vigor no instante da leitura — '
  'fica para a história, mas a confirmação conta-se por evento.';
comment on column public.portal_condicoes_lidas.ip is
  'O endereço de onde veio a confirmação. Parte da prova, como nos actos.';
comment on column public.portal_condicoes_lidas.user_agent is
  'O navegador que confirmou. Parte da prova, como nos actos.';
comment on column public.portal_condicoes_lidas.criado_em is
  'O carimbo: «confirmou a leitura das condições a …».';

alter table public.portal_condicoes_lidas enable row level security;

-- O backoffice lê; ninguém escreve por aqui. A escrita entra SÓ pela RPC
-- security definer — sem policy de insert, nem o anon nem o authenticated
-- tocam na mesa directamente.
drop policy if exists "admin le as leituras" on public.portal_condicoes_lidas;
create policy "admin le as leituras" on public.portal_condicoes_lidas
  for select to authenticated using (true);

create index if not exists portal_condicoes_lidas_pub_idx
  on public.portal_condicoes_lidas (publicacao_id);


-- ─── 2 · Confirmar a leitura (anon, pré-código) ─────────────────────────────
--
-- Sem código e sem sessão DE PROPÓSITO: o pórtico vem antes de tudo — é a
-- porta de entrada do orçamento, não um acto sobre ele.

create or replace function public.dlm_portal_condicoes_lidas(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_pub    public.portal_publicacoes%rowtype;
  v_quando timestamptz;
  v_ip     text;
  v_ua     text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- A versão em vigor: é a que ela vai abrir a seguir ao pórtico.
  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = 'orcamento'
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  -- UMA VEZ POR EVENTO: a leitura procura-se por submission, através das
  -- publicações — nunca por versão. Carregar duas vezes não faz duas
  -- provas; devolve-se o carimbo que já existe.
  select min(l.criado_em) into v_quando
    from public.portal_condicoes_lidas l
    join public.portal_publicacoes p on p.id = l.publicacao_id
   where p.submission_id = v_acesso.submission_id
     and p.tipo = 'orcamento';
  if v_quando is not null then
    return jsonb_build_object('estado', 'ja_feito', 'quando', v_quando);
  end if;

  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  insert into public.portal_condicoes_lidas
    (acesso_id, publicacao_id, ip, user_agent)
  values
    (v_acesso.id, v_pub.id, nullif(v_ip, ''), v_ua)
  returning criado_em into v_quando;

  return jsonb_build_object('estado', 'ok', 'quando', v_quando);
end
$$;

revoke all     on function public.dlm_portal_condicoes_lidas(text) from public;
grant  execute on function public.dlm_portal_condicoes_lidas(text) to anon, authenticated;


-- ─── 3 · A projecção do documento sabe do pórtico — e do portão ─────────────
--
-- Cópia fiel da 074, com DUAS edições: `condicoes_lidas_em` na resposta do
-- orçamento — nos dois estados, velado e com sessão, porque o pórtico vem
-- ANTES do código e a folha precisa de saber se já foi passado — e a
-- guarda do portão do sinal: contrato e proposta sem sinal pago devolvem
-- 'nada', indistinguível de nunca publicados.

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
  -- 078 · o carimbo da leitura das condições, por evento.
  v_condicoes timestamptz;
  -- 078 · o portão do sinal: sem ele, contrato e proposta não existem.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA, cedo: sem o sinal pago, o contrato e a
  -- proposta NÃO existem deste lado do portão — 'nada', indistinguível
  -- de nunca publicados, como a casa já responde aos tokens mortos. A
  -- inferência é a MESMA da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  if p_tipo in ('contrato', 'proposta') then
    select s.fase into v_fase
      from public.submissions s
     where s.id = v_acesso.submission_id;
    v_sinal_feito :=
         v_fase in ('contrato','cliente','projecto')
      or exists (select 1 from public.pagamentos p
                  where p.submission_id = v_acesso.submission_id
                    and p.origem = 'sinal');
    if not coalesce(v_sinal_feito, false) then
      return jsonb_build_object('estado', 'nada');
    end if;
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

  -- 074 · também a NATUREZA da prova: código verificado (digital) ou
  -- papel confirmado pela casa — a folha não pode afirmar «código
  -- verificado» de uma assinatura que veio no papel.
  select acto, criado_em, nome_escrito,
         case when verificacao_id is not null then 'codigo' else 'papel' end
           as prova
    into v_acto
    from public.portal_actos
   where publicacao_id = v_pub.id
   order by criado_em desc
   limit 1;

  -- 078 · a leitura das condições, por EVENTO e nunca por versão — e nos
  -- dois estados, porque o pórtico decide-se antes de haver sessão.
  if p_tipo = 'orcamento' then
    select max(l.criado_em) into v_condicoes
      from public.portal_condicoes_lidas l
      join public.portal_publicacoes pp on pp.id = l.publicacao_id
     where pp.submission_id = v_acesso.submission_id
       and pp.tipo = 'orcamento';
  end if;

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
                                'nome',   v_acto.nome_escrito,
                                'prova',  v_acto.prova) end,
    -- 078 · null enquanto não confirmar — e aí o pórtico fecha a porta.
    'condicoes_lidas_em', v_condicoes,
    -- 074 · a assinatura da casa, para a folha mostrar os dois lados.
    'assinatura_casa', (
      select case when d.assinado_casa_em is null then null
                  else jsonb_build_object(
                         'nome',   d.assinado_casa_por,
                         'quando', d.assinado_casa_em) end
        from public.documentos d
       where d.id = v_pub.documento_id));
end
$$;
revoke all     on function public.dlm_portal_ver_documento(text, text, uuid, integer) from public;
grant  execute on function public.dlm_portal_ver_documento(text, text, uuid, integer) to anon, authenticated;


-- ─── 4 · A jornada atrás do portão — dlm_portal_ver ─────────────────────────
--
-- Cópia INTEGRAL da 077 (secção 5), com o portão do sinal por cima:
-- v_sinal_feito decide o que a projecção afirma. Sem sinal, a jornada
-- acaba no apelo (interessada · orcamento · sinal — as etapas 4-7 nem
-- saem), `publicado_em` sai só com a chave do orçamento e
-- `marcos_datados` cala contrato e projecto. Com sinal, tudo igual à 077.

create or replace function public.dlm_portal_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso      public.portal_acessos%rowtype;
  v_ev          public.submissions%rowtype;
  v_steps       jsonb;
  v_modelo      text;
  v_titulo      text;

  -- Fase 7 · a avaliação e a despedida
  v_av         public.avaliacoes%rowtype;
  v_convidada  boolean := false;
  v_nome_pub   text;
  v_foto_site  boolean := false;

  -- Fase 6 · as fotografias
  v_fotos      jsonb;
  v_n_fotos    integer := 0;
  v_depois     boolean;

  v_pedido_em       timestamptz;
  v_orcamento_em    timestamptz;
  v_sinal_em        timestamptz;
  v_projecto_em     timestamptz;
  v_contrato_em     timestamptz;
  v_questionario_em timestamptz;

  -- 078 · o portão: «o acompanhamento compra-se com o sinal».
  v_sinal_feito boolean;

  v_marcos   jsonb;
  v_anterior timestamptz;

  v_id_paleta text;
  v_paleta    jsonb;
  v_horas     jsonb;
  v_placa1    text;
  v_placa2    text;
  v_visao     jsonb;
  v_imagens   jsonb;
  v_mensagem  text;

  -- 070 · a resposta dela ao orçamento: só o gesto e o instante.
  v_resposta_orc jsonb;

  -- 073 · as publicações da proposta e do contrato.
  v_proposta_pub timestamptz;
  v_contrato_pub timestamptz;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_acesso from public.portal_acessos where token = p_token;

  if not found
     or v_acesso.revogado_em is not null
     or (v_acesso.expira_em is not null and v_acesso.expira_em < now())
  then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  if not found then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select nome, steps into v_modelo, v_steps
    from public.event_types where id = v_ev.event_type_id;
  v_steps := coalesce(v_steps, '[]'::jsonb);

  v_titulo := nullif(
    concat_ws(' & ',
      nullif(btrim(coalesce(v_ev.nome_noivo, '')), ''),
      nullif(btrim(coalesce(v_ev.nome_noiva, '')), '')
    ), '');
  if v_titulo is null then
    select c.nome into v_titulo from public.clientes c where c.id = v_ev.cliente_id;
  end if;

  -- ── Artefactos (051 · 052) ────────────────────────────────────────────
  select min(n.created_at) into v_pedido_em
    from public.notificacoes n
   where n.submission_id = v_ev.id and n.tipo = 'captacao';

  select min(d.enviado_em) into v_orcamento_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'orcamento';

  select min(d.assinado_em) into v_projecto_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'proposta';

  select min(d.assinado_em) into v_contrato_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'contrato';

  -- 073 · As PUBLICAÇÕES da proposta e do contrato — o instante em que
  -- ficaram à espera dela. Sem isto, a jornada só sabia da assinatura, e
  -- um contrato publicado continuava «a ser escrito» na página inteira.
  select min(d.enviado_em) into v_proposta_pub
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'proposta';

  select min(d.enviado_em) into v_contrato_pub
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'contrato';

  select min(p.data)::timestamptz into v_sinal_em
    from public.pagamentos p
   where p.submission_id = v_ev.id
     and p.origem = 'sinal' and p.reconstituido = false;

  -- 078 · A REGRA DA NÁDIA: a MESMA inferência da etapa 3 da jornada,
  -- nem mais larga nem mais estreita — o carimbo do sinal, uma fase que
  -- já só existe depois dele, ou qualquer pagamento de origem 'sinal'.
  -- Divergir aqui seria um portão que abre para uma jornada que ainda
  -- jura «por acontecer».
  v_sinal_feito :=
       v_sinal_em is not null
    or v_ev.fase in ('contrato','cliente','projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_ev.id and p.origem = 'sinal');

  -- A COLUNA DO EVENTO PRIMEIRO. A 062 criou-a, fez backfill e foi
  -- carimbada à mão — mas esta projecção continuava a ler só os convites, e
  -- por isso o portal nunca soube que o questionário estava entregue. Quem
  -- responde PELO PORTAL pode não ter convite nenhum.
  select coalesce(v_ev.questionario_entregue_em, min(i.preenchido_em))
    into v_questionario_em
    from public.invites i
   where i.submission_id = v_ev.id or i.submission_alvo_id = v_ev.id;

  -- ── A Jornada — agora atrás do portão (078) ───────────────────────────
  select jsonb_agg(
           jsonb_build_object(
             'etapa',  m.etapa,
             'estado', case
                         when not m.feito      then 'por_acontecer'
                         when m.quando is null then 'feito_sem_data'
                         else                       'feito_datado'
                       end,
             'quando', m.quando
           ) order by m.ord)
    into v_marcos
    from (values
      (1, 'interessada', true, coalesce(v_pedido_em, v_ev.created_at)),
      (2, 'orcamento',
          v_orcamento_em is not null
            or v_ev.fase in ('orcamento','sinal','contrato','cliente','projecto'),
          v_orcamento_em),
      -- 077 · O SINAL vem antes do contrato (a ordem final da Nádia):
      -- aceite o orçamento, o sinal reserva a data; reservada, segue o
      -- contrato para assinar. O sinal acende pelo pagamento ou pelas
      -- fases que já só existem depois dele.
      (3, 'sinal',
          v_sinal_em is not null
            or v_ev.fase in ('contrato','cliente','projecto')
            or exists (select 1 from public.pagamentos p
                        where p.submission_id = v_ev.id and p.origem = 'sinal'),
          v_sinal_em),
      -- O contrato acende pelo carimbo da assinatura, ou pela fase
      -- 'cliente' — que na semântica nova só existe depois de assinar.
      -- 'projecto' NÃO infere de propósito: os eventos antigos chegaram
      -- lá por fluxos velhos e afirmar-lhes «assinado» seria mentir.
      (4, 'contrato',
          v_contrato_em is not null
            or v_ev.fase = 'cliente',
          v_contrato_em),
      (5, 'projecto', v_projecto_em is not null or v_ev.fase = 'projecto', v_projecto_em),
      -- 076 · A Preparação acende pelo TRABALHO, nunca pela fase: o
      -- questionário entregue, ou o estado que a Nádia marca. A fase
      -- cliente diz «a data é dela» — não diz «compras feitas», e com a
      -- 075 a avançar sozinha, a inferência antiga mentia no instante
      -- seguinte ao sinal.
      (6, 'preparacao',
          v_questionario_em is not null
            or v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          v_questionario_em),
      -- 055 · Uma data que passou NÃO é um evento que aconteceu. Sem
      -- sinal pago, a data ter passado significa o contrário: o pedido
      -- caducou. FASES_POS_SINAL, a lista canónica — que a 071 apertou.
      (7, 'grande_dia',
          v_ev.data_evento is not null
            and v_ev.data_evento < current_date
            and v_ev.fase in ('contrato','cliente','projecto'),
          case when v_ev.data_evento is not null then v_ev.data_evento::timestamptz end)
    ) as m(ord, etapa, feito, quando)
   -- 078 · sem o sinal, a jornada acaba no apelo: interessada, orçamento,
   -- sinal — e mais nada. As etapas 4-7 NEM SAEM: uma etapa «por
   -- acontecer» já é uma promessa de acompanhamento, e o acompanhamento
   -- compra-se com o sinal.
   where v_sinal_feito or m.ord <= 3;

  -- ── O PEDIDO — chaves fixas, iguais para toda a gente ─────────────────
  v_mensagem := nullif(btrim(coalesce(v_ev.respostas->>'mensagemInicial', '')), '');

  -- Só strings: um elemento que não seja texto não é um URL de imagem.
  select jsonb_agg(x.value)
    into v_imagens
    from jsonb_array_elements(
           case when jsonb_typeof(v_ev.respostas->'imagensReferencia') = 'array'
                then v_ev.respostas->'imagensReferencia'
                else '[]'::jsonb end) x(value)
   where jsonb_typeof(x.value) = 'string'
     and btrim(x.value #>> '{}') <> '';

  -- ── A PALETA — pelo TIPO do campo, não pelo id ────────────────────────
  select f.val->>'id' into v_id_paleta
    from jsonb_array_elements(v_steps) p(val),
         jsonb_array_elements(p.val->'fields') f(val)
   where f.val->>'type' = 'paleta'
   limit 1;

  if v_id_paleta is not null
     and jsonb_typeof(v_ev.respostas->v_id_paleta) = 'array' then
    select jsonb_agg(x.value)
      into v_paleta
      from jsonb_array_elements(v_ev.respostas->v_id_paleta) x(value)
     where jsonb_typeof(x.value) = 'string'
       and btrim(x.value #>> '{}') <> '';
  end if;

  -- ── AS HORAS — os campos de tipo `time`, na ordem do modelo ───────────
  -- Cada uma leva o RÓTULO do modelo: a página não precisa de conhecer id
  -- nenhum, e um modelo com outras horas continua a desenhar-se sozinho.
  select jsonb_agg(
           jsonb_build_object('rotulo', h.rotulo, 'valor', h.valor)
           order by h.po, h.fo)
    into v_horas
    from (
      select p.ord as po, f.ord as fo,
             f.val->>'label'                     as rotulo,
             v_ev.respostas->>(f.val->>'id')     as valor
        from jsonb_array_elements(v_steps)          with ordinality p(val, ord),
             jsonb_array_elements(p.val->'fields')  with ordinality f(val, ord)
       where f.val->>'type' = 'time'
    ) h
   where nullif(btrim(coalesce(h.valor, '')), '') is not null;

  -- ── A PLACA — por padrão no id (gerado a partir da etiqueta) ──────────
  select nullif(btrim(coalesce(v_ev.respostas->>(f.val->>'id'), '')), '')
    into v_placa1
    from jsonb_array_elements(v_steps) p(val),
         jsonb_array_elements(p.val->'fields') f(val)
   where f.val->>'id' ilike '%placa%'
     and f.val->>'id' ilike '%principal%'
   limit 1;

  select nullif(btrim(coalesce(v_ev.respostas->>(f.val->>'id'), '')), '')
    into v_placa2
    from jsonb_array_elements(v_steps) p(val),
         jsonb_array_elements(p.val->'fields') f(val)
   where (f.val->>'id' ilike '%placa%' or f.val->>'id' ilike '%textoSecundario%')
     and f.val->>'id' ilike '%secundario%'
   limit 1;

  -- ── A VISÃO — as descrições longas, com o rótulo do modelo ────────────
  select jsonb_agg(
           jsonb_build_object('rotulo', d.rotulo, 'texto', d.texto)
           order by d.po, d.fo)
    into v_visao
    from (
      select p.ord as po, f.ord as fo,
             f.val->>'label'                 as rotulo,
             v_ev.respostas->>(f.val->>'id') as texto
        from jsonb_array_elements(v_steps)         with ordinality p(val, ord),
             jsonb_array_elements(p.val->'fields') with ordinality f(val, ord)
       where f.val->>'id' ilike 'descricao%'
         and f.val->>'type' in ('textarea', 'text')
    ) d
   where nullif(btrim(coalesce(d.texto, '')), '') is not null;

  -- ── A visita anterior, e a janela de 30 minutos ───────────────────────
  --
  -- Devolve-se SEMPRE o penúltimo. Quando a janela expirou, o penúltimo
  -- ainda não rodou nesta linha em memória, por isso o valor certo é o
  -- `ultimo_acesso_em` que está prestes a ser empurrado para lá.
  if v_acesso.ultimo_acesso_em is null
     or v_acesso.ultimo_acesso_em < now() - interval '30 minutes'
  then
    v_anterior := v_acesso.ultimo_acesso_em;
    update public.portal_acessos
       set visita_anterior_em = ultimo_acesso_em,
           ultimo_acesso_em   = now(),
           n_acessos          = n_acessos + 1
     where id = v_acesso.id;
  else
    -- Dentro da janela: nada se mexe, e a página desenha exactamente o
    -- mesmo que desenhou há cinco minutos.
    v_anterior := v_acesso.visita_anterior_em;
  end if;

  -- ── As fotografias (fase 6) ───────────────────────────────────────────
  --
  -- DOIS ENQUADRAMENTOS, A MESMA DIVISÃO. Antes do dia é presente e é só a
  -- montagem: ninguém quer ver o espaço a meio às onze da manhã, mas quer
  -- ver a mesa posta às cinco. Depois do dia é memória, e aí entra tudo —
  -- «da montagem ao fim da noite».
  --
  -- SEM DATA DE EVENTO trata-se como presente. Não se pode afirmar que um
  -- dia passou quando não se sabe qual é.
  v_depois := v_ev.data_evento is not null and v_ev.data_evento < current_date;

  select jsonb_agg(jsonb_build_object(
           'pequena', f.url_pequena,
           'grande',  f.url_grande,
           'assunto', f.assunto,
           'quando',  f.criado_em,
           'momento', f.momento)
         order by f.ordem, f.criado_em),
         count(*)
    into v_fotos, v_n_fotos
    from public.evento_fotografias f
   where f.submission_id = v_ev.id
     and (v_depois or f.momento = 'montagem');

  -- ── A avaliação e a despedida (fase 7) ────────────────────────────────
  --
  -- O CONVITE APARECE UNS DIAS DEPOIS, não no dia seguinte. Três: tempo
  -- para as fotografias do dia estarem carregadas e para ela ter dormido.
  -- Antes disso o convite NÃO EXISTE — não há rótulo, não há «por
  -- responder», não há prazo à vista.
  --
  -- E só a quem fechou negócio: um pedido que caducou com a data a passar
  -- não tem evento para avaliar.
  v_convidada := v_ev.data_evento is not null
             and v_ev.data_evento + 3 <= current_date
             and v_ev.fase in ('contrato','cliente','projecto');

  select * into v_av from public.avaliacoes where submission_id = v_ev.id;

  if v_av.id is not null then
    -- O nome como ela o escolheu. Só sai se ela autorizou a publicação —
    -- sem autorização não há nome nenhum a mostrar, porque não há nada
    -- para publicar.
    if v_av.publicacao_autorizada then
      -- «Sofia R.» — o nome próprio inteiro e a inicial do último, que é o
      -- meio-termo entre reconhecível e exposta. Num casal ficam os dois
      -- nomes próprios, porque é assim que eles se apresentam.
      --
      -- ⚠ ESTA CONTA VIVE SÓ AQUI. Fazê-la também no browser obrigava a
      -- mandar o nome inteiro para a página — e quem escolheu «sem nome»
      -- ficava com ele a viajar na resposta na mesma.
      v_nome_pub := case v_av.nome_como
        when 'anonimo'  then null
        when 'primeiro' then
          case
            when v_titulo like '% & %' then
              split_part(split_part(v_titulo, ' & ', 1), ' ', 1) || ' & ' ||
              split_part(split_part(v_titulo, ' & ', 2), ' ', 1)
            when position(' ' in btrim(coalesce(v_titulo, ''))) > 0 then
              split_part(btrim(v_titulo), ' ', 1) || ' ' ||
              upper(left(
                (string_to_array(btrim(v_titulo), ' '))[
                  array_length(string_to_array(btrim(v_titulo), ' '), 1)], 1)) || '.'
            else btrim(coalesce(v_titulo, ''))
          end
        else v_titulo
      end;
    end if;

    -- A FOTOGRAFIA NÃO É DECISÃO DELA. Se tiver convidados reconhecíveis,
    -- essas pessoas não consentiram — e a anfitriã não pode consentir por
    -- elas. Quem marca é a casa, na aba das fotografias.
    select (f.publicavel = 'sem_convidados') into v_foto_site
      from public.evento_fotografias f where f.id = v_av.fotografia_id;
    v_foto_site := coalesce(v_foto_site, false);
  end if;

  -- ── A projecção ───────────────────────────────────────────────────────
  -- ── 070 · a resposta dela ao orçamento ──────────────────────────────────
  -- O último acto sobre uma publicação de ORÇAMENTO deste evento. Só o
  -- gesto e o instante: nem o nome, nem a mensagem, nem versões — a página
  -- só precisa de saber que a resposta existe para deixar de a cobrar.
  select jsonb_build_object('acto', a.acto, 'em', a.criado_em)
    into v_resposta_orc
    from public.portal_actos a
    join public.portal_publicacoes p on p.id = a.publicacao_id
   where p.submission_id = v_ev.id
     and p.tipo = 'orcamento'
   order by a.criado_em desc
   limit 1;

  return jsonb_build_object(
    'estado', 'activo',
    'evento', jsonb_build_object(
      'titulo',     v_titulo,
      'modelo',     v_modelo,
      'data',       v_ev.data_evento,
      'local',      v_ev.local_evento,
      'convidados', v_ev.numero_convidados,
      'dias_para',  case when v_ev.data_evento is not null
                         then v_ev.data_evento - current_date end,
      'principio',  v_ev.fase in ('interessado','orcamento'),
      -- A placa dos casais leva segunda linha com nomes e data.
      'de_casal',   v_titulo is not null and v_titulo like '% & %'
    ),
    'jornada', coalesce(v_marcos, '[]'::jsonb),

    -- «Esta ligação fica aberta até 30 de Outubro.» A despedida diz o prazo
    -- em voz alta, em vez de o deixar chegar de surpresa. É uma data sobre
    -- o acesso dela — não revela nada do evento.
    'ligacao_ate', v_acesso.expira_em,

    -- Serve a divisão das novidades. NULL na primeira visita — e aí a
    -- divisão não se pinta, porque não há «desde a última vez».
    'visita_anterior', v_anterior,

    'pedido', jsonb_build_object(
      'mensagem',  v_mensagem,
      'quando',    coalesce(v_pedido_em, v_ev.created_at),
      'imagens',   coalesce(v_imagens, '[]'::jsonb)
    ),

    'questionario', jsonb_build_object(
      -- Há perguntas que cheguem neste modelo? Abaixo de cinco campos não
      -- há questionário nenhum (063) — e sem isto a pendência convidava a
      -- responder a um questionário que não existe, em quatro dos seis
      -- modelos, com uma ligação que devolvia a pessoa ao princípio.
      'tem_perguntas', public.dlm_questionario_conta_campos(v_steps) >= 5,
      'entregue_em', v_questionario_em,
      'paleta',      coalesce(v_paleta, '[]'::jsonb),
      'horas',       coalesce(v_horas, '[]'::jsonb),
      'placa',       jsonb_build_object('principal', v_placa1, 'secundario', v_placa2),
      'visao',       coalesce(v_visao, '[]'::jsonb)
    ),

    -- SEM FOTOGRAFIAS, A CHAVE VEM VAZIA e a divisão não se pinta —
    -- nem rótulo, nem espaço reservado, nem «ainda sem fotografias». Um
    -- lugar reservado transforma uma surpresa numa promessa por cumprir.
    --
    -- Os URLs são públicos e o nome do ficheiro é foto_{carimbo}_{aleatório}:
    -- não leva id de evento nem nada derivável dele. Reorganizar os
    -- caminhos «por evento» é que exporia o id — a mesma razão que está
    -- escrita na 054 para as imagens de referência.
    'fotografias', jsonb_build_object(
      'quando',  case when v_depois then 'memoria' else 'montagem' end,
      'lista',   coalesce(v_fotos, '[]'::jsonb),
      'total',   v_n_fotos
    ),

    -- A AVALIAÇÃO NÃO REVOGA O ACESSO. Estava no plano que o acesso
    -- morresse ao gravar; mudou, e por uma boa razão: fechar a porta a quem
    -- acabou de dar uma frase e uma fotografia é o gesto errado no momento
    -- errado. O estado de despedida deriva de EXISTIR uma avaliação, e vive
    -- até ao prazo acabar. A revogação continua a ser por prazo ou à mão.
    'avaliacao', jsonb_build_object(
      'convidada',        v_convidada,
      'feita_em',         v_av.criada_em,
      'frase',            v_av.frase,
      'palavras_no_site', coalesce(v_av.publicacao_autorizada, false),
      'nome_publicado',   v_nome_pub,
      'foto_no_site',     v_foto_site
    ),

    -- Datas dos artefactos, para a página saber o que é NOVO desde a
    -- visita anterior. Só carimbos — nunca valores.
    -- 078 · atrás do portão ficam também os carimbos: sem sinal, contrato
    -- e projecto calam-se — um carimbo datado já é acompanhamento.
    'marcos_datados', case when v_sinal_feito
      then jsonb_build_object(
        'orcamento', v_orcamento_em,
        'projecto',  v_projecto_em,
        'contrato',  v_contrato_em,
        'sinal',     v_sinal_em)
      else jsonb_build_object(
        'orcamento', v_orcamento_em,
        'sinal',     v_sinal_em) end,

    -- 070 · NULL enquanto não houver resposta — e aí a pendência cobra,
    -- como sempre cobrou.
    'resposta_orcamento', v_resposta_orc,

    -- 073 · só carimbos, nunca conteúdo: o instante em que a proposta e
    -- o contrato ficaram publicados à espera dela.
    -- 078 · sem o sinal, proposta e contrato não existem deste lado do
    -- portão: sai só a chave do orçamento — o documento que ela PODE ver
    -- por inteiro. A página só lê proposta/contrato daqui, e ausentes é
    -- exactamente o que devem parecer.
    'publicado_em', case when v_sinal_feito
      then jsonb_build_object(
        'proposta', v_proposta_pub,
        'contrato', v_contrato_pub)
      else jsonb_build_object(
        'orcamento', v_orcamento_em) end
  );
end;
$$;

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ─── 5 · A lista atrás do portão — dlm_portal_documentos ────────────────────
--
-- Cópia INTEGRAL da 057 (a versão mais recente da função), com UM filtro:
-- sem o sinal pago, a lista só conhece o orçamento — proposta e contrato
-- ficam de fora como se nunca tivessem sido publicados. Nem entrada, nem
-- «precisa de código», nem versão: nada que denuncie que existem.

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
  -- 078 · o portão do sinal, com a inferência da etapa 3 da jornada.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA: «o acompanhamento compra-se com o sinal».
  -- A MESMA inferência da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  select s.fase into v_fase
    from public.submissions s
   where s.id = v_acesso.submission_id;
  v_sinal_feito :=
       v_fase in ('contrato','cliente','projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_acesso.submission_id
                  and p.origem = 'sinal');

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
         -- 078 · sem sinal, só o orçamento saiu da casa — os outros
         -- documentos comportam-se como se nunca publicados.
         and (v_sinal_feito or p.tipo = 'orcamento')
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


-- ============================================================================
-- 6 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 6.1 · A primeira confirmação grava a prova toda:
--   select public.dlm_portal_condicoes_lidas('<TOKEN>');
--   -- → {"estado":"ok","quando":"<carimbo>"}
--   select acesso_id, publicacao_id, ip, user_agent, criado_em
--     from portal_condicoes_lidas order by criado_em desc limit 1;
--   -- ip e user_agent preenchidos (via PostgREST).

-- 6.2 · A segunda vez é eco, com o MESMO carimbo:
--   select public.dlm_portal_condicoes_lidas('<TOKEN>');
--   -- → {"estado":"ja_feito","quando":"<o carimbo de 6.1>"}

-- 6.3 · Publicar a versão 2 do orçamento NÃO reabre o pórtico:
--   (publicar outra versão; depois)
--   select public.dlm_portal_condicoes_lidas('<TOKEN>');
--   -- → 'ja_feito' na mesma — a leitura é do evento, não da versão.

-- 6.4 · Sem orçamento publicado → 'nada'; token revogado/expirado → 'terminado':
--   select public.dlm_portal_condicoes_lidas('<TOKEN_SEM_ORCAMENTO>');
--   select public.dlm_portal_condicoes_lidas('<TOKEN_REVOGADO>');

-- 6.5 · A projecção traz o campo NOS DOIS estados:
--   select public.dlm_portal_ver_documento('<TOKEN>','orcamento')->>'condicoes_lidas_em';
--   -- sem sessão (velado): null antes de confirmar, o carimbo depois;
--   -- com sessão (p_verificacao): o mesmo carimbo.

-- 6.6 · A mesa não se lê com a chave anónima nem se escreve por fora:
--   (com a chave anónima) select * from portal_condicoes_lidas;
--   -- 0 linhas. E o insert directo tem de ser recusado (sem policy).

-- 6.7 · A invariante de sempre: nenhum id de evento sai pelas funções.

-- 6.8 · O PORTÃO — evento SEM sinal (fase interessado/orcamento/sinal e
--   nenhum pagamento de origem 'sinal'): a jornada acaba no apelo.
--   select jsonb_array_length(public.dlm_portal_ver('<TOKEN_SEM_SINAL>')->'jornada');
--   -- → 3 (interessada · orcamento · sinal — as etapas 4-7 nem saem)
--   select public.dlm_portal_ver('<TOKEN_SEM_SINAL>')->'publicado_em';
--   -- → só a chave do orçamento; proposta/contrato AUSENTES (não null: ausentes)
--   select public.dlm_portal_ver('<TOKEN_SEM_SINAL>')->'marcos_datados';
--   -- → orcamento e sinal; contrato/projecto AUSENTES

-- 6.9 · A lista sem sinal só conhece o orçamento, MESMO com contrato e
--   proposta publicados:
--   select public.dlm_portal_documentos('<TOKEN_SEM_SINAL>')->'documentos';
--   -- → no máximo a entrada 'orcamento' — as outras como nunca publicadas

-- 6.10 · O contrato e a proposta sem sinal são 'nada', indistinguíveis de
--   não publicados — velados ou com sessão, tanto faz:
--   select public.dlm_portal_ver_documento('<TOKEN_SEM_SINAL>','contrato')->>'estado';
--   select public.dlm_portal_ver_documento('<TOKEN_SEM_SINAL>','proposta')->>'estado';
--   -- → 'nada' nos dois

-- 6.11 · Com o sinal (pagamento de origem 'sinal' OU fase contrato/
--   cliente/projecto), tudo abre de uma vez:
--   select jsonb_array_length(public.dlm_portal_ver('<TOKEN_COM_SINAL>')->'jornada');
--   -- → 7; e a lista traz os três tipos, e o contrato responde 'ok'.
--   O orçamento nunca esteve atrás deste portão: responde igual nos dois
--   mundos (só o pórtico das condições o guarda).
