-- ============================================================================
-- 054 · Portal do Cliente — fase 2: a projecção cresce
--
-- Sete divisões novas precisam de matéria: a mensagem com que ela chegou, as
-- imagens do pedido, a paleta, as horas do dia, a placa e as descrições da
-- visão. Mais o ponto de comparação das novidades.
--
-- 🔴 PROJECÇÃO EXPLÍCITA, como sempre. Cada campo que sai é uma decisão.
--    NÃO sai: valores em euros, morada exacta, quem abre o espaço e o
--    contacto dessa pessoa (dados de terceiros atrás de uma ligação
--    partilhável), briefing, materiais, notas internas — e o
--    `submissions.id`, que nunca sai por nenhuma porta.
--
-- 🔴 OS IDS DOS CAMPOS DIVERGEM ENTRE MODELOS para o mesmo conceito. Por isso
--    nada aqui lê uma lista fixa de chaves do questionário: lê-se o `steps`
--    do modelo do evento e resolve-se o campo pelo que ele É.
--      · paleta → o campo de `type = 'paleta'` (tipo dedicado, um por modelo)
--      · horas  → os campos de `type = 'time'`, na ordem do modelo
--      · placa  → ids que contêm 'placa'
--      · visão  → ids que começam por 'descricao'
--    Os dois primeiros são exactos. Os dois últimos são padrões sobre ids
--    gerados a partir de etiquetas — se um modelo novo lhes fugir, a divisão
--    simplesmente não aparece, que é o comportamento certo (ver a regra de
--    ausência da folha de decisões: sem matéria, não se pinta).
--
--    A mensagem inicial e as imagens SÃO chaves fixas, e de propósito: vêm do
--    pedido (`lib/captacao.js`), que grava `mensagemInicial` e
--    `imagensReferencia` literalmente, igual para toda a gente.
--
-- 🔴 AS IMAGENS SAEM TAL E QUAL. Investigado antes de escrever isto: o
--    caminho no Storage é `ref_{timestamp}_{aleatório}.jpg`, no balde
--    `referencias`, sem id de evento, sem código, sem nada derivável. O que
--    fica em `respostas` é o URL público completo. Servir estes URLs não
--    expõe o id — e reorganizar os caminhos "por evento" é que o exporia.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · A visita penúltima ─────────────────────────────────────────────────
--
-- PORQUÊ UMA COLUNA NOVA, e não só devolver o valor antes de o actualizar:
--
-- A divisão «o que mudou desde a última vez» compara os artefactos com a
-- visita anterior. Se o carimbo avança a cada leitura, um simples recarregar
-- da página apaga as novidades que ela acabou de ver.
--
-- A regra dos 30 minutos sozinha não resolve isso. Sem actualizar, o
-- `ultimo_acesso_em` continua a ser o da visita de hoje, e a comparação passa
-- a ser contra hoje — a novidade desaparece na mesma. A janela impede o
-- contador de inflacionar; não preserva o ponto de comparação.
--
-- São precisas as duas peças: guardar o PENÚLTIMO, e usar os 30 minutos para
-- decidir quando ele roda. Dentro da janela nada se mexe e a página desenha
-- sempre o mesmo; passada a janela, o penúltimo recebe o último e o último
-- passa a agora.

alter table public.portal_acessos
  add column if not exists visita_anterior_em timestamptz;

comment on column public.portal_acessos.visita_anterior_em is
  'O acesso ANTES do último. É contra este que a divisão das novidades '
  'compara. Roda só quando passam 30 minutos sobre ultimo_acesso_em, para '
  'recarregar a página não apagar o que ela acabou de ver.';


-- ─── 2 · A leitura pública, com a projecção maior ───────────────────────────

create or replace function public.dlm_portal_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso      public.portal_acessos%rowtype;
  v_ev          public.submissions%rowtype;
  v_steps       jsonb;
  v_modelo      text;
  v_titulo      text;

  v_pedido_em       timestamptz;
  v_orcamento_em    timestamptz;
  v_sinal_em        timestamptz;
  v_projecto_em     timestamptz;
  v_contrato_em     timestamptz;
  v_questionario_em timestamptz;

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

  select min(p.data)::timestamptz into v_sinal_em
    from public.pagamentos p
   where p.submission_id = v_ev.id
     and p.origem = 'sinal' and p.reconstituido = false;

  select min(i.preenchido_em) into v_questionario_em
    from public.invites i
   where i.submission_id = v_ev.id or i.submission_alvo_id = v_ev.id;

  -- ── A Jornada (inalterada face à 052) ─────────────────────────────────
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
            or v_ev.fase in ('orcamento','sinal','cliente','projecto','contrato'),
          v_orcamento_em),
      (3, 'sinal',
          v_sinal_em is not null
            or v_ev.fase in ('cliente','projecto','contrato')
            or exists (select 1 from public.pagamentos p
                        where p.submission_id = v_ev.id and p.origem = 'sinal'),
          v_sinal_em),
      (4, 'projecto', v_projecto_em is not null or v_ev.fase in ('projecto','contrato'), v_projecto_em),
      (5, 'contrato', v_contrato_em is not null or v_ev.fase = 'contrato', v_contrato_em),
      (6, 'preparacao',
          v_questionario_em is not null
            or v_ev.fase   in ('cliente','projecto','contrato')
            or v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          v_questionario_em),
      (7, 'grande_dia',
          v_ev.data_evento is not null and v_ev.data_evento < current_date,
          case when v_ev.data_evento is not null then v_ev.data_evento::timestamptz end)
    ) as m(ord, etapa, feito, quando);

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

  -- ── A projecção ───────────────────────────────────────────────────────
  return jsonb_build_object(
    'estado', 'activo',
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

    -- Serve a divisão das novidades. NULL na primeira visita — e aí a
    -- divisão não se pinta, porque não há «desde a última vez».
    'visita_anterior', v_anterior,

    'pedido', jsonb_build_object(
      'mensagem',  v_mensagem,
      'quando',    coalesce(v_pedido_em, v_ev.created_at),
      'imagens',   coalesce(v_imagens, '[]'::jsonb)
    ),

    'questionario', jsonb_build_object(
      'entregue_em', v_questionario_em,
      'paleta',      coalesce(v_paleta, '[]'::jsonb),
      'horas',       coalesce(v_horas, '[]'::jsonb),
      'placa',       jsonb_build_object('principal', v_placa1, 'secundario', v_placa2),
      'visao',       coalesce(v_visao, '[]'::jsonb)
    ),

    -- Datas dos artefactos, para a página saber o que é NOVO desde a
    -- visita anterior. Só carimbos — nunca valores.
    'marcos_datados', jsonb_build_object(
      'orcamento', v_orcamento_em,
      'projecto',  v_projecto_em,
      'contrato',  v_contrato_em,
      'sinal',     v_sinal_em
    )
  );
end;
$$;

comment on function public.dlm_portal_ver(text) is
  'Leitura pública do portal. Projecção explícita — submissions.id nunca sai, '
  'nem valores, nem dados de terceiros. Etapas datadas pelo momento em que se '
  'tornaram verdade para a cliente (051, 052). Fase 2 (054): pedido, '
  'questionário e ponto de comparação das novidades. Os campos do '
  'questionário resolvem-se pelo `steps` do modelo, nunca por lista fixa.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- 3 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 3.1 · 🔴 O id continua sem sair. A cada mudança na projecção.
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- FALSE obrigatoriamente.

-- 3.2 · ⭐ Nada de valores nem de dados de terceiros escapou:
--   with p as (select public.dlm_portal_ver('<TOKEN>')::text as j)
--   select j ilike '%valor_acordado%'  as fuga_valor,
--          j ilike '%morada_exacta%'   as fuga_morada,
--          j ilike '%moradaExacta%'    as fuga_morada2,
--          j ilike '%pessoaAbre%'      as fuga_terceiro,
--          j ilike '%briefing%'        as fuga_briefing
--     from p;
--   -- Tudo FALSE.

-- 3.3 · A janela dos 30 minutos: duas leituras seguidas não mexem no contador
--       nem no ponto de comparação.
--   select n_acessos, ultimo_acesso_em, visita_anterior_em
--     from portal_acessos where token = '<TOKEN>';
--   select public.dlm_portal_ver('<TOKEN>') -> 'visita_anterior';
--   select public.dlm_portal_ver('<TOKEN>') -> 'visita_anterior';   -- igual
--   select n_acessos, ultimo_acesso_em, visita_anterior_em
--     from portal_acessos where token = '<TOKEN>';                  -- igual
--
--   Para simular a passagem do tempo sem esperar:
--   update portal_acessos
--      set ultimo_acesso_em = now() - interval '31 minutes'
--    where token = '<TOKEN>';
--   -- a leitura seguinte JÁ roda, e `visita_anterior` passa a ser esse valor.

-- 3.4 · Que matéria tem cada evento, para saber que divisões vão aparecer:
--   select s.id,
--          (s.respostas ? 'mensagemInicial')                       as tem_mensagem,
--          jsonb_array_length(coalesce(
--            case when jsonb_typeof(s.respostas->'imagensReferencia') = 'array'
--                 then s.respostas->'imagensReferencia' end, '[]'::jsonb)) as n_imagens,
--          et.nome as modelo
--     from submissions s
--     left join event_types et on et.id = s.event_type_id
--    order by s.created_at desc;
