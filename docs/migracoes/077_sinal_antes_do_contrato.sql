-- ============================================================================
-- 077 · o sinal antes do contrato — a ordem final da Nádia
-- ============================================================================
-- A DECISÃO (Nádia, via Hélio, 03/08/2026 — a rever a 071):
--
--   interessado → orçamento → [Aceite] → SINAL (50%, reserva a data) →
--   [Sinal recebido] → CONTRATO (por assinar) → [assinado] → cliente →
--   projecto (terminal)
--
-- A semântica nova das fases:
--   · sinal    = orçamento aceite, 50% por pagar (o limbo pós-aceite)
--   · contrato = sinal pago (data reservada), contrato por assinar
--   · cliente  = contrato assinado — negócio fechado por inteiro
--   · projecto = terminal do funil (o trabalho corre no eixo STATUS)
-- «Pós-sinal» (data garantida) passa a: contrato · cliente · projecto.
--
-- CINCO peças:
--   1 · o invariante da 040 reescrito (pós-sinal novo);
--   2 · os dados lidos à luz nova: fase 'contrato' da 071 (aceite, por
--       assinar, SEM sinal) → 'sinal'; fase 'cliente' SEM assinatura e
--       com evento por vir → 'contrato' (pago, por assinar); o resto fica;
--   3 · dlm_fase_avancar_ate com a ordem nova;
--   4 · a sincronização (075) re-apontada: aceite → ≥sinal; sinal saldado
--       → ≥contrato (no backoffice); assinatura (código/papel) → ≥cliente;
--   5 · dlm_portal_ver com a jornada sinal(3)·contrato(4) e as
--       inferências de fase reescritas. Inclui tudo da 076.
--
-- Correr DEPOIS da 076. Idempotente.
-- ============================================================================

begin;

-- ── 1 · o invariante da 040, reescrito ─────────────────────────────────────
alter table public.submissions
  drop constraint if exists submissions_status_pos_sinal;

-- ── 2 · os dados lidos à luz nova ──────────────────────────────────────────

-- O limbo da 071 (aceite, contrato por assinar, sem sinal): passa ao
-- limbo novo — à espera do sinal. Quem já tinha o contrato ASSINADO
-- (fase 'sinal' da 071: assinado, por pagar) também espera o sinal:
-- juntam-se todos em 'sinal', e a assinatura já feita lê-se nos
-- carimbos, não na fase.
update public.submissions
   set fase = 'sinal'
 where fase = 'contrato';

-- Sinal pago sem contrato assinado (o auto-avanço da 075 pôs estes em
-- 'cliente'): à luz nova são 'contrato' — pago, por assinar. Só os
-- eventos POR VIR: os passados são história e não se reabrem.
update public.submissions s
   set fase = 'contrato'
 where s.fase = 'cliente'
   and (s.data_evento is null or s.data_evento >= current_date)
   and not exists (
     select 1 from public.documentos d
      where d.submission_id = s.id
        and d.tipo = 'contrato'
        and d.assinado_em is not null
   );

-- ── o invariante volta, apertado à ordem nova ──────────────────────────────
alter table public.submissions
  add constraint submissions_status_pos_sinal
  check (
    status not in ('Em Preparação', 'Confirmado', 'Concluído')
    or fase in ('contrato', 'cliente', 'projecto', 'perdido')
  );

commit;

-- ── 3 · o degrau com a ordem nova ──────────────────────────────────────────
create or replace function public.dlm_fase_avancar_ate(
  p_submission_id uuid,
  p_fase          text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordem  constant text[] :=
    array['interessado','orcamento','sinal','contrato','cliente','projecto'];
  v_actual text;
begin
  select fase into v_actual
    from public.submissions where id = p_submission_id;
  if v_actual is null or v_actual = 'perdido' then
    return;                          -- perdido não se mexe por reflexo
  end if;
  if array_position(v_ordem, p_fase) is null then
    return;                          -- fase fora do vocabulário: nada
  end if;
  if coalesce(array_position(v_ordem, v_actual), 0)
     >= array_position(v_ordem, p_fase) then
    return;                          -- nunca recuar, nunca repetir
  end if;
  update public.submissions set fase = p_fase where id = p_submission_id;
end
$$;

revoke all     on function public.dlm_fase_avancar_ate(uuid, text) from public;
-- authenticated pode (é quem publica); as funções do portal são
-- SECURITY DEFINER e chamam-na como donas.
grant  execute on function public.dlm_fase_avancar_ate(uuid, text) to authenticated;


-- ── 4 · os actos re-apontados ──────────────────────────────────────────────
create or replace function public.dlm_portal_acto(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid,
  p_acto        text,
  p_nome        text,
  p_mensagem    text default null,
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

  -- A ÚNICA alteração desta migração à função (o resto é cópia fiel da 058).
  -- ASSINAR é o acto que tranca e que fica como prova: o código tem de ter
  -- sido pedido A PARTIR DO CONTRATO, nunca um que veio para ver o
  -- orçamento e ficou de pé 60 minutos.
  if p_acto = 'assinou' and coalesce(v_sessao.contexto, '') <> 'contrato' then
    return jsonb_build_object('estado', 'precisa_codigo',
                              'motivo', 'codigo_de_outro_documento');
  end if;

  if length(btrim(coalesce(p_nome, ''))) < 3 then
    return jsonb_build_object('estado', 'nome_em_falta');
  end if;

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

  -- A versão que ela leu tem de ser a que está em vigor. Se saiu outra
  -- entretanto, o acto NÃO se grava: ela relê e responde de novo.
  if p_versao is not null and p_versao <> v_pub.versao then
    return jsonb_build_object('estado', 'versao_mudou', 'versao', v_pub.versao);
  end if;

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

  -- 072 · TODOS os actos tocam na Caixa de Entrada. Antes só o pedido
  -- de alteração avisava; aceitar, aprovar e assinar eram silêncio — e
  -- eram precisamente os momentos em que ela quer agir na hora.
  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome_cl from public.clientes c where c.id = v_ev.cliente_id;

  if p_acto = 'pediu_alteracao' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('pedido_alteracao',
       coalesce(v_nome_cl, 'A cliente') || ' pediu uma alteração',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'mensagem', btrim(p_mensagem)));
  elsif p_acto = 'aceitou' and p_tipo = 'orcamento' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('orcamento_aceite',
       coalesce(v_nome_cl, 'A cliente') || ' aceitou o orçamento',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'aceitou' and p_tipo = 'proposta' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('projecto_aprovado',
       coalesce(v_nome_cl, 'A cliente') || ' aprovou o projecto',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'assinou' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('contrato_assinado',
       coalesce(v_nome_cl, 'A cliente') || ' assinou o contrato',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  end if;

  -- 077 · o facto move o funil, pela ordem nova: aceite → fase sinal
  -- (50% por pagar); assinatura → fase cliente (fechado por inteiro).
  -- Nunca recua, nunca toca em perdidos, e falhar o avanço nunca falha
  -- o acto (o registo é o que importa).
  begin
    if p_acto = 'aceitou' and p_tipo = 'orcamento' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'sinal');
    elsif p_acto = 'assinou' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'cliente');
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;


create or replace function public.dlm_portal_confirmar_papel(
  p_notificacao_id uuid,
  p_nome           text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_not     public.notificacoes%rowtype;
  v_caminho text;
  v_pub     public.portal_publicacoes%rowtype;
begin
  if length(btrim(coalesce(p_nome, ''))) < 3 then
    raise exception 'NOME_EM_FALTA: escreva o nome tal como está no papel.';
  end if;

  select * into v_not
    from public.notificacoes
   where id = p_notificacao_id and tipo = 'contrato_papel';
  if not found then
    raise exception 'AVISO_NAO_ENCONTRADO';
  end if;

  v_caminho := btrim(coalesce(v_not.dados->>'caminho', ''));
  if v_caminho = '' then
    raise exception 'FICHEIRO_NAO_ENCONTRADO';
  end if;
  if not exists (
    select 1 from storage.objects
     where bucket_id = 'contratos-assinados' and name = v_caminho
  ) then
    raise exception 'FICHEIRO_NAO_ENCONTRADO';
  end if;

  -- A VERSÃO CERTA: a que estava em vigor quando ela carregou a fotografia,
  -- não a mais alta de hoje. Se a Nádia publicou outra entretanto, o acto
  -- fica preso à que a cliente teve mesmo na mão.
  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_not.submission_id
     and tipo = 'contrato'
     and publicado_em <= v_not.created_at
   order by versao desc
   limit 1;

  if not found then
    -- Carregou antes de haver publicação registada (dados antigos): fica a
    -- primeira, que é a mais próxima da verdade que se consegue afirmar.
    select * into v_pub
      from public.portal_publicacoes
     where submission_id = v_not.submission_id and tipo = 'contrato'
     order by versao asc
     limit 1;
  end if;
  if not found then
    raise exception 'SEM_CONTRATO_PUBLICADO';
  end if;

  if exists (
    select 1 from public.portal_actos
     where publicacao_id = v_pub.id and acto = 'assinou'
  ) then
    -- Já assinado: o aviso sai da Caixa de Entrada na mesma, senão ficava
    -- lá para sempre a pedir uma coisa que já está feita.
    update public.notificacoes set lida_em = coalesce(lida_em, now())
     where id = v_not.id;
    return jsonb_build_object('estado', 'ja_assinado', 'versao', v_pub.versao);
  end if;

  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, confirmado_por, ficheiro)
  values
    (v_pub.id, null, 'assinou', btrim(p_nome), auth.uid(), v_caminho);

  update public.documentos
     set assinado_em = coalesce(assinado_em, now()),
         trancado_em = now()
   where id = v_pub.documento_id;

  update public.notificacoes
     set lida_em = coalesce(lida_em, now())
   where tipo = 'contrato_papel'
     and submission_id = v_not.submission_id
     and lida_em is null;

  -- 077 · a assinatura em papel confirmada é assinatura a sério: fecha
  -- o negócio por inteiro, com as mesmas guardas do digital.
  begin
    perform public.dlm_fase_avancar_ate(v_not.submission_id, 'cliente');
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'versao', v_pub.versao);
end
$$;

revoke all     on function public.dlm_portal_confirmar_papel(uuid, text) from public, anon;

-- ============================================================================

-- ── 5 · a jornada pela ordem final ─────────────────────────────────────────
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

  -- A COLUNA DO EVENTO PRIMEIRO. A 062 criou-a, fez backfill e foi
  -- carimbada à mão — mas esta projecção continuava a ler só os convites, e
  -- por isso o portal nunca soube que o questionário estava entregue. Quem
  -- responde PELO PORTAL pode não ter convite nenhum.
  select coalesce(v_ev.questionario_entregue_em, min(i.preenchido_em))
    into v_questionario_em
    from public.invites i
   where i.submission_id = v_ev.id or i.submission_alvo_id = v_ev.id;

  -- ── A Jornada (inalterada face à 052) ─────────────────────────────────
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
    ) as m(ord, etapa, feito, quando);

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
    'marcos_datados', jsonb_build_object(
      'orcamento', v_orcamento_em,
      'projecto',  v_projecto_em,
      'contrato',  v_contrato_em,
      'sinal',     v_sinal_em
    ),

    -- 070 · NULL enquanto não houver resposta — e aí a pendência cobra,
    -- como sempre cobrou.
    'resposta_orcamento', v_resposta_orc,

    -- 073 · só carimbos, nunca conteúdo: o instante em que a proposta e
    -- o contrato ficaram publicados à espera dela.
    'publicado_em', jsonb_build_object(
      'proposta', v_proposta_pub,
      'contrato', v_contrato_pub
    )
  );
end;
$$;

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 1 · As fases migradas:
--   select fase, count(*) from submissions group by fase order by fase;
-- 2 · A jornada pela ordem nova:
--   select e->>'etapa' from jsonb_array_elements(
--     public.dlm_portal_ver('<TOKEN>')->'jornada') as t(e);
--   -- Esperado: interessada · orcamento · sinal · contrato · projecto ·
--   -- preparacao · grande_dia.
-- 3 · Aceite no portal → fase 'sinal'. Regista o sinal (saldado) → o
--   backoffice avança para 'contrato'. Assina → fase 'cliente'.
-- 4 · O invariante: status operacional exige fase contrato/cliente/
--   projecto/perdido — 23514 caso contrário.
