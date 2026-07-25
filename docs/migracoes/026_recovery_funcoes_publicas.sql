-- ============================================================
-- 026 — Migração de recuperação: versiona as funções `public` que já
-- existiam na base de dados mas nunca tinham ficado no repositório
-- (foram todas criadas directamente no editor SQL do Supabase, nas
-- migrações 010/011/013/016 não guardadas).
--
-- Não muda comportamento nenhum — é `create or replace function` do
-- que já está em produção, byte a byte. Auditado em 2026-07-24 via
--   select proname, pg_get_functiondef(oid)
--   from pg_proc where pronamespace = 'public'::regnamespace
--   order by proname;
-- corrido em TESTE e PRODUÇÃO: as 15 funções abaixo são IDÊNTICAS nos
-- dois ambientes, sem deriva nenhuma. Isto é o que existia ANTES da
-- 025 (pagamentos) — o objectivo é só ter uma cópia de recuperação no
-- repositório, não introduzir nada novo.
--
-- Relevante para o módulo de pagamentos: `importar_cliente` (perto do
-- fim deste ficheiro) é a função que vai precisar de um loop novo para
-- também escrever em `pagamentos` — ver docs/migracoes/025_pagamentos.sql
-- e a nota em executar.js sobre `registoDoEvento`. Ainda por fazer,
-- numa migração à parte, só depois da reconciliação (fase 1.5) validada.
-- ============================================================

CREATE OR REPLACE FUNCTION public._ajustar_registo(alvo regclass, registo jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    jsonb_object_agg(
      e.key,
      case
        -- string onde a coluna é array → [string]
        when att.attndims > 0 and jsonb_typeof(e.value) = 'string'
          then jsonb_build_array(e.value)
        -- array onde a coluna é texto simples → "a, b, c"
        when coalesce(att.attndims, 0) = 0
             and jsonb_typeof(e.value) = 'array'
             and att.atttypid in ('text'::regtype, 'character varying'::regtype)
          then to_jsonb((
            select string_agg(x, ', ')
            from jsonb_array_elements_text(e.value) x
          ))
        else e.value
      end
    ),
    '{}'::jsonb
  )
  from jsonb_each(registo) e
  left join pg_attribute att
    on att.attrelid = alvo
   and att.attname = e.key
   and att.attnum > 0
   and not att.attisdropped;
$function$;

CREATE OR REPLACE FUNCTION public.captacao_dedupe(p_digitos text, p_data date DEFAULT NULL::date)
 RETURNS TABLE(cliente_id uuid, evento_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_digitos text := right(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g'), 9);
  v_cliente uuid;
  v_evento uuid;
begin
  -- Sem dígitos suficientes, não há deduplicação possível
  if length(v_digitos) < 9 then
    return;
  end if;

  -- 1) Cliente com o mesmo telefone: compara o contacto da ficha E
  --    o numeroWhatsapp/contactoPrincipal guardados nos eventos.
  select c.id into v_cliente
  from public.clientes c
  where right(regexp_replace(coalesce(c.contacto, ''), '\D', '', 'g'), 9) = v_digitos
  limit 1;

  if v_cliente is null then
    select s.cliente_id into v_cliente
    from public.submissions s
    where s.cliente_id is not null
      and (
        right(regexp_replace(coalesce(s.respostas->>'numeroWhatsapp', ''), '\D', '', 'g'), 9) = v_digitos
        or right(regexp_replace(coalesce(s.respostas->>'contactoPrincipal', ''), '\D', '', 'g'), 9) = v_digitos
      )
    limit 1;
  end if;

  if v_cliente is null then
    return;
  end if;

  -- 2) Evento VIVO do mesmo cliente na mesma data (trava o duplo envio)
  if p_data is not null then
    select s.id into v_evento
    from public.submissions s
    where s.cliente_id = v_cliente
      and s.data_evento = p_data
      and coalesce(s.fase, '') <> 'perdido'
      and coalesce(s.status, '') <> 'Concluído'
    limit 1;
  end if;

  cliente_id := v_cliente;
  evento_id := v_evento;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.captacao_submeter(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome text := dlm_txt(p_payload, 'nome');
  v_contacto text := dlm_txt(p_payload, 'contacto');
  v_whatsapp text := dlm_txt(p_payload, 'whatsapp');
  v_data date := dlm_safe_date(dlm_txt(p_payload, 'dataEvento'));
  v_numeros text[];
  v_numero text;
  v_hit_cliente uuid;
  v_hit_evento uuid;
  v_cliente_id uuid;
  v_reutilizado boolean := false;
  v_sub submissions%rowtype;
begin
  if v_nome is null then
    raise exception 'NOME_OBRIGATORIO';
  end if;

  -- Dedupe pelo telefone (whatsapp + contacto, cada um por si), com a
  -- função da migração 019. Se ela não existir, segue sem dedupe —
  -- a mesma resiliência do código antigo.
  select coalesce(array_agg(distinct n), '{}'::text[]) into v_numeros
    from unnest(array[v_whatsapp, v_contacto]) n
   where n is not null;

  foreach v_numero in array v_numeros loop
    v_hit_cliente := null;
    v_hit_evento := null;
    begin
      select cliente_id, evento_id into v_hit_cliente, v_hit_evento
        from captacao_dedupe(p_digitos => v_numero, p_data => v_data)
       limit 1;
    exception when others then
      v_hit_cliente := null;
      v_hit_evento := null;
    end;
    if v_hit_evento is not null then
      -- Mesmo telefone + mesma data com evento vivo: devolve o
      -- existente (mata o duplo clique e o reenvio).
      return jsonb_build_object('id', v_hit_evento, 'duplicado', true);
    end if;
    if v_hit_cliente is not null then
      v_cliente_id := v_hit_cliente;
      v_reutilizado := true;
      exit;
    end if;
  end loop;

  if v_cliente_id is null then
    insert into clientes (nome, contacto)
    values (v_nome, v_contacto)
    returning id into v_cliente_id;
  end if;

  insert into submissions
    (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas)
  values (
    v_cliente_id,
    'interessado',
    dlm_safe_uuid(dlm_txt(p_payload, 'eventTypeId')),
    v_data,
    dlm_safe_int(dlm_txt(p_payload, 'numeroConvidados')),
    coalesce(p_payload -> 'respostas', '{}'::jsonb))
  returning * into v_sub;

  return to_jsonb(v_sub)
    || case when v_reutilizado
         then jsonb_build_object('clienteReutilizado', true)
         else '{}'::jsonb end;
end
$function$;

CREATE OR REPLACE FUNCTION public.dlm_notificar_captacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    if coalesce(new.fase, '') <> 'interessado' then
      return new;
    end if;

    -- authenticated (a Nádia a transcrever uma conversa) não se
    -- auto-notifica; tudo o resto (anon = o site público, ou sem
    -- sessão nenhuma — SQL directo/testes) notifica.
    if auth.role() = 'authenticated' then
      return new;
    end if;

    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values (
      'captacao',
      coalesce(
        new.respostas ->> 'nomeDoCliente',
        new.respostas ->> 'nomeResponsavel',
        'Novo interessado'),
      new.id,
      new.cliente_id,
      new.event_type_id,
      jsonb_build_object(
        'respostas', coalesce(new.respostas, '{}'::jsonb),
        'data_evento', new.data_evento,
        'numero_convidados', new.numero_convidados));
  exception when others then
    raise warning 'dlm_notificar_captacao falhou para submission %: % (sqlstate %)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.dlm_safe_date(t text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$ begin return t::date; exception when others then return null; end $function$;

CREATE OR REPLACE FUNCTION public.dlm_safe_int(t text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$ begin return t::integer; exception when others then return null; end $function$;

CREATE OR REPLACE FUNCTION public.dlm_safe_time(t text)
 RETURNS time without time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$ begin return t::time; exception when others then return null; end $function$;

CREATE OR REPLACE FUNCTION public.dlm_safe_uuid(t text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$ begin return t::uuid; exception when others then return null; end $function$;

CREATE OR REPLACE FUNCTION public.dlm_txt(v jsonb, k text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select nullif(btrim(coalesce(v ->> k, '')), '') $function$;

CREATE OR REPLACE FUNCTION public.dlm_txt_array(v jsonb, k text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if v -> k is null or jsonb_typeof(v -> k) <> 'array' then
    return null;
  end if;
  return array(select jsonb_array_elements_text(v -> k));
exception when others then
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION public.documentos_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.formulario_briefing(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
           'submission', to_jsonb(s),
           'event_type', to_jsonb(et))
    from submissions s
    left join event_types et on et.id = s.event_type_id
   where s.id = p_id
$function$;

CREATE OR REPLACE FUNCTION public.formulario_submeter(p_codigo text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invite invites%rowtype;
  v_resp jsonb := coalesce(p_payload -> 'respostas', '{}'::jsonb);
  v_atual jsonb;
  v_submission_id uuid;
  v_cliente_id uuid;
  v_noivo text;
  v_noiva text;
  v_nome text;
begin
  select * into v_invite
    from invites
   where code = upper(btrim(p_codigo))
   for update;
  if not found then
    raise exception 'CONVITE_INVALIDO';
  end if;
  if v_invite.status = 'Preenchido' then
    raise exception 'CONVITE_JA_USADO';
  end if;

  if v_invite.submission_alvo_id is not null then
    -- Onboarding apontado a um evento existente: merge nas respostas
    -- (nada do que já lá vive se perde) + escrita nas colunas antigas
    -- equivalentes (dupla fonte, o mesmo padrão do drawer). Cada campo
    -- só é tocado se veio nas respostas novas; vazio grava null.
    select respostas into v_atual
      from submissions
     where id = v_invite.submission_alvo_id
     for update;
    if not found then
      raise exception 'EVENTO_ALVO_EM_FALTA';
    end if;

    update submissions set
      respostas = coalesce(v_atual, '{}'::jsonb) || v_resp,
      event_type_id = coalesce(
        dlm_safe_uuid(dlm_txt(p_payload, 'event_type_id')), event_type_id),
      data_evento = coalesce(
        dlm_safe_date(dlm_txt(p_payload, 'data_evento')), data_evento),
      -- fase NÃO é tocada (é a Nádia que a gere no funil)

      numero_convidados = case when v_resp ? 'numeroConvidados'
        then dlm_safe_int(dlm_txt(v_resp, 'numeroConvidados'))
        else numero_convidados end,

      -- texto
      nome_noivo = case when v_resp ? 'nomeNoivo' then dlm_txt(v_resp, 'nomeNoivo') else nome_noivo end,
      nome_noiva = case when v_resp ? 'nomeNoiva' then dlm_txt(v_resp, 'nomeNoiva') else nome_noiva end,
      contacto_principal = case when v_resp ? 'contactoPrincipal' then dlm_txt(v_resp, 'contactoPrincipal') else contacto_principal end,
      email = case when v_resp ? 'email' then dlm_txt(v_resp, 'email') else email end,
      morada = case when v_resp ? 'morada' then dlm_txt(v_resp, 'morada') else morada end,
      local_evento = case when v_resp ? 'localEvento' then dlm_txt(v_resp, 'localEvento') else local_evento end,
      recolha_dia_seguinte = case when v_resp ? 'recolhaDiaSeguinte' then dlm_txt(v_resp, 'recolhaDiaSeguinte') else recolha_dia_seguinte end,
      nome_responsavel = case when v_resp ? 'nomeResponsavel' then dlm_txt(v_resp, 'nomeResponsavel') else nome_responsavel end,
      contacto_responsavel = case when v_resp ? 'contactoResponsavel' then dlm_txt(v_resp, 'contactoResponsavel') else contacto_responsavel end,
      relacao_responsavel = case when v_resp ? 'relacaoResponsavel' then dlm_txt(v_resp, 'relacaoResponsavel') else relacao_responsavel end,
      estilo_outro = case when v_resp ? 'estiloOutro' then dlm_txt(v_resp, 'estiloOutro') else estilo_outro end,
      paleta_observacoes = case when v_resp ? 'paletaObservacoes' then dlm_txt(v_resp, 'paletaObservacoes') else paleta_observacoes end,
      cartoes_pratos = case when v_resp ? 'cartoesPratos' then dlm_txt(v_resp, 'cartoesPratos') else cartoes_pratos end,
      observacoes_cartoes = case when v_resp ? 'observacoesCartoes' then dlm_txt(v_resp, 'observacoesCartoes') else observacoes_cartoes end,
      descricao_mesa_noivos = case when v_resp ? 'descricaoMesaNoivos' then dlm_txt(v_resp, 'descricaoMesaNoivos') else descricao_mesa_noivos end,
      descricao_cenario = case when v_resp ? 'descricaoCenario' then dlm_txt(v_resp, 'descricaoCenario') else descricao_cenario end,
      medidas_espaco = case when v_resp ? 'medidasEspaco' then dlm_txt(v_resp, 'medidasEspaco') else medidas_espaco end,
      formato_mesas = case when v_resp ? 'formatoMesas' then dlm_txt(v_resp, 'formatoMesas') else formato_mesas end,
      observacoes_mesas = case when v_resp ? 'observacoesMesas' then dlm_txt(v_resp, 'observacoesMesas') else observacoes_mesas end,
      texto_principal_placa = case when v_resp ? 'textoPrincipalPlaca' then dlm_txt(v_resp, 'textoPrincipalPlaca') else texto_principal_placa end,
      texto_secundario_placa = case when v_resp ? 'textoSecundarioPlaca' then dlm_txt(v_resp, 'textoSecundarioPlaca') else texto_secundario_placa end,
      notas_placa = case when v_resp ? 'notasPlaca' then dlm_txt(v_resp, 'notasPlaca') else notas_placa end,
      morada_exacta = case when v_resp ? 'moradaExacta' then dlm_txt(v_resp, 'moradaExacta') else morada_exacta end,
      pessoa_abre_espaco = case when v_resp ? 'pessoaAbreEspaco' then dlm_txt(v_resp, 'pessoaAbreEspaco') else pessoa_abre_espaco end,
      contacto_pessoa_abre = case when v_resp ? 'contactoPessoaAbre' then dlm_txt(v_resp, 'contactoPessoaAbre') else contacto_pessoa_abre end,
      notas_acesso = case when v_resp ? 'notasAcesso' then dlm_txt(v_resp, 'notasAcesso') else notas_acesso end,
      observacoes_gerais = case when v_resp ? 'observacoesGerais' then dlm_txt(v_resp, 'observacoesGerais') else observacoes_gerais end,

      -- horas (time)
      hora_inicio = case when v_resp ? 'horaInicio' then dlm_safe_time(dlm_txt(v_resp, 'horaInicio')) else hora_inicio end,
      hora_termino = case when v_resp ? 'horaTermino' then dlm_safe_time(dlm_txt(v_resp, 'horaTermino')) else hora_termino end,
      hora_montagem = case when v_resp ? 'horaMontagem' then dlm_safe_time(dlm_txt(v_resp, 'horaMontagem')) else hora_montagem end,
      hora_limite_montagem = case when v_resp ? 'horaLimiteMontagem' then dlm_safe_time(dlm_txt(v_resp, 'horaLimiteMontagem')) else hora_limite_montagem end,
      hora_recolha = case when v_resp ? 'horaRecolha' then dlm_safe_time(dlm_txt(v_resp, 'horaRecolha')) else hora_recolha end,

      -- números (integer)
      numero_mesas = case when v_resp ? 'numeroMesas' then dlm_safe_int(dlm_txt(v_resp, 'numeroMesas')) else numero_mesas end,
      lugares_por_mesa = case when v_resp ? 'lugaresporMesa' then dlm_safe_int(dlm_txt(v_resp, 'lugaresporMesa')) else lugares_por_mesa end,

      -- checkboxes (text[])
      estilo_evento = case when v_resp ? 'estiloEvento' then dlm_txt_array(v_resp, 'estiloEvento') else estilo_evento end,
      paleta_cores = case when v_resp ? 'paletaCores' then dlm_txt_array(v_resp, 'paletaCores') else paleta_cores end,
      mesa_noivos = case when v_resp ? 'mesaNoivos' then dlm_txt_array(v_resp, 'mesaNoivos') else mesa_noivos end,
      cenario_palco = case when v_resp ? 'cenarioPalco' then dlm_txt_array(v_resp, 'cenarioPalco') else cenario_palco end,
      centros_mesa = case when v_resp ? 'centrosMesa' then dlm_txt_array(v_resp, 'centrosMesa') else centros_mesa end,
      tipo_flores = case when v_resp ? 'tipoFlores' then dlm_txt_array(v_resp, 'tipoFlores') else tipo_flores end,
      estilo_placa = case when v_resp ? 'estiloPlaca' then dlm_txt_array(v_resp, 'estiloPlaca') else estilo_placa end,
      acesso_local = case when v_resp ? 'acessoLocal' then dlm_txt_array(v_resp, 'acessoLocal') else acesso_local end
    where id = v_invite.submission_alvo_id;

    v_submission_id := v_invite.submission_alvo_id;

  else
    -- Convite sem alvo: cria CLIENTE + EVENTO ligados (fase "cliente").
    -- Extração do nome com a prioridade da migração 011.
    v_noivo := dlm_txt(v_resp, 'nomeNoivo');
    v_noiva := dlm_txt(v_resp, 'nomeNoiva');
    v_nome := coalesce(
      nullif(concat_ws(' & ', v_noivo, v_noiva), ''),
      dlm_txt(v_resp, 'nomeDoCliente'),
      dlm_txt(v_resp, 'nomeResponsavel'),
      'Cliente sem nome');

    insert into clientes (nome, contacto, email, morada)
    values (
      v_nome,
      dlm_txt(v_resp, 'contactoPrincipal'),
      dlm_txt(v_resp, 'email'),
      dlm_txt(v_resp, 'morada'))
    returning id into v_cliente_id;

    insert into submissions
      (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas)
    values (
      v_cliente_id,
      'cliente',
      dlm_safe_uuid(dlm_txt(p_payload, 'event_type_id')),
      dlm_safe_date(dlm_txt(p_payload, 'data_evento')),
      dlm_safe_int(dlm_txt(p_payload, 'numero_convidados')),
      v_resp)
    returning id into v_submission_id;
  end if;

  -- Marca o convite e converte a reserva de origem — na MESMA transação.
  update invites
     set status = 'Preenchido', submission_id = v_submission_id
   where id = v_invite.id;

  if v_invite.reserva_id is not null then
    update reservas
       set estado = 'Convertida', submission_id = v_submission_id
     where id = v_invite.reserva_id;
  end if;

  return jsonb_build_object('id', v_submission_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.formulario_validar_convite(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select to_jsonb(i)
    || jsonb_build_object(
         'event_types',
         (select jsonb_build_object(
                   'nome', et.nome, 'steps', et.steps, 'icone', et.icone)
            from event_types et
           where et.id = i.event_type_id),
         'alvo_dados',
         (select jsonb_build_object(
                   'respostas', s.respostas,
                   'data_evento', s.data_evento,
                   'numero_convidados', s.numero_convidados)
            from submissions s
           where s.id = i.submission_alvo_id)
       )
    from invites i
   where i.code = upper(btrim(p_codigo))
   limit 1
$function$;

CREATE OR REPLACE FUNCTION public.importar_cliente(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_cliente_id uuid;
  v_evento jsonb;
  v_doc jsonb;
  v_submission_id uuid;
  n_eventos int := 0;
  n_docs int := 0;
  n_forms int := 0;
begin
  if nullif(payload->>'cliente_existente_id', '') is not null then
    v_cliente_id := (payload->>'cliente_existente_id')::uuid;
  else
    insert into clientes
    select * from jsonb_populate_record(
      null::clientes,
      public._ajustar_registo(
        'public.clientes'::regclass,
        jsonb_build_object('id', gen_random_uuid(), 'created_at', now())
          || (payload->'cliente')
      )
    )
    returning id into v_cliente_id;
  end if;

  for v_evento in
    select value from jsonb_array_elements(coalesce(payload->'eventos', '[]'::jsonb))
  loop
    insert into submissions
    select * from jsonb_populate_record(
      null::submissions,
      public._ajustar_registo(
        'public.submissions'::regclass,
        jsonb_build_object(
          'id', gen_random_uuid(),
          'created_at', now(),
          'cliente_id', v_cliente_id
        ) || (v_evento->'registo')
      )
    )
    returning id into v_submission_id;
    n_eventos := n_eventos + 1;

    if coalesce((v_evento->>'formulario_preenchido')::boolean, false)
       and nullif(v_evento->'registo'->>'event_type_id', '') is not null then
      insert into invites (code, event_type_id, data_evento, respostas, status, submission_id)
      values (
        v_evento->>'code',
        (v_evento->'registo'->>'event_type_id')::uuid,
        nullif(v_evento->'registo'->>'data_evento', '')::date,
        '{}'::jsonb,
        'Preenchido',
        v_submission_id
      );
      n_forms := n_forms + 1;
    end if;

    for v_doc in
      select value from jsonb_array_elements(coalesce(v_evento->'documentos', '[]'::jsonb))
    loop
      insert into documentos (tipo, submission_id, dados)
      values (
        v_doc->>'tipo',
        v_submission_id,
        coalesce(v_doc->'dados', '{}'::jsonb)
      );
      n_docs := n_docs + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'eventos', n_eventos,
    'documentos', n_docs,
    'formularios', n_forms
  );
end;
$function$;
