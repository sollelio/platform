-- Canonical copy of docs/migracoes/110_quem_pediu_e_por_onde.sql
-- (authored 2026-09-24; applied by hand to TEST only). The SQL below is
-- the numbered file WITHOUT its own `begin;`/`commit;` lines: the Supabase
-- CLI already runs each migration inside one transaction, and no other
-- file in this chain carries its own. Everything else is byte-for-byte.
-- supabase/migrations/ is the executable source of truth — see
-- docs/migracoes/README.md.

-- ============================================================
-- 110 · Quem pediu, e por onde
--
-- A fundação de analytics (24/09/2026) precisa de uma verdade que o
-- PostHog não pode ser: de ONDE veio cada pedido e QUEM o preencheu.
-- Isso é dado de negócio — mora na base, ao lado do pedido, e o
-- PostHog só o espelha.
--
-- Duas perguntas que NUNCA se fundem numa só «origem»:
--
--   ONDE  · submissao_superficie
--             public_form  — o /interesse (a porta da casa)
--             admin_form   — o «+ Registar pedido» do backoffice
--             import       — reservado ao importador (não escrito aqui)
--             other        — sessão interna por um caminho não declarado
--
--   QUEM  · submissao_autor_tipo
--             prospect      — reservado: nada hoje o PROVA
--             internal_user — sessão autenticada de um membro da casa
--             unknown       — porta pública sem sessão
--           criado_por (da 105) — o uuid de quem tinha a sessão. NÃO
--           se cria uma segunda coluna de utilizador: a 105 já grava
--           auth.uid() no insert, e duas colunas com o mesmo facto são
--           duas verdades à espera de divergir. Nesta função passa a
--           ser escrito EXPLICITAMENTE, nunca vindo do browser.
--
--   COMO SE SABE · submissao_atribuicao
--             admin_form            — veio do formulário interno
--             internal_entry_point  — sessão interna que entrou no
--                                     /interesse pelo atalho do backoffice
--             authenticated_session — sessão interna no /interesse, sem atalho
--             unidentified          — sem sessão: não há como saber
--
-- AS REGRAS (e a origem da confiança):
--   · QUEM deriva-se SEMPRE da sessão, dentro da função (auth.uid()).
--     Com sessão, a casa já é confirmada contra a membership (108):
--     quem chega ao insert autenticado É membro da casa.
--   · Sem sessão, a superfície é SEMPRE public_form e o autor unknown —
--     o anónimo não consegue declarar-se admin nem interno. Não se
--     adivinha a Nádia por nome, telefone, IP ou dispositivo: um
--     /interesse sem sessão pode ser a cliente OU a Nádia com a sessão
--     fechada, e «dado ausente é melhor que dado inventado».
--   · O browser só DECLARA a superfície e a entrada (atalho) — e só
--     conta quando há sessão. A identidade nunca vem do browser.
--
-- HISTÓRICO: nenhum backfill. As linhas antigas ficam a NULL nas três
-- colunas = «anterior à atribuição». Um criado_por antigo prova sessão,
-- mas não prova a superfície — e metade da verdade não se grava.
--
-- IMUTÁVEL: a atribuição é um facto do momento do pedido. Um gatilho
-- recusa alterá-la depois (ATRIBUICAO_IMUTAVEL). E o autor também: o
-- criado_por deixa de ser reescrevível por um membro (AUTORIA_IMUTAVEL),
-- com a limpeza da FK ON DELETE SET NULL preservada (secção 4). Os outros caminhos de
-- criação (+ Novo evento, convites, importador) continuam a NULL até à
-- próxima fatia — documentado em docs/analytics/README.md.
--
-- Corre no SQL editor do Supabase. TEST primeiro (validacao_110.sql).
-- ============================================================

-- ── 1 · As três colunas ─────────────────────────────────────────────
alter table public.submissions
  add column if not exists submissao_superficie text,
  add column if not exists submissao_autor_tipo text,
  add column if not exists submissao_atribuicao text;

alter table public.submissions
  drop constraint if exists submissions_submissao_superficie_valida,
  drop constraint if exists submissions_submissao_autor_tipo_valido,
  drop constraint if exists submissions_submissao_atribuicao_valida,
  drop constraint if exists submissions_submissao_atribuicao_completa,
  drop constraint if exists submissions_submissao_anonimo_sem_utilizador;

-- Eixos de máquina (não vocabulário de negócio): CHECK fechado.
alter table public.submissions
  add constraint submissions_submissao_superficie_valida
    check (submissao_superficie is null
           or submissao_superficie in ('public_form', 'admin_form', 'import', 'other')),
  add constraint submissions_submissao_autor_tipo_valido
    check (submissao_autor_tipo is null
           or submissao_autor_tipo in ('prospect', 'internal_user', 'unknown')),
  add constraint submissions_submissao_atribuicao_valida
    check (submissao_atribuicao is null
           or submissao_atribuicao in ('authenticated_session', 'internal_entry_point',
                                       'admin_form', 'unidentified')),
  -- Tudo ou nada: uma atribuição a meio é pior do que nenhuma.
  add constraint submissions_submissao_atribuicao_completa
    check ((submissao_superficie is null) = (submissao_autor_tipo is null)
       and (submissao_autor_tipo is null) = (submissao_atribuicao is null)),
  -- Quem não é interno não tem utilizador. (O inverso não se trava: o
  -- criado_por passa a NULL se a conta for apagada — on delete set null.)
  add constraint submissions_submissao_anonimo_sem_utilizador
    check (submissao_autor_tipo is null
           or submissao_autor_tipo = 'internal_user'
           or criado_por is null);

comment on column public.submissions.submissao_superficie is
  '110 · ONDE nasceu o pedido: public_form | admin_form | import | other. NULL = anterior à atribuição (ou caminho ainda não atribuído).';
comment on column public.submissions.submissao_autor_tipo is
  '110 · QUEM o preencheu: internal_user (sessão de membro — o uuid está em criado_por) | unknown (porta pública sem sessão) | prospect (reservado). Nunca deduzido da superfície.';
comment on column public.submissions.submissao_atribuicao is
  '110 · COMO se sabe: admin_form | internal_entry_point | authenticated_session | unidentified.';

-- ── 2 · A atribuição não se reescreve ──────────────────────────────
create or replace function public.submissao_atribuicao_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.submissao_superficie is distinct from old.submissao_superficie
     or new.submissao_autor_tipo is distinct from old.submissao_autor_tipo
     or new.submissao_atribuicao is distinct from old.submissao_atribuicao then
    raise exception 'ATRIBUICAO_IMUTAVEL'
      using hint = 'A origem de um pedido é um facto do momento em que nasceu — não se altera.';
  end if;
  return new;
end
$$;

revoke all on function public.submissao_atribuicao_imutavel() from public, anon, authenticated;

drop trigger if exists submissions_atribuicao_imutavel on public.submissions;
create trigger submissions_atribuicao_imutavel
  before update of submissao_superficie, submissao_autor_tipo, submissao_atribuicao
  on public.submissions
  for each row execute function public.submissao_atribuicao_imutavel();

-- ── 3 · A captação carimba a atribuição ────────────────────────────
-- Recria a captacao_submeter da 109 com UMA adição: o bloco «110»
-- (decidir a atribuição, gravá-la no insert, devolvê-la). O resto é
-- letra por letra o corpo da 109. A assinatura não muda — os grants
-- mantêm-se e um browser antigo (sem `atribuicao` no payload) continua
-- a funcionar: com sessão cai em 'other', sem sessão em public_form.

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
  -- 110
  v_quem       uuid := auth.uid();
  v_declarado  jsonb := coalesce(p_payload -> 'atribuicao', '{}'::jsonb);
  v_superficie text;
  v_autor_tipo text;
  v_atribuicao text;
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

  -- 110 · A atribuição. QUEM vem da sessão (e a sessão, a esta altura,
  -- já provou ser de um membro desta casa); o browser só declara ONDE,
  -- e só conta quando há sessão.
  if v_quem is null then
    v_superficie := 'public_form';
    v_autor_tipo := 'unknown';
    v_atribuicao := 'unidentified';
  else
    v_superficie := case dlm_txt(v_declarado, 'superficie')
                      when 'admin_form'  then 'admin_form'
                      when 'public_form' then 'public_form'
                      else 'other'
                    end;
    v_autor_tipo := 'internal_user';
    v_atribuicao := case
                      when v_superficie = 'admin_form' then 'admin_form'
                      when v_superficie = 'public_form'
                           and dlm_txt(v_declarado, 'entrada') = 'internal_entry_point'
                        then 'internal_entry_point'
                      else 'authenticated_session'
                    end;
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
      -- 109 · O contacto repetido deixa rasto: insistência é procura.
      -- A identidade deduplica-se (nada é criado), mas a ocorrência
      -- fica contada numa nota interna do evento existente. Best-
      -- -effort de propósito: falhar a nota NUNCA falha a captação —
      -- a regra da casa é «falhar nunca falha o acto».
      --
      -- SEM coluna de autor: a 105 apagou-a («drop column autor») e
      -- pô-la aqui de volta faria o insert rebentar em silêncio dentro
      -- deste best-effort (apanhado na revisão adversarial de 10/09).
      -- O criado_por preenche-se pelo default auth.uid() — null na
      -- porta pública, que é a verdade; a porta vai dita no corpo.
      begin
        insert into public.notas_evento (submission_id, tipo, corpo)
        values (
          v_hit_evento,
          'interna',
          'Contacto repetido na captação ('
            || case when auth.uid() is null then 'porta pública' else 'porta interna' end
            || ') — mesmo telefone e mesma data do evento. Não foi criado pedido novo. '
            || 'Se for um evento DIFERENTE no mesmo dia, cria-o pela ficha do contacto («+ Novo evento»).'
        );
      exception when others then
        null;
      end;
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
    (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas, tenant_id,
     -- 110
     criado_por, submissao_superficie, submissao_autor_tipo, submissao_atribuicao)
  values (
    v_cliente_id, 'interessado', v_tipo_ok, v_data,
    dlm_safe_int(dlm_txt(p_payload, 'numeroConvidados')),
    coalesce(p_payload -> 'respostas', '{}'::jsonb), v_tenant,
    v_quem, v_superficie, v_autor_tipo, v_atribuicao)
  returning id into v_sub_id;

  -- 110 · A atribuição volta ao browser (eixos de máquina, sem nada
  -- pessoal) para o evento de analytics espelhar a VERDADE gravada, e
  -- não o que o browser julgava ter pedido.
  return jsonb_build_object(
    'id', v_sub_id, 'duplicado', false, 'clienteReutilizado', v_reutilizado,
    'atribuicao', jsonb_build_object(
      'superficie', v_superficie,
      'autorTipo',  v_autor_tipo,
      'metodo',     v_atribuicao));
end
$$;

revoke all     on function public.captacao_submeter(jsonb, text) from public, anon;
grant  execute on function public.captacao_submeter(jsonb, text) to anon, authenticated;

-- ── 4 · O autor não se reescreve (submissions.criado_por) ──────────
-- O uuid de QUEM preencheu é o `criado_por` da 105 — e até aqui qualquer
-- membro da casa o podia reescrever (a tabela tem GRANT ALL ao
-- authenticated e a política só separa casas). Proveniência que se
-- reescreve não é proveniência.
--
-- Porquê um gatilho e não privilégios de coluna: com GRANT de tabela, um
-- REVOKE de coluna não tira nada; teria de se revogar o UPDATE da tabela
-- e conceder coluna a coluna — frágil (cada coluna nova esquecida parte
-- um ecrã).
--
-- A excepção que TEM de passar: a FK `ON DELETE SET NULL`. Quando uma
-- conta é apagada, o Postgres limpa o criado_por com um UPDATE interno
-- que DISPARA este gatilho — e nesse momento a conta já não está em
-- auth.users. É exactamente isso que se testa: pôr a NULL só é aceite
-- quando o utilizador de antes já não existe. Reatribuir, apagar à mão
-- ou «preencher» um NULL histórico: recusado (AUTORIA_IMUTAVEL).
--
-- No INSERT, com sessão, o criado_por tem de ser o da sessão (o default
-- auth.uid() já o faz — isto só trava quem o forje à mão num insert
-- directo). Sem sessão (serviço, migrações) fica como estava.
--
-- SECURITY DEFINER porque o authenticated não lê auth.users.

create or replace function public.submissao_autoria_imutavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.criado_por is distinct from auth.uid() then
      raise exception 'AUTORIA_IMUTAVEL'
        using hint = 'O autor de um pedido é quem tem a sessão — não se escolhe.';
    end if;
    return new;
  end if;

  if new.criado_por is not distinct from old.criado_por then
    return new;
  end if;
  -- A limpeza da FK: a conta apagada já não existe.
  if new.criado_por is null
     and old.criado_por is not null
     and not exists (select 1 from auth.users u where u.id = old.criado_por) then
    return new;
  end if;
  raise exception 'AUTORIA_IMUTAVEL'
    using hint = 'Quem criou um pedido é um facto do momento em que nasceu — não se altera.';
end
$$;

revoke all on function public.submissao_autoria_imutavel() from public, anon, authenticated;

drop trigger if exists submissions_autoria_imutavel on public.submissions;
create trigger submissions_autoria_imutavel
  before insert or update of criado_por
  on public.submissions
  for each row execute function public.submissao_autoria_imutavel();

