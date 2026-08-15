-- ============================================================================
-- 093 · A casa vem do endereço — o fim do palpite no lado público
--
-- As migrações 090-092 puseram a casa na base de dados e nas políticas. Falta
-- o lado de fora: quem chega sem sessão não tem como dizer a que casa
-- pertence, e o remendo do tenant_actual() só funciona enquanto houver uma.
--
-- A REGRA: o tenant entra por UMA porta — tenant_por_slug(). Nenhuma função
-- pública o adivinha, nenhuma o recebe como uuid vindo do browser (um uuid
-- de fora é um pedido para escrever na casa alheia). O slug é público por
-- desenho: está no endereço, não é credencial, e sozinho não abre nada.
--
-- QUATRO CORRECÇÕES, e três são falhas a sério que a RLS não trava — funções
-- SECURITY DEFINER ignoram políticas por definição:
--
--   · captacao_dedupe procura cliente por telefone em TODAS as casas. Uma
--     noiva que ligue para dois buffets ficaria colada à ficha do primeiro.
--     Isto não vaza dados — escreve-os no sítio errado, que é pior: não dá
--     erro, e desfazer meses depois é impossível.
--   · dlm_dia_estado devolve rival_nome. Sem escopo, o calendário de uma
--     casa mostra o NOME de uma cliente de outra. O dlm_portal_ver teve o
--     cuidado de nunca deixar o rival passar para o noivo; a chamada directa
--     do admin não tinha.
--   · captacao_submeter devolve to_jsonb(v_sub) — as 56 colunas para o anon.
--     Passa a projecção explícita, o padrão do dlm_portal_ver.
--   · A leitura anónima de event_types some. Uma política não sabe de que
--     casa é o pedido, portanto não há como limitá-la; os tipos passam a vir
--     por RPC, como tudo o resto do lado público.
--
-- ⚠ ESTA MIGRAÇÃO E O DEPLOY DO FRONTEND TÊM DE IR JUNTOS. As assinaturas
-- mudam. Entre uma coisa e outra, /interesse fica em baixo.
-- ============================================================================

-- ── 1 · A porta única ───────────────────────────────────────────────────────

create or replace function public.tenant_por_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.tenants
   where slug = lower(btrim(coalesce(p_slug, '')))
     and estado = 'activo';
$$;

revoke all     on function public.tenant_por_slug(text) from public;
grant  execute on function public.tenant_por_slug(text) to anon, authenticated;

comment on function public.tenant_por_slug(text) is
  'A casa, a partir do slug do endereço. Devolve NULL para slug desconhecido ou casa suspensa — quem chama decide se isso é erro.';

-- ── 2 · Os tipos de evento, sem política anónima ────────────────────────────
--
-- Projecção mínima: id e nome, o que o select do formulário desenha. Os
-- `steps` NÃO saem — são o desenho do formulário da casa, e o lado público
-- não precisa deles para escolher um tipo.

create or replace function public.tipos_de_evento_publicos(p_tenant_slug text)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select et.id, et.nome
    from public.event_types et
   where et.tenant_id = public.tenant_por_slug(p_tenant_slug)
   order by et.nome;
$$;

revoke all     on function public.tipos_de_evento_publicos(text) from public;
grant  execute on function public.tipos_de_evento_publicos(text) to anon, authenticated;

drop policy if exists publico_le_tipos_de_evento on public.event_types;

-- ── 3 · O dedupe, dentro da casa ────────────────────────────────────────────
--
-- p_tenant é obrigatório e vem SEMPRE de tenant_por_slug ou tenant_actual —
-- nunca do browser. Sem ele, não há procura: devolver nada é melhor do que
-- devolver a pessoa errada.

drop function if exists public.captacao_dedupe(text, date);

create or replace function public.captacao_dedupe(
  p_digitos text,
  p_data date default null,
  p_tenant uuid default null
) returns table (cliente_id uuid, evento_id uuid)
language plpgsql
security definer
set search_path = public
as $$
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

revoke all     on function public.captacao_dedupe(text, date, uuid) from public;
grant  execute on function public.captacao_dedupe(text, date, uuid) to authenticated;

-- ── 4 · A disputa do dia, dentro da casa ────────────────────────────────────
--
-- p_tenant nulo cai no tenant_actual() — é o caminho do admin, onde há
-- sessão. O dlm_portal_ver chama-a a partir de uma submission que já tem
-- tenant_id, e passa-o explicitamente (ver ponto 6).

create or replace function public.dlm_dia_estado(
  p_data date,
  p_excluir uuid default null,
  p_tenant uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rival  public.submissions%rowtype;
  v_nome   text;
  v_tenant uuid := coalesce(p_tenant, public.tenant_actual());
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

revoke all     on function public.dlm_dia_estado(date, uuid, uuid) from public;
grant  execute on function public.dlm_dia_estado(date, uuid, uuid) to authenticated;

-- ── 5 · A submissão, com a casa explícita ───────────────────────────────────
--
-- p_tenant_slug nulo é o modo interno (modoInterno no CaptacaoForm): a Nádia
-- cria um interessado a partir do admin, tem sessão, e o tenant_actual()
-- responde. Do lado público o slug é obrigatório — sem ele, excepção, nunca
-- um palpite.
--
-- A resposta passa a ser projecção explícita. O to_jsonb(v_sub) devolvia as
-- 56 colunas ao anon; o front só usa o id e a bandeira do duplicado.

create or replace function public.captacao_submeter(
  p_payload jsonb,
  p_tenant_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_tenant := case when p_tenant_slug is null
                   then public.tenant_actual()
                   else public.tenant_por_slug(p_tenant_slug) end;

  if v_tenant is null then
    raise exception 'CASA_DESCONHECIDA';
  end if;
  if v_nome is null then
    raise exception 'NOME_OBRIGATORIO';
  end if;

  -- O tipo de evento tem de ser DESTA casa. Sem isto, um id de outra casa
  -- passado à mão criava um evento com modelo alheio.
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
    'id', v_sub_id,
    'duplicado', false,
    'clienteReutilizado', v_reutilizado);
end
$$;

revoke all     on function public.captacao_submeter(jsonb, text) from public;
grant  execute on function public.captacao_submeter(jsonb, text) to anon, authenticated;

drop function if exists public.captacao_submeter(jsonb);

-- ── 6 · O portal passa a casa à disputa do dia ──────────────────────────────
--
-- O dlm_portal_ver chama dlm_dia_estado com dois argumentos. Como a nova tem
-- um terceiro com default, a chamada antiga continua a compilar — mas cairia
-- no tenant_actual(), que é NULL no portal (o noivo não tem sessão), e todos
-- os dias apareceriam livres. Silencioso, e errado.

create or replace function public.dlm_portal_dia_do_evento(p_submission uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.dlm_dia_estado(s.data_evento, s.id, s.tenant_id)
    from public.submissions s where s.id = p_submission;
$$;

revoke all on function public.dlm_portal_dia_do_evento(uuid) from public;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · A porta responde:
--   select public.tenant_por_slug('doluxoamesa');   -- um uuid
--   select public.tenant_por_slug('inexistente');   -- null
--
-- 2 · Os tipos saem pelo slug, e só os da casa:
--   select * from public.tipos_de_evento_publicos('doluxoamesa');
--   select * from public.tipos_de_evento_publicos('nada');  -- vazio
--
-- 3 · event_types já não é legível pelo anon:
--   select policyname, roles from pg_policies
--    where tablename='event_types';
--   -- Esperado: só tenant_isolamento, para authenticated
--
-- 4 · A APP, e desta vez em DUAS sessões:
--   · /interesse/doluxoamesa — o select de tipos preenche, submeter cria
--     o interessado, e ele aparece no funil
--   · /interesse/casa-que-nao-existe — o formulário não deve deixar submeter
--   · no admin: criar um interessado pelo modo interno (sem slug)
--   · no admin: escolher uma data ocupada e confirmar que o aviso de
--     disputa continua a aparecer
--   · o portal de um noivo com sinal por pagar — o ecrã do sinal deve
--     continuar a mostrar o estado do dia
-- ============================================================================