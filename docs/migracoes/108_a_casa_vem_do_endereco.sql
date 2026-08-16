-- ============================================================================
-- 108 · A casa vem do endereço, também no admin
--
-- `tenant_actual()` faz `limit 1` sobre as memberships. Com uma por pessoa
-- devolve a certa; com duas, devolve a mais antiga — em silêncio. As
-- escritas caem na casa errada sem erro nenhum.
--
-- É o último bloqueio real ao segundo cliente, e é o modo de falhar que
-- esta série aprendeu a temer: não parte nada, mente. O próprio COMMENT da
-- 092 já o confessava — «o tenant tem de vir do pedido, não daqui».
--
-- ── A DECISÃO (16/08/2026) ───────────────────────────────────────────────
--
-- A casa vem do endereço, no admin como já vem no público desde a 093. Não
-- é padrão novo: é o do `/interesse/:slug` aplicado ao outro lado. A razão
-- que o escolheu lá vale aqui — o endereço nunca mente, e um estado
-- invisível de «casa activa» é o que produz escritas no sítio errado sem
-- ninguém reparar.
--
-- Recusados: um seletor no topo (a casa passaria a estado invisível — o
-- problema que isto vem resolver) e proibir membership múltipla (adia).
--
-- ── UM BUG DE HOJE, encontrado no levantamento ───────────────────────────
--
-- O `captacao_submeter` resolve o slug por `tenant_por_slug`, que NÃO
-- verifica membership — certo para o público, errado para uma sessão
-- autenticada. Hoje, quem escrever à mão o slug de outra casa cria lá um
-- interessado. Não é bug futuro.
--
-- ── DUAS CAMADAS, não duas alternativas ──────────────────────────────────
--
-- Esta migração endurece: nenhuma escrita pode cair calada na casa errada,
-- porque `tenant_actual()` deixa de escolher e passa a parar. O trabalho de
-- mandar o `tenant_id` explícito em cada insert é do frontend, faz-se por
-- lotes e NÃO é urgente — a rede já impede a mentira.
-- ============================================================================

-- ── 1 · A porta nova ────────────────────────────────────────────────────────
--
-- O que a 093 fez para o público, com a membership por cima: recebe o slug
-- da rota, confirma que quem pede pertence à casa, devolve o id.
--
-- Devolve NULL e não excepção, de propósito: compõe com `coalesce` nas
-- leituras, e cada escrita decide como falhar. Uma leitura de uma casa
-- alheia deve dar vazio; uma escrita deve parar.
--
-- É irmã de `tenant_por_slug` (093) e não a substitui — aquela continua a
-- ser a porta do público, onde não há sessão para verificar.

create or replace function public.tenant_do_pedido(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.tenants t
    join public.memberships m on m.tenant_id = t.id
   where t.slug = lower(btrim(coalesce(p_slug, '')))
     and t.estado = 'activo'
     and m.user_id = auth.uid();
$$;

revoke all     on function public.tenant_do_pedido(text) from public, anon;
grant  execute on function public.tenant_do_pedido(text) to authenticated;

comment on function public.tenant_do_pedido(text) is
  'A casa do pedido: o slug da rota, confirmado contra a membership de quem pede. NULL quando a casa não existe, está suspensa, ou não é de quem pergunta — e quem chama decide se isso é vazio ou erro.';

-- ── 2 · A função que deixa de mentir ────────────────────────────────────────
--
-- Zero memberships → NULL, como hoje (é o caso do anon, e é desenhado).
-- Uma → essa. Duas ou mais → PARA.
--
-- Com os dados de hoje é um no-op: uma membership por pessoa. No dia em que
-- alguém tiver duas, qualquer caminho esquecido rebenta alto em vez de
-- escrever na casa errada. É a conversão que esta série fez três vezes esta
-- semana — de «mente» para «parte».
--
-- O HINT existe porque a excepção vai subir por dentro dos onze defaults de
-- coluna, onde nenhum frontend a espera. Verificado: o PostgREST devolve o
-- `message` (o code-word, para a máquina) e o `hint` (a frase, para quem
-- lê) — e a frase existe mesmo nos ecrãs que ainda não traduzem code-words.

create or replace function public.tenant_actual()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all     on function public.tenant_actual() from public, anon;
grant  execute on function public.tenant_actual() to authenticated;

comment on function public.tenant_actual() is
  'A casa da sessão, quando não há ambiguidade. Com duas ou mais, PARA com CASA_AMBIGUA — a versão da 092 devolvia a mais antiga em silêncio, e escritas caíam na casa errada. Rede de segurança: o caminho certo é o tenant_do_pedido, com o slug da rota.';

-- ── 3 · A identidade do backoffice, pela rota ───────────────────────────────
--
-- A versão sem argumentos alimentava o CasaProvider de todo o admin a
-- partir da membership mais antiga. Passa a receber o slug.
--
-- TRÊS respostas, não duas — e a do meio fecha de borla a pendência da 104:
-- uma casa suspensa deixava o admin com todas as listas vazias, sem nada a
-- explicar porquê. Agora diz-se, e o frontend pode desenhar o ecrã.

-- A `identidade_da_casa` filtra por estado activo desde a 097 — o que é
-- certo para o público. Uma casa suspensa tem de se mostrar a QUEM LHE
-- PERTENCE, para o ecrã que explica poder dizer de quem é.
create or replace function public.identidade_da_casa_sem_filtro(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nome', t.nome, 'titular', t.titular, 'morada', t.morada,
           'nif', t.nif, 'iban', t.iban, 'mbway', t.mbway, 'foro', t.foro,
           'dominio', t.dominio, 'whatsapp', t.whatsapp,
           'logo_url', t.logo_url, 'linha_actividade', t.linha_actividade,
           'linha_by', t.linha_by, 'slogan', t.slogan)
    from public.tenants t where t.id = p_tenant;
$$;

revoke all on function public.identidade_da_casa_sem_filtro(uuid) from public, anon;

create or replace function public.identidade_da_minha_casa(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

revoke all     on function public.identidade_da_minha_casa(text) from public, anon;
grant  execute on function public.identidade_da_minha_casa(text) to authenticated;

-- A versão sem argumentos NÃO se apaga aqui: o frontend ainda a chama, e
-- apagá-la agora deixava o admin sem identidade até ao deploy. Sai no lote
-- do frontend, com o CasaProvider a passar o slug.
comment on function public.identidade_da_minha_casa() is
  '⚠ SUBSTITUÍDA pela versão com slug (108). Fica de pé até o CasaProvider passar a casa da rota; apagar antes deixa o admin sem identidade.';

-- ── 4 · As casas de quem entra ──────────────────────────────────────────────
--
-- Para o redirect dos endereços antigos (/admin/inicio sem casa) e, um dia,
-- para o ecrã de escolha. Uma casa → redirecciona. Duas → o redirect morre
-- e a escolha faz-se por navegação, nunca por seletor persistente.

create or replace function public.as_minhas_casas()
returns table (slug text, nome text, estado text)
language sql
stable
security definer
set search_path = public
as $$
  select t.slug, t.nome, t.estado
    from public.tenants t
    join public.memberships m on m.tenant_id = t.id
   where m.user_id = auth.uid()
   order by m.criado_em;
$$;

revoke all     on function public.as_minhas_casas() from public, anon;
grant  execute on function public.as_minhas_casas() to authenticated;

-- ── 5 · O buraco do captacao_submeter ───────────────────────────────────────
--
-- Cópia fiel da 093, com um delta: o ramo do slug distingue quem tem sessão
-- de quem não tem. Sem sessão, `tenant_por_slug` como sempre — é o pedido
-- público, e não há membership para verificar. Com sessão, o slug tem de
-- ser de uma casa de quem pede.

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

revoke all     on function public.captacao_submeter(jsonb, text) from public, anon;
grant  execute on function public.captacao_submeter(jsonb, text) to anon, authenticated;

-- ── 6 · O registo de erros, com a mesma regra ───────────────────────────────
--
-- A proposta era deixar este sem membership — «o pior caso é um log na casa
-- errada». Falha num ponto: o log carrega a coluna `respostas`, que é o
-- formulário da cliente. Um log na casa errada é dados pessoais na casa
-- errada, e foi a 106 que existiu para o impedir.
--
-- Aqui não se levanta excepção: o registo de erros é fire-and-forget por
-- desenho, e rebentar seria o registo de erros a causar um erro. Um slug
-- que não é de quem pede vira log sem casa — que continua a ser diagnóstico
-- válido.

create or replace function public.registar_erro_formulario(
  p_origem text,
  p_mensagem text,
  p_detalhe jsonb default null,
  p_contexto jsonb default null,
  p_respostas jsonb default null,
  p_tenant_slug text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

revoke all     on function public.registar_erro_formulario(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant  execute on function public.registar_erro_formulario(text, text, jsonb, jsonb, jsonb, text) to anon, authenticated;

-- ── 7 · A décima primeira coluna aperta ─────────────────────────────────────
--
-- `event_types.tenant_id` ficou nullable na 090 para admitir «modelos da
-- plataforma». Nunca foram escritos, e a varredura mostrou que um NULL seria
-- lixo inerte, não funcionalidade: a política `tenant_isolamento` nunca o
-- deixaria passar no admin, e a `tipos_de_evento_publicos` filtra pelo
-- tenant do slug. Um modelo global criado por acidente seria invisível em
-- todo o lado — o pior tipo de silêncio.
--
-- Zero NULLs nos dados reais, verificado.

alter table public.event_types alter column tenant_id set not null;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- ⚠ O ponto 3 cria um segundo tenant. SÓ em staging, e limpar no fim.
--
-- 1 · Com uma casa, nada mudou:
--   select public.tenant_actual();          -- null no SQL Editor (sem sessão)
--   select public.tenant_do_pedido('doluxoamesa');  -- null aqui, idem
--   -- Confirma-se na app, não aqui.
--
-- 2 · A identidade responde às três:
--   -- (na app, com sessão) identidade_da_minha_casa('doluxoamesa') → conhecida
--   -- identidade_da_minha_casa('nao-existe') → desconhecida
--
-- 3 · O TESTE QUE PROVA — duas casas, em staging:
--   insert into tenants (slug, nome, prefixo)
--     values ('casa-dois', 'Casa Dois', 'CD2');
--   insert into memberships (user_id, tenant_id, papel)
--     select u.id, t.id, 'gestor' from auth.users u cross join tenants t
--      where u.email = '<o-seu-email>' and t.slug = 'casa-dois';
--
--   -- Agora, NA APP: criar um cliente deve rebentar com CASA_AMBIGUA e a
--   -- frase do hint. Antes desta migração, criava-o na casa mais antiga.
--
--   -- E o endereço da casa alheia deve recusar:
--   --   /admin/casa-dois/... com a conta da Nádia → desconhecida
--
-- 4 · LIMPAR:
--   delete from memberships where tenant_id = (select id from tenants where slug='casa-dois');
--   delete from tenants where slug = 'casa-dois';
--
-- 5 · event_types apertou:
--   select is_nullable from information_schema.columns
--    where table_schema='public' and table_name='event_types'
--      and column_name='tenant_id';
--   -- Esperado: NO
-- ============================================================================