-- ============================================================================
-- 089 · «Formulário» em vez de «questionário» — a palavra nas notificações
--
-- Decisão da Nádia (14/08/2026): o formulário que os clientes preenchem
-- chama-se «formulário» em TODA a linguagem visível — «questionário» soa a
-- opcional e trava o preenchimento. O front foi varrido no mesmo dia; aqui
-- muda o que vive na base: os DOIS títulos de notificação compostos no
-- servidor, e os títulos já guardados no livro.
--
-- As duas funções são CÓPIAS FIÉIS das últimas versões (dlm_portal_responder
-- da 069; dlm_portal_pedir_alteracao_campo da 074), verificadas por diff,
-- com UMA string mudada cada. Identificadores (tipos questionario_entregue/
-- questionario_pedido, tabelas questionario_*, estados sem_questionario)
-- ficam como estão — são endereços, não linguagem.
-- ============================================================================

-- ── 1 · A entrega do formulário avisa com a palavra certa (cópia da 069) ────

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

  -- ── O CARIMBO DE ENTREGA (069) ────────────────────────────────────
  --
  -- O questionário ENTREGA-SE SOZINHO quando não faltar nada obrigatório.
  -- Não há botão de submeter, e é de propósito: o desenho da fase 5 fez de
  -- responder e rever o mesmo ecrã, e um «terminei» num ecrã de revisão
  -- seria um gesto a mais.
  --
  -- Era aqui que a fase 5 estava partida: havia uma função de entregar que
  -- NUNCA era chamada, e por isso a pendência «O questionário» ficava a
  -- pedir para sempre, mesmo depois de ela responder a tudo.
  --
  -- Sem campos obrigatórios no modelo, valem TODOS — é o mesmo critério
  -- que o ecrã usa para dizer onde ela ficou.
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

revoke all     on function public.dlm_portal_responder(text, text, jsonb) from public;
grant  execute on function public.dlm_portal_responder(text, text, jsonb) to anon, authenticated;


-- ── 2 · O pedido de alteração avisa com a palavra certa (cópia da 074) ──────

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
     coalesce(v_nome, 'A cliente') || ' pediu uma alteração ao formulário',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('campo', coalesce(v_campo->>'label', p_campo),
                        'mensagem', btrim(p_pedido)));

  return jsonb_build_object('estado', 'ok');
end
$$;

revoke all     on function public.dlm_portal_pedir_alteracao_campo(text, text, text, jsonb) from public;
grant  execute on function public.dlm_portal_pedir_alteracao_campo(text, text, text, jsonb) to anon, authenticated;

-- ── 3 · Os títulos que já estão no livro ────────────────────────────────────
-- Cosmético mas visível: a Caixa de Entrada mostra o histórico, e o histórico
-- não deve falar uma língua que a casa abandonou.

update public.notificacoes
   set titulo = replace(titulo, 'questionário', 'formulário')
 where titulo like '%questionário%';

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Não resta nenhum título antigo:
--   select count(*) from notificacoes where titulo like '%questionário%';
--   -- Esperado: 0
-- 2 · Responder a um campo no portal (com tudo obrigatório preenchido) cria
--   a notificação «… respondeu ao formulário»; pedir uma alteração cria
--   «… pediu uma alteração ao formulário».
