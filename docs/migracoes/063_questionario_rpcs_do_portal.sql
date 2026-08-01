-- ============================================================================
-- 063 · Questionário no portal — as RPC (fase 5, bloco 2)
--
-- A 062 pôs o chão. Isto é a canalização: ler o questionário por token,
-- gravar campo a campo, entregar, e pedir alteração a um campo já fechado.
--
-- ─── AS QUATRO REGRAS QUE ESTÃO AQUI DENTRO ────────────────────────────────
--
-- 1 · MENOS DE 5 CAMPOS, NÃO HÁ QUESTIONÁRIO. Sai dos dados, não de palpite:
--     os modelos que são mesmo questionário têm 12 e 44 campos; os outros
--     três têm 1, 1 e 3. Cinco fica no meio do vazio, com folga dos dois
--     lados. Sem isto, um interessado de um modelo de um campo abria «As
--     suas respostas» com um campo que a CAPTAÇÃO encheu por ele — e o
--     portal dava por respondido um questionário que não existe.
--
-- 2 · UM PASSO SEM GRUPO NUNCA FECHA, e um evento SEM DATA também não.
--     Não se pode dizer «faltam catorze dias» a quem não tem dia. Fechar
--     por omissão seria transformar protecção da montagem em castigo.
--
-- 3 · RESPONDER NÃO EXIGE CÓDIGO. O precedente da 061: só o acto que
--     TRANCA exige verificação. Responder não tranca nada, e pedir um
--     código para escrever o nome do bolo é atrito sem ganho.
--
-- 4 · O FECHO É DO SERVIDOR. O ecrã mostra o campo em leitura, mas quem
--     recusa a escrita é esta função. Um fecho que vive só no ecrã não é
--     um fecho.
--
-- ⚠ A INVARIANTE DE SEMPRE: o id interno do evento NUNCA sai. Toda a
--   projecção é jsonb_build_object com chaves nomeadas uma a uma. Ids de
--   CAMPO saem (são do modelo, não do evento) — id de evento, nunca.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 0 · Duas funções internas, para não repetir a conta ────────────────────

-- Quantos campos tem o modelo. Abaixo do mínimo, o portal não mostra
-- questionário nenhum: nem convite, nem revisão, nem pendência.
create or replace function public.dlm_questionario_conta_campos(p_steps jsonb)
returns integer
language sql
immutable
as $$
  select coalesce(count(*), 0)::integer
    from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields', '[]'::jsonb)) as campo(valor);
$$;

comment on function public.dlm_questionario_conta_campos(jsonb) is
  'Campos totais de um modelo. O mínimo de 5 para haver questionário no '
  'portal está nas RPC, não aqui — esta função só conta.';

-- Um valor conta como resposta? Vazio, array vazio e objecto vazio não.
create or replace function public.dlm_questionario_respondido(p_valor jsonb)
returns boolean
language sql
immutable
as $$
  select p_valor is not null
     and jsonb_typeof(p_valor) <> 'null'
     and case jsonb_typeof(p_valor)
           when 'string' then btrim(p_valor #>> '{}') <> ''
           when 'array'  then jsonb_array_length(p_valor) > 0
           when 'object' then p_valor <> '{}'::jsonb
           else true
         end;
$$;


-- ─── 1 · Ler o questionário por token ───────────────────────────────────────

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
      select autor, escrito_em into v_autoria
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
                            then v_autoria.escrito_em else null end));
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


-- ─── 2 · Gravar um campo ────────────────────────────────────────────────────
--
-- Campo a campo, e não tudo no fim: é o que o desenho promete («fica
-- guardado à medida que escreve»), e é o que o portal já dizia à cliente
-- muito antes de existir maneira de o cumprir.

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

  -- O campo TEM de ser do modelo. Sem isto, a ligação pública escrevia
  -- chaves à escolha dentro de submissions.respostas.
  select passo.valor, campo.valor into v_passo, v_campo
    from jsonb_array_elements(v_steps) as passo(valor)
    cross join lateral jsonb_array_elements(
                 coalesce(passo.valor->'fields', '[]'::jsonb)) as campo(valor)
   where campo.valor->>'id' = p_campo
   limit 1;

  if v_campo is null then
    return jsonb_build_object('estado', 'campo_desconhecido');
  end if;

  -- Regra 4: quem recusa é o servidor. O ecrã mostra o campo em leitura,
  -- mas um fecho que vive só no ecrã não é um fecho.
  if coalesce(btrim(v_passo->>'grupo'), '') <> '' and v_ev.data_evento is not null then
    select * into v_grupo from public.questionario_grupos
     where chave = btrim(v_passo->>'grupo');
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

  -- As colunas legadas que o backoffice inteiro lê. Resolvidas pelo TIPO do
  -- campo e por padrão no id — NUNCA por lista fixa de ids, que é o erro
  -- que a 053 existiu para corrigir (os ids divergem entre os seis modelos).
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
      null; -- data escrita à mão que não converte: fica só em respostas
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

  return jsonb_build_object('estado', 'ok', 'guardado_em', now());
end
$$;

revoke all     on function public.dlm_portal_responder(text, text, jsonb) from public;
grant  execute on function public.dlm_portal_responder(text, text, jsonb) to anon, authenticated;


-- ─── 3 · Entregar ───────────────────────────────────────────────────────────
--
-- O carimbo é o momento em que passou a ser verdade PARA A EQUIPA que há
-- briefing — e é datado por aqui, nunca pelo nascimento do evento (051).

create or replace function public.dlm_portal_entregar_questionario(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_nome   text;
  v_ja     boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  v_ja := v_ev.questionario_entregue_em is not null;

  update public.submissions
     set questionario_entregue_em = coalesce(questionario_entregue_em, now())
   where id = v_ev.id;

  -- Um aviso por entrega. Voltar a mexer nas respostas depois não levanta
  -- aviso novo: seria eco, e a Nádia já sabe que o questionário existe.
  if not v_ja then
    select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('questionario_entregue',
       coalesce(v_nome, 'A cliente') || ' respondeu ao questionário',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id, '{}'::jsonb);
  end if;

  return jsonb_build_object('estado', 'ok', 'ja_estava', v_ja);
end
$$;

revoke all     on function public.dlm_portal_entregar_questionario(text) from public;
grant  execute on function public.dlm_portal_entregar_questionario(text) to anon, authenticated;


-- ─── 4 · Pedir alteração a um campo fechado ─────────────────────────────────
--
-- «Isto não pode parecer uma porta na cara.» Passado o prazo, alterar
-- continua possível — só deixa de mudar o valor sozinho.

create or replace function public.dlm_portal_pedir_alteracao_campo(
  p_token  text,
  p_campo  text,
  p_pedido text
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
    (submission_id, campo_id, campo_label, pedido)
  values
    (v_ev.id, p_campo, coalesce(v_campo->>'label', p_campo), btrim(p_pedido));

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

revoke all     on function public.dlm_portal_pedir_alteracao_campo(text, text, text) from public;
grant  execute on function public.dlm_portal_pedir_alteracao_campo(text, text, text) to anon, authenticated;


-- ============================================================================
-- 5 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 5.1 · 🔴 A INVARIANTE. O id do evento não sai, em nenhuma das RPC:
--   select public.dlm_portal_questionario('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Esperado: FALSE. Obrigatoriamente.

-- 5.2 · Os modelos magros não mostram questionário nenhum.
--   Usa o token de um evento de modelo «Festinhas», «Requinte» ou
--   «dia dos namorados»:
--   select public.dlm_portal_questionario('<TOKEN_MAGRO>');
--   -- Esperado: {"estado":"ok","mostrar":false} e mais nada.

-- 5.3 · Um casamento traz os cinco passos e os campos todos:
--   select jsonb_array_length(public.dlm_portal_questionario('<TOKEN>')->'passos');
--   -- Esperado: 5
--   select public.dlm_portal_questionario('<TOKEN>')->'passos'->0->'total';
--   -- Esperado: o nº de campos do 1.º passo do modelo.

-- 5.4 · Gravar um campo funciona e deixa autoria:
--   select public.dlm_portal_responder('<TOKEN>', '<CAMPO_ID>', '"Teste"'::jsonb);
--   -- Esperado: {"estado":"ok","guardado_em":...}
--   select campo_id, autor, valor_anterior from respostas_autoria
--    order by escrito_em desc limit 1;
--   -- autor = 'cliente', valor_anterior = o que lá estava.

-- 5.5 · Um campo que não é do modelo é recusado:
--   select public.dlm_portal_responder('<TOKEN>', 'campoInventado', '"x"'::jsonb);
--   -- Esperado: {"estado":"campo_desconhecido"} — e NADA gravado.

-- 5.6 · 🔴 O FECHO É DO SERVIDOR. Marca um passo com grupo e põe a data do
--   evento perto:
--   update event_types set steps = jsonb_set(steps, '{0,grupo}', '"compras"')
--    where id = '<MODELO>'::uuid;
--   update submissions set data_evento = current_date + 3 where id = '<EVENTO>'::uuid;
--   select public.dlm_portal_responder('<TOKEN>', '<CAMPO_DO_PASSO_0>', '"x"'::jsonb);
--   -- Esperado: {"estado":"fechado","grupo":"Compras e stock","porque":"..."}
--   -- E o valor NÃO mudou em submissions.respostas.

-- 5.7 · Sem data de evento nada fecha, mesmo com grupo marcado:
--   update submissions set data_evento = null where id = '<EVENTO>'::uuid;
--   select public.dlm_portal_questionario('<TOKEN>')->'passos'->0->'fechado';
--   -- Esperado: false

-- 5.8 · O pedido de alteração levanta aviso, e o segundo não duplica:
--   select public.dlm_portal_pedir_alteracao_campo('<TOKEN>','<CAMPO>','Passar para 45');
--   -- Esperado: {"estado":"ok"}
--   select public.dlm_portal_pedir_alteracao_campo('<TOKEN>','<CAMPO>','Outra vez');
--   -- Esperado: {"estado":"ja_pedido"}
--   select count(*) from notificacoes where tipo='questionario_pedido';
--   -- Esperado: 1

-- 5.9 · Entregar carimba e avisa uma vez só:
--   select public.dlm_portal_entregar_questionario('<TOKEN>');  -- ja_estava: false
--   select public.dlm_portal_entregar_questionario('<TOKEN>');  -- ja_estava: true
--   select count(*) from notificacoes where tipo='questionario_entregue';
--   -- Esperado: 1

-- 5.10 · Repor o que o 5.6 mexeu, se foi num modelo a sério:
--   update event_types set steps = steps #- '{0,grupo}' where id = '<MODELO>'::uuid;
