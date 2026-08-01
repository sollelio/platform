-- ============================================================================
-- 064 · Questionário — a autoria dos dois lados, e o valor de antes
--
-- Dois buracos que só aparecem ao construir os ecrãs 6 e 7 do desenho.
--
-- 1 · A MARCA «ACTUALIZADO PELA EQUIPA» NUNCA APARECERIA. A 062 criou a
--     tabela da autoria e a 063 escreve-lhe quando a CLIENTE responde pelo
--     portal — mas quando a Nádia corrige uma resposta no briefing não
--     ficava registo nenhum. `por_equipa` era sempre falso, e o ecrã que o
--     desenho pede para esse caso era código morto à nascença.
--
--     Passa a ficar registo, e só quando o valor MUDA MESMO. Gravar o
--     briefing sem mexer em nada não pode marcar tudo.
--
-- 2 · O DESENHO MOSTRA O VALOR ANTIGO. «Antes dizia: três arranjos altos,
--     em tons escuros», riscado. A coluna existe desde a 062; faltava sair
--     na projecção.
--
-- A função da secção 1 é CÓPIA FIEL da 038 com um bloco acrescentado antes
-- do update — foi gerada a partir do texto original, não reescrita à mão.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O briefing passa a deixar rasto ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submissao_fundir_respostas(
  p_id uuid,
  p_patch jsonb,
  p_colunas jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_linha submissions;
begin
  -- ── AUTORIA (064) ────────────────────────────────────────────────────
  -- Uma linha de trilho por chave que MUDA MESMO de valor. A condição
  -- `is distinct from` não é zelo: sem ela, gravar o briefing sem mexer em
  -- nada marcava todas as respostas como «actualizado pela equipa», e a
  -- cliente abria o questionário com uma marca em cima de cada linha — o
  -- oposto do que o desenho pede, que é marca nenhuma na maioria delas.
  insert into public.respostas_autoria
    (submission_id, campo_id, autor, autor_id, valor_anterior)
  select p_id, par.key, 'equipa', auth.uid(), s.respostas -> par.key
    from public.submissions s
    cross join lateral jsonb_each(coalesce(p_patch, '{}'::jsonb)) as par(key, value)
   where s.id = p_id
     and (s.respostas -> par.key) is distinct from par.value;

  update submissions set
    respostas = coalesce(respostas, '{}'::jsonb)
                || coalesce(p_patch, '{}'::jsonb),

    -- data do evento (date)
    data_evento = case when p_colunas ? 'data_evento' then dlm_safe_date(dlm_txt(p_colunas, 'data_evento')) else data_evento end,

    -- texto
    nome_noivo = case when p_colunas ? 'nome_noivo' then dlm_txt(p_colunas, 'nome_noivo') else nome_noivo end,
    nome_noiva = case when p_colunas ? 'nome_noiva' then dlm_txt(p_colunas, 'nome_noiva') else nome_noiva end,
    contacto_principal = case when p_colunas ? 'contacto_principal' then dlm_txt(p_colunas, 'contacto_principal') else contacto_principal end,
    email = case when p_colunas ? 'email' then dlm_txt(p_colunas, 'email') else email end,
    morada = case when p_colunas ? 'morada' then dlm_txt(p_colunas, 'morada') else morada end,
    local_evento = case when p_colunas ? 'local_evento' then dlm_txt(p_colunas, 'local_evento') else local_evento end,
    recolha_dia_seguinte = case when p_colunas ? 'recolha_dia_seguinte' then dlm_txt(p_colunas, 'recolha_dia_seguinte') else recolha_dia_seguinte end,
    nome_responsavel = case when p_colunas ? 'nome_responsavel' then dlm_txt(p_colunas, 'nome_responsavel') else nome_responsavel end,
    contacto_responsavel = case when p_colunas ? 'contacto_responsavel' then dlm_txt(p_colunas, 'contacto_responsavel') else contacto_responsavel end,
    relacao_responsavel = case when p_colunas ? 'relacao_responsavel' then dlm_txt(p_colunas, 'relacao_responsavel') else relacao_responsavel end,
    estilo_outro = case when p_colunas ? 'estilo_outro' then dlm_txt(p_colunas, 'estilo_outro') else estilo_outro end,
    paleta_observacoes = case when p_colunas ? 'paleta_observacoes' then dlm_txt(p_colunas, 'paleta_observacoes') else paleta_observacoes end,
    cartoes_pratos = case when p_colunas ? 'cartoes_pratos' then dlm_txt(p_colunas, 'cartoes_pratos') else cartoes_pratos end,
    observacoes_cartoes = case when p_colunas ? 'observacoes_cartoes' then dlm_txt(p_colunas, 'observacoes_cartoes') else observacoes_cartoes end,
    descricao_mesa_noivos = case when p_colunas ? 'descricao_mesa_noivos' then dlm_txt(p_colunas, 'descricao_mesa_noivos') else descricao_mesa_noivos end,
    descricao_cenario = case when p_colunas ? 'descricao_cenario' then dlm_txt(p_colunas, 'descricao_cenario') else descricao_cenario end,
    medidas_espaco = case when p_colunas ? 'medidas_espaco' then dlm_txt(p_colunas, 'medidas_espaco') else medidas_espaco end,
    formato_mesas = case when p_colunas ? 'formato_mesas' then dlm_txt(p_colunas, 'formato_mesas') else formato_mesas end,
    observacoes_mesas = case when p_colunas ? 'observacoes_mesas' then dlm_txt(p_colunas, 'observacoes_mesas') else observacoes_mesas end,
    texto_principal_placa = case when p_colunas ? 'texto_principal_placa' then dlm_txt(p_colunas, 'texto_principal_placa') else texto_principal_placa end,
    texto_secundario_placa = case when p_colunas ? 'texto_secundario_placa' then dlm_txt(p_colunas, 'texto_secundario_placa') else texto_secundario_placa end,
    notas_placa = case when p_colunas ? 'notas_placa' then dlm_txt(p_colunas, 'notas_placa') else notas_placa end,
    morada_exacta = case when p_colunas ? 'morada_exacta' then dlm_txt(p_colunas, 'morada_exacta') else morada_exacta end,
    pessoa_abre_espaco = case when p_colunas ? 'pessoa_abre_espaco' then dlm_txt(p_colunas, 'pessoa_abre_espaco') else pessoa_abre_espaco end,
    contacto_pessoa_abre = case when p_colunas ? 'contacto_pessoa_abre' then dlm_txt(p_colunas, 'contacto_pessoa_abre') else contacto_pessoa_abre end,
    notas_acesso = case when p_colunas ? 'notas_acesso' then dlm_txt(p_colunas, 'notas_acesso') else notas_acesso end,
    observacoes_gerais = case when p_colunas ? 'observacoes_gerais' then dlm_txt(p_colunas, 'observacoes_gerais') else observacoes_gerais end,

    -- horas (time)
    hora_inicio = case when p_colunas ? 'hora_inicio' then dlm_safe_time(dlm_txt(p_colunas, 'hora_inicio')) else hora_inicio end,
    hora_termino = case when p_colunas ? 'hora_termino' then dlm_safe_time(dlm_txt(p_colunas, 'hora_termino')) else hora_termino end,
    hora_montagem = case when p_colunas ? 'hora_montagem' then dlm_safe_time(dlm_txt(p_colunas, 'hora_montagem')) else hora_montagem end,
    hora_limite_montagem = case when p_colunas ? 'hora_limite_montagem' then dlm_safe_time(dlm_txt(p_colunas, 'hora_limite_montagem')) else hora_limite_montagem end,
    hora_recolha = case when p_colunas ? 'hora_recolha' then dlm_safe_time(dlm_txt(p_colunas, 'hora_recolha')) else hora_recolha end,

    -- números (integer)
    numero_convidados = case when p_colunas ? 'numero_convidados' then dlm_safe_int(dlm_txt(p_colunas, 'numero_convidados')) else numero_convidados end,
    numero_mesas = case when p_colunas ? 'numero_mesas' then dlm_safe_int(dlm_txt(p_colunas, 'numero_mesas')) else numero_mesas end,
    lugares_por_mesa = case when p_colunas ? 'lugares_por_mesa' then dlm_safe_int(dlm_txt(p_colunas, 'lugares_por_mesa')) else lugares_por_mesa end,

    -- checkboxes (text[])
    estilo_evento = case when p_colunas ? 'estilo_evento' then dlm_txt_array(p_colunas, 'estilo_evento') else estilo_evento end,
    paleta_cores = case when p_colunas ? 'paleta_cores' then dlm_txt_array(p_colunas, 'paleta_cores') else paleta_cores end,
    mesa_noivos = case when p_colunas ? 'mesa_noivos' then dlm_txt_array(p_colunas, 'mesa_noivos') else mesa_noivos end,
    cenario_palco = case when p_colunas ? 'cenario_palco' then dlm_txt_array(p_colunas, 'cenario_palco') else cenario_palco end,
    centros_mesa = case when p_colunas ? 'centros_mesa' then dlm_txt_array(p_colunas, 'centros_mesa') else centros_mesa end,
    tipo_flores = case when p_colunas ? 'tipo_flores' then dlm_txt_array(p_colunas, 'tipo_flores') else tipo_flores end,
    estilo_placa = case when p_colunas ? 'estilo_placa' then dlm_txt_array(p_colunas, 'estilo_placa') else estilo_placa end,
    acesso_local = case when p_colunas ? 'acesso_local' then dlm_txt_array(p_colunas, 'acesso_local') else acesso_local end
  where id = p_id
  returning * into v_linha;

  if not found then
    raise exception 'EVENTO_EM_FALTA';
  end if;

  return to_jsonb(v_linha);
end
$function$;

revoke all on function public.submissao_fundir_respostas(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.submissao_fundir_respostas(uuid, jsonb, jsonb) to authenticated;


-- ─── 2 · A projeccao passa a trazer o valor de antes ────────────────────────
--
-- Copia fiel da 063 com duas alteracoes: o `select` da autoria passa a
-- trazer `valor_anterior`, e a projeccao do campo ganha a chave `antes`.

create or replace function public.dlm_portal_questionario(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- O mínimo de campos para haver questionário. Ver regra 1 no cabeçalho.
  c_min_campos constant integer := 5;

  v_acesso  public.portal_acessos%rowtype;
  v_ev      public.submissions%rowtype;
  v_steps   jsonb;
  v_passos  jsonb := '[]'::jsonb;
  v_passo   record;
  v_campos  jsonb;
  v_campo   record;
  v_grupo   public.questionario_grupos%rowtype;
  v_fecha   date;
  v_fechado boolean;
  v_autoria record;
  v_valor   jsonb;
  v_comecado boolean;
  v_resp    integer;
  v_tot     integer;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select et.steps into v_steps
    from public.event_types et where et.id = v_ev.event_type_id;

  -- Regra 1: modelo magro, não há questionário nenhum a mostrar.
  if public.dlm_questionario_conta_campos(v_steps) < c_min_campos then
    return jsonb_build_object('estado', 'ok', 'mostrar', false);
  end if;

  -- Começado = a cliente já escreveu alguma coisa POR AQUI. Não se lê das
  -- respostas: a captação também lá escreve, e um evento acabado de nascer
  -- apareceria «a meio» sem ninguém lhe ter tocado.
  select exists (
    select 1 from public.respostas_autoria
     where submission_id = v_ev.id and autor = 'cliente'
  ) into v_comecado;

  for v_passo in
    select passo.valor as p, passo.ord as ord
      from jsonb_array_elements(v_steps) with ordinality as passo(valor, ord)
  loop
    -- O grupo de prazo do passo, se estiver marcado.
    v_grupo := null;
    if coalesce(btrim(v_passo.p->>'grupo'), '') <> '' then
      select * into v_grupo from public.questionario_grupos
       where chave = btrim(v_passo.p->>'grupo');
    end if;

    -- Regra 2: sem grupo, ou sem data de evento, não fecha.
    v_fecha   := null;
    v_fechado := false;
    if v_grupo.chave is not null and v_ev.data_evento is not null then
      v_fecha   := v_ev.data_evento - v_grupo.dias_antes;
      v_fechado := v_fecha <= current_date;
    end if;

    v_campos := '[]'::jsonb;
    v_resp   := 0;
    v_tot    := 0;

    for v_campo in
      select campo.valor as c
        from jsonb_array_elements(coalesce(v_passo.p->'fields', '[]'::jsonb))
             as campo(valor)
    loop
      v_valor := coalesce(v_ev.respostas, '{}'::jsonb) -> (v_campo.c->>'id');
      v_tot := v_tot + 1;
      if public.dlm_questionario_respondido(v_valor) then
        v_resp := v_resp + 1;
      end if;

      -- A marca de autoria só aparece quando a ÚLTIMA escrita não foi dela.
      -- A maior parte das respostas é da própria pessoa e não leva marca
      -- nenhuma — encher o ecrã de metadados era o oposto do pedido.
      select autor, escrito_em, valor_anterior into v_autoria
        from public.respostas_autoria
       where submission_id = v_ev.id and campo_id = v_campo.c->>'id'
       order by escrito_em desc
       limit 1;

      v_campos := v_campos || jsonb_build_array(jsonb_build_object(
        'id',          v_campo.c->>'id',
        'label',       v_campo.c->>'label',
        'tipo',        v_campo.c->>'type',
        'obrigatorio', coalesce((v_campo.c->>'required')::boolean, false),
        'ajuda',       v_campo.c->>'placeholder',
        'opcoes',      v_campo.c->'options',
        'valor',       v_valor,
        'por_equipa',  coalesce(v_autoria.autor = 'equipa', false),
        'mudado_em',   case when v_autoria.autor = 'equipa'
                            then v_autoria.escrito_em else null end,
        -- «Antes dizia: …», riscado. Só sai quando foi a equipa a mexer:
        -- mostrar-lhe o que ELA própria lá tinha antes não é transparência,
        -- é ruído — e a maioria das respostas é dela.
        'antes',       case when v_autoria.autor = 'equipa'
                            then v_autoria.valor_anterior else null end));
    end loop;

    v_passos := v_passos || jsonb_build_array(jsonb_build_object(
      'ordem',      v_passo.ord,
      'titulo',     v_passo.p->>'title',
      'subtitulo',  v_passo.p->>'subtitle',
      'campos',     v_campos,
      'total',      v_tot,
      'respondidos', v_resp,
      'grupo',      case when v_grupo.chave is null then null
                         else jsonb_build_object(
                                'chave',  v_grupo.chave,
                                'rotulo', v_grupo.rotulo,
                                'porque', v_grupo.porque) end,
      'fecha_em',   v_fecha,
      'fechado',    v_fechado));
  end loop;

  return jsonb_build_object(
    'estado',      'ok',
    'mostrar',     true,
    'entregue_em', v_ev.questionario_entregue_em,
    'comecado',    v_comecado,
    'passos',      v_passos,
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'campo',      q.campo_id,
               'campo_nome', q.campo_label,
               'pedido',     q.pedido,
               'quando',     q.pedido_em,
               'respondido', q.respondido_em is not null)
             order by q.pedido_em desc)
        from public.questionario_pedidos q
       where q.submission_id = v_ev.id), '[]'::jsonb));
end
$$;

revoke all     on function public.dlm_portal_questionario(text) from public;
grant  execute on function public.dlm_portal_questionario(text) to anon, authenticated;


-- ============================================================================
-- 3 · VERIFICACAO — correr depois, em TESTE
-- ============================================================================

-- 3.1 · Gravar o briefing SEM mudar nada nao deixa rasto nenhum:
--   Abre um evento no backoffice, entra na edicao do briefing e grava sem
--   tocar em campo nenhum.
--   select count(*) from respostas_autoria where autor = 'equipa';
--   -- Esperado: o MESMO numero de antes. Se subir, o `is distinct from`
--   -- nao esta a filtrar, e a cliente vai ver marcas em todas as respostas.

-- 3.2 · Mudar uma resposta no briefing deixa uma linha, com o valor antigo:
--   select campo_id, autor, valor_anterior, escrito_em
--     from respostas_autoria order by escrito_em desc limit 1;

-- 3.3 · E a cliente ve a marca, com o antes:
--   select c.c
--     from jsonb_array_elements(
--            public.dlm_portal_questionario('<TOKEN>')->'passos') as p(v)
--     cross join lateral jsonb_array_elements(p.v->'campos') as c(c)
--    where (c.c->>'por_equipa')::boolean;

-- 3.4 · Uma resposta escrita pela CLIENTE nao traz marca nenhuma:
--   select public.dlm_portal_responder('<TOKEN>','<CAMPO>','\"x\"'::jsonb);
--   -- na projeccao, esse campo fica com por_equipa=false e antes=null.

-- 3.5 · 🔴 A invariante, outra vez (a funcao mudou):
--   select public.dlm_portal_questionario('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Esperado: FALSE.
