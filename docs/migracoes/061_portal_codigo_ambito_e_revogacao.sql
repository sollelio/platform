-- ============================================================================
-- 061 · Portal — o âmbito do código, e uma saída que existe mesmo
--
-- Ficaram duas coisas em aberto no fim da fase 4. Ao ir resolvê-las, a
-- segunda revelou-se pior do que estava registada.
--
-- ─── O QUE ESTAVA REGISTADO ────────────────────────────────────────────────
--
-- A · «Um código pedido para o orçamento autoriza assinar o contrato durante
--     60 minutos, e o registo diz "verificado com o código". É verdade a
--     meias.» — `dlm_portal_sessao` nunca olhou para o `contexto`.
--
-- B · «"Pedir outro código" não anula o anterior — quem desconfie que lho
--     viram não tem como o matar.»
--
-- ─── O QUE SE ENCONTROU AO ABRIR ───────────────────────────────────────────
--
-- O B era mais fundo. «Pedir outro código» não é que não anule o anterior:
-- NÃO FAZ NADA. `dlm_portal_pedir_codigo` vê que já existe um código vivo,
-- devolve 'pedido' e sai — sem criar pedido, sem avisar a Nádia. E o teste
-- de «vivo» não olha às tentativas, por isso um código já morto às cinco
-- falhas continua a bloquear pedidos novos.
--
-- Efeito no ecrã da cliente: erra cinco vezes, o código morre, o portal
-- oferece-lhe «Pedir outro código» — ela carrega, vê a página de espera, e
-- do outro lado não chega aviso nenhum. Fica encravada 24 horas com uma
-- página a dizer-lhe que a Nádia já sabe. Não sabia.
--
-- ─── AS DUAS REGRAS QUE ISTO PASSA A TER ───────────────────────────────────
--
-- 1 · ASSINAR exige um código pedido A PARTIR DO CONTRATO.
--     Só assinar. Aceitar o orçamento e pedir alteração ficam como estavam:
--     são leves, e uma versão nova reabre-os. Assinar é o acto que TRANCA e
--     que fica como prova — é o único onde «verificado com o código» tem de
--     ser verdade inteira. Apertar os outros obrigava a dois códigos para
--     ler dois documentos, que é atrito sem ganho.
--
-- 2 · PEDIR OUTRO CÓDIGO MATA O ANTERIOR — o código E a sessão que ele
--     abriu. Matar só o código deixava de pé quem já o tinha usado, que é
--     precisamente a pessoa de quem ela desconfia. Custo assumido: se ela
--     estava a ler com valores abertos, volta a ter de escrever um código —
--     e escrever um código é exactamente o que ela já ia fazer.
--
--     Um pedido POR ATENDER continua a não gerar aviso repetido: isso é
--     eco, e a Nádia já o tem à frente.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · Pedir código: eco não, revogação sim ───────────────────────────────

create or replace function public.dlm_portal_pedir_codigo(
  p_token    text,
  p_contexto text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso   public.portal_acessos%rowtype;
  v_ev       public.submissions%rowtype;
  v_nome     text;
  v_pedido   uuid;
  v_ctx      text := nullif(btrim(coalesce(p_contexto, '')), '');
  v_matou    boolean := false;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- (a) Há pedido POR ATENDER? Então é eco: a Nádia já tem o aviso à
  -- frente e não se lho repete. Mas o contexto actualiza-se — ela pode ter
  -- pedido a partir do orçamento e estar agora no contrato, e é o último
  -- documento que diz para que serve o código.
  select id into v_pedido
    from public.portal_verificacoes
   where acesso_id = v_acesso.id
     and emitido_em is null
     and pedido_em > now() - interval '24 hours'
   order by pedido_em desc
   limit 1;

  if v_pedido is not null then
    if v_ctx is not null then
      update public.portal_verificacoes set contexto = v_ctx where id = v_pedido;
    end if;
    return jsonb_build_object('estado', 'pedido');
  end if;

  -- (b) Havia código EMITIDO? Pedir outro mata-o — e mata a sessão que ele
  -- abriu. `usado_em = null` é o que fecha a porta a quem já tinha entrado:
  -- sem isto, «pedir outro código» não protegia de nada, porque quem viu o
  -- código de relance já lá estava dentro por 60 minutos.
  update public.portal_verificacoes
     set expira_em = now(),
         usado_em  = null
   where acesso_id = v_acesso.id
     and codigo is not null
     and (expira_em > now() or usado_em > now() - interval '60 minutes');
  v_matou := found;

  insert into public.portal_verificacoes (acesso_id, contexto)
  values (v_acesso.id, v_ctx)
  returning id into v_pedido;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('codigo_pedido',
     coalesce(v_nome, 'A cliente')
       || case when v_matou then ' pediu OUTRO código de verificação'
               else ' pediu o código de verificação' end,
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('contexto', v_ctx,
                        'verificacao_id', v_pedido,
                        'substitui_anterior', v_matou));

  return jsonb_build_object('estado', 'pedido', 'anterior_morto', v_matou);
end
$$;

revoke all     on function public.dlm_portal_pedir_codigo(text, text) from public;
grant  execute on function public.dlm_portal_pedir_codigo(text, text) to anon, authenticated;


-- ─── 2 · Assinar exige código pedido a partir do contrato ───────────────────
--
-- Uma linha só, mas é a linha que faz o trilho dizer verdade: a partir daqui
-- «assinou, verificado com o código» significa mesmo que houve um código
-- pedido PARA ISTO, e não um que passava por ali.

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

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;


-- ============================================================================
-- 3 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 3.1 · O código do orçamento já NÃO assina o contrato.
--   Peça o código a partir do ORÇAMENTO, emita-o, verifique no portal.
--   Depois abra o contrato e tente assinar:
--     select public.dlm_portal_acto('<TOKEN>','contrato','<SESSAO>'::uuid,
--                                   'assinou','Sofia Ramalho');
--   -- Esperado: {'estado':'precisa_codigo','motivo':'codigo_de_outro_documento'}
--   E com um código pedido a partir do CONTRATO: {'estado':'ok', ...}

-- 3.2 · «Pedir outro código» mata mesmo o anterior.
--   Emita um código, use-o (fica sessão viva). Depois, no portal, peça outro.
--     select codigo, expira_em, usado_em from portal_verificacoes
--      where acesso_id = '<ACESSO>'::uuid order by pedido_em desc;
--   -- A linha antiga: expira_em no passado e usado_em a NULL.
--   E o código antigo deixa de entrar:
--     select public.dlm_portal_verificar('<TOKEN>','<CODIGO_ANTIGO>');
--   -- Esperado: {'estado':'codigo_invalido'}

-- 3.3 · A saída depois das cinco falhas existe mesmo.
--   Erre cinco vezes. Depois carregue em «Pedir outro código» no portal.
--     select count(*) from notificacoes
--      where tipo='codigo_pedido' and submission_id='<EVENTO>'::uuid;
--   -- Esperado: MAIS UM aviso do que antes, com o título a dizer «pediu
--   -- OUTRO código». Antes desta migração: nenhum.

-- 3.4 · O eco continua calado.
--   Com um pedido por atender, carregue duas ou três vezes em «Pedir o
--   código». A contagem de avisos NÃO pode subir.
