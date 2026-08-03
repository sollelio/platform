-- ============================================================================
-- 074 · as assinaturas na folha, e a morada validada num toque
-- ============================================================================
-- DUAS peças, decididas pelo Hélio a 02/08/2026:
--
-- A · AS ASSINATURAS NA FOLHA. A assinatura digital da cliente vivia no
--   registo (portal_actos) mas a folha do contrato continuava com as
--   linhas vazias; e a casa não tinha maneira de assinar do lado dela.
--   Entram duas colunas em `documentos` — assinado_casa_em e
--   assinado_casa_por — que o gatilho do tranco (057) NÃO guarda, de
--   propósito: assinar pela casa nunca muda o conteúdo, e tem de poder
--   pousar num contrato que a cliente já trancou. Quem escreve é a
--   Nádia, autenticada — a sessão dela é a prova, como o código é a da
--   cliente. A projecção de dlm_portal_ver_documento passa a devolver
--   'assinatura_casa' {nome, quando}, para a folha do portal mostrar as
--   duas assinaturas.
--
-- B · A MORADA VALIDADA NUM TOQUE. O pedido de alteração do portal passa
--   a poder levar DADOS estruturados (a morada nova, nas cinco partes) —
--   coluna `dados` em questionario_pedidos e parâmetro novo na RPC. O
--   texto humano continua no `pedido` (é o que a Caixa cita); os dados
--   são o que a folha do Acompanhamento aplica com um toque. A RPC muda
--   de assinatura (parâmetro novo com default): drop + create, grants
--   repostos.
--
-- Correr DEPOIS da 073. Idempotente.
-- ============================================================================

-- ── A1 · as colunas da assinatura da casa ──────────────────────────────────
alter table public.documentos
  add column if not exists assinado_casa_em  timestamptz,
  add column if not exists assinado_casa_por text;

-- ── B1 · os dados estruturados do pedido ───────────────────────────────────
alter table public.questionario_pedidos
  add column if not exists dados jsonb;

-- ── A2 · a projecção do documento com a assinatura da casa ─────────────────
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

-- ── B2 · o pedido de alteração aceita dados estruturados ───────────────────
-- A assinatura muda (parâmetro novo): sai a antiga, entra a nova.
drop function if exists public.dlm_portal_pedir_alteracao_campo(text, text, text);

create or replace function public.dlm_portal_pedir_alteracao_campo(
  p_token  text,
  p_campo  text,
  p_pedido text,
  -- 074 · a morada nova nas cinco partes (rua, numero, andar,
  -- codigoPostal, localidade) — o que a folha aplica num toque. NULL
  -- nos pedidos de texto livre; nunca substitui o `pedido` humano.
  p_dados  jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_steps  jsonb;
  v_campo  jsonb;
  v_nome   text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  if length(btrim(coalesce(p_pedido, ''))) < 3 then
    return jsonb_build_object('estado', 'pedido_vazio');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select et.steps into v_steps
    from public.event_types et where et.id = v_ev.event_type_id;

  select campo.valor into v_campo
    from jsonb_array_elements(coalesce(v_steps, '[]'::jsonb)) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields', '[]'::jsonb)) as campo(valor)
   where campo.valor->>'id' = p_campo
   limit 1;

  if v_campo is null then
    return jsonb_build_object('estado', 'campo_desconhecido');
  end if;

  -- Um pedido por atender e por campo. Carregar duas vezes não faz dois.
  if exists (
    select 1 from public.questionario_pedidos
     where submission_id = v_ev.id and campo_id = p_campo
       and respondido_em is null
  ) then
    return jsonb_build_object('estado', 'ja_pedido');
  end if;

  insert into public.questionario_pedidos
    (submission_id, campo_id, campo_label, pedido, dados)
  values
    (v_ev.id, p_campo, coalesce(v_campo->>'label', p_campo), btrim(p_pedido),
     p_dados);

  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;
  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('questionario_pedido',
     coalesce(v_nome, 'A cliente') || ' pediu uma alteração ao questionário',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('campo', coalesce(v_campo->>'label', p_campo),
                        'mensagem', btrim(p_pedido)));

  return jsonb_build_object('estado', 'ok');
end
$$;

revoke all     on function public.dlm_portal_pedir_alteracao_campo(text, text, text, jsonb) from public;
grant  execute on function public.dlm_portal_pedir_alteracao_campo(text, text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 1 · Assinar pela casa um contrato TRANCADO não rebenta:
--   update documentos set assinado_casa_em = now(), assinado_casa_por = 'Nádia Schultz'
--    where tipo='contrato' and submission_id='<EVENTO>'::uuid;
--   -- Esperado: OK (o tranco guarda dados/assinado_em/trancado_em, não isto).
--   E mexer no conteúdo continua proibido:
--   update documentos set dados = dados || '{"x":1}'::jsonb where tipo='contrato' and submission_id='<EVENTO>'::uuid;
--   -- Esperado: ERRO «DOCUMENTO_TRANCADO».

-- 2 · A projecção traz a assinatura da casa:
--   select public.dlm_portal_ver_documento('<TOKEN>','contrato')->'assinatura_casa';

-- 3 · O pedido estruturado grava:
--   select public.dlm_portal_pedir_alteracao_campo('<TOKEN>','<CAMPO_MORADA>',
--     'Rua Nova, n.º 4, 2745-000 Queluz', '{"rua":"Rua Nova","numero":"4","codigoPostal":"2745-000","localidade":"Queluz"}'::jsonb);
--   select dados from questionario_pedidos order by pedido_em desc limit 1;

-- 4 · A invariante de sempre: nenhum id de evento sai pelas funções.
