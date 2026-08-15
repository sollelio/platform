-- ============================================================================
-- 102 · A mesma chave em casas diferentes
--
-- Quatro chaves de texto são únicas GLOBALMENTE, não por casa. Era a única
-- verdade possível quando havia uma casa; com duas, é a última coisa que
-- impede a segunda de existir.
--
-- O caso concreto: a Do Luxo à Mesa tem um tipo de evento «Casamento». O
-- segundo buffet a entrar vai querer criar o dele — também «Casamento», que
-- é o nome que a coisa tem — e o insert falha com violação de unicidade. As
-- duas casas veem tabelas separadas; a base vê uma só.
--
-- O mesmo vale para as três chaves primárias de texto: duas casas com uma
-- configuração `whatsapp_ativo`, ou um eixo de avaliação `bolo`, colidem.
--
-- ── O QUE TORNA ISTO BARATO ──────────────────────────────────────────────
--
-- Verificado antes de escrever: as estrangeiras de `event_types` apontam
-- todas para o `id` (submissions, invites, reservas), nunca para o `nome`.
-- E ninguém aponta para as chaves de texto das outras três. Trocar a
-- primária não arrasta relação nenhuma.
--
-- Volumes: 3 grupos, 6 eixos, 2 configurações. Se alguma coisa correr mal,
-- vê-se de imediato.
--
-- ⚠ O CÓDIGO QUE PROCURA POR CHAVE fica a precisar de contexto de casa. O
-- `dlm_portal_responder` faz `where chave = btrim(v_passo->>'grupo')` sem
-- tenant — com uma casa devolve a linha certa; com duas, devolve a primeira
-- que encontrar. Está tratado no ponto 5.
-- ============================================================================

-- ── 1 · Os tipos de evento ──────────────────────────────────────────────────
--
-- `tenant_id` é nullable aqui (a 090 deixou-o assim para admitir modelos da
-- plataforma). Um índice único sobre uma coluna nullable trata NULLs como
-- distintos entre si — o que significa que dois modelos globais poderiam ter
-- o mesmo nome. Com `nulls not distinct`, não podem.

alter table public.event_types drop constraint if exists event_types_nome_key;

drop index if exists event_types_tenant_nome_uniq;
create unique index event_types_tenant_nome_uniq
  on public.event_types (tenant_id, nome) nulls not distinct;

-- ── 2 · A configuração ──────────────────────────────────────────────────────
--
-- A primária passa a composta. `tenant_id` é NOT NULL desde a 090, portanto
-- não há aqui o problema dos nulos.

alter table public.app_config drop constraint if exists app_config_pkey;
alter table public.app_config add primary key (tenant_id, chave);

-- ── 3 · Os eixos da avaliação ───────────────────────────────────────────────

alter table public.avaliacao_eixos drop constraint if exists avaliacao_eixos_pkey;
alter table public.avaliacao_eixos add primary key (tenant_id, chave);

-- ── 4 · Os grupos de prazo ──────────────────────────────────────────────────

alter table public.questionario_grupos drop constraint if exists questionario_grupos_pkey;
alter table public.questionario_grupos add primary key (tenant_id, chave);

-- ── 5 · A consulta que passa a precisar da casa ─────────────────────────────
--
-- O `dlm_portal_responder` procura o grupo de prazo por `where chave = …`.
-- Hoje devolve a linha certa porque só há uma casa; com duas, devolve a
-- primeira que a base encontrar — e um grupo da casa errada fecharia um
-- campo que devia estar aberto, ou o contrário.
--
-- Cópia fiel da 089 com um delta: o `and tenant_id = v_ev.tenant_id`. A
-- linha nova está marcada; o resto é byte a byte, verificado por diff.

create or replace function public.dlm_portal_responder(
  p_token text,
  p_campo text,
  p_valor jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- 101 · o grant explícito, agora que a omissão do schema não o dá
revoke all     on function public.dlm_portal_responder(text, text, jsonb) from public, anon;
grant  execute on function public.dlm_portal_responder(text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · As chaves são compostas:
--   select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid in ('app_config'::regclass,'avaliacao_eixos'::regclass,
--                       'questionario_grupos'::regclass)
--      and contype = 'p';
--   -- Esperado: (tenant_id, chave) nas três
--
-- 2 · O índice dos tipos de evento:
--   select indexdef from pg_indexes
--    where tablename = 'event_types' and indexname like '%nome%';
--   -- Esperado: UNIQUE (tenant_id, nome) NULLS NOT DISTINCT
--
-- 3 · A prova real — duas casas, o mesmo nome. SÓ EM TESTE:
--   insert into tenants (slug, nome, prefixo)
--     values ('casa-de-teste', 'Casa de Teste', 'TST');
--   insert into event_types (nome, tenant_id, steps)
--     values ('Casamento',
--             (select id from tenants where slug='casa-de-teste'),
--             '[]'::jsonb);
--   -- Esperado: passa. Antes desta migração, falhava.
--   delete from event_types where tenant_id =
--     (select id from tenants where slug='casa-de-teste');
--   delete from tenants where slug='casa-de-teste';   -- ⚠ LIMPAR
--
-- 4 · E a unicidade DENTRO da casa continua de pé:
--   insert into event_types (nome, tenant_id, steps)
--     values ('Casamento',
--             (select id from tenants where slug='doluxoamesa'),
--             '[]'::jsonb);
--   -- Esperado: FALHA com violação de unicidade
--
-- 5 · A APP: o portal de um noivo, a responder ao formulário. É o que
--   exercita o dlm_portal_responder e a procura do grupo de prazo.
-- ============================================================================