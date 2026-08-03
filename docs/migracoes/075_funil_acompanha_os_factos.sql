-- ============================================================================
-- 075 · o funil acompanha os factos — «sugere-se» afinado, nunca traído
-- ============================================================================
-- A DECISÃO (Hélio, 03/08/2026), a afinar a regra de 27/07:
--
-- «Sugere-se, nunca se executa» distinguia mal duas coisas. Quando a
-- transição de fase é o ESPELHO DE UM FACTO já registado com trilho —
-- o orçamento publicado, o aceite com registo, a assinatura com código
-- (ou papel confirmado), o sinal saldado — a decisão humana JÁ
-- aconteceu; obrigar a Nádia a repeti-la no funil era contabilidade em
-- dobro. Essas passam a acompanhar sozinhas. Quando é um JUÍZO
-- comercial (dar por perdido, arrancar com o projecto), continua a
-- sugerir-se, nunca a executar-se.
--
-- TRÊS guardas invioláveis do avanço automático:
--   · NUNCA recua — só move para a frente na ordem do funil;
--   · NUNCA toca num evento perdido — recuperar é gesto informado dela;
--   · falhar o avanço NUNCA falha o acto — o registo do facto é o que
--     importa; a fase apanha-se depois, à mão, como sempre se pôde.
--
-- O que sincroniza aqui (servidor, junto do facto):
--   · publicar o orçamento           → fase ≥ orcamento
--   · aceite do orçamento (portal)   → fase ≥ contrato
--   · assinatura (código ou papel)   → fase ≥ sinal
-- O sinal saldado → cliente sincroniza no backoffice (é lá que o
-- pagamento se regista). O resto das funções é texto exacto das
-- migrações 057, 060 e 072. Correr DEPOIS da 074.
-- ============================================================================

-- ── 1 · o degrau: avança ATÉ uma fase, nunca além, nunca para trás ─────────
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
    array['interessado','orcamento','contrato','sinal','cliente','projecto'];
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

-- ── 2 · publicar o orçamento reflecte a fase ───────────────────────────────
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

  -- 075 · publicar o orçamento é o facto que abre a fase comercial: o
  -- funil acompanha. Falhar aqui nunca falha a publicação.
  if p_tipo = 'orcamento' then
    begin
      perform public.dlm_fase_avancar_ate(p_submission_id, 'orcamento');
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('versao', v_versao, 'publicado_em', now());
end
$$;

revoke all     on function public.dlm_portal_publicar(uuid, text, jsonb) from public, anon;

-- ── 3 · os actos do portal reflectem a fase ────────────────────────────────
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

  -- 075 · o facto move o funil: aceite → fase contrato; assinatura →
  -- fase sinal. Nunca recua, nunca toca em perdidos, e falhar o avanço
  -- nunca falha o acto (o registo é o que importa).
  begin
    if p_acto = 'aceitou' and p_tipo = 'orcamento' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'contrato');
    elsif p_acto = 'assinou' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'sinal');
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;

-- ── 4 · o papel confirmado reflecte a fase ─────────────────────────────────
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

  -- 075 · a assinatura em papel confirmada é assinatura a sério: o
  -- funil acompanha, com as mesmas guardas do digital.
  begin
    perform public.dlm_fase_avancar_ate(v_not.submission_id, 'sinal');
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'versao', v_pub.versao);
end
$$;

revoke all     on function public.dlm_portal_confirmar_papel(uuid, text) from public, anon;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 1 · Aceita um orçamento no portal (evento em fase orcamento):
--   select fase from submissions where id='<EVENTO>'::uuid;  -- 'contrato'
-- 2 · Assina o contrato (código):  -- fase passa a 'sinal'
-- 3 · Num evento PERDIDO, um acto do portal NÃO mexe a fase.
-- 4 · Num evento já em 'cliente', publicar orçamento novo NÃO recua nada.
-- 5 · O funil: os cartões mudam de coluna sozinhos ao refrescar.
