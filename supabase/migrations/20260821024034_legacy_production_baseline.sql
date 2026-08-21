-- =============================================================================
-- Sollelio — legacy production baseline
-- Migration: 20260821024034_legacy_production_baseline.sql
--
-- Purpose
--   First canonical migration of the Sollelio platform. It reconstructs, on a
--   clean Supabase instance, the application schema that is live in PRODUCTION
--   (project sollelio-prod) as audited on 2026-08-21. It is a HISTORICAL
--   STARTING POINT for the Sollelio v2 migration, not the target architecture:
--   legacy Portuguese identifiers are reproduced on purpose and must not be
--   "improved" here. Every change towards Sollelio v2 belongs in later,
--   explicit migrations.
--
-- Provenance
--   * Base text: `supabase db dump` (pg_dump --schema-only) of sollelio-staging,
--     captured 2026-08-21 01:57 UTC, whose public schema was verified object by
--     object against the production catalog capture of 2026-08-21 02:20 UTC.
--   * Patched to the audited production state where staging differs:
--       - public.submissions.status is nullable (no NOT NULL);
--       - check constraints submissions_status_valido and submissions_fase_valida
--         do not exist; submissions_fase_check and submissions_status_pos_sinal do;
--       - invites_submission_id_fkey is ON DELETE SET NULL;
--       - invites.created_at and submissions.created_at default to
--         timezone('utc', now());
--       - the storage bucket "materiais" does not exist in production and is
--         therefore not created (its three storage policies do exist and are kept).
--   * Added because pg_dump does not emit them: storage buckets, storage.objects
--     policies, explicit PUBLIC execute grants, and the default-privilege
--     revocations that make the end state independent of local defaults.
--
-- Scope
--   Schema only. No application rows, no customer data, no auth users, no
--   tenant or membership rows, no secrets. Platform-managed objects (auth,
--   storage internals, realtime internals, vault, graphql) are left to the
--   Supabase runtime; only the application's touch points on them are declared
--   (extensions, bucket rows, storage.objects policies, publication membership).
--
-- Historical archive
--   docs/migracoes/ (020 .. 108) remains the read-only record of how this state
--   was reached; it is not part of the executable migration chain.
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE OR REPLACE FUNCTION "public"."_ajustar_registo"("alvo" "regclass", "registo" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."_ajustar_registo"("alvo" "regclass", "registo" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_minhas_casas"() RETURNS TABLE("slug" "text", "nome" "text", "estado" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.slug, t.nome, t.estado
    from public.tenants t
    join public.memberships m on m.tenant_id = t.id
   where m.user_id = auth.uid()
   order by m.criado_em;
$$;


ALTER FUNCTION "public"."as_minhas_casas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."briefing_materiais"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', em.id,
        'nome', m.nome,
        'categoria', m.categoria,
        'unidade', m.unidade,
        'quantidade', em.quantidade,
        'cores', em.cores,
        'observacoes', em.observacoes,
        'lista_carga', em.lista_carga,
        'lista_montagem', em.lista_montagem,
        'lista_higienizacao', em.lista_higienizacao
      )
      order by m.categoria, m.ordem nulls last, m.nome
    ),
    '[]'::jsonb
  )
  from public.evento_materiais em
  join public.materiais m on m.id = em.material_id
  where em.submission_id = p_id;
$$;


ALTER FUNCTION "public"."briefing_materiais"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campanha_publica"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'estado', c.estado,
    'pct', least(
      100,
      coalesce(round(100 * soma.total / c.objetivo), 0)
    ),
    'pessoas', coalesce(soma.pessoas, 0),
    'mensagem', c.mensagem,
    'como_contribuir', c.como_contribuir,
    'tipo_evento', et.nome,
    'data_evento', s.data_evento
  )
  from campanhas c
  join submissions s on s.id = c.submission_id
  left join event_types et on et.id = s.event_type_id
  left join lateral (
    select
      sum(p.valor) as total,
      -- pessoas como o admin as conta: nomes distintos + anónimos um a
      -- um. O filtro de "nomeado" é a truthiness do JS (não-null e
      -- não-'' CRUS): um nome só de espaços é nomeado no admin e
      -- colapsa para '' no lower(trim(...)) — aqui igual.
      count(distinct lower(trim(p.contribuinte)))
        filter (where p.contribuinte is not null and p.contribuinte <> '')
      + count(distinct coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text)
        filter (where p.contribuinte is null or p.contribuinte = '')
      as pessoas
    from pagamentos p
    where p.campanha_id = c.id
      and p.origem = 'contribuicao'
  ) soma on true
  where c.token = p_token;
$$;


ALTER FUNCTION "public"."campanha_publica"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."captacao_dedupe"("p_digitos" "text", "p_data" "date" DEFAULT NULL::"date", "p_tenant" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("cliente_id" "uuid", "evento_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_digitos text := right(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g'), 9);
  v_cliente uuid;
  v_evento  uuid;
begin
  if length(v_digitos) < 9 or p_tenant is null then
    return;
  end if;

  select c.id into v_cliente
    from public.clientes c
   where c.tenant_id = p_tenant
     and right(regexp_replace(coalesce(c.contacto, ''), '\D', '', 'g'), 9) = v_digitos
   order by c.created_at asc, c.id asc
   limit 1;

  if v_cliente is null then
    select s.cliente_id into v_cliente
      from public.submissions s
      join public.clientes c on c.id = s.cliente_id
     where s.tenant_id = p_tenant
       and s.cliente_id is not null
       and (right(regexp_replace(coalesce(s.respostas->>'numeroWhatsapp', ''), '\D', '', 'g'), 9) = v_digitos
         or right(regexp_replace(coalesce(s.respostas->>'contactoPrincipal', ''), '\D', '', 'g'), 9) = v_digitos)
     order by c.created_at asc, c.id asc
     limit 1;
  end if;

  if v_cliente is null then
    return;
  end if;

  if p_data is not null then
    select s.id into v_evento
      from public.submissions s
     where s.tenant_id = p_tenant
       and s.cliente_id = v_cliente
       and s.data_evento = p_data
       and coalesce(s.fase, '')   <> 'perdido'
       and coalesce(s.status, '') <> 'Concluído'
     order by s.created_at asc, s.id asc
     limit 1;
  end if;

  cliente_id := v_cliente;
  evento_id  := v_evento;
  return next;
end;
$$;


ALTER FUNCTION "public"."captacao_dedupe"("p_digitos" "text", "p_data" "date", "p_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_nome     text := dlm_txt(p_payload, 'nome');
  v_contacto text := dlm_txt(p_payload, 'contacto');
  v_whatsapp text := dlm_txt(p_payload, 'whatsapp');
  v_data     date := dlm_safe_date(dlm_txt(p_payload, 'dataEvento'));
  v_tenant   uuid;
  v_numeros  text[];
  v_numero   text;
  v_hit_cliente uuid;
  v_hit_evento  uuid;
  v_cliente_id  uuid;
  v_reutilizado boolean := false;
  v_sub_id   uuid;
  v_tipo_ok  uuid;
begin
  if p_tenant_slug is null then
    v_tenant := public.tenant_actual();
  elsif auth.uid() is null then
    -- o pedido público: não há membership para confirmar
    v_tenant := public.tenant_por_slug(p_tenant_slug);
  else
    -- 108 · com sessão, o slug tem de ser de uma casa de quem pede. Sem
    -- isto, escrever à mão o slug de outra casa criava lá um interessado.
    v_tenant := public.tenant_do_pedido(p_tenant_slug);
    if v_tenant is null then
      raise exception 'CASA_ERRADA'
        using hint = 'Este endereço não pertence a nenhuma das suas casas.';
    end if;
  end if;

  if v_tenant is null then
    raise exception 'CASA_DESCONHECIDA';
  end if;
  if v_nome is null then
    raise exception 'NOME_OBRIGATORIO';
  end if;

  select et.id into v_tipo_ok
    from public.event_types et
   where et.id = dlm_safe_uuid(dlm_txt(p_payload, 'eventTypeId'))
     and et.tenant_id = v_tenant;

  select coalesce(array_agg(distinct n), '{}'::text[]) into v_numeros
    from unnest(array[v_whatsapp, v_contacto]) n
   where n is not null;

  foreach v_numero in array v_numeros loop
    v_hit_cliente := null;
    v_hit_evento  := null;
    begin
      select cliente_id, evento_id into v_hit_cliente, v_hit_evento
        from public.captacao_dedupe(v_numero, v_data, v_tenant) limit 1;
    exception when others then
      v_hit_cliente := null; v_hit_evento := null;
    end;
    if v_hit_evento is not null then
      return jsonb_build_object('id', v_hit_evento, 'duplicado', true);
    end if;
    if v_hit_cliente is not null then
      v_cliente_id := v_hit_cliente; v_reutilizado := true; exit;
    end if;
  end loop;

  if v_cliente_id is null then
    insert into public.clientes (nome, contacto, tenant_id)
    values (v_nome, v_contacto, v_tenant)
    returning id into v_cliente_id;
  end if;

  insert into public.submissions
    (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas, tenant_id)
  values (
    v_cliente_id, 'interessado', v_tipo_ok, v_data,
    dlm_safe_int(dlm_txt(p_payload, 'numeroConvidados')),
    coalesce(p_payload -> 'respostas', '{}'::jsonb), v_tenant)
  returning id into v_sub_id;

  return jsonb_build_object(
    'id', v_sub_id, 'duplicado', false, 'clienteReutilizado', v_reutilizado);
end
$$;


ALTER FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."casa_do_token_activa"("p_token" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
      from public.portal_acessos a
      join public.submissions s on s.id = a.submission_id
      join public.tenants     t on t.id = s.tenant_id
     where a.token = p_token and t.estado = 'activo');
$$;


ALTER FUNCTION "public"."casa_do_token_activa"("p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."casa_do_token_activa"("p_token" "text") IS 'Guarda para as funções do portal que não passam pelo helper. Não se concede ao anon: quem a chama são funções SECURITY DEFINER, por dentro.';


CREATE OR REPLACE FUNCTION "public"."contribuicao_registar"("p_submission_id" "uuid", "p_valor" numeric, "p_metodo" "text", "p_data" "date", "p_contribuinte" "text" DEFAULT NULL::"text", "p_notas" "text" DEFAULT NULL::"text", "p_intencao_id" "uuid" DEFAULT NULL::"uuid", "p_campanha_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_int campanha_intencoes;
  v_campanha uuid := null;
  -- p_valor deve chegar com 2 casas (o cliente pré-arredonda); o round
  -- aqui é rede de segurança, com half-away-from-zero do numeric.
  v_valor numeric := round(coalesce(p_valor, 0)::numeric, 2);
  v_resto numeric;
  v_previsto record;
  v_pago numeric;
  v_falta numeric;
  v_parte numeric;
  v_partes jsonb := '[]'::jsonb;
  v_linhas jsonb;
begin
  if p_submission_id is null or v_valor <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;
  if p_metodo is null or btrim(p_metodo) = '' then
    raise exception 'METODO_EM_FALTA';
  end if;
  -- reconstituido=false exige data (CHECK da 025) — um registo ao
  -- vivo tem sempre data a sério.
  if p_data is null then
    raise exception 'DATA_EM_FALTA';
  end if;

  -- 1) Reclamar a intenção — o cadeado contra a dupla confirmação.
  --    O join à campanha garante que a promessa pertence MESMO a este
  --    evento; o campanha_id vem DELA (autoritativo).
  --    NOTA: INTENCAO_JA_RESOLVIDA cobre também intenção inexistente
  --    ou de outro evento — casos só alcançáveis por bug de chamada.
  if p_intencao_id is not null then
    update campanha_intencoes i
       set estado = 'confirmada',
           confirmada_em = now()
      from campanhas c
     where i.id = p_intencao_id
       and i.estado = 'pendente'
       and c.id = i.campanha_id
       and c.submission_id = p_submission_id
    returning i.* into v_int;
    if not found then
      raise exception 'INTENCAO_JA_RESOLVIDA';
    end if;
    v_campanha := v_int.campanha_id;
  elsif p_campanha_id is not null then
    -- Registo manual: a campanha indicada tem de ser deste evento.
    -- O ESTADO não se valida de propósito: registar numa campanha
    -- fechada/concluída é um acerto legítimo de backoffice (dinheiro
    -- que chegou tarde), e o histórico da campanha deve recebê-lo.
    select c.id into v_campanha
      from campanhas c
     where c.id = p_campanha_id
       and c.submission_id = p_submission_id;
    if v_campanha is null then
      raise exception 'CAMPANHA_INVALIDA';
    end if;
  end if;

  -- 2) Serializar CONTRIBUIÇÕES do mesmo evento: duas chamadas desta
  --    RPC esperam uma pela outra em vez de calcular ambas sobre o
  --    mesmo retrato. (Os inserts diretos de pagamentos — sinal/
  --    remanescente manuais — não passam por este cadeado; essa
  --    corrida pré-existente fica anotada para outro lote.)
  --    O ORDER BY dá ordem fixa aos locks — sem ele, dois planos
  --    diferentes podiam trancar as linhas por ordens opostas e
  --    deadlockar.
  perform 1
     from pagamentos_previstos
    where submission_id = p_submission_id
    order by id
      for update;

  -- 3) Imputação por ordem, com os números lidos AGORA.
  v_resto := v_valor;
  for v_previsto in
    select id, valor
      from pagamentos_previstos
     where submission_id = p_submission_id
     order by ordem
  loop
    exit when v_resto <= 0;
    select coalesce(sum(valor), 0) into v_pago
      from pagamentos
     where previsto_id = v_previsto.id;
    v_falta := round(v_previsto.valor - v_pago, 2);
    continue when v_falta <= 0;
    v_parte := round(least(v_resto, v_falta), 2);
    v_partes := v_partes
      || jsonb_build_object('previsto_id', v_previsto.id, 'valor', v_parte);
    v_resto := round(v_resto - v_parte, 2);
  end loop;
  -- excedente: para lá do plano inteiro fica sem previsto — o resumo
  -- soma-o na mesma
  if v_resto > 0 then
    v_partes := v_partes
      || jsonb_build_object('previsto_id', null, 'valor', v_resto);
  end if;

  -- 4) As linhas num só INSERT (mesmo created_at — a chave do
  --    agrupamento na UI), já com a campanha dona do dinheiro.
  --    Falhar aqui reverte também o claim do passo 1: tudo ou nada.
  with linhas as (
    insert into pagamentos
      (submission_id, previsto_id, valor, data, metodo, origem,
       contribuinte, notas, reconstituido, intencao_id, campanha_id)
    select p_submission_id,
           (e ->> 'previsto_id')::uuid,
           (e ->> 'valor')::numeric,
           p_data,
           p_metodo,
           'contribuicao',
           coalesce(p_contribuinte, v_int.nome),
           coalesce(p_notas, v_int.mensagem),
           false,
           p_intencao_id,
           v_campanha
      from jsonb_array_elements(v_partes) e
    returning *
  )
  select jsonb_agg(to_jsonb(l)) into v_linhas from linhas l;

  return coalesce(v_linhas, '[]'::jsonb);
end
$$;


ALTER FUNCTION "public"."contribuicao_registar"("p_submission_id" "uuid", "p_valor" numeric, "p_metodo" "text", "p_data" "date", "p_contribuinte" "text", "p_notas" "text", "p_intencao_id" "uuid", "p_campanha_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_out    jsonb := '[]'::jsonb;
  v_step   jsonb;
  v_fields jsonb;
  v_f      jsonb;
begin
  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_fields := '[]'::jsonb;
    for v_f in select * from jsonb_array_elements(v_step->'fields') loop
      if v_f->>'id' = p_id then
        v_f := v_f || p_patch;   -- merge de topo: o patch ganha
      end if;
      v_fields := v_fields || jsonb_build_array(v_f);
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_set(v_step, '{fields}', v_fields));
  end loop;
  return v_out;
end
$$;


ALTER FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") IS 'Funde um patch no campo com o id dado, em todos os passos do modelo.';


CREATE OR REPLACE FUNCTION "public"."dlm_comunicado_publicar"("p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_token text;
begin
  select token into v_token from public.comunicados where id = p_id;
  if not found then
    raise exception 'COMUNICADO_NAO_EXISTE';
  end if;

  -- Republicar depois de retirar devolve o MESMO endereço: quem já tem a
  -- ligação volta a poder abri-la. O endereço é a identidade da folha.
  if v_token is null then
    v_token := public.dlm_token_comunicado();
  end if;

  update public.comunicados
     set token          = v_token,
         publicado_em   = coalesce(publicado_em, now()),
         retirado_em    = null,
         actualizado_em = now()
   where id = p_id;

  return v_token;
end;
$$;


ALTER FUNCTION "public"."dlm_comunicado_publicar"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_comunicado_retirar"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.comunicados
     set retirado_em    = now(),
         actualizado_em = now()
   where id = p_id;
end;
$$;


ALTER FUNCTION "public"."dlm_comunicado_retirar"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_comunicado_ver"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v public.comunicados%rowtype;
begin
  select c.* into v
    from public.comunicados c
    join public.tenants t on t.id = c.tenant_id
   where c.token = p_token
     and c.publicado_em is not null
     and c.retirado_em is null
     and (c.expira_em is null or c.expira_em > now())
     and t.estado = 'activo';                       -- 103 · o delta

  if not found then
    return jsonb_build_object('estado', 'terminado');
  end if;

  update public.comunicados set n_acessos = n_acessos + 1 where id = v.id;

  return jsonb_build_object(
    'estado', 'activo',
    'titulo', v.titulo,
    'subtitulo', v.subtitulo,
    'saudacao', v.saudacao,
    'blocos', v.blocos,
    'registo', v.registo,
    'publicado_em', v.publicado_em);
end
$$;


ALTER FUNCTION "public"."dlm_comunicado_ver"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_dia_estado"("p_data" "date", "p_excluir" "uuid" DEFAULT NULL::"uuid", "p_tenant" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rival  public.submissions%rowtype;
  v_nome   text;
  -- A casa: dita, deduzida, ou da sessão — por esta ordem.
  v_tenant uuid := coalesce(
    p_tenant,
    (select s.tenant_id from public.submissions s where s.id = p_excluir),
    public.tenant_actual()
  );
begin
  if p_data is null or p_data < current_date or v_tenant is null then
    return jsonb_build_object('estado', 'livre');
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and (s.fase in ('contrato', 'cliente', 'projecto')
          or exists (select 1 from public.pagamentos p
                      where p.submission_id = s.id
                        and p.origem = 'sinal'
                        and p.reconstituido = false))
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','tomado','rival_id',v_rival.id,'rival_nome',v_nome);
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and s.dia_guardado_ate is not null
     and s.dia_guardado_ate >= current_date
   order by s.dia_guardado_ate desc, s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','preferencia','rival_id',v_rival.id,
                              'rival_nome',v_nome,'ate',v_rival.dia_guardado_ate);
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and exists (select 1 from public.portal_sinal_confirmacoes psc
                  where psc.submission_id = s.id and psc.anulada_em is null)
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','em_confirmacao','rival_id',v_rival.id,'rival_nome',v_nome);
  end if;

  return jsonb_build_object('estado', 'livre');
end
$$;


ALTER FUNCTION "public"."dlm_dia_estado"("p_data" "date", "p_excluir" "uuid", "p_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_fase_avancar_ate"("p_submission_id" "uuid", "p_fase" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_fase_avancar_ate"("p_submission_id" "uuid", "p_fase" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_out       jsonb := '[]'::jsonb;
  v_step      jsonb;
  v_fields    jsonb;
  v_f         jsonb;
  v_inserido  boolean := false;
begin
  -- Idempotência: se o id já lá está, devolve tal e qual.
  if exists (
    select 1
      from jsonb_array_elements(p_steps) s,
           jsonb_array_elements(s->'fields') f
     where f->>'id' = p_campo->>'id'
  ) then
    return p_steps;
  end if;

  -- Âncora em falta: não inventa lugar. Devolve intacto (o chamador avisa).
  if not exists (
    select 1
      from jsonb_array_elements(p_steps) s,
           jsonb_array_elements(s->'fields') f
     where f->>'id' = p_ancora
  ) then
    return p_steps;
  end if;

  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_fields := '[]'::jsonb;
    for v_f in select * from jsonb_array_elements(v_step->'fields') loop
      if not v_inserido and v_f->>'id' = p_ancora then
        v_fields := v_fields || jsonb_build_array(p_campo);
        v_inserido := true;
      end if;
      v_fields := v_fields || jsonb_build_array(v_f);
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_set(v_step, '{fields}', v_fields));
  end loop;

  return v_out;
end
$$;


ALTER FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") IS 'Insere um campo no steps de um modelo, imediatamente antes de um campo âncora. Idempotente (id já presente = não faz nada) e conservadora (âncora ausente = não faz nada).';


CREATE OR REPLACE FUNCTION "public"."dlm_marcar_preenchido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Só na transição PARA 'Preenchido', e só se ainda não houver carimbo.
  -- Nunca sobrepõe um valor existente: reprocessar não reescreve história.
  if new.status = 'Preenchido'
     and new.preenchido_em is null
     and (tg_op = 'INSERT' or old.status is distinct from 'Preenchido')
  then
    new.preenchido_em := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."dlm_marcar_preenchido"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_marcar_preenchido"() IS 'Carimba invites.preenchido_em na transição para status = Preenchido.';


CREATE OR REPLACE FUNCTION "public"."dlm_notificar_captacao"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."dlm_notificar_captacao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_token text;
  v_data  date;
begin
  select token into v_token
    from public.portal_acessos
   where submission_id = p_submission_id
     and revogado_em is null;

  if found then
    return v_token;
  end if;

  select data_evento into v_data
    from public.submissions
   where id = p_submission_id;

  insert into public.portal_acessos (submission_id, expira_em)
  values (p_submission_id,
          case when v_data is not null
               then greatest((v_data + interval '30 days')::timestamptz,
                             now() + interval '30 days')
               end)
  returning token into v_token;

  return v_token;
end;
$$;


ALTER FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") IS 'Abre (ou devolve) a porta do portal de um evento. Um só acesso vivo por evento. Prazo: 30 dias depois do evento, nunca menos de 30 dias a partir de agora (051). Sem data de evento, fica em aberto e revoga-se à mão.';


CREATE OR REPLACE FUNCTION "public"."dlm_token_portal"() RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;


ALTER FUNCTION "public"."dlm_token_portal"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_token_portal"() IS 'Gera um token opaco para o portal do cliente. 24 bytes aleatórios em base64url. Não deriva do id do evento — reverter é impossível por desenho.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."portal_acessos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "public"."dlm_token_portal"() NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_em" timestamp with time zone,
    "revogado_em" timestamp with time zone,
    "motivo" "text",
    "ultimo_acesso_em" timestamp with time zone,
    "n_acessos" integer DEFAULT 0 NOT NULL,
    "visita_anterior_em" timestamp with time zone,
    CONSTRAINT "portal_acessos_motivo_check" CHECK ((("motivo" IS NULL) OR ("motivo" = ANY (ARRAY['avaliado'::"text", 'prazo'::"text", 'manual'::"text"])))),
    CONSTRAINT "portal_acessos_revogado_com_motivo" CHECK ((("revogado_em" IS NULL) = ("motivo" IS NULL)))
);


ALTER TABLE "public"."portal_acessos" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_acessos" IS 'Uma porta por evento para o portal do cliente. Revogar fecha a porta; não apaga o evento, os documentos nem a avaliação.';


COMMENT ON COLUMN "public"."portal_acessos"."motivo" IS 'Porque é que o acesso foi revogado: prazo · manual · avaliado. ATENÇÃO (066): «avaliado» já NÃO é automático. Estava no plano que o acesso morresse ao gravar a avaliação, e mudou — o portal passa a um estado de despedida que vive até ao fim do prazo. O valor fica disponível para revogação à mão por esse motivo, e mais nada.';


COMMENT ON COLUMN "public"."portal_acessos"."visita_anterior_em" IS 'O acesso ANTES do último. É contra este que a divisão das novidades compara. Roda só quando passam 30 minutos sobre ultimo_acesso_em, para recarregar a página não apagar o que ela acabou de ver.';


CREATE OR REPLACE FUNCTION "public"."dlm_portal_acesso_por_token"("p_token" "text") RETURNS "public"."portal_acessos"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select a.*
    from public.portal_acessos a
    join public.submissions s on s.id = a.submission_id
    join public.tenants     t on t.id = s.tenant_id
   where a.token = p_token
     and length(coalesce(p_token, '')) >= 16
     and a.revogado_em is null
     and (a.expira_em is null or a.expira_em > now())
     -- 103 · a casa suspensa não serve conteúdo. Do lado de lá é
     -- indistinguível de um acesso terminado, e é assim que deve ser: o
     -- motivo da suspensão é entre a casa e a Sollelio, não com a cliente.
     and t.estado = 'activo';
$$;


ALTER FUNCTION "public"."dlm_portal_acesso_por_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text" DEFAULT NULL::"text", "p_versao" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- 086 · A ÚNICA alteração desta migração à função (o resto é cópia
  -- fiel da 083). Os TRÊS actos servem-se da ligação privada: a posse
  -- da ligação é a prova, e a sessão — quando existir — regista-se na
  -- mesma. O bloco que exigia código ao 'assinou' morreu com o véu.
  v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);

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

  -- 086 · Sem sessão, v_sessao.id é NULL e o acto regista-se assim — o
  -- CHECK morreu na peça 3; a prova é a da ligação, com IP e user-agent.
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


ALTER FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text", "p_versao" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_ev      public.submissions%rowtype;
  v_lista   text[];
  v_eixos   jsonb;
  v_fotos   jsonb;
  v_av      public.avaliacoes%rowtype;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;

  -- Regra 1: antes dos três dias, e sem negócio fechado, não há convite.
  if v_ev.data_evento is null
     or v_ev.data_evento + 3 > current_date
     or v_ev.fase not in ('cliente','projecto','contrato') then
    return jsonb_build_object('estado', 'ok', 'convidada', false);
  end if;

  -- Os serviços TAL COMO ESTÃO GUARDADOS. Não se normaliza nem se adivinha:
  -- é o mapa da 066 que conhece os vários nomes do mesmo serviço.
  select coalesce(array_agg(v #>> '{}'), '{}')
    into v_lista
    from jsonb_array_elements(
           case when jsonb_typeof(v_ev.respostas->'servicos') = 'array'
                then v_ev.respostas->'servicos' else '[]'::jsonb end) as t(v);

  -- A ordem sai do mapa, nunca do array do evento — que varia de cliente
  -- para cliente para a mesma compra.
  select jsonb_agg(jsonb_build_object(
           'chave',  e.chave,
           'rotulo', e.rotulo,
           'esquerda', e.ponta_esquerda,
           'direita',  e.ponta_direita,
           'sempre', e.servicos = '{}')
         order by e.ordem)
    into v_eixos
    from public.avaliacao_eixos e
   where e.servicos = '{}' or e.servicos && v_lista;

  -- As fotografias por onde ela escolhe a preferida. Só os URLs — o id da
  -- linha não sai (regra 3).
  select jsonb_agg(jsonb_build_object(
           'pequena', f.url_pequena,
           'grande',  f.url_grande,
           'assunto', f.assunto,
           -- Três estados, e a pastilha só se pinta num deles. Um booleano
           -- fazia a página dizer «com convidados» a toda a fotografia que
           -- ninguém reviu — que é a maioria, e não é verdade.
           'com_convidados', f.publicavel = 'com_convidados',
           'pode_site',      f.publicavel = 'sem_convidados')
         order by f.ordem, f.criado_em)
    into v_fotos
    from public.evento_fotografias f
   where f.submission_id = v_ev.id;

  select * into v_av from public.avaliacoes where submission_id = v_ev.id;

  return jsonb_build_object(
    'estado',     'ok',
    'convidada',  true,
    'eixos',      coalesce(v_eixos, '[]'::jsonb),
    'fotografias', coalesce(v_fotos, '[]'::jsonb),
    -- O que ela já respondeu, para poder rever e mudar de ideias.
    'feita', case when v_av.id is null then null else jsonb_build_object(
      'frase',      v_av.frase,
      'eixos',      v_av.eixos,
      'fotografia', (select f.url_pequena from public.evento_fotografias f
                      where f.id = v_av.fotografia_id),
      'autorizada', v_av.publicacao_autorizada,
      'nome_como',  v_av.nome_como,
      'quando',     v_av.criada_em) end);
end
$$;


ALTER FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text" DEFAULT NULL::"text", "p_autorizar" boolean DEFAULT false, "p_nome_como" "text" DEFAULT 'completo'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_foto   uuid;
  v_nome   text;
  v_ja     boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;

  if v_ev.data_evento is null
     or v_ev.data_evento + 3 > current_date
     or v_ev.fase not in ('cliente','projecto','contrato') then
    return jsonb_build_object('estado', 'ainda_nao');
  end if;

  if p_nome_como is not null and p_nome_como not in ('completo','primeiro','anonimo') then
    return jsonb_build_object('estado', 'nome_invalido');
  end if;

  -- Regra 3: a fotografia vem pelo URL, e tem de ser DESTE evento. Sem esta
  -- guarda, a ligação pública apontava a avaliação a uma fotografia de
  -- outra cliente.
  if coalesce(btrim(p_fotografia), '') <> '' then
    select f.id into v_foto
      from public.evento_fotografias f
     where f.submission_id = v_ev.id
       and (f.url_pequena = btrim(p_fotografia) or f.url_grande = btrim(p_fotografia));
    if v_foto is null then
      return jsonb_build_object('estado', 'fotografia_desconhecida');
    end if;
  end if;

  select exists (select 1 from public.avaliacoes where submission_id = v_ev.id)
    into v_ja;

  -- Regra 5: reenviar ACTUALIZA. Ela pode mudar de ideias sobre a
  -- autorização, e o ecrã do obrigado promete-lhe isso por escrito.
  insert into public.avaliacoes
    (submission_id, frase, eixos, fotografia_id, publicacao_autorizada, nome_como)
  values
    (v_ev.id,
     nullif(btrim(coalesce(p_frase, '')), ''),
     coalesce(p_eixos, '[]'::jsonb),
     v_foto,
     coalesce(p_autorizar, false),
     coalesce(p_nome_como, 'completo'))
  on conflict (submission_id) do update set
     frase                 = excluded.frase,
     eixos                 = excluded.eixos,
     fotografia_id         = excluded.fotografia_id,
     publicacao_autorizada = excluded.publicacao_autorizada,
     nome_como             = excluded.nome_como;

  -- Regra 2: NÃO se toca em portal_acessos. Repete-se aqui porque é a
  -- linha que alguém vai querer acrescentar sem saber porque não está.

  -- Um aviso, e só à primeira. Reenviar não volta a tocar a campainha.
  if not v_ja then
    select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('avaliacao_recebida',
       coalesce(v_nome, 'A cliente') || ' avaliou o evento',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object(
         'mensagem', nullif(btrim(coalesce(p_frase, '')), ''),
         'autorizada', coalesce(p_autorizar, false)));
  end if;

  return jsonb_build_object('estado', 'ok', 'primeira', not v_ja);
end
$$;


ALTER FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text", "p_autorizar" boolean, "p_nome_como" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_confirmar_papel"("p_notificacao_id" "uuid", "p_nome" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_portal_confirmar_papel"("p_notificacao_id" "uuid", "p_nome" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_acesso      public.portal_acessos%rowtype;
  v_ev          public.submissions%rowtype;
  v_sinal_feito boolean;
  v_dia         jsonb;
  v_quando      timestamptz;
  v_nome        text;
  v_disputado   boolean;
  v_ip          text;
  v_ua          text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  if not found or v_ev.fase = 'perdido' then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- O sinal do PRÓPRIO evento — a definição canónica (077/078): o
  -- pagamento de origem 'sinal' não reconstituído, ou uma fase que já
  -- só existe depois dele.
  v_sinal_feito :=
       v_ev.fase in ('contrato', 'cliente', 'projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_ev.id
                  and p.origem = 'sinal'
                  and p.reconstituido = false);
  if v_sinal_feito then
    return jsonb_build_object('estado', 'ja_reservado');
  end if;

  -- Sem sinal e com a data passada, o pedido caducou (o padrão de
  -- sempre): o ecrã do sinal já não tem nada para confirmar.
  if v_ev.data_evento is not null and v_ev.data_evento < current_date then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- A MESMA serialização por dia da porta do registo (secção 4), com a
  -- MESMA chave determinística (o número do dia; sem data, o próprio
  -- evento): a confirmação que entra a meio de um registo espera — e
  -- quando entra, já vê o dia tomado. E o duplo clique do «já paguei»
  -- serializa-se também, mesmo sem data. Estreita a janela; quem a
  -- fecha é a Nádia.
  perform pg_advisory_xact_lock(
    hashtext('dlm_dia'),
    case when v_ev.data_evento is not null
         then v_ev.data_evento - date '2000-01-01'
         else hashtext(v_ev.id::text) end);

  -- Reconferir o dia NO CLIQUE — nunca confiar no ecrã que ficou aberto.
  v_dia := public.dlm_dia_estado(v_ev.data_evento, v_ev.id);
  if v_dia->>'estado' = 'tomado' then
    return jsonb_build_object('estado', 'dia_tomado');
  end if;
  if v_dia->>'estado' in ('preferencia', 'em_confirmacao') then
    -- Alheias por construção (o próprio está excluído da conta). O ecrã
    -- nem devia estar aberto — sem rival nenhum na resposta: para o
    -- cliente a porta está fechada, e os porquês são da casa.
    return jsonb_build_object('estado', 'fechado');
  end if;

  -- Confirmar duas vezes não faz duas promessas: devolve-se o carimbo
  -- da confirmação viva que já existe.
  select psc.criado_em into v_quando
    from public.portal_sinal_confirmacoes psc
   where psc.submission_id = v_ev.id
     and psc.anulada_em is null
   order by psc.criado_em desc
   limit 1;
  if v_quando is not null then
    return jsonb_build_object('estado', 'ja_feito', 'quando', v_quando);
  end if;

  -- A prova, como na 078: o IP e o user-agent dos headers do PostgREST.
  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  -- O cinto além do cadeado: se apesar de tudo uma confirmação viva
  -- nasceu no meio-tempo, o índice parcial recusa — e devolve-se o
  -- carimbo dela, nunca uma exceção crua ao portal.
  insert into public.portal_sinal_confirmacoes
    (acesso_id, submission_id, metodo_indicado, ip, user_agent)
  values
    (v_acesso.id, v_ev.id,
     nullif(btrim(coalesce(p_metodo, '')), ''),
     nullif(v_ip, ''), v_ua)
  on conflict (submission_id) where anulada_em is null do nothing
  returning criado_em into v_quando;

  if v_quando is null then
    select psc.criado_em into v_quando
      from public.portal_sinal_confirmacoes psc
     where psc.submission_id = v_ev.id
       and psc.anulada_em is null
     order by psc.criado_em desc
     limit 1;
    return jsonb_build_object('estado', 'ja_feito', 'quando', v_quando);
  end if;

  -- O aviso na Caixa de Entrada (padrão 061): a Nádia é quem carimba, e
  -- por isso é a primeira a saber. `dia_disputado` diz-lhe já no título
  -- da triagem se há rivais vivos no mesmo dia — o caso que não pode
  -- esperar pelo fim da tarde.
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  v_disputado := v_ev.data_evento is not null and exists (
    select 1 from public.submissions r
     where r.data_evento = v_ev.data_evento
       and r.id <> v_ev.id
       and r.fase <> 'perdido');

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('sinal_confirmado',
     coalesce(v_nome, 'A cliente') || ' confirmou o pagamento do sinal',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object(
       'metodo_indicado', nullif(btrim(coalesce(p_metodo, '')), ''),
       'dia_disputado',   v_disputado));

  return jsonb_build_object('estado', 'ok', 'quando', v_quando);
end
$$;


ALTER FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_documentos"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
             -- 086 · ler nunca pede código — o código ficou só na
             -- assinatura (dlm_portal_acto). A chave fica, sempre false,
             -- para a folha não mudar de contrato.
             'precisa_codigo', false,
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

  -- O estado do código, para os ecrãs da espera e do regresso — da
  -- ASSINATURA, agora: ler já não o pede. SEM o código, claro — só o
  -- que a cliente pode saber.
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


ALTER FUNCTION "public"."dlm_portal_documentos"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_emitir_codigo"("p_verificacao_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_v public.portal_verificacoes%rowtype;
  v_codigo text;
begin
  select * into v_v from public.portal_verificacoes where id = p_verificacao_id;
  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if v_v.codigo is not null and v_v.usado_em is null
     and v_v.expira_em > now() and v_v.tentativas < 5 then
    return v_v.codigo;
  end if;

  -- gen_random_bytes e não random(): isto é um segredo, não uma amostra.
  v_codigo := lpad(
    ((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647)
      % 1000000)::text, 6, '0');

  update public.portal_verificacoes
     set codigo      = v_codigo,
         emitido_em  = now(),
         emitido_por = auth.uid(),
         expira_em   = now() + interval '24 hours',
         usado_em    = null,
         tentativas  = 0
   where id = p_verificacao_id;

  return v_codigo;
end
$$;


ALTER FUNCTION "public"."dlm_portal_emitir_codigo"("p_verificacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_publicar"("p_submission_id" "uuid", "p_tipo" "text", "p_extra" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_doc         public.documentos%rowtype;
  v_versao      integer;
  v_instantaneo jsonb;
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
  v_instantaneo := coalesce(v_doc.dados, '{}'::jsonb)
                   || coalesce(p_extra, '{}'::jsonb);

  -- 088 · a proposta troca as imagens AQUI, sobre os dados frescos: cada
  -- secção sai com imagem = imagemCliente (ou vazia — regra estrita) e
  -- sem a chave imagemCliente. Deriva de v_doc.dados, nunca do p_extra:
  -- o que o backoffice enviou (o cinto de segurança pré-088) é sobreposto
  -- pela versão atómica. Seccoes em falta ou corrompidas publicam [].
  if p_tipo = 'proposta' then
    v_instantaneo := jsonb_set(
      v_instantaneo,
      '{seccoes}',
      coalesce(
        (select jsonb_agg(
                  (t.s - 'imagemCliente')
                  || jsonb_build_object(
                       'imagem', coalesce(t.s->>'imagemCliente', ''))
                )
           from jsonb_array_elements(
                  case when jsonb_typeof(v_doc.dados->'seccoes') = 'array'
                       then v_doc.dados->'seccoes'
                       else '[]'::jsonb
                  end
                ) as t(s)),
        '[]'::jsonb
      )
    );
  end if;

  insert into public.portal_publicacoes
    (submission_id, documento_id, tipo, versao, instantaneo, publicado_por)
  values
    (p_submission_id, v_doc.id, p_tipo, v_versao, v_instantaneo, auth.uid());

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


ALTER FUNCTION "public"."dlm_portal_publicar"("p_submission_id" "uuid", "p_tipo" "text", "p_extra" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_questionario"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dlm_portal_questionario"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_nome   text;
  v_antigo public.notificacoes%rowtype;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;
  if coalesce(btrim(p_caminho), '') = '' then
    return jsonb_build_object('estado', 'caminho_em_falta');
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'contratos-assinados'
       and o.name = btrim(p_caminho)
       and o.created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('estado', 'ficheiro_nao_encontrado');
  end if;

  -- Já havia aviso desta hora? Então não se cria outro — ACTUALIZA-SE, para
  -- apontar à fotografia mais recente. Voltar a pô-lo por ler é de propósito:
  -- chegou coisa nova, e a Nádia tem de a ver antes de confirmar.
  select * into v_antigo
    from public.notificacoes
   where tipo = 'contrato_papel'
     and submission_id = v_acesso.submission_id
     and created_at > now() - interval '1 hour'
   order by created_at desc
   limit 1;

  if found then
    update public.notificacoes
       set dados   = coalesce(dados, '{}'::jsonb)
                     || jsonb_build_object('caminho', btrim(p_caminho)),
           lida_em = null
     where id = v_antigo.id;
    return jsonb_build_object('estado', 'ok');
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


ALTER FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_min_campos constant integer := 5;

  v_acesso  public.portal_acessos%rowtype;
  v_ev      public.submissions%rowtype;
  v_steps   jsonb;
  v_passo   jsonb;
  v_campo   jsonb;
  v_grupo   public.questionario_grupos%rowtype;
  v_antes   jsonb;
  v_data_id text;
  v_conv_id text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select et.steps into v_steps
    from public.event_types et where et.id = v_ev.event_type_id;

  if public.dlm_questionario_conta_campos(v_steps) < c_min_campos then
    return jsonb_build_object('estado', 'sem_questionario');
  end if;

  select passo.valor, campo.valor into v_passo, v_campo
    from jsonb_array_elements(v_steps) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields', '[]'::jsonb)) as campo(valor)
   where campo.valor->>'id' = p_campo
   limit 1;

  if v_campo is null then
    return jsonb_build_object('estado', 'campo_desconhecido');
  end if;

  if coalesce(btrim(v_passo->>'grupo'), '') <> '' and v_ev.data_evento is not null then
    select * into v_grupo from public.questionario_grupos
     where chave = btrim(v_passo->>'grupo')
       and tenant_id = v_ev.tenant_id;      -- 102 · o delta
    if v_grupo.chave is not null
       and (v_ev.data_evento - v_grupo.dias_antes) <= current_date then
      return jsonb_build_object(
        'estado', 'fechado',
        'grupo',  v_grupo.rotulo,
        'porque', v_grupo.porque);
    end if;
  end if;

  v_antes := coalesce(v_ev.respostas, '{}'::jsonb) -> p_campo;

  update public.submissions
     set respostas = coalesce(respostas, '{}'::jsonb)
                     || jsonb_build_object(p_campo, p_valor)
   where id = v_ev.id;

  insert into public.respostas_autoria
    (submission_id, campo_id, autor, valor_anterior)
  values (v_ev.id, p_campo, 'cliente', v_antes);

  select campo.valor->>'id' into v_data_id
    from jsonb_array_elements(v_steps) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields','[]'::jsonb)) as campo(valor)
   where campo.valor->>'papel' = 'data'
      or campo.valor->>'type'  = 'date'
   order by (campo.valor->>'papel' = 'data') desc
   limit 1;

  select campo.valor->>'id' into v_conv_id
    from jsonb_array_elements(v_steps) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields','[]'::jsonb)) as campo(valor)
   where campo.valor->>'type' = 'number'
     and translate(lower(campo.valor->>'id'),
                   'áàâãéèêíìóòôõúùç', 'aaaaeeeiioooouuc') like '%convidad%'
   limit 1;

  if p_campo = v_data_id and public.dlm_questionario_respondido(p_valor) then
    begin
      update public.submissions
         set data_evento = (p_valor #>> '{}')::date where id = v_ev.id;
    exception when others then
      null;
    end;
  end if;

  if p_campo = v_conv_id and public.dlm_questionario_respondido(p_valor) then
    begin
      update public.submissions
         set numero_convidados = (p_valor #>> '{}')::integer where id = v_ev.id;
    exception when others then
      null;
    end;
  end if;

  if v_ev.questionario_entregue_em is null then
    declare
      v_falta integer;
      v_obrig integer;
      v_nome  text;
    begin
      select count(*) filter (where (c->>'required')::boolean)
        into v_obrig
        from jsonb_array_elements(v_steps) as p(v)
        cross join lateral jsonb_array_elements(
          coalesce(p.v->'fields','[]'::jsonb)) as t(c);

      select count(*)
        into v_falta
        from jsonb_array_elements(v_steps) as p(v)
        cross join lateral jsonb_array_elements(
          coalesce(p.v->'fields','[]'::jsonb)) as t(c)
       where (v_obrig = 0 or (c->>'required')::boolean)
         and not public.dlm_questionario_respondido(
               (select respostas -> (c->>'id') from public.submissions where id = v_ev.id));

      if v_falta = 0 then
        update public.submissions
           set questionario_entregue_em = now()
         where id = v_ev.id and questionario_entregue_em is null;

        select c.nome into v_nome
          from public.clientes c where c.id = v_ev.cliente_id;
        insert into public.notificacoes
          (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
        values
          ('questionario_entregue',
           coalesce(v_nome, 'A cliente') || ' respondeu ao formulário',
           v_ev.id, v_ev.cliente_id, v_ev.event_type_id, '{}'::jsonb);
      end if;
    end;
  end if;

  return jsonb_build_object('estado', 'ok', 'guardado_em', now());
end
$$;


ALTER FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_revogar"("p_submission_id" "uuid", "p_motivo" "text" DEFAULT 'manual'::"text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  update public.portal_acessos
     set revogado_em = now(),
         motivo      = p_motivo
   where submission_id = p_submission_id
     and revogado_em is null;
$$;


ALTER FUNCTION "public"."dlm_portal_revogar"("p_submission_id" "uuid", "p_motivo" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_verificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "contexto" "text",
    "pedido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo" "text",
    "emitido_em" timestamp with time zone,
    "emitido_por" "uuid",
    "expira_em" timestamp with time zone,
    "usado_em" timestamp with time zone,
    "tentativas" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."portal_verificacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_verificacoes" IS 'Pedidos e emissões de código. O código guarda-se em claro DE PROPÓSITO: a Nádia tem de o ler para o enviar pelo WhatsApp; vive 24h, é curto e só o admin lê esta mesa. usado_em é também o relógio da sessão (60 min).';


COMMENT ON COLUMN "public"."portal_verificacoes"."tentativas" IS 'Falhas de verificação deste código. À quinta, o código morre e é preciso pedir outro — sem isto, um milhão de hipóteses em 24 horas é força bruta a céu aberto, e o prémio é assinar um contrato.';


CREATE OR REPLACE FUNCTION "public"."dlm_portal_sessao"("p_acesso_id" "uuid", "p_verificacao" "uuid") RETURNS "public"."portal_verificacoes"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select v.* from public.portal_verificacoes v
   where v.id = p_verificacao
     and v.acesso_id = p_acesso_id
     and v.usado_em is not null
     and v.usado_em > now() - interval '60 minutes';
$$;


ALTER FUNCTION "public"."dlm_portal_sessao"("p_acesso_id" "uuid", "p_verificacao" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_ver"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when public.casa_do_token_activa(p_token)
    then public.dlm_portal_ver_interno(p_token)
    -- Uma casa suspensa é indistinguível de um acesso terminado. O motivo
    -- da suspensão é entre a casa e a Sollelio; a cliente não tem nada com
    -- isso, e dizer-lho seria expor o que não lhe pertence saber.
    else jsonb_build_object('estado', 'terminado')
  end;
$$;


ALTER FUNCTION "public"."dlm_portal_ver"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid" DEFAULT NULL::"uuid", "p_versao" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
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
  -- 086 · o véu morreu: o contrato sai inteiro pela ligação privada,
  -- como o orçamento desde a 083. A posse da ligação é a prova — o
  -- código ficou só onde prova alguma coisa: na assinatura.

  -- 074/086 · a NATUREZA da prova, agora com três nomes: 'papel' é a
  -- confirmação humana com fotografia (confirmado_por), 'codigo' é a
  -- sessão verificada de antes da 086, e 'ligacao' é a prova nova — a
  -- posse da ligação privada. A ordem importa: o papel tem sempre
  -- confirmado_por, e é ele que o distingue de um acto sem código.
  select acto, criado_em, nome_escrito,
         case when confirmado_por is not null then 'papel'
              when verificacao_id is not null then 'codigo'
              else 'ligacao' end
           as prova
    into v_acto
    from public.portal_actos
   where publicacao_id = v_pub.id
   order by criado_em desc
   limit 1;

  -- 078 · a leitura das condições, por EVENTO e nunca por versão. O
  -- pórtico continua a vir ANTES de tudo — o orçamento já não tem estado
  -- velado (083), mas a folha precisa na mesma de saber se foi passado.
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


ALTER FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_versao" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_portal_ver_interno"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  v_comunicados  jsonb;  -- 082 · as folhas da casa enviadas a este evento

  -- 073 · as publicações da proposta e do contrato.
  v_proposta_pub timestamptz;
  v_contrato_pub timestamptz;

  -- 083 · o ecrã do sinal: o instantâneo em vigor, o total da folha, o
  -- estado do dia traduzido e a confirmação dela.
  v_orc_inst   jsonb;     -- o instantâneo da versão de orçamento em vigor
  v_total      numeric;   -- o total COMO A FOLHA O MOSTRA, a cêntimos
  v_dia        jsonb;     -- o veredicto cru da dlm_dia_estado (parte A)
  v_estado_dia jsonb;     -- o mesmo, traduzido para o lado de quem lê
  v_conf       jsonb;     -- a confirmação «já paguei» mais recente
  v_sinal      jsonb;     -- o bloco inteiro, ou NULL sem orçamento
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

  -- ── 082 · as folhas da casa enviadas a este evento ──────────────────────
  -- Só o título, o endereço e a data do envio; só linhas com enviado_em
  -- (as dispensadas nem carimbos podem ter — o CHECK da 081 — mas o
  -- filtro fica escrito na mesma: cinta e suspensórios); e só folhas no
  -- ar — retirada ou expirada sai da projecção em vez de virar ligação
  -- morta. Fora do portão do sinal de propósito (ver o cabeçalho da 082).
  --
  -- 085 · E SÓ AS QUE ELA PÔS NO PORTAL: `no_portal` é a escolha explícita
  -- por destinatário (fase C, 4.4). O envio deixou de valer por presença —
  -- os envios anteriores à regra foram carimbados true no backfill da 085
  -- e continuam visíveis; os novos só entram pela caixa.
  select jsonb_agg(
           jsonb_build_object(
             'titulo',     c.titulo,
             'token',      c.token,
             'enviado_em', d.enviado_em
           ) order by d.enviado_em desc)
    into v_comunicados
    from public.comunicado_destinatarios d
    join public.comunicados c on c.id = d.comunicado_id
   where d.submission_id = v_ev.id
     and d.enviado_em is not null
     and d.dispensado_em is null
     and d.no_portal = true          -- 085 · o delta: a caixa é o gesto
     and c.token is not null
     and c.publicado_em is not null
     and c.retirado_em is null
     and (c.expira_em is null or c.expira_em > now());

  -- ── 083 · o ecrã do sinal ───────────────────────────────────────────────
  --
  -- O INSTANTÂNEO DA VERSÃO EM VIGOR — a de maior número (057). É a fonte
  -- de verdade do valor do sinal: o que ela aceitou é o que lhe foi
  -- publicado, congelado, não o que os dados da casa dizem hoje. NUNCA de
  -- pagamentos_previstos — o plano pode não existir, e o sinal existe.
  select p.instantaneo
    into v_orc_inst
    from public.portal_publicacoes p
   where p.submission_id = v_ev.id
     and p.tipo = 'orcamento'
   order by p.versao desc
   limit 1;

  if v_orc_inst is not null then
    -- O TOTAL COMO A FOLHA O MOSTRA (CorpoOrcamento, no portal):
    --   Σ qtd × valor das linhas CRUAS  +  __logistica.total
    -- A logística entre moradas (03/08/2026) viaja no instantâneo como
    -- parcelas diluídas — os valores das linhas ficam crus e o total dela
    -- soma-se ao Total, exactamente como o front faz. E como o front, só
    -- conta quando __logistica.parcelas é mesmo um array: um instantâneo
    -- legado, sem a chave, soma como sempre somou.
    --
    -- Os números guardam-se como texto ou como número, conforme a idade do
    -- instantâneo — o crivo abaixo imita o Number() do browser: o que não
    -- for número conta zero, em vez de rebentar a projecção inteira.
    select round(
             coalesce(sum(
                 coalesce(case when btrim(coalesce(l.value->>'qtd', ''))
                                    ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$'
                               then btrim(l.value->>'qtd')::numeric end, 0)
               * coalesce(case when btrim(coalesce(l.value->>'valor', ''))
                                    ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$'
                               then btrim(l.value->>'valor')::numeric end, 0)
             ), 0)
             + case when jsonb_typeof(v_orc_inst->'__logistica'->'parcelas') = 'array'
                    then coalesce(case when btrim(coalesce(v_orc_inst->'__logistica'->>'total', ''))
                                            ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$'
                                       then btrim(v_orc_inst->'__logistica'->>'total')::numeric end, 0)
                    else 0 end
           , 2)
      into v_total
      from jsonb_array_elements(
             case when jsonb_typeof(v_orc_inst->'linhas') = 'array'
                  then v_orc_inst->'linhas'
                  else '[]'::jsonb end) l(value);

    -- O ESTADO DO DIA, para o lado de quem lê — e SEMPRE num objecto
    -- construído de raiz: por aqui não passa nome, id nem migalha do
    -- rival, hoje nem nunca. Tudo deriva de data_evento em leitura (o
    -- padrão do caducou): mudar a data dissolve disputa, prazo e
    -- preferência sozinha. Sem data marcada não há dia para disputar —
    -- livre, por definição.
    v_dia := case when v_ev.data_evento is not null
                  then public.dlm_dia_estado(v_ev.data_evento, v_ev.id)
                  else jsonb_build_object('estado', 'livre') end;

    if v_dia->>'estado' = 'tomado' then
      -- O dia TOMADO cala tudo — até o prazo próprio. Se a Nádia
      -- registou por cima da promessa (p_forcar na porta do registo), o
      -- portal da preterida tem de o mostrar com as desculpas da casa —
      -- nunca um «guardado para si» que já não é verdade.
      --
      -- 084 · A PROMESSA QUEBRADA. Quando o dia foi tomado e o prazo
      -- PRÓPRIO ainda estaria de pé, {estado:'tomado'} sozinho era uma
      -- mentira por omissão: a cliente tinha um «guardado para si até
      -- DD/MM» à vista e o portal respondia «ficou reservado» como a um
      -- rival qualquer. A bandeira diz ao front que há desculpas a dar
      -- (o ecrã H″ do mockup) — e só a bandeira: do rival continua a
      -- não atravessar nada.
      --
      -- PORQUÊ `dia_guardado_ate >= current_date`, e não «>= a data do
      -- pagamento rival» — a leitura mais fiel a «a promessa estava
      -- viva quando o dia foi tomado»:
      --   · no instante da quebra as duas leituras coincidem: a porta
      --     do registo (dlm_registar_sinal) só deixa forçar contra uma
      --     'preferencia', que por definição exige dia_guardado_ate >=
      --     current_date — quebrar um prazo morto é impossível;
      --   · a contradição que esta bandeira existe para resolver vive
      --     EXACTAMENTE enquanto o prazo prometido dura: dentro da
      --     janela «até DD/MM», um dia tomado desmente uma promessa de
      --     pé; passado DD/MM, a promessa teria expirado pelos próprios
      --     termos, e «ficou reservado» volta a ser a verdade simples;
      --   · a data do pagamento rival é escrita à mão e pode ser
      --     retroactiva — registar no dia 12, com o prazo expirado a
      --     10, uma transferência datada de 3 fabricaria uma «quebra»
      --     que nunca houve (o prazo foi honrado até ao fim) — e pode
      --     nem existir (tomado inferido pela fase, sem pagamento no
      --     livro);
      --   · e ir buscá-la arrastava dados do rival para este ramo —
      --     contra a regra da porta, mesmo que nada saísse na resposta.
      -- Deriva em leitura, como tudo aqui: o prazo passar ou a data do
      -- evento mudar dissolve a bandeira sozinho, sem vassoura. E o
      -- 'tomado' da dlm_dia_estado já implica a data do evento de pé
      -- (dias passados são sempre 'livre' — não há disputa sobre
      -- história), por isso não se repete essa verificação aqui.
      if v_ev.dia_guardado_ate is not null
         and v_ev.dia_guardado_ate >= current_date then
        v_estado_dia := jsonb_build_object(
          'estado',            'tomado',
          'promessa_quebrada', true);
      else
        v_estado_dia := jsonb_build_object('estado', 'tomado');
      end if;
    elsif v_ev.dia_guardado_ate is not null
       and v_ev.dia_guardado_ate >= current_date
       and v_ev.data_evento is not null
       and v_ev.data_evento >= current_date then
      -- O prazo próprio («guardado para si até DD/MM») mostra-se ao
      -- preferido e cala o resto da disputa. Só com um DIA de pé: sem
      -- data, ou com a data já passada, não há dia nenhum guardado —
      -- «não há disputa sobre história», o mesmo princípio da parte A.
      v_estado_dia := jsonb_build_object(
        'estado', 'guardado_para_si',
        'ate',    v_ev.dia_guardado_ate);
    else
      v_estado_dia := case v_dia->>'estado'
        -- O prazo do rival fecha o ecrã por inteiro; a data em que abre
        -- de novo é a única coisa que o portal precisa (e pode) dizer.
        when 'preferencia'    then jsonb_build_object(
                                     'estado', 'preferencia_alheia',
                                     'ate',    v_dia->'ate')
        -- «Já paguei» de outro fecha até a Nádia registar ou limpar —
        -- estreita a janela do duplo pagamento; quem a fecha é o registo.
        when 'em_confirmacao' then jsonb_build_object('estado', 'em_confirmacao_alheia')
        else                       jsonb_build_object('estado', 'livre')
      end;
    end if;

    -- A CONFIRMAÇÃO dela — a mais recente, viva OU anulada. Viva: o ecrã
    -- agradece e não volta a pedir. Anulada (a Nádia limpou): o ecrã
    -- reabre, e `anulada_em` é o que distingue os dois sem segunda
    -- consulta. Nunca reserva o dia — é palavra dela, não carimbo da casa.
    select jsonb_build_object(
             'em',         c.criado_em,
             'metodo',     c.metodo_indicado,
             'anulada_em', c.anulada_em)
      into v_conf
      from public.portal_sinal_confirmacoes c
     where c.submission_id = v_ev.id
     order by c.criado_em desc
     limit 1;

    v_sinal := jsonb_build_object(
      -- Metade do total da folha, a cêntimos (num total ímpar em
      -- cêntimos, a metade arredonda para cima — 100,01 € pede 50,01 €).
      'valor',         round(v_total / 2, 2),
      -- O total inteiro, para a legenda «metade de X» — o MESMO número
      -- que a folha imprime, ou a legenda desmentia o documento.
      'total',         v_total,
      -- A config CRUA do evento; os defaults da casa (sem escolha →
      -- dados da casa; sem MB Way registado → só IBAN) aplicam-se no
      -- front, que é quem conhece os dados da casa.
      'config',        v_ev.sinal_pagamento,
      'estado_do_dia', v_estado_dia,
      'confirmacao',   v_conf
    );
  end if;

  return jsonb_build_object(
    'estado', 'activo',
    'comunicados', coalesce(v_comunicados, '[]'::jsonb),
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
  )
  -- 083 · a chave 'sinal' só EXISTE quando há orçamento publicado — antes
  -- disso não há valor de que falar, e uma chave nula seria uma promessa
  -- a meio. O front pergunta «há sinal na resposta?», não «é null?».
  || case when v_sinal is not null
          then jsonb_build_object('sinal', v_sinal)
          else '{}'::jsonb end;
end;
$_$;


ALTER FUNCTION "public"."dlm_portal_ver_interno"("p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_portal_ver_interno"("p_token" "text") IS 'O corpo da projecção do portal — 696 linhas, intocadas desde a 082. Não se chama de fora: a porta é dlm_portal_ver, que verifica primeiro se a casa está activa.';


CREATE OR REPLACE FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
     and tentativas < 5
     and (
       (usado_em is null and expira_em > now())
       or (usado_em is not null and usado_em > now() - interval '60 minutes')
     )
   order by pedido_em desc
   limit 1;

  if v_v.id is null then
    -- Falhou: conta a tentativa no código VIVO deste acesso. À quinta, ele
    -- morre — e a saída é pedir outro, que o ecrã já oferece.
    update public.portal_verificacoes
       set tentativas = tentativas + 1
     where id = (
       select id from public.portal_verificacoes
        where acesso_id = v_acesso.id and codigo is not null
          and usado_em is null and expira_em > now()
        order by pedido_em desc limit 1);
    return jsonb_build_object('estado', 'codigo_invalido');
  end if;

  if v_v.usado_em is null then
    update public.portal_verificacoes set usado_em = now() where id = v_v.id;
    v_v.usado_em := now();
  end if;

  return jsonb_build_object(
    'estado', 'verificado',
    'verificacao', v_v.id,
    'valida_ate', v_v.usado_em + interval '60 minutes');
end
$$;


ALTER FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(count(*), 0)::integer
    from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields', '[]'::jsonb)) as campo(valor);
$$;


ALTER FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") IS 'Campos totais de um modelo. O mínimo de 5 para haver questionário no portal está nas RPC, não aqui — esta função só conta.';


CREATE OR REPLACE FUNCTION "public"."dlm_questionario_respondido"("p_valor" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select p_valor is not null
     and jsonb_typeof(p_valor) <> 'null'
     and case jsonb_typeof(p_valor)
           when 'string' then btrim(p_valor #>> '{}') <> ''
           when 'array'  then jsonb_array_length(p_valor) > 0
           when 'object' then p_valor <> '{}'::jsonb
           else true
         end;
$$;


ALTER FUNCTION "public"."dlm_questionario_respondido"("p_valor" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_registar_sinal"("p_submission" "uuid", "p_valor" numeric, "p_data" "date", "p_metodo" "text", "p_contribuinte" "text" DEFAULT NULL::"text", "p_notas" "text" DEFAULT NULL::"text", "p_forcar" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ev       public.submissions%rowtype;
  v_dia      jsonb;
  v_previsto uuid;
  v_id       uuid;
begin
  select * into v_ev from public.submissions where id = p_submission;
  if not found then
    return jsonb_build_object('estado', 'nao_encontrado');
  end if;

  -- Um registo ao vivo tem sempre valor, data e método a sério — a
  -- própria mesa (025) recusaria; aqui recusa-se com estado, não com
  -- exceção, para a UI falar português.
  if p_valor is null or p_valor <= 0
     or p_data is null
     or nullif(btrim(coalesce(p_metodo, '')), '') is null then
    return jsonb_build_object('estado', 'invalido');
  end if;

  -- A guarda serializa-se POR DIA: quem chega segundo espera, e quando
  -- entra já vê o que o primeiro fez. A chave é determinística (o número
  -- do dia; sem data, o próprio evento) — a MESMA fórmula da porta do
  -- portal, ou o cadeado não guardava nada.
  perform pg_advisory_xact_lock(
    hashtext('dlm_dia'),
    case when v_ev.data_evento is not null
         then v_ev.data_evento - date '2000-01-01'
         else hashtext(v_ev.id::text) end);

  -- O PRÓPRIO evento com um sinal vivo (não reconstituído) não leva
  -- segundo: o duplo clique — ou a ficha esquecida aberta — escrevia
  -- dois pagamentos de sinal no livro. A fase pós-sinal NÃO trava de
  -- propósito: um evento avançado à mão pode ter o pagamento real por
  -- registar, e este é exactamente o sítio de o registar.
  if exists (select 1 from public.pagamentos p
              where p.submission_id = v_ev.id
                and p.origem = 'sinal'
                and p.reconstituido = false) then
    return jsonb_build_object('estado', 'ja_registado');
  end if;

  v_dia := public.dlm_dia_estado(v_ev.data_evento, p_submission);

  if v_dia->>'estado' = 'tomado' then
    -- Nunca há forcar contra dia tomado.
    return jsonb_build_object(
      'estado',     'dia_tomado',
      'rival_id',   v_dia->'rival_id',
      'rival_nome', v_dia->'rival_nome');
  end if;

  if v_dia->>'estado' = 'preferencia' and not coalesce(p_forcar, false) then
    return jsonb_build_object(
      'estado',     'prazo_alheio',
      'rival_id',   v_dia->'rival_id',
      'rival_nome', v_dia->'rival_nome',
      'ate',        v_dia->'ate');
  end if;

  -- O previsto de ordem 1 (o sinal do plano), se o plano existir — o
  -- pagamento pendura-se nele para o saldo se contar sozinho. Sem plano,
  -- fica solto: o saldo calcula-se sempre dos pagamentos (025).
  select pp.id into v_previsto
    from public.pagamentos_previstos pp
   where pp.submission_id = p_submission
     and pp.ordem = 1
   order by pp.created_at
   limit 1;

  insert into public.pagamentos
    (submission_id, previsto_id, valor, data, metodo, origem,
     contribuinte, notas, reconstituido)
  values
    (p_submission, v_previsto, p_valor, p_data,
     btrim(p_metodo), 'sinal',
     nullif(btrim(coalesce(p_contribuinte, '')), ''),
     nullif(btrim(coalesce(p_notas, '')), ''),
     false)
  returning id into v_id;

  -- A fase NÃO se toca aqui — a ordem invertida do Funil: o cliente da
  -- UI avança a fase DEPOIS do 'ok', nunca antes da guarda.
  return jsonb_build_object('estado', 'ok', 'id', v_id);
end
$$;


ALTER FUNCTION "public"."dlm_registar_sinal"("p_submission" "uuid", "p_valor" numeric, "p_data" "date", "p_metodo" "text", "p_contribuinte" "text", "p_notas" "text", "p_forcar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_safe_date"("t" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$ begin return t::date; exception when others then return null; end $$;


ALTER FUNCTION "public"."dlm_safe_date"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_safe_int"("t" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$ begin return t::integer; exception when others then return null; end $$;


ALTER FUNCTION "public"."dlm_safe_int"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_safe_time"("t" "text") RETURNS time without time zone
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$ begin return t::time; exception when others then return null; end $$;


ALTER FUNCTION "public"."dlm_safe_time"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_safe_uuid"("t" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$ begin return t::uuid; exception when others then return null; end $$;


ALTER FUNCTION "public"."dlm_safe_uuid"("t" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_token_comunicado"() RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
  -- 24 bytes aleatórios em base64url: 32 caracteres, sem enchimento
  select replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
$$;


ALTER FUNCTION "public"."dlm_token_comunicado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_travar_documento_trancado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."dlm_travar_documento_trancado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_txt"("v" "jsonb", "k" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ select nullif(btrim(coalesce(v ->> k, '')), '') $$;


ALTER FUNCTION "public"."dlm_txt"("v" "jsonb", "k" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_txt_array"("v" "jsonb", "k" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if v -> k is null or jsonb_typeof(v -> k) <> 'array' then
    return null;
  end if;
  return array(select jsonb_array_elements_text(v -> k));
exception when others then
  return null;
end
$$;


ALTER FUNCTION "public"."dlm_txt_array"("v" "jsonb", "k" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  -- O que PODE sair sem sessão verificada: identifica o evento e descreve o
  -- serviço, sem dinheiro e sem dados pessoais.
  v_livres constant text[] := array[
    'tipoEvento', 'dataEvento', 'horaInicio', 'horaFim', 'local',
    'lugares', 'subtitulo', 'cliente', 'seccoes', 'linhas', '__contrato',
    '__condicoes', '__validadeDias'
  ];
  v_out jsonb := '{}'::jsonb;
  v_par record;
  v_arr jsonb;
  v_el  jsonb;
begin
  for v_par in
    select key, value from jsonb_each(coalesce(p_dados, '{}'::jsonb))
     where key = any (v_livres)
  loop
    if jsonb_typeof(v_par.value) = 'array' then
      v_arr := '[]'::jsonb;
      for v_el in select * from jsonb_array_elements(v_par.value) loop
        if jsonb_typeof(v_el) = 'object' then
          -- Dentro das linhas do orçamento e das secções do projecto: fora
          -- o valor, e fora o texto livre onde um preço pode ter sido
          -- escrito à mão.
          v_arr := v_arr || jsonb_build_array(v_el - 'valor' - 'inclui' - 'itens');
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


ALTER FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") IS '⛔ SEM CHAMADOR desde a 086 — o véu do contrato morreu e o último chamador (dlm_portal_ver_documento, versão da 083) foi redefinido sem ela. Verificado por varredura às 86 migrações e ao src em 16/08/2026. Candidata a remoção na próxima limpeza; não se apaga aqui para não misturar riscos.';


CREATE OR REPLACE FUNCTION "public"."documentos_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."documentos_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."formulario_briefing"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
           'submission', to_jsonb(s),
           'event_type', to_jsonb(et))
    from submissions s
    left join event_types et on et.id = s.event_type_id
   where s.id = p_id
$$;


ALTER FUNCTION "public"."formulario_briefing"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."formulario_submeter"("p_codigo" "text", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite invites%rowtype;
  v_resp jsonb := coalesce(p_payload -> 'respostas', '{}'::jsonb);
  v_atual jsonb;
  v_submission_id uuid;
  v_cliente_id uuid;
  v_noivo text;
  v_noiva text;
  v_nome text;
  -- O alvo efetivo da submissão: o do convite ou, para convites de
  -- reserva, o evento que a própria reserva já tem ligado.
  v_alvo uuid;
  v_tel text;
  v_hit_cliente uuid;
  v_cliente_reutilizado boolean := false;
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

  v_alvo := v_invite.submission_alvo_id;

  -- Convite de reserva que perdeu (ou nunca teve) o alvo: a reserva é
  -- o vínculo autoritativo — se já tem evento ligado, é esse o alvo.
  if v_alvo is null and v_invite.reserva_id is not null then
    select r.submission_id into v_alvo
      from reservas r
     where r.id = v_invite.reserva_id;
  end if;

  if v_alvo is null then
    -- Convite sem alvo: ANTES de criar o que quer que seja, procura a
    -- PESSOA pelo telefone — o mesmo padrão do captacao_submeter.
    -- Só o cliente: o evento nunca se escolhe por palpite (ver
    -- cabeçalho), por isso o p_data vai a null.
    begin
      v_tel := dlm_txt(v_resp, 'contactoPrincipal');
      if v_tel is not null then
        select d.cliente_id
          into v_hit_cliente
          from captacao_dedupe(v_tel, null) d;
      end if;
      if v_hit_cliente is null then
        v_tel := dlm_txt(v_resp, 'numeroWhatsapp');
        if v_tel is not null then
          select d.cliente_id
            into v_hit_cliente
            from captacao_dedupe(v_tel, null) d;
        end if;
      end if;
    exception when others then
      -- O dedupe nunca trava uma submissão de cliente.
      v_hit_cliente := null;
    end;
  end if;

  if v_alvo is not null then
    -- Onboarding apontado a um evento existente: merge nas respostas
    -- (nada do que já lá vive se perde) + escrita nas colunas antigas
    -- equivalentes (dupla fonte, o mesmo padrão do drawer). Cada campo
    -- só é tocado se veio nas respostas novas; vazio grava null.
    select respostas into v_atual
      from submissions
     where id = v_alvo
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
    where id = v_alvo;

    v_submission_id := v_alvo;

  else
    -- Sem alvo e sem evento correspondente: cliente (reutilizado ou
    -- novo) + EVENTO novo ligado (fase "cliente").
    -- Extração do nome com a prioridade da migração 011.
    v_noivo := dlm_txt(v_resp, 'nomeNoivo');
    v_noiva := dlm_txt(v_resp, 'nomeNoiva');
    v_nome := coalesce(
      nullif(concat_ws(' & ', v_noivo, v_noiva), ''),
      dlm_txt(v_resp, 'nomeDoCliente'),
      dlm_txt(v_resp, 'nomeResponsavel'),
      'Cliente sem nome');

    if v_hit_cliente is not null then
      -- O telefone encontrou a pessoa: reutiliza o cartão em vez de
      -- criar um segundo. A ficha dela não é reescrita — só o evento
      -- novo é que nasce.
      v_cliente_id := v_hit_cliente;
      v_cliente_reutilizado := true;
    else
      insert into clientes (nome, contacto, email, morada)
      values (
        v_nome,
        dlm_txt(v_resp, 'contactoPrincipal'),
        dlm_txt(v_resp, 'email'),
        dlm_txt(v_resp, 'morada'))
      returning id into v_cliente_id;
    end if;

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

  -- A bandeira extra é inofensiva para quem só lê o id, e deixa a UI
  -- (no futuro) dizer "reutilizei a ficha da Maria".
  return jsonb_build_object(
    'id', v_submission_id,
    'cliente_reutilizado', v_cliente_reutilizado);
end
$$;


ALTER FUNCTION "public"."formulario_submeter"("p_codigo" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
           where s.id = i.submission_alvo_id),
         -- 100 · a casa do convite, para as mensagens de erro nomearem
         -- quem contactar. É a única projecção pública que leva a
         -- identidade embutida, e por uma razão: o código escrito à mão
         -- não tem outra porta por onde a pedir.
         'casa', public.identidade_da_casa(i.tenant_id)
       )
    from invites i
   where i.code = upper(btrim(p_codigo))
   limit 1
$$;


ALTER FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when p_tenant is null then jsonb_build_object('estado', 'desconhecida')
    else coalesce(
      (select jsonb_build_object('estado', 'conhecida', 'casa',
                public.identidade_da_casa(p_tenant))
         from public.tenants t
        where t.id = p_tenant and t.estado = 'activo'),
      -- A casa existe mas está suspensa (ou encerrada): trata-se como
      -- desconhecida. Suspender é cortar a presença, não só o acesso.
      jsonb_build_object('estado', 'desconhecida'))
  end;
$$;


ALTER FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") IS 'A identidade envolvida em estado. `desconhecida` é resposta legítima — o front limpa a marca; ausência de resposta (rede) é outra coisa e mantém a que tinha.';


CREATE OR REPLACE FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") IS 'A identidade de uma casa, para as projecções públicas a embutirem. Não se concede ao anon: recebe um uuid, e um uuid vindo de fora não se aceita. Quem a chama são as RPCs públicas, que já resolveram a casa pelo token ou pelo slug.';


CREATE OR REPLACE FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.identidade_conhecida(public.tenant_por_slug(p_slug));
$$;


ALTER FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identidade_da_casa_sem_filtro"("p_tenant" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
           'nome', t.nome, 'titular', t.titular, 'morada', t.morada,
           'nif', t.nif, 'iban', t.iban, 'mbway', t.mbway, 'foro', t.foro,
           'dominio', t.dominio, 'whatsapp', t.whatsapp,
           'logo_url', t.logo_url, 'linha_actividade', t.linha_actividade,
           'linha_by', t.linha_by, 'slogan', t.slogan)
    from public.tenants t where t.id = p_tenant;
$$;


ALTER FUNCTION "public"."identidade_da_casa_sem_filtro"("p_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identidade_da_minha_casa"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.identidade_conhecida(public.tenant_actual());
$$;


ALTER FUNCTION "public"."identidade_da_minha_casa"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."identidade_da_minha_casa"() IS '⚠ SUBSTITUÍDA pela versão com slug (108). Fica de pé até o CasaProvider passar a casa da rota; apagar antes deixa o admin sem identidade.';


CREATE OR REPLACE FUNCTION "public"."identidade_da_minha_casa"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    -- minha e activa
    when exists (
      select 1 from public.tenants t
        join public.memberships m on m.tenant_id = t.id
       where t.slug = lower(btrim(coalesce(p_slug, '')))
         and t.estado = 'activo' and m.user_id = auth.uid())
    then public.identidade_conhecida(public.tenant_do_pedido(p_slug))

    -- minha, mas suspensa ou encerrada: a identidade sai, com o estado a
    -- dizer porquê. Sem isto, o admin fica vazio e parece avariado.
    when exists (
      select 1 from public.tenants t
        join public.memberships m on m.tenant_id = t.id
       where t.slug = lower(btrim(coalesce(p_slug, '')))
         and m.user_id = auth.uid())
    then (select jsonb_build_object(
                   'estado', 'suspensa',
                   'casa', public.identidade_da_casa_sem_filtro(t.id))
            from public.tenants t
           where t.slug = lower(btrim(coalesce(p_slug, ''))))

    -- não é minha, ou não existe
    else jsonb_build_object('estado', 'desconhecida')
  end;
$$;


ALTER FUNCTION "public"."identidade_da_minha_casa"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.identidade_conhecida(
    (select i.tenant_id from public.invites i
      where i.code = upper(btrim(coalesce(p_codigo, ''))))
  );
$$;


ALTER FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."identidade_por_token"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.identidade_conhecida(
    coalesce(
      -- o portal do noivo — SEM filtro de revogação ou prazo: um acesso
      -- terminado continua a ser de uma casa, e a página que o diz assina
      -- com ela.
      (select s.tenant_id
         from public.portal_acessos pa
         join public.submissions s on s.id = pa.submission_id
        where pa.token = p_token),
      -- a folha de comunicado (raiz: comunicados tem tenant_id próprio)
      (select c.tenant_id from public.comunicados c where c.token = p_token),
      -- a campanha de contribuição
      (select s.tenant_id
         from public.campanhas ca
         join public.submissions s on s.id = ca.submission_id
        where ca.token = p_token)
    )
  );
$$;


ALTER FUNCTION "public"."identidade_por_token"("p_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."identidade_por_token"("p_token" "text") IS 'A identidade da casa a partir de qualquer token público — portal, folha ou campanha. Respeita revogação, prazo e estado: um token morto não devolve casa nenhuma.';


CREATE OR REPLACE FUNCTION "public"."importar_cliente"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_cliente_id uuid;
  v_evento jsonb;
  v_doc jsonb;
  v_submission_id uuid;
  v_valor numeric;
  v_fase text;
  v_pagamento_final boolean;
  v_data_evento date;
  v_previsto_sinal_id uuid;
  v_previsto_remanescente_id uuid;
  n_eventos int := 0;
  n_docs int := 0;
  n_forms int := 0;
  n_pagamentos int := 0;
  n_saltados int := 0;
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
    -- IDEMPOTÊNCIA (044): o mesmo trio cliente+data+tipo não entra
    -- duas vezes — salta o evento INTEIRO (documentos, convite e
    -- pagamentos incluídos) e conta-o para o relatório.
    -- SÓ com data preenchida: sem data não há chave natural confiável,
    -- e o IS NOT DISTINCT FROM em (null, null) saltaria um segundo
    -- evento LEGÍTIMO sem data do mesmo cliente (o prompt de migração
    -- manda deixar null o que os documentos não dizem).
    if nullif(v_evento->'registo'->>'data_evento', '') is not null
       and exists (
      select 1 from submissions s
       where s.cliente_id = v_cliente_id
         and s.data_evento =
             nullif(v_evento->'registo'->>'data_evento', '')::date
         and s.event_type_id is not distinct from
             nullif(v_evento->'registo'->>'event_type_id', '')::uuid
    ) then
      n_saltados := n_saltados + 1;
      continue;
    end if;

    insert into submissions
    select * from jsonb_populate_record(
      null::submissions,
      public._ajustar_registo(
        'public.submissions'::regclass,
        jsonb_build_object(
          'id', gen_random_uuid(),
          'created_at', now(),
          'cliente_id', v_cliente_id,
          -- Blindagem (2A/040): par neutro VÁLIDO por baixo — o
          -- registo do app sobrepõe sempre; um chamador que omita os
          -- campos já não insere NULL contra o NOT NULL.
          'fase', 'interessado',
          'status', 'Recebido'
          -- strip_nulls: um "fase": null EXPLÍCITO no registo
          -- sobreporia o default do base e ressuscitava o 23502; para
          -- colunas nullable, chave ausente e null dão o mesmo — e no
          -- respostas, null lê-se igual a ausente (a regra da casa).
        ) || jsonb_strip_nulls(v_evento->'registo')
      )
    )
    returning id, valor_acordado, fase, pagamento_final, data_evento
      into v_submission_id, v_valor, v_fase, v_pagamento_final, v_data_evento;
    n_eventos := n_eventos + 1;

    -- Plano + dinheiro reconstituído (mesma regra da 027, sem data —
    -- ver nota acima)
    if v_valor > 0 then
      insert into pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
      values (v_submission_id, 'Sinal (50%)', round(v_valor / 2, 2), null, 1)
      returning id into v_previsto_sinal_id;

      insert into pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
      values (
        v_submission_id,
        'Remanescente (50%)',
        round(v_valor / 2, 2),
        case when v_data_evento is not null then v_data_evento - interval '2 days' else null end,
        2
      )
      returning id into v_previsto_remanescente_id;

      if v_fase in ('cliente', 'projecto', 'contrato') then
        insert into pagamentos (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
        values (
          v_submission_id, v_previsto_sinal_id, round(v_valor / 2, 2),
          null, 'Desconhecido (reconstituído)', 'sinal', true
        );
        n_pagamentos := n_pagamentos + 1;
      end if;

      if v_pagamento_final then
        insert into pagamentos (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
        values (
          v_submission_id, v_previsto_remanescente_id, round(v_valor / 2, 2),
          null, 'Desconhecido (reconstituído)', 'remanescente', true
        );
        n_pagamentos := n_pagamentos + 1;
      end if;
    end if;

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
    'formularios', n_forms,
    'pagamentos', n_pagamentos,
    'eventos_saltados', n_saltados
  );
end;
$$;


ALTER FUNCTION "public"."importar_cliente"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nome_do_autor"("p_user" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(split_part(u.email, '@', 1), ''))
    from auth.users u
   where u.id = p_user
     and exists (
       select 1 from public.memberships m
        where m.user_id = p_user
          and m.tenant_id in (select public.tenants_do_utilizador()));
$$;


ALTER FUNCTION "public"."nome_do_autor"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nome_do_utilizador"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(split_part(u.email, '@', 1), ''))
    from auth.users u
   where u.id = auth.uid();
$$;


ALTER FUNCTION "public"."nome_do_utilizador"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."nome_do_utilizador"() IS 'O nome de quem tem sessão — para a saudação do admin. NÃO confundir com tenants.titular, que é quem assina os contratos: com uma equipa de três, são pessoas diferentes.';


CREATE OR REPLACE FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campanha public.campanhas%rowtype;
begin
  select ca.* into v_campanha
    from public.campanhas ca
    join public.submissions s on s.id = ca.submission_id
    join public.tenants     t on t.id = s.tenant_id
   where ca.token = p_token
     and ca.estado = 'ativa'
     and t.estado = 'activo';                       -- 103 · o delta

  if not found then
    return jsonb_build_object('estado', 'terminada');
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;

  insert into public.campanha_intencoes (campanha_id, nome, valor, mensagem)
  values (v_campanha.id, btrim(p_nome), p_valor, nullif(btrim(coalesce(p_mensagem,'')), ''));

  return jsonb_build_object('estado', 'ok');
end
$$;


ALTER FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb" DEFAULT NULL::"jsonb", "p_contexto" "jsonb" DEFAULT NULL::"jsonb", "p_respostas" "jsonb" DEFAULT NULL::"jsonb", "p_tenant_slug" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_limite_hora constant integer := 20;
  c_dias_recuperacao constant integer := 30;
  v_tenant uuid;
  v_recentes integer;
begin
  if p_tenant_slug is null then
    begin
      v_tenant := public.tenant_actual();
    exception when others then
      v_tenant := null;   -- CASA_AMBIGUA: o log fica sem casa, nunca na errada
    end;
  elsif auth.uid() is null then
    v_tenant := public.tenant_por_slug(p_tenant_slug);
  else
    v_tenant := public.tenant_do_pedido(p_tenant_slug);   -- 108 · o delta
  end if;

  update public.form_errors
     set respostas = null, respostas_ate = null
   where respostas is not null
     and respostas_ate is not null
     and respostas_ate < now();

  select count(*) into v_recentes
    from public.form_errors
   where created_at > now() - interval '1 hour'
     and (tenant_id = v_tenant or (tenant_id is null and v_tenant is null));

  if v_recentes >= c_limite_hora then
    return false;
  end if;

  insert into public.form_errors
    (origem, mensagem, detalhe, contexto, respostas, tenant_id, respostas_ate)
  values (
    coalesce(nullif(btrim(p_origem), ''), 'desconhecida'),
    p_mensagem, p_detalhe, p_contexto, p_respostas, v_tenant,
    case when p_respostas is not null
         then now() + (c_dias_recuperacao || ' days')::interval end);

  return true;
end
$$;


ALTER FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb", "p_contexto" "jsonb", "p_respostas" "jsonb", "p_tenant_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submissao_fundir_respostas"("p_id" "uuid", "p_patch" "jsonb", "p_colunas" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."submissao_fundir_respostas"("p_id" "uuid", "p_patch" "jsonb", "p_colunas" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tenant_actual"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_n integer;
  v_tenant uuid;
begin
  select count(*) into v_n
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid() and t.estado = 'activo';

  if v_n = 0 then
    return null;
  elsif v_n > 1 then
    raise exception 'CASA_AMBIGUA'
      using hint = 'A sessão pertence a mais do que uma casa. Abra o endereço da casa certa.';
  end if;

  select m.tenant_id into v_tenant
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid() and t.estado = 'activo';

  return v_tenant;
end
$$;


ALTER FUNCTION "public"."tenant_actual"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tenant_actual"() IS 'A casa da sessão, quando não há ambiguidade. Com duas ou mais, PARA com CASA_AMBIGUA — a versão da 092 devolvia a mais antiga em silêncio, e escritas caíam na casa errada. Rede de segurança: o caminho certo é o tenant_do_pedido, com o slug da rota.';


CREATE OR REPLACE FUNCTION "public"."tenant_do_pedido"("p_slug" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select t.id
    from public.tenants t
    join public.memberships m on m.tenant_id = t.id
   where t.slug = lower(btrim(coalesce(p_slug, '')))
     and t.estado = 'activo'
     and m.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."tenant_do_pedido"("p_slug" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tenant_do_pedido"("p_slug" "text") IS 'A casa do pedido: o slug da rota, confirmado contra a membership de quem pede. NULL quando a casa não existe, está suspensa, ou não é de quem pergunta — e quem chama decide se isso é vazio ou erro.';


CREATE OR REPLACE FUNCTION "public"."tenant_por_slug"("p_slug" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id from public.tenants
   where slug = lower(btrim(coalesce(p_slug, '')))
     and estado = 'activo';
$$;


ALTER FUNCTION "public"."tenant_por_slug"("p_slug" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tenant_por_slug"("p_slug" "text") IS 'A casa, a partir do slug do endereço. Devolve NULL para slug desconhecido ou casa suspensa — quem chama decide se isso é erro.';


CREATE OR REPLACE FUNCTION "public"."tenants_do_utilizador"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.tenant_id
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and t.estado = 'activo';
$$;


ALTER FUNCTION "public"."tenants_do_utilizador"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tenants_do_utilizador"() IS 'As casas a que a sessão actual pertence. Uma casa suspensa não devolve nada — suspender corta o acesso sem apagar dados.';


CREATE OR REPLACE FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") RETURNS TABLE("id" "uuid", "nome" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select et.id, et.nome
    from public.event_types et
   where et.tenant_id = public.tenant_por_slug(p_tenant_slug)
   order by et.nome;
$$;


ALTER FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "chave" "text" NOT NULL,
    "valor" "text" NOT NULL,
    "descricao" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avaliacao_eixos" (
    "chave" "text" NOT NULL,
    "servicos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "rotulo" "text" NOT NULL,
    "ponta_esquerda" "text" NOT NULL,
    "ponta_direita" "text" NOT NULL,
    "ordem" integer NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."avaliacao_eixos" OWNER TO "postgres";


COMMENT ON TABLE "public"."avaliacao_eixos" IS 'Que perguntas se fazem a quem contratou o quê. Vive em tabela e não em código porque o catálogo de serviços muda — e mudou já: o formulário diz «Cenário fotografável» e os dados dizem «Cenário».';


COMMENT ON COLUMN "public"."avaliacao_eixos"."servicos" IS 'As cadeias que trazem este eixo, TAL COMO ESTÃO GUARDADAS em respostas.servicos. Várias por eixo de propósito: é assim que um rótulo novo entra sem deixar o histórico para trás. VAZIO quer dizer SEMPRE.';


COMMENT ON COLUMN "public"."avaliacao_eixos"."ordem" IS 'A ordem das perguntas sai daqui, nunca da ordem do array do evento — que varia de cliente para cliente para a mesma compra.';


CREATE TABLE IF NOT EXISTS "public"."avaliacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "frase" "text",
    "eixos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fotografia_id" "uuid",
    "publicacao_autorizada" boolean DEFAULT false NOT NULL,
    "nome_como" "text" DEFAULT 'completo'::"text" NOT NULL,
    "criada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "publicada_em" timestamp with time zone,
    CONSTRAINT "avaliacoes_nome_como_check" CHECK (("nome_como" = ANY (ARRAY['completo'::"text", 'primeiro'::"text", 'anonimo'::"text"])))
);


ALTER TABLE "public"."avaliacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."avaliacoes" IS 'Uma por evento (unique). Gravá-la NÃO revoga o acesso — fechar a porta a quem acabou de dar uma frase e uma fotografia é o gesto errado no momento errado. O portal entra em despedida e vive até ao fim do prazo.';


COMMENT ON COLUMN "public"."avaliacoes"."eixos" IS 'As respostas dos deslizadores: [{chave, rotulo, valor}], valor de 0 a 100. JSONB e não colunas — o catálogo de serviços vai mudar, e um eixo novo não pode pedir migração.';


COMMENT ON COLUMN "public"."avaliacoes"."fotografia_id" IS 'A preferida DELA. Escolher não é autorizar: uma fotografia pode ser a preferida e não ser publicável, que é o caso normal quando tem convidados.';


COMMENT ON COLUMN "public"."avaliacoes"."publicacao_autorizada" IS 'A autorização DELA, e só sobre AS PALAVRAS. Nasce falsa: nada vem pré-marcado. A fotografia decide-se noutro sítio e por outra pessoa — ver evento_fotografias.pode_publicar.';


COMMENT ON COLUMN "public"."avaliacoes"."publicada_em" IS 'Quando foi mesmo para o site. Fica por preencher até o site existir — a captação constrói-se agora, a ponte faz-se depois.';


CREATE TABLE IF NOT EXISTS "public"."campanha_intencoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campanha_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "mensagem" "text",
    "estado" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "confirmada_em" timestamp with time zone,
    "anulada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campanha_intencoes_estado_check" CHECK (("estado" = ANY (ARRAY['pendente'::"text", 'confirmada'::"text", 'anulada'::"text"]))),
    CONSTRAINT "campanha_intencoes_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."campanha_intencoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "objetivo" numeric(10,2) NOT NULL,
    "mensagem" "text",
    "token" "text" NOT NULL,
    "estado" "text" DEFAULT 'ativa'::"text" NOT NULL,
    "celebrada_em" timestamp with time zone,
    "fechada_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "como_contribuir" "text",
    CONSTRAINT "campanhas_estado_check" CHECK (("estado" = ANY (ARRAY['ativa'::"text", 'fechada'::"text", 'concluida'::"text"]))),
    CONSTRAINT "campanhas_objetivo_check" CHECK (("objetivo" > (0)::numeric))
);


ALTER TABLE "public"."campanhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "contacto" "text",
    "email" "text",
    "nif" "text",
    "morada" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recusou_promocoes_em" timestamp with time zone,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clientes"."recusou_promocoes_em" IS 'Null = pode receber. Preenchido = fica de fora de qualquer recorte por CONTACTOS. Não afecta comunicados por EVENTOS: um aviso de montagem a quem tem casamento marcado é operação, não promoção.';


CREATE TABLE IF NOT EXISTS "public"."comunicado_destinatarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comunicado_id" "uuid" NOT NULL,
    "submission_id" "uuid",
    "cliente_id" "uuid",
    "nome" "text" NOT NULL,
    "ancora" "text",
    "telefone" "text",
    "telefone_chave" "text",
    "mensagem" "text",
    "aberto_em" timestamp with time zone,
    "enviado_em" timestamp with time zone,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dispensado_em" timestamp with time zone,
    "no_portal" boolean DEFAULT false NOT NULL,
    CONSTRAINT "comunicado_destinatarios_dispensada_sem_carimbos" CHECK ((("dispensado_em" IS NULL) OR (("aberto_em" IS NULL) AND ("enviado_em" IS NULL))))
);


ALTER TABLE "public"."comunicado_destinatarios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."comunicado_destinatarios"."enviado_em" IS 'Quer dizer: a conversa abriu-se e ela confirmou que a mensagem saiu. NÃO quer dizer que foi recebida nem lida. A interface tem de o dizer.';


COMMENT ON COLUMN "public"."comunicado_destinatarios"."dispensado_em" IS 'Preenchido = entrou depois de a lista fechar e ela decidiu deixar como estava. Não conta para a lista nem para as contagens, e não se volta a perguntar por esta pessoa. Limpar a coluna é o «Desfazer».';


COMMENT ON COLUMN "public"."comunicado_destinatarios"."no_portal" IS 'A escolha explícita: esta folha aparece no portal DESTE evento. Não deriva do envio — enviar pelo WhatsApp e publicar no portal são gestos diferentes (briefing da fase C, 4.4). O backfill da 085 marcou true nos envios anteriores à regra, porque essas folhas já estavam visíveis desde a 082.';


CREATE TABLE IF NOT EXISTS "public"."comunicado_modelos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "registo" "text" DEFAULT 'aviso'::"text" NOT NULL,
    "titulo" "text" NOT NULL,
    "subtitulo" "text",
    "blocos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mensagem" "text",
    "publico" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "saudacao" "text",
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "comunicado_modelos_registo_valido" CHECK (("registo" = ANY (ARRAY['aviso'::"text", 'oferta'::"text"])))
);


ALTER TABLE "public"."comunicado_modelos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."comunicado_modelos"."blocos" IS 'A mesma forma dos blocos de `comunicados`, com dois campos a mais que só fazem sentido num molde: `rever` (booleano) e `pergunta` (texto). Um bloco com rever=true nasce editável e assinalado quando o molde for usado, com a `pergunta` ao lado — «Vem de abril de 2026. A data ainda serve?». A marca decide-se ao GUARDAR o molde, não ao usá-lo: é aí que ela tem o contexto todo à frente.';


COMMENT ON COLUMN "public"."comunicado_modelos"."publico" IS 'A regra: { origem, event_type_id, janela, quem }. Os nomes contam-se de novo de cada vez que o molde for usado.';


COMMENT ON COLUMN "public"."comunicado_modelos"."saudacao" IS 'A mesma saudação explícita de comunicados.saudacao, no molde: quem usar o molde herda a saudação como campo, não como pontuação a adivinhar.';


CREATE TABLE IF NOT EXISTS "public"."comunicados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "subtitulo" "text",
    "blocos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mensagem" "text",
    "token" "text",
    "publicado_em" timestamp with time zone,
    "retirado_em" timestamp with time zone,
    "expira_em" timestamp with time zone,
    "n_acessos" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "registo" "text" DEFAULT 'aviso'::"text" NOT NULL,
    "publico" "jsonb",
    "congelado_em" timestamp with time zone,
    "modelo_id" "uuid",
    "saudacao" "text",
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "comunicados_registo_valido" CHECK (("registo" = ANY (ARRAY['aviso'::"text", 'oferta'::"text"])))
);


ALTER TABLE "public"."comunicados" OWNER TO "postgres";


COMMENT ON COLUMN "public"."comunicados"."blocos" IS 'Array de blocos {id, rotulo, texto}, no molde de event_types.steps — editável sem deploy. O id gera-se no cliente e NUNCA se regenera. O papel de cada bloco (prosa, nota, grupo, cláusula, remate) não se guarda: deriva-se da posição e do conteúdo em comporFolha (src/lib/comunicados.js).';


COMMENT ON COLUMN "public"."comunicados"."n_acessos" IS 'Total de aberturas. NUNCA se atribui a ninguém: a folha é pública e reencaminhável, logo não se sabe quem a abriu. A interface tem de dizer isto.';


COMMENT ON COLUMN "public"."comunicados"."registo" IS 'O temperamento da MESMA folha: aviso (sóbrio) ou oferta (desejo). Não são duas folhas — é a mesma com dois registos visuais.';


COMMENT ON COLUMN "public"."comunicados"."publico" IS 'A regra que produziu a lista, guardada para a fase 3 a reutilizar: { origem:"eventos"|"contactos", event_type_id, janela, quem }. Guarda-se a REGRA; quem recebeu está em comunicado_destinatarios.';


COMMENT ON COLUMN "public"."comunicados"."congelado_em" IS 'Quando a lista foi fixada. A partir daqui um evento novo já não entra: a lista não se mexe debaixo dos pés de quem está a enviar.';


COMMENT ON COLUMN "public"."comunicados"."saudacao" IS 'A saudação de abertura («Queridos noivos,»), campo explícito. Substitui a regra da vírgula de comporFolha (a 1.ª linha curta de prosa terminada em vírgula) — a armadilha registada em src/lib/comunicados.js:179-182. NULL = a folha abre sem saudação, e é uma escolha, não um esquecimento.';


CREATE TABLE IF NOT EXISTS "public"."documentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "submission_id" "uuid",
    "dados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enviado_em" timestamp with time zone,
    "assinado_em" timestamp with time zone,
    "trancado_em" timestamp with time zone,
    "assinado_casa_em" timestamp with time zone,
    "assinado_casa_por" "text",
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "documentos_tipo_check" CHECK (("tipo" = ANY (ARRAY['orcamento'::"text", 'contrato'::"text", 'proposta'::"text"])))
);


ALTER TABLE "public"."documentos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."documentos"."enviado_em" IS 'Quando o documento ficou à espera da cliente. Carimbado pelo servidor ao publicar (dlm_portal_publicar, 057) — publicar é o envio. NULL = ainda não publicado.';


COMMENT ON COLUMN "public"."documentos"."assinado_em" IS 'Quando a cliente assinou ou aceitou. Carimbado pelo acto dela (dlm_portal_acto, 059) ou pela confirmação do papel (dlm_portal_confirmar_papel, 074). NULL = ainda não.';


COMMENT ON COLUMN "public"."documentos"."trancado_em" IS 'Carimbado quando o contrato é assinado no acompanhamento. A partir daí o gatilho recusa alterações aos dados e aos carimbos — mesmo do backoffice. Erro? Faz-se contrato novo; este fica como prova.';


CREATE TABLE IF NOT EXISTS "public"."event_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "icone" "text",
    "steps" "jsonb" NOT NULL,
    "predefinido" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."event_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evento_fotografias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "caminho" "text" NOT NULL,
    "url_pequena" "text" NOT NULL,
    "url_grande" "text" NOT NULL,
    "assunto" "text",
    "momento" "text" DEFAULT 'montagem'::"text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    "publicavel" "text" DEFAULT 'por_rever'::"text" NOT NULL,
    CONSTRAINT "evento_fotografias_momento_check" CHECK (("momento" = ANY (ARRAY['montagem'::"text", 'evento'::"text"]))),
    CONSTRAINT "evento_fotografias_publicavel_check" CHECK (("publicavel" = ANY (ARRAY['por_rever'::"text", 'sem_convidados'::"text", 'com_convidados'::"text"])))
);


ALTER TABLE "public"."evento_fotografias" OWNER TO "postgres";


COMMENT ON TABLE "public"."evento_fotografias" IS 'As fotografias que a equipa tira no dia. Tudo o que aqui está é para a cliente ver — não há visibilidade por fotografia, de propósito.';


COMMENT ON COLUMN "public"."evento_fotografias"."caminho" IS 'O nome no balde. Guarda-se para poder apagar o ficheiro quando a linha sai — sem isto, apagar do ecrã deixava lixo no armazenamento para sempre.';


COMMENT ON COLUMN "public"."evento_fotografias"."momento" IS 'montagem ou evento. O valor por omissão deriva da data (carregada no dia ou antes = montagem), mas é CAMPO e não conta: carregar as fotografias da montagem no dia seguinte não é o caso raro, é terça-feira.';


COMMENT ON COLUMN "public"."evento_fotografias"."ordem" IS 'A CAPA é a primeira. A casa escolhe-a, e a regra da casa é que seja a mais adiantada: o trabalho a acontecer aparece por baixo, nunca primeiro — ninguém precisa de ver o espaço a meio às onze da manhã. O código não adivinha o que é «mais adiantada»; ela decide, ordenando.';


COMMENT ON COLUMN "public"."evento_fotografias"."publicavel" IS 'por_rever (predefinido) · sem_convidados · com_convidados. Decisão DA CASA: só quem lá esteve sabe se há gente reconhecível, e a anfitriã não pode consentir pelos convidados. TRÊS estados e não dois porque «por rever» não é «com convidados» — dizer que é seria a página a afirmar o que não sabe.';


CREATE TABLE IF NOT EXISTS "public"."evento_materiais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "quantidade" integer DEFAULT 0,
    "cores" "text",
    "observacoes" "text",
    "lista_carga" boolean DEFAULT true NOT NULL,
    "lista_montagem" boolean DEFAULT true NOT NULL,
    "lista_higienizacao" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."evento_materiais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."form_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origem" "text",
    "mensagem" "text",
    "detalhe" "jsonb",
    "contexto" "jsonb",
    "respostas" "jsonb",
    "tenant_id" "uuid",
    "respostas_ate" timestamp with time zone
);


ALTER TABLE "public"."form_errors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."form_errors"."respostas" IS 'A cópia de recuperação — o formulário no momento da falha. NÃO é diagnóstico: existe para a cliente não ter de reescrever tudo. Esvazia-se ao fim de 30 dias (respostas_ate), porque passado esse tempo ninguém recupera nada e ficam a ser só dados pessoais guardados sem razão.';


COMMENT ON COLUMN "public"."form_errors"."tenant_id" IS 'Nullable de propósito: um erro pode acontecer antes de se saber a casa (slug inválido, código inexistente). Esses são precisamente os que mais interessa ver.';


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "code" "text" NOT NULL,
    "nome_noivo" "text",
    "nome_noiva" "text",
    "email" "text",
    "data_evento" "date",
    "status" "text" DEFAULT 'Pendente'::"text",
    "submission_id" "uuid",
    "event_type_id" "uuid",
    "respostas" "jsonb",
    "reserva_id" "uuid",
    "submission_alvo_id" "uuid",
    "preenchido_em" timestamp with time zone,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invites"."preenchido_em" IS 'Momento em que o questionário foi entregue. Escrito por gatilho na transição de status para Preenchido — é facto observado, não marcação à mão. NULL nos formulários entregues antes da migração 048 (com alvo), e recuperado dos órfãos pelo passo 3.';


CREATE TABLE IF NOT EXISTS "public"."materiais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "categoria" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "unidade" "text" DEFAULT 'un'::"text",
    "ordem" integer DEFAULT 0,
    "ativo" boolean DEFAULT true,
    "def_carga" boolean DEFAULT true,
    "def_montagem" boolean DEFAULT true,
    "def_higienizacao" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantidade_total" integer DEFAULT 0 NOT NULL,
    "codigo" "text",
    "tipo" "text",
    "cor" "text",
    "medida" "text",
    "em_higienizacao" integer DEFAULT 0 NOT NULL,
    "por_confirmar" integer DEFAULT 0 NOT NULL,
    "stock_ideal" integer,
    "imagem_url" "text",
    "notas" "text",
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "materiais_em_higienizacao_nao_negativa" CHECK (("em_higienizacao" >= 0)),
    CONSTRAINT "materiais_por_confirmar_nao_negativa" CHECK (("por_confirmar" >= 0)),
    CONSTRAINT "materiais_quantidade_total_nao_negativa" CHECK (("quantidade_total" >= 0)),
    CONSTRAINT "materiais_stock_ideal_nao_negativo" CHECK ((("stock_ideal" IS NULL) OR ("stock_ideal" >= 0)))
);


ALTER TABLE "public"."materiais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "papel" "text" DEFAULT 'dono'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_papel_valido" CHECK (("papel" = ANY (ARRAY['dono'::"text", 'gestor'::"text", 'equipa'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens_tipo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chave" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "corpo" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."mensagens_tipo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notas_evento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "tipo" "text" DEFAULT 'interna'::"text" NOT NULL,
    "corpo" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "notas_evento_corpo_check" CHECK (("btrim"("corpo") <> ''::"text")),
    CONSTRAINT "notas_evento_tipo_check" CHECK (("tipo" = ANY (ARRAY['chamada'::"text", 'mensagem'::"text", 'alteracao'::"text", 'interna'::"text"])))
);


ALTER TABLE "public"."notas_evento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text" DEFAULT 'captacao'::"text" NOT NULL,
    "titulo" "text",
    "submission_id" "uuid",
    "cliente_id" "uuid",
    "event_type_id" "uuid",
    "dados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "lida_em" timestamp with time zone
);


ALTER TABLE "public"."notificacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."notificacoes" IS 'Caixa de Entrada do admin: uma linha por acontecimento (hoje, captações públicas), com snapshot do pedido em dados.';


CREATE TABLE IF NOT EXISTS "public"."pagamentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "previsto_id" "uuid",
    "valor" numeric(10,2) NOT NULL,
    "data" "date",
    "metodo" "text" NOT NULL,
    "origem" "text" DEFAULT 'sinal'::"text" NOT NULL,
    "contribuinte" "text",
    "notas" "text",
    "reconstituido" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "intencao_id" "uuid",
    "campanha_id" "uuid",
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "pagamentos_data_reconstituido_check" CHECK ((("data" IS NOT NULL) OR ("reconstituido" = true))),
    CONSTRAINT "pagamentos_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."pagamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagamentos_previstos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "descricao" "text" NOT NULL,
    "valor" numeric(10,2) NOT NULL,
    "data_limite" "date",
    "ordem" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pagamentos_previstos_valor_check" CHECK (("valor" > (0)::numeric))
);


ALTER TABLE "public"."pagamentos_previstos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_actos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "publicacao_id" "uuid" NOT NULL,
    "verificacao_id" "uuid",
    "acto" "text" NOT NULL,
    "nome_escrito" "text" NOT NULL,
    "mensagem" "text",
    "ip" "text",
    "user_agent" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmado_por" "uuid",
    "ficheiro" "text",
    CONSTRAINT "portal_actos_acto_check" CHECK (("acto" = ANY (ARRAY['aceitou'::"text", 'pediu_alteracao'::"text", 'assinou'::"text"])))
);


ALTER TABLE "public"."portal_actos" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_actos" IS 'Aceitação electrónica com trilho: quem (nome escrito), por que sessão verificada (e por ela, quem emitiu o código e quando), IP, user-agent, que versão. on delete RESTRICT: prova não se apaga por arrasto.';


COMMENT ON COLUMN "public"."portal_actos"."confirmado_por" IS 'Quem confirmou uma assinatura EM PAPEL (auth.uid da Nádia). No caminho digital fica NULL — lá a prova é a sessão verificada.';


COMMENT ON COLUMN "public"."portal_actos"."ficheiro" IS 'O caminho da fotografia do contrato assinado, no balde privado contratos-assinados. Só no caminho do papel.';


CREATE TABLE IF NOT EXISTS "public"."portal_condicoes_lidas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "publicacao_id" "uuid" NOT NULL,
    "ip" "text",
    "user_agent" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."portal_condicoes_lidas" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_condicoes_lidas" IS 'O pórtico das condições: a confirmação de que o cliente leu e entendeu as condições do orçamento ANTES de o abrir. Prova pré-código — o token privado, o IP, o user-agent e o carimbo. Uma leitura vale para o EVENTO inteiro, nunca por versão. on delete RESTRICT: prova não se apaga por arrasto.';


COMMENT ON COLUMN "public"."portal_condicoes_lidas"."acesso_id" IS 'A ligação privada por onde a confirmação entrou. Sem sessão verificada, o token É a prova de quem esteve do outro lado.';


COMMENT ON COLUMN "public"."portal_condicoes_lidas"."publicacao_id" IS 'A publicação de orçamento que estava em vigor no instante da leitura — fica para a história, mas a confirmação conta-se por evento.';


COMMENT ON COLUMN "public"."portal_condicoes_lidas"."ip" IS 'O endereço de onde veio a confirmação. Parte da prova, como nos actos.';


COMMENT ON COLUMN "public"."portal_condicoes_lidas"."user_agent" IS 'O navegador que confirmou. Parte da prova, como nos actos.';


COMMENT ON COLUMN "public"."portal_condicoes_lidas"."criado_em" IS 'O carimbo: «confirmou a leitura das condições a …».';


CREATE TABLE IF NOT EXISTS "public"."portal_publicacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "documento_id" "uuid",
    "tipo" "text" NOT NULL,
    "versao" integer NOT NULL,
    "instantaneo" "jsonb" NOT NULL,
    "publicado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "publicado_por" "uuid",
    CONSTRAINT "portal_publicacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['orcamento'::"text", 'proposta'::"text", 'contrato'::"text"])))
);


ALTER TABLE "public"."portal_publicacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_publicacoes" IS 'O que a cliente vê no acompanhamento: instantâneos congelados no momento de publicar. `documentos.dados` continua vivo; isto não.';


CREATE TABLE IF NOT EXISTS "public"."portal_sinal_confirmacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acesso_id" "uuid" NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "metodo_indicado" "text",
    "ip" "text",
    "user_agent" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "anulada_em" timestamp with time zone,
    "anulada_por" "text"
);


ALTER TABLE "public"."portal_sinal_confirmacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."portal_sinal_confirmacoes" IS 'O «já fiz o pagamento do sinal» do cliente, pelo portal. Prova pré-registo: o token privado, o IP, o user-agent e o carimbo — como o pórtico das condições (078). NUNCA reserva o dia (quem carimba é o registo da Nádia); enquanto viva (anulada_em IS NULL) fecha o ecrã do sinal aos rivais. on delete RESTRICT nos dois lados: prova não se apaga por arrasto.';


COMMENT ON COLUMN "public"."portal_sinal_confirmacoes"."acesso_id" IS 'A ligação privada por onde a confirmação entrou. Sem sessão verificada, o token É a prova de quem esteve do outro lado.';


COMMENT ON COLUMN "public"."portal_sinal_confirmacoes"."metodo_indicado" IS 'O método que o cliente DISSE ter usado (opcional). Texto livre — é uma indicação para a Nádia conferir, nunca um facto contabilístico.';


COMMENT ON COLUMN "public"."portal_sinal_confirmacoes"."anulada_em" IS 'NULL = confirmação viva (fecha o ecrã aos rivais). Preenchido = a Nádia limpou-a («afinal não pagou») — anula-se, nunca se apaga.';


COMMENT ON COLUMN "public"."portal_sinal_confirmacoes"."anulada_por" IS 'Quem limpou a confirmação, para a história dizer verdade.';


CREATE TABLE IF NOT EXISTS "public"."questionario_grupos" (
    "chave" "text" NOT NULL,
    "rotulo" "text" NOT NULL,
    "dias_antes" integer NOT NULL,
    "porque" "text" NOT NULL,
    "ordem" integer NOT NULL,
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "questionario_grupos_dias_antes_check" CHECK (("dias_antes" >= 0))
);


ALTER TABLE "public"."questionario_grupos" OWNER TO "postgres";


COMMENT ON TABLE "public"."questionario_grupos" IS 'Os grupos de prazo do questionário. Um passo do modelo aponta para um destes pela chave; passo sem grupo nunca fecha. O `porque` é o texto que a cliente lê quando encontra um campo fechado — e é por isso que é uma coluna e não uma constante: a razão material tem de poder mudar com o prazo.';


CREATE TABLE IF NOT EXISTS "public"."questionario_pedidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "campo_id" "text" NOT NULL,
    "campo_label" "text" NOT NULL,
    "pedido" "text" NOT NULL,
    "pedido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondido_em" timestamp with time zone,
    "respondido_por" "uuid",
    "dados" "jsonb"
);


ALTER TABLE "public"."questionario_pedidos" OWNER TO "postgres";


COMMENT ON TABLE "public"."questionario_pedidos" IS 'Quando o prazo de um grupo já passou, alterar deixa de mudar o valor e passa a pedir. O `campo_label` guarda-se por extenso de propósito: o rótulo do modelo pode ser editado depois, e o pedido tem de continuar a dizer o que ela pediu na altura.';


CREATE TABLE IF NOT EXISTS "public"."reservas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_cliente" "text" NOT NULL,
    "data_evento" "date",
    "event_type_id" "uuid",
    "contacto" "text",
    "nota" "text",
    "estado" "text" DEFAULT 'Provisória'::"text" NOT NULL,
    "submission_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reservas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."respostas_autoria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "campo_id" "text" NOT NULL,
    "autor" "text" NOT NULL,
    "autor_id" "uuid",
    "valor_anterior" "jsonb",
    "escrito_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "respostas_autoria_autor_check" CHECK (("autor" = ANY (ARRAY['cliente'::"text", 'equipa'::"text"])))
);


ALTER TABLE "public"."respostas_autoria" OWNER TO "postgres";


COMMENT ON TABLE "public"."respostas_autoria" IS 'Quem escreveu cada resposta, quando, e o que lá estava antes. Uma linha por escrita — as respostas em si continuam em submissions.respostas, intocadas. `autor` é o LADO (cliente ou equipa), não a pessoa: é isso que a cliente precisa de ver, e a pessoa fica em autor_id para o backoffice.';


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "nome_noivo" "text",
    "nome_noiva" "text",
    "contacto_principal" "text",
    "email" "text",
    "morada" "text",
    "data_evento" "date",
    "local_evento" "text",
    "numero_convidados" integer,
    "hora_inicio" time without time zone,
    "hora_termino" time without time zone,
    "hora_montagem" time without time zone,
    "hora_limite_montagem" time without time zone,
    "hora_recolha" time without time zone,
    "recolha_dia_seguinte" "text",
    "nome_responsavel" "text",
    "contacto_responsavel" "text",
    "relacao_responsavel" "text",
    "estilo_evento" "text"[],
    "estilo_outro" "text",
    "paleta_cores" "text"[],
    "paleta_observacoes" "text",
    "mesa_noivos" "text"[],
    "cartoes_pratos" "text",
    "observacoes_cartoes" "text",
    "descricao_mesa_noivos" "text",
    "cenario_palco" "text"[],
    "descricao_cenario" "text",
    "medidas_espaco" "text",
    "centros_mesa" "text"[],
    "tipo_flores" "text"[],
    "numero_mesas" integer,
    "formato_mesas" "text",
    "lugares_por_mesa" integer,
    "observacoes_mesas" "text",
    "texto_principal_placa" "text",
    "texto_secundario_placa" "text",
    "estilo_placa" "text"[],
    "notas_placa" "text",
    "morada_exacta" "text",
    "pessoa_abre_espaco" "text",
    "contacto_pessoa_abre" "text",
    "acesso_local" "text"[],
    "notas_acesso" "text",
    "observacoes_gerais" "text",
    "status" "text" DEFAULT 'Recebido'::"text",
    "event_type_id" "uuid",
    "respostas" "jsonb",
    "fase" "text" DEFAULT 'interessado'::"text" NOT NULL,
    "valor_acordado" numeric(10,2),
    "cliente_id" "uuid",
    "pagamento_final" boolean DEFAULT false NOT NULL,
    "questionario_entregue_em" timestamp with time zone,
    "sinal_pagamento" "jsonb",
    "dia_guardado_ate" "date",
    "tenant_id" "uuid" DEFAULT "public"."tenant_actual"() NOT NULL,
    "criado_por" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "submissions_fase_check" CHECK (("fase" = ANY (ARRAY['interessado'::"text", 'orcamento'::"text", 'sinal'::"text", 'cliente'::"text", 'projecto'::"text", 'contrato'::"text", 'perdido'::"text"]))),
    CONSTRAINT "submissions_status_pos_sinal" CHECK ((("status" <> ALL (ARRAY['Em Preparação'::"text", 'Confirmado'::"text", 'Concluído'::"text"])) OR ("fase" = ANY (ARRAY['contrato'::"text", 'cliente'::"text", 'projecto'::"text", 'perdido'::"text"]))))
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."submissions"."questionario_entregue_em" IS 'Quando o questionário ficou entregue. Vivia só em invites.preenchido_em, que não serve para quem responde pelo portal — essa pessoa pode não ter convite nenhum.';


COMMENT ON COLUMN "public"."submissions"."sinal_pagamento" IS 'A forma de pagamento do sinal configurada pela Nádia para ESTE evento: {metodo: mbway_iban|conversa|dinheiro|outra, mbway, iban, instrucao}. NULL = default do front (os dados da casa). Livre de propósito — uma forma nova nunca deve exigir migração.';


COMMENT ON COLUMN "public"."submissions"."dia_guardado_ate" IS 'O prazo da preferência do dia: «guardado para si até …». NULL = sem prazo (e os rivais não veem disputa nenhuma). Expira em leitura (>= current_date) e um por dia no máximo — quem verifica é dlm_dia_estado, nunca uma coluna de dono.';


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "prefixo" "text" NOT NULL,
    "locale" "text" DEFAULT 'pt-PT'::"text" NOT NULL,
    "moeda" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titular" "text",
    "morada" "text",
    "nif" "text",
    "iban" "text",
    "mbway" "text",
    "foro" "text",
    "dominio" "text",
    "whatsapp" "text",
    "logo_url" "text",
    "linha_actividade" "text",
    "linha_by" "text",
    "slogan" "text",
    CONSTRAINT "tenants_estado_valido" CHECK (("estado" = ANY (ARRAY['activo'::"text", 'suspenso'::"text", 'encerrado'::"text"]))),
    CONSTRAINT "tenants_prefixo_formato" CHECK (("prefixo" ~ '^[A-Z]{2,6}$'::"text")),
    CONSTRAINT "tenants_slug_formato" CHECK (("slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'::"text"))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenants" IS 'Uma casa — a empresa de eventos que usa o gestor. A Sollelio não é um tenant.';


COMMENT ON COLUMN "public"."tenants"."prefixo" IS 'O prefixo dos códigos de convite: DLM-WK6Q-49TE. Era literal no código; passa a ser dado.';


COMMENT ON COLUMN "public"."tenants"."locale" IS 'pt-PT ou pt-BR — muda vocabulário e formatos, não a língua.';


COMMENT ON COLUMN "public"."tenants"."titular" IS 'Quem assina os contratos — a 2.ª contraente. Diferente de `nome`, que é o nome comercial.';


COMMENT ON COLUMN "public"."tenants"."mbway" IS 'Com espaços, para ler. Quem copia recebe-o sem eles — a regra vive no front.';


COMMENT ON COLUMN "public"."tenants"."whatsapp" IS 'Canónico, com indicativo e sem sinais: 351927177190. O wa.me usa-o tal e qual.';


COMMENT ON COLUMN "public"."tenants"."logo_url" IS 'Endereço público no Storage (bucket identidade). Nulo enquanto o upload não acontecer.';


CREATE OR REPLACE VIEW "public"."v_destinatarios_possiveis" WITH ("security_invoker"='true') AS
 WITH "normaliza" AS (
         SELECT "s"."id" AS "submission_id",
            "s"."cliente_id",
            "c"."nome",
            COALESCE(NULLIF("c"."contacto", ''::"text"), NULLIF(("s"."respostas" ->> 'numeroWhatsapp'::"text"), ''::"text"), NULLIF(("s"."respostas" ->> 'contactoPrincipal'::"text"), ''::"text")) AS "telefone_bruto",
            "s"."event_type_id",
            "s"."data_evento",
            "s"."fase"
           FROM ("public"."submissions" "s"
             LEFT JOIN "public"."clientes" "c" ON (("c"."id" = "s"."cliente_id")))
        )
 SELECT "submission_id",
    "cliente_id",
    "nome",
    "telefone_bruto" AS "telefone",
    NULLIF("right"("regexp_replace"(COALESCE("telefone_bruto", ''::"text"), '\D'::"text", ''::"text", 'g'::"text"), 9), ''::"text") AS "telefone_chave",
    "event_type_id",
    "data_evento",
    "fase"
   FROM "normaliza";


ALTER VIEW "public"."v_destinatarios_possiveis" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_destinatarios_possiveis" IS 'Um sítio só para a pergunta «qual é o número desta pessoa?». Coluna primeiro, respostas do evento como recurso. Usada pelo recorte por eventos.';


ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("tenant_id", "chave");


ALTER TABLE ONLY "public"."avaliacao_eixos"
    ADD CONSTRAINT "avaliacao_eixos_pkey" PRIMARY KEY ("tenant_id", "chave");


ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_submission_id_key" UNIQUE ("submission_id");


ALTER TABLE ONLY "public"."campanha_intencoes"
    ADD CONSTRAINT "campanha_intencoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_token_unico" UNIQUE ("token");


ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."comunicado_destinatarios"
    ADD CONSTRAINT "comunicado_destinatarios_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."comunicado_modelos"
    ADD CONSTRAINT "comunicado_modelos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_token_key" UNIQUE ("token");


ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."event_types"
    ADD CONSTRAINT "event_types_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."evento_fotografias"
    ADD CONSTRAINT "evento_fotografias_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."evento_materiais"
    ADD CONSTRAINT "evento_materiais_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."evento_materiais"
    ADD CONSTRAINT "evento_materiais_submission_id_material_id_key" UNIQUE ("submission_id", "material_id");


ALTER TABLE ONLY "public"."form_errors"
    ADD CONSTRAINT "form_errors_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_code_key" UNIQUE ("code");


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id", "tenant_id");


ALTER TABLE ONLY "public"."mensagens_tipo"
    ADD CONSTRAINT "mensagens_tipo_chave_key" UNIQUE ("chave");


ALTER TABLE ONLY "public"."mensagens_tipo"
    ADD CONSTRAINT "mensagens_tipo_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."notas_evento"
    ADD CONSTRAINT "notas_evento_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."pagamentos_previstos"
    ADD CONSTRAINT "pagamentos_previstos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_acessos"
    ADD CONSTRAINT "portal_acessos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_acessos"
    ADD CONSTRAINT "portal_acessos_token_key" UNIQUE ("token");


ALTER TABLE ONLY "public"."portal_actos"
    ADD CONSTRAINT "portal_actos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_condicoes_lidas"
    ADD CONSTRAINT "portal_condicoes_lidas_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_publicacoes"
    ADD CONSTRAINT "portal_publicacoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_publicacoes"
    ADD CONSTRAINT "portal_publicacoes_submission_id_tipo_versao_key" UNIQUE ("submission_id", "tipo", "versao");


ALTER TABLE ONLY "public"."portal_sinal_confirmacoes"
    ADD CONSTRAINT "portal_sinal_confirmacoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."portal_verificacoes"
    ADD CONSTRAINT "portal_verificacoes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."questionario_grupos"
    ADD CONSTRAINT "questionario_grupos_pkey" PRIMARY KEY ("tenant_id", "chave");


ALTER TABLE ONLY "public"."questionario_pedidos"
    ADD CONSTRAINT "questionario_pedidos_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reservas"
    ADD CONSTRAINT "reservas_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."respostas_autoria"
    ADD CONSTRAINT "respostas_autoria_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_prefixo_key" UNIQUE ("prefixo");


ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");


CREATE INDEX "app_config_tenant_idx" ON "public"."app_config" USING "btree" ("tenant_id");


CREATE INDEX "avaliacao_eixos_tenant_idx" ON "public"."avaliacao_eixos" USING "btree" ("tenant_id");


CREATE INDEX "avaliacoes_por_publicar_idx" ON "public"."avaliacoes" USING "btree" ("criada_em" DESC) WHERE ("publicacao_autorizada" AND ("publicada_em" IS NULL));


CREATE INDEX "campanha_intencoes_campanha_idx" ON "public"."campanha_intencoes" USING "btree" ("campanha_id");


CREATE INDEX "campanhas_submission_idx" ON "public"."campanhas" USING "btree" ("submission_id");


CREATE UNIQUE INDEX "campanhas_uma_ativa_idx" ON "public"."campanhas" USING "btree" ("submission_id") WHERE ("estado" = 'ativa'::"text");


CREATE INDEX "clientes_tenant_idx" ON "public"."clientes" USING "btree" ("tenant_id");


CREATE INDEX "comunicado_destinatarios_comunicado_idx" ON "public"."comunicado_destinatarios" USING "btree" ("comunicado_id", "ordem");


CREATE UNIQUE INDEX "comunicado_destinatarios_sem_repetidos" ON "public"."comunicado_destinatarios" USING "btree" ("comunicado_id", "telefone_chave") WHERE ("telefone_chave" IS NOT NULL);


CREATE INDEX "comunicado_modelos_tenant_idx" ON "public"."comunicado_modelos" USING "btree" ("tenant_id");


CREATE INDEX "comunicados_modelo_idx" ON "public"."comunicados" USING "btree" ("modelo_id") WHERE ("modelo_id" IS NOT NULL);


CREATE INDEX "comunicados_tenant_idx" ON "public"."comunicados" USING "btree" ("tenant_id");


CREATE INDEX "comunicados_token_idx" ON "public"."comunicados" USING "btree" ("token") WHERE ("token" IS NOT NULL);


CREATE INDEX "event_types_tenant_idx" ON "public"."event_types" USING "btree" ("tenant_id");


CREATE UNIQUE INDEX "event_types_tenant_nome_uniq" ON "public"."event_types" USING "btree" ("tenant_id", "nome") NULLS NOT DISTINCT;


CREATE INDEX "evento_fotografias_evento_idx" ON "public"."evento_fotografias" USING "btree" ("submission_id", "ordem", "criado_em");


CREATE INDEX "form_errors_respostas_ate_idx" ON "public"."form_errors" USING "btree" ("respostas_ate") WHERE ("respostas" IS NOT NULL);


CREATE INDEX "form_errors_tenant_idx" ON "public"."form_errors" USING "btree" ("tenant_id");


CREATE INDEX "idx_documentos_submission" ON "public"."documentos" USING "btree" ("submission_id");


CREATE INDEX "idx_documentos_updated_at" ON "public"."documentos" USING "btree" ("updated_at" DESC);


CREATE INDEX "idx_evmat_material" ON "public"."evento_materiais" USING "btree" ("material_id");


CREATE INDEX "idx_evmat_submission" ON "public"."evento_materiais" USING "btree" ("submission_id");


CREATE INDEX "idx_invites_reserva" ON "public"."invites" USING "btree" ("reserva_id");


CREATE INDEX "idx_materiais_ativo" ON "public"."materiais" USING "btree" ("ativo");


CREATE INDEX "idx_materiais_categoria" ON "public"."materiais" USING "btree" ("categoria");


CREATE INDEX "idx_reservas_data" ON "public"."reservas" USING "btree" ("data_evento");


CREATE INDEX "idx_reservas_estado" ON "public"."reservas" USING "btree" ("estado");


CREATE INDEX "idx_reservas_submission" ON "public"."reservas" USING "btree" ("submission_id");


CREATE INDEX "invites_tenant_idx" ON "public"."invites" USING "btree" ("tenant_id");


CREATE UNIQUE INDEX "materiais_codigo_unico" ON "public"."materiais" USING "btree" ("codigo") WHERE ("codigo" IS NOT NULL);


CREATE INDEX "materiais_tenant_idx" ON "public"."materiais" USING "btree" ("tenant_id");


CREATE INDEX "memberships_tenant_idx" ON "public"."memberships" USING "btree" ("tenant_id");


CREATE INDEX "mensagens_tipo_tenant_idx" ON "public"."mensagens_tipo" USING "btree" ("tenant_id");


CREATE INDEX "notas_evento_submission_idx" ON "public"."notas_evento" USING "btree" ("submission_id", "created_at" DESC);


CREATE INDEX "notificacoes_nao_lidas_idx" ON "public"."notificacoes" USING "btree" ("created_at" DESC) WHERE ("lida_em" IS NULL);


CREATE INDEX "pagamentos_campanha_idx" ON "public"."pagamentos" USING "btree" ("campanha_id") WHERE ("campanha_id" IS NOT NULL);


CREATE INDEX "pagamentos_intencao_idx" ON "public"."pagamentos" USING "btree" ("intencao_id") WHERE ("intencao_id" IS NOT NULL);


CREATE UNIQUE INDEX "pagamentos_previstos_submissao_ordem_unq" ON "public"."pagamentos_previstos" USING "btree" ("submission_id", "ordem");


CREATE INDEX "pagamentos_previstos_submission_idx" ON "public"."pagamentos_previstos" USING "btree" ("submission_id");


CREATE INDEX "pagamentos_submission_idx" ON "public"."pagamentos" USING "btree" ("submission_id");


CREATE INDEX "portal_acessos_token_idx" ON "public"."portal_acessos" USING "btree" ("token");


CREATE UNIQUE INDEX "portal_acessos_vivo_idx" ON "public"."portal_acessos" USING "btree" ("submission_id") WHERE ("revogado_em" IS NULL);


CREATE UNIQUE INDEX "portal_actos_um_assinou_por_publicacao" ON "public"."portal_actos" USING "btree" ("publicacao_id") WHERE ("acto" = 'assinou'::"text");


COMMENT ON INDEX "public"."portal_actos_um_assinou_por_publicacao" IS 'Uma assinatura por versão, ao nível da base. O IF EXISTS das funções é cortesia; a tranca é esta.';


CREATE INDEX "portal_condicoes_lidas_pub_idx" ON "public"."portal_condicoes_lidas" USING "btree" ("publicacao_id");


CREATE INDEX "portal_publicacoes_evento_idx" ON "public"."portal_publicacoes" USING "btree" ("submission_id", "tipo", "versao" DESC);


CREATE INDEX "portal_sinal_confirmacoes_acesso_idx" ON "public"."portal_sinal_confirmacoes" USING "btree" ("acesso_id");


CREATE UNIQUE INDEX "portal_sinal_confirmacoes_viva_uidx" ON "public"."portal_sinal_confirmacoes" USING "btree" ("submission_id") WHERE ("anulada_em" IS NULL);


CREATE INDEX "portal_verificacoes_acesso_idx" ON "public"."portal_verificacoes" USING "btree" ("acesso_id", "pedido_em" DESC);


CREATE INDEX "questionario_grupos_tenant_idx" ON "public"."questionario_grupos" USING "btree" ("tenant_id");


CREATE INDEX "questionario_pedidos_por_responder_idx" ON "public"."questionario_pedidos" USING "btree" ("submission_id", "pedido_em" DESC) WHERE ("respondido_em" IS NULL);


CREATE INDEX "respostas_autoria_evento_idx" ON "public"."respostas_autoria" USING "btree" ("submission_id", "campo_id", "escrito_em" DESC);


CREATE INDEX "submissions_cliente_id_idx" ON "public"."submissions" USING "btree" ("cliente_id");


CREATE INDEX "submissions_fase_idx" ON "public"."submissions" USING "btree" ("fase");


CREATE INDEX "submissions_tenant_idx" ON "public"."submissions" USING "btree" ("tenant_id");


CREATE UNIQUE INDEX "uq_documentos_tipo_manual" ON "public"."documentos" USING "btree" ("tipo") WHERE ("submission_id" IS NULL);


CREATE UNIQUE INDEX "uq_documentos_tipo_submission" ON "public"."documentos" USING "btree" ("tipo", "submission_id") WHERE ("submission_id" IS NOT NULL);


CREATE OR REPLACE TRIGGER "documentos_trancados" BEFORE UPDATE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."dlm_travar_documento_trancado"();


CREATE OR REPLACE TRIGGER "invites_marcar_preenchido" BEFORE INSERT OR UPDATE ON "public"."invites" FOR EACH ROW EXECUTE FUNCTION "public"."dlm_marcar_preenchido"();


CREATE OR REPLACE TRIGGER "trg_documentos_updated_at" BEFORE UPDATE ON "public"."documentos" FOR EACH ROW EXECUTE FUNCTION "public"."documentos_set_updated_at"();


CREATE OR REPLACE TRIGGER "trg_notificar_captacao" AFTER INSERT ON "public"."submissions" FOR EACH ROW EXECUTE FUNCTION "public"."dlm_notificar_captacao"();


ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."avaliacao_eixos"
    ADD CONSTRAINT "avaliacao_eixos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."avaliacao_eixos"
    ADD CONSTRAINT "avaliacao_eixos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_fotografia_id_fkey" FOREIGN KEY ("fotografia_id") REFERENCES "public"."evento_fotografias"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."campanha_intencoes"
    ADD CONSTRAINT "campanha_intencoes_campanha_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."comunicado_destinatarios"
    ADD CONSTRAINT "comunicado_destinatarios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."comunicado_destinatarios"
    ADD CONSTRAINT "comunicado_destinatarios_comunicado_id_fkey" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."comunicado_destinatarios"
    ADD CONSTRAINT "comunicado_destinatarios_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."comunicado_modelos"
    ADD CONSTRAINT "comunicado_modelos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."comunicado_modelos"
    ADD CONSTRAINT "comunicado_modelos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "public"."comunicado_modelos"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."comunicados"
    ADD CONSTRAINT "comunicados_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."event_types"
    ADD CONSTRAINT "event_types_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."event_types"
    ADD CONSTRAINT "event_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."evento_fotografias"
    ADD CONSTRAINT "evento_fotografias_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."evento_materiais"
    ADD CONSTRAINT "evento_materiais_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materiais"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."evento_materiais"
    ADD CONSTRAINT "evento_materiais_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."form_errors"
    ADD CONSTRAINT "form_errors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id");


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_submission_alvo_id_fkey" FOREIGN KEY ("submission_alvo_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."mensagens_tipo"
    ADD CONSTRAINT "mensagens_tipo_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."mensagens_tipo"
    ADD CONSTRAINT "mensagens_tipo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."notas_evento"
    ADD CONSTRAINT "notas_evento_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."notas_evento"
    ADD CONSTRAINT "notas_evento_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_campanha_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_intencao_fk" FOREIGN KEY ("intencao_id") REFERENCES "public"."campanha_intencoes"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_previsto_fk" FOREIGN KEY ("previsto_id") REFERENCES "public"."pagamentos_previstos"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."pagamentos_previstos"
    ADD CONSTRAINT "pagamentos_previstos_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."pagamentos"
    ADD CONSTRAINT "pagamentos_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_acessos"
    ADD CONSTRAINT "portal_acessos_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."portal_actos"
    ADD CONSTRAINT "portal_actos_publicacao_id_fkey" FOREIGN KEY ("publicacao_id") REFERENCES "public"."portal_publicacoes"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_actos"
    ADD CONSTRAINT "portal_actos_verificacao_id_fkey" FOREIGN KEY ("verificacao_id") REFERENCES "public"."portal_verificacoes"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_condicoes_lidas"
    ADD CONSTRAINT "portal_condicoes_lidas_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_condicoes_lidas"
    ADD CONSTRAINT "portal_condicoes_lidas_publicacao_id_fkey" FOREIGN KEY ("publicacao_id") REFERENCES "public"."portal_publicacoes"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_publicacoes"
    ADD CONSTRAINT "portal_publicacoes_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."portal_publicacoes"
    ADD CONSTRAINT "portal_publicacoes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."portal_sinal_confirmacoes"
    ADD CONSTRAINT "portal_sinal_confirmacoes_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_sinal_confirmacoes"
    ADD CONSTRAINT "portal_sinal_confirmacoes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."portal_verificacoes"
    ADD CONSTRAINT "portal_verificacoes_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "public"."portal_acessos"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."questionario_grupos"
    ADD CONSTRAINT "questionario_grupos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."questionario_grupos"
    ADD CONSTRAINT "questionario_grupos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE ONLY "public"."questionario_pedidos"
    ADD CONSTRAINT "questionario_pedidos_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reservas"
    ADD CONSTRAINT "reservas_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."reservas"
    ADD CONSTRAINT "reservas_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."respostas_autoria"
    ADD CONSTRAINT "respostas_autoria_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");


ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id");


ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");


ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."avaliacao_eixos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."avaliacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campanha_intencoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campanhas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicado_destinatarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicado_modelos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evento_fotografias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evento_materiais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."form_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."materiais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_leitura" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


ALTER TABLE "public"."mensagens_tipo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notas_evento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagamentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagamentos_previstos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_acessos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_actos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_condicoes_lidas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_publicacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_sinal_confirmacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_verificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionario_grupos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionario_pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."respostas_autoria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_isolamento" ON "public"."app_config" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."avaliacao_eixos" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."avaliacoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "avaliacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "avaliacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."campanha_intencoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."campanhas" "c"
     JOIN "public"."submissions" "s" ON (("s"."id" = "c"."submission_id")))
  WHERE (("c"."id" = "campanha_intencoes"."campanha_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."campanhas" "c"
     JOIN "public"."submissions" "s" ON (("s"."id" = "c"."submission_id")))
  WHERE (("c"."id" = "campanha_intencoes"."campanha_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."campanhas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "campanhas"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "campanhas"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."clientes" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."comunicado_destinatarios" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."comunicados" "c"
  WHERE (("c"."id" = "comunicado_destinatarios"."comunicado_id") AND ("c"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."comunicados" "c"
  WHERE (("c"."id" = "comunicado_destinatarios"."comunicado_id") AND ("c"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."comunicado_modelos" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."comunicados" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."documentos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "documentos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "documentos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."event_types" TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."evento_fotografias" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "evento_fotografias"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "evento_fotografias"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."evento_materiais" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "evento_materiais"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "evento_materiais"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."form_errors" TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."invites" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."materiais" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."mensagens_tipo" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."notas_evento" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "notas_evento"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "notas_evento"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."notificacoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "notificacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "notificacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."pagamentos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "pagamentos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "pagamentos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."pagamentos_previstos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "pagamentos_previstos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "pagamentos_previstos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_acessos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_acessos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_acessos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_actos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."portal_publicacoes" "pp"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pp"."submission_id")))
  WHERE (("pp"."id" = "portal_actos"."publicacao_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."portal_publicacoes" "pp"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pp"."submission_id")))
  WHERE (("pp"."id" = "portal_actos"."publicacao_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_condicoes_lidas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."portal_acessos" "pa"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pa"."submission_id")))
  WHERE (("pa"."id" = "portal_condicoes_lidas"."acesso_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."portal_acessos" "pa"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pa"."submission_id")))
  WHERE (("pa"."id" = "portal_condicoes_lidas"."acesso_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_publicacoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_publicacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_publicacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_sinal_confirmacoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_sinal_confirmacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "portal_sinal_confirmacoes"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."portal_verificacoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."portal_acessos" "pa"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pa"."submission_id")))
  WHERE (("pa"."id" = "portal_verificacoes"."acesso_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."portal_acessos" "pa"
     JOIN "public"."submissions" "s" ON (("s"."id" = "pa"."submission_id")))
  WHERE (("pa"."id" = "portal_verificacoes"."acesso_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."questionario_grupos" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


CREATE POLICY "tenant_isolamento" ON "public"."questionario_pedidos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "questionario_pedidos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "questionario_pedidos"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."reservas" TO "authenticated" USING ((("submission_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "reservas"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))))) WITH CHECK ((("submission_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "reservas"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))));


CREATE POLICY "tenant_isolamento" ON "public"."respostas_autoria" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "respostas_autoria"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."submissions" "s"
  WHERE (("s"."id" = "respostas_autoria"."submission_id") AND ("s"."tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))))));


CREATE POLICY "tenant_isolamento" ON "public"."submissions" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_leitura" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "public"."tenants_do_utilizador"() AS "tenants_do_utilizador")));


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


REVOKE ALL ON FUNCTION "public"."_ajustar_registo"("alvo" "regclass", "registo" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_ajustar_registo"("alvo" "regclass", "registo" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_ajustar_registo"("alvo" "regclass", "registo" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."as_minhas_casas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_minhas_casas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."as_minhas_casas"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."briefing_materiais"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."briefing_materiais"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."briefing_materiais"("p_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."campanha_publica"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campanha_publica"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."campanha_publica"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."campanha_publica"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."captacao_dedupe"("p_digitos" "text", "p_data" "date", "p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."captacao_dedupe"("p_digitos" "text", "p_data" "date", "p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."captacao_dedupe"("p_digitos" "text", "p_data" "date", "p_tenant" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."captacao_submeter"("p_payload" "jsonb", "p_tenant_slug" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."casa_do_token_activa"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."casa_do_token_activa"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."casa_do_token_activa"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."contribuicao_registar"("p_submission_id" "uuid", "p_valor" numeric, "p_metodo" "text", "p_data" "date", "p_contribuinte" "text", "p_notas" "text", "p_intencao_id" "uuid", "p_campanha_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contribuicao_registar"("p_submission_id" "uuid", "p_valor" numeric, "p_metodo" "text", "p_data" "date", "p_contribuinte" "text", "p_notas" "text", "p_intencao_id" "uuid", "p_campanha_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contribuicao_registar"("p_submission_id" "uuid", "p_valor" numeric, "p_metodo" "text", "p_data" "date", "p_contribuinte" "text", "p_notas" "text", "p_intencao_id" "uuid", "p_campanha_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_actualizar_campo"("p_steps" "jsonb", "p_id" "text", "p_patch" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_comunicado_publicar"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_comunicado_publicar"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_comunicado_publicar"("p_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_comunicado_retirar"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_comunicado_retirar"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_comunicado_retirar"("p_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_comunicado_ver"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_comunicado_ver"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."dlm_comunicado_ver"("p_token" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."dlm_dia_estado"("p_data" "date", "p_excluir" "uuid", "p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_dia_estado"("p_data" "date", "p_excluir" "uuid", "p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_dia_estado"("p_data" "date", "p_excluir" "uuid", "p_tenant" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_fase_avancar_ate"("p_submission_id" "uuid", "p_fase" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_fase_avancar_ate"("p_submission_id" "uuid", "p_fase" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_fase_avancar_ate"("p_submission_id" "uuid", "p_fase" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_inserir_campo_antes"("p_steps" "jsonb", "p_campo" "jsonb", "p_ancora" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_marcar_preenchido"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_marcar_preenchido"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_marcar_preenchido"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_notificar_captacao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_notificar_captacao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_notificar_captacao"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_abrir"("p_submission_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_token_portal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_token_portal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_token_portal"() TO "service_role";


GRANT ALL ON TABLE "public"."portal_acessos" TO "anon";
GRANT ALL ON TABLE "public"."portal_acessos" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_acessos" TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_acesso_por_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_acesso_por_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_acesso_por_token"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text", "p_versao" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text", "p_versao" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text", "p_versao" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_acto"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_acto" "text", "p_nome" "text", "p_mensagem" "text", "p_versao" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliacao"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text", "p_autorizar" boolean, "p_nome_como" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text", "p_autorizar" boolean, "p_nome_como" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text", "p_autorizar" boolean, "p_nome_como" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_avaliar"("p_token" "text", "p_frase" "text", "p_eixos" "jsonb", "p_fotografia" "text", "p_autorizar" boolean, "p_nome_como" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_condicoes_lidas"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_confirmar_papel"("p_notificacao_id" "uuid", "p_nome" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_confirmar_papel"("p_notificacao_id" "uuid", "p_nome" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_confirmar_papel"("p_notificacao_id" "uuid", "p_nome" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_confirmar_sinal"("p_token" "text", "p_metodo" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_documentos"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_documentos"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_documentos"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_documentos"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_emitir_codigo"("p_verificacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_emitir_codigo"("p_verificacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_emitir_codigo"("p_verificacao_id" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_alteracao_campo"("p_token" "text", "p_campo" "text", "p_pedido" "text", "p_dados" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_pedir_codigo"("p_token" "text", "p_contexto" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_publicar"("p_submission_id" "uuid", "p_tipo" "text", "p_extra" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_publicar"("p_submission_id" "uuid", "p_tipo" "text", "p_extra" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_publicar"("p_submission_id" "uuid", "p_tipo" "text", "p_extra" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_questionario"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_questionario"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_questionario"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_questionario"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_registar_assinado_papel"("p_token" "text", "p_caminho" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."dlm_portal_responder"("p_token" "text", "p_campo" "text", "p_valor" "jsonb") TO "anon";


REVOKE ALL ON FUNCTION "public"."dlm_portal_revogar"("p_submission_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_revogar"("p_submission_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_revogar"("p_submission_id" "uuid", "p_motivo" "text") TO "service_role";


GRANT ALL ON TABLE "public"."portal_verificacoes" TO "anon";
GRANT ALL ON TABLE "public"."portal_verificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_verificacoes" TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_sessao"("p_acesso_id" "uuid", "p_verificacao" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_sessao"("p_acesso_id" "uuid", "p_verificacao" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_sessao"("p_acesso_id" "uuid", "p_verificacao" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_ver"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_ver"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_ver"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."dlm_portal_ver"("p_token" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_versao" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_versao" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_versao" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_ver_documento"("p_token" "text", "p_tipo" "text", "p_verificacao" "uuid", "p_versao" integer) TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_ver_interno"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_ver_interno"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_portal_verificar"("p_token" "text", "p_codigo" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_questionario_conta_campos"("p_steps" "jsonb") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_questionario_respondido"("p_valor" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_questionario_respondido"("p_valor" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_questionario_respondido"("p_valor" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_registar_sinal"("p_submission" "uuid", "p_valor" numeric, "p_data" "date", "p_metodo" "text", "p_contribuinte" "text", "p_notas" "text", "p_forcar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_registar_sinal"("p_submission" "uuid", "p_valor" numeric, "p_data" "date", "p_metodo" "text", "p_contribuinte" "text", "p_notas" "text", "p_forcar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_registar_sinal"("p_submission" "uuid", "p_valor" numeric, "p_data" "date", "p_metodo" "text", "p_contribuinte" "text", "p_notas" "text", "p_forcar" boolean) TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_safe_date"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_safe_date"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_safe_date"("t" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_safe_int"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_safe_int"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_safe_int"("t" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_safe_time"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_safe_time"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_safe_time"("t" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_safe_uuid"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_safe_uuid"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_safe_uuid"("t" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_token_comunicado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_token_comunicado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_token_comunicado"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."dlm_travar_documento_trancado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dlm_travar_documento_trancado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_travar_documento_trancado"() TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_txt"("v" "jsonb", "k" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_txt"("v" "jsonb", "k" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_txt"("v" "jsonb", "k" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_txt_array"("v" "jsonb", "k" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_txt_array"("v" "jsonb", "k" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_txt_array"("v" "jsonb", "k" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dlm_velar_instantaneo"("p_dados" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."documentos_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."documentos_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."documentos_set_updated_at"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."formulario_briefing"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."formulario_briefing"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."formulario_briefing"("p_id" "uuid") TO "service_role";


GRANT ALL ON FUNCTION "public"."formulario_submeter"("p_codigo" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."formulario_submeter"("p_codigo" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."formulario_submeter"("p_codigo" "text", "p_payload" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."formulario_validar_convite"("p_codigo" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_conhecida"("p_tenant" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_da_casa"("p_tenant" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_da_casa_por_slug"("p_slug" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_da_casa_sem_filtro"("p_tenant" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_da_casa_sem_filtro"("p_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_da_casa_sem_filtro"("p_tenant" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_da_minha_casa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_da_minha_casa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_da_minha_casa"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_da_minha_casa"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_da_minha_casa"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_da_minha_casa"("p_slug" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_por_codigo"("p_codigo" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."identidade_por_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."identidade_por_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."identidade_por_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."identidade_por_token"("p_token" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."importar_cliente"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."importar_cliente"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."importar_cliente"("payload" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."nome_do_autor"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nome_do_autor"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nome_do_autor"("p_user" "uuid") TO "service_role";


REVOKE ALL ON FUNCTION "public"."nome_do_utilizador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nome_do_utilizador"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."nome_do_utilizador"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."prometer_contribuicao"("p_token" "text", "p_nome" "text", "p_valor" numeric, "p_mensagem" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb", "p_contexto" "jsonb", "p_respostas" "jsonb", "p_tenant_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb", "p_contexto" "jsonb", "p_respostas" "jsonb", "p_tenant_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb", "p_contexto" "jsonb", "p_respostas" "jsonb", "p_tenant_slug" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."registar_erro_formulario"("p_origem" "text", "p_mensagem" "text", "p_detalhe" "jsonb", "p_contexto" "jsonb", "p_respostas" "jsonb", "p_tenant_slug" "text") TO "anon";


REVOKE ALL ON FUNCTION "public"."submissao_fundir_respostas"("p_id" "uuid", "p_patch" "jsonb", "p_colunas" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submissao_fundir_respostas"("p_id" "uuid", "p_patch" "jsonb", "p_colunas" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submissao_fundir_respostas"("p_id" "uuid", "p_patch" "jsonb", "p_colunas" "jsonb") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tenant_actual"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_actual"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenant_actual"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tenant_do_pedido"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_do_pedido"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenant_do_pedido"("p_slug" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tenant_por_slug"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenant_por_slug"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenant_por_slug"("p_slug" "text") TO "service_role";


REVOKE ALL ON FUNCTION "public"."tenants_do_utilizador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tenants_do_utilizador"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tenants_do_utilizador"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tipos_de_evento_publicos"("p_tenant_slug" "text") TO "service_role";


GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";


GRANT ALL ON TABLE "public"."avaliacao_eixos" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacao_eixos" TO "service_role";


GRANT ALL ON TABLE "public"."avaliacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacoes" TO "service_role";


GRANT ALL ON TABLE "public"."campanha_intencoes" TO "anon";
GRANT ALL ON TABLE "public"."campanha_intencoes" TO "authenticated";
GRANT ALL ON TABLE "public"."campanha_intencoes" TO "service_role";


GRANT ALL ON TABLE "public"."campanhas" TO "anon";
GRANT ALL ON TABLE "public"."campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."campanhas" TO "service_role";


GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";


GRANT ALL ON TABLE "public"."comunicado_destinatarios" TO "anon";
GRANT ALL ON TABLE "public"."comunicado_destinatarios" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicado_destinatarios" TO "service_role";


GRANT ALL ON TABLE "public"."comunicado_modelos" TO "anon";
GRANT ALL ON TABLE "public"."comunicado_modelos" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicado_modelos" TO "service_role";


GRANT ALL ON TABLE "public"."comunicados" TO "anon";
GRANT ALL ON TABLE "public"."comunicados" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicados" TO "service_role";


GRANT ALL ON TABLE "public"."documentos" TO "anon";
GRANT ALL ON TABLE "public"."documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos" TO "service_role";


GRANT ALL ON TABLE "public"."event_types" TO "anon";
GRANT ALL ON TABLE "public"."event_types" TO "authenticated";
GRANT ALL ON TABLE "public"."event_types" TO "service_role";


GRANT ALL ON TABLE "public"."evento_fotografias" TO "authenticated";
GRANT ALL ON TABLE "public"."evento_fotografias" TO "service_role";


GRANT ALL ON TABLE "public"."evento_materiais" TO "anon";
GRANT ALL ON TABLE "public"."evento_materiais" TO "authenticated";
GRANT ALL ON TABLE "public"."evento_materiais" TO "service_role";


GRANT ALL ON TABLE "public"."form_errors" TO "anon";
GRANT ALL ON TABLE "public"."form_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."form_errors" TO "service_role";


GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";


GRANT ALL ON TABLE "public"."materiais" TO "anon";
GRANT ALL ON TABLE "public"."materiais" TO "authenticated";
GRANT ALL ON TABLE "public"."materiais" TO "service_role";


GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";


GRANT ALL ON TABLE "public"."mensagens_tipo" TO "anon";
GRANT ALL ON TABLE "public"."mensagens_tipo" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens_tipo" TO "service_role";


GRANT ALL ON TABLE "public"."notas_evento" TO "anon";
GRANT ALL ON TABLE "public"."notas_evento" TO "authenticated";
GRANT ALL ON TABLE "public"."notas_evento" TO "service_role";


GRANT ALL ON TABLE "public"."notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacoes" TO "service_role";


GRANT ALL ON TABLE "public"."pagamentos" TO "anon";
GRANT ALL ON TABLE "public"."pagamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamentos" TO "service_role";


GRANT ALL ON TABLE "public"."pagamentos_previstos" TO "anon";
GRANT ALL ON TABLE "public"."pagamentos_previstos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagamentos_previstos" TO "service_role";


GRANT ALL ON TABLE "public"."portal_actos" TO "anon";
GRANT ALL ON TABLE "public"."portal_actos" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_actos" TO "service_role";


GRANT ALL ON TABLE "public"."portal_condicoes_lidas" TO "anon";
GRANT ALL ON TABLE "public"."portal_condicoes_lidas" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_condicoes_lidas" TO "service_role";


GRANT ALL ON TABLE "public"."portal_publicacoes" TO "anon";
GRANT ALL ON TABLE "public"."portal_publicacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_publicacoes" TO "service_role";


GRANT ALL ON TABLE "public"."portal_sinal_confirmacoes" TO "anon";
GRANT ALL ON TABLE "public"."portal_sinal_confirmacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_sinal_confirmacoes" TO "service_role";


GRANT ALL ON TABLE "public"."questionario_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."questionario_grupos" TO "service_role";


GRANT ALL ON TABLE "public"."questionario_pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."questionario_pedidos" TO "service_role";


GRANT ALL ON TABLE "public"."reservas" TO "anon";
GRANT ALL ON TABLE "public"."reservas" TO "authenticated";
GRANT ALL ON TABLE "public"."reservas" TO "service_role";


GRANT ALL ON TABLE "public"."respostas_autoria" TO "authenticated";
GRANT ALL ON TABLE "public"."respostas_autoria" TO "service_role";


GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";


GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";


GRANT ALL ON TABLE "public"."v_destinatarios_possiveis" TO "authenticated";
GRANT ALL ON TABLE "public"."v_destinatarios_possiveis" TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- =============================================================================
-- Storage buckets that exist in production (bucket "materiais" intentionally
-- absent: it exists only in staging). Bucket rows are platform configuration,
-- not customer data. Objects are never created here.
-- =============================================================================

INSERT INTO "storage"."buckets" ("id", "name", "public") VALUES
  ('referencias', 'referencias', true),
  ('propostas', 'propostas', true),
  ('contratos-assinados', 'contratos-assinados', false),
  ('fotografias', 'fotografias', true),
  ('comunicados', 'comunicados', true),
  ('identidade', 'identidade', true)
ON CONFLICT ("id") DO NOTHING;

-- =============================================================================
-- storage.objects policies (13), identical in staging and production. The three
-- "materiais_*" policies reference a bucket that production does not have; they
-- are reproduced as-is because they are part of the audited state.
-- =============================================================================

CREATE POLICY "admin le contratos assinados" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'contratos-assinados'::"text"));
CREATE POLICY "comunicados_img_equipa_escreve" ON "storage"."objects" TO "authenticated" USING (("bucket_id" = 'comunicados'::"text")) WITH CHECK (("bucket_id" = 'comunicados'::"text"));
CREATE POLICY "equipa apaga fotografias" ON "storage"."objects" FOR DELETE TO "authenticated" USING (("bucket_id" = 'fotografias'::"text"));
CREATE POLICY "equipa carrega fotografias" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'fotografias'::"text"));
CREATE POLICY "equipa ve fotografias" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'fotografias'::"text"));
CREATE POLICY "materiais_leitura_publica" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'materiais'::"text"));
CREATE POLICY "materiais_update_autenticado" ON "storage"."objects" FOR UPDATE TO "authenticated" USING (("bucket_id" = 'materiais'::"text"));
CREATE POLICY "materiais_upload_autenticado" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'materiais'::"text"));
CREATE POLICY "portal envia contrato assinado" ON "storage"."objects" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("bucket_id" = 'contratos-assinados'::"text") AND ("name" ~~ 'papel\_%'::"text") AND (("length"("name") >= 12) AND ("length"("name") <= 120))));
CREATE POLICY "propostas_insert_autenticado" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'propostas'::"text"));
CREATE POLICY "propostas_select_publico" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'propostas'::"text"));
CREATE POLICY "referencias_insert_publico" ON "storage"."objects" FOR INSERT TO "authenticated", "anon" WITH CHECK (("bucket_id" = 'referencias'::"text"));
CREATE POLICY "referencias_select_publico" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'referencias'::"text"));

-- =============================================================================
-- Realtime: membership of the platform publication "supabase_realtime".
-- Guarded so that the baseline is idempotent and does not fail if the platform
-- has not created the publication yet.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['campanha_intencoes', 'event_types', 'invites', 'notificacoes', 'submissions'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public".%I', t);
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'publication supabase_realtime not found - realtime membership skipped';
  END IF;
END
$$;

-- =============================================================================
-- Function execute privileges that production still grants to PUBLIC (legacy
-- default ACLs from before migration 101). Declared explicitly so that the
-- reconstructed state does not depend on the default privileges of the host.
-- =============================================================================

GRANT EXECUTE ON FUNCTION "public"."dlm_actualizar_campo"(p_steps jsonb, p_id text, p_patch jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_inserir_campo_antes"(p_steps jsonb, p_campo jsonb, p_ancora text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_questionario_conta_campos"(p_steps jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_questionario_respondido"(p_valor jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_safe_date"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_safe_int"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_safe_time"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_safe_uuid"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_txt"(v jsonb, k text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_txt_array"(v jsonb, k text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."dlm_velar_instantaneo"(p_dados jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."formulario_submeter"(p_codigo text, p_payload jsonb) TO PUBLIC;

-- =============================================================================
-- Objects on which production grants NOTHING to anon (the legacy migrations
-- 062/065/066/080 revoked it). Declared explicitly because a host whose default
-- privileges still auto-expose new tables would otherwise leave residual anon
-- privileges on them.
-- =============================================================================

REVOKE ALL ON TABLE "public"."avaliacao_eixos" FROM "anon";
REVOKE ALL ON TABLE "public"."avaliacoes" FROM "anon";
REVOKE ALL ON TABLE "public"."evento_fotografias" FROM "anon";
REVOKE ALL ON TABLE "public"."questionario_grupos" FROM "anon";
REVOKE ALL ON TABLE "public"."questionario_pedidos" FROM "anon";
REVOKE ALL ON TABLE "public"."respostas_autoria" FROM "anon";
REVOKE ALL ON TABLE "public"."v_destinatarios_possiveis" FROM "anon";

-- =============================================================================
-- Default privileges for role postgres in schema public, as audited in
-- production: tables and sequences default to anon/authenticated/service_role;
-- functions default to authenticated/service_role only (neither anon nor
-- PUBLIC). The GRANT side is emitted above by pg_dump; the REVOKE side is
-- declared here.
-- =============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM "anon";
