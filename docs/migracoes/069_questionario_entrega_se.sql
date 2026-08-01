-- ============================================================================
-- 069 · O questionário entrega-se — e a pendência sabe quando não há
--       (correcções A1 e A2 da revisão do conjunto)
--
-- A revisão com o portal inteiro à vista apanhou a fase 5 partida de ponta
-- a ponta. Três elos, e nenhum deles se via a testar um passo de cada vez:
--
-- 1 · `dlm_portal_entregar_questionario` foi escrita, exportada na camada
--     JS, e NUNCA CHAMADA. Nenhum ecrã a invoca — logo o carimbo nunca era
--     posto pelo portal.
--
-- 2 · `dlm_portal_ver` continuava a ler `min(invites.preenchido_em)` e
--     NUNCA lia `submissions.questionario_entregue_em`, apesar de a 062 ter
--     criado a coluna, feito backfill e o Hélio a ter carimbado à mão. Duas
--     fontes para a mesma verdade, e a projecção lia a errada.
--
-- 3 · Consequência das duas: a cliente respondia a tudo e a pendência «O
--     questionário» continuava a pedir. Para sempre.
--
-- E, de caminho, a pendência nunca soube do mínimo de cinco campos (063):
-- em QUATRO dos seis modelos convidava a responder a um questionário que
-- não existe, com uma ligação que devolvia a pessoa ao princípio.
--
-- ─── COMO PASSA A ENTREGAR-SE ──────────────────────────────────────────────
--
-- SOZINHO, quando não faltar nada obrigatório. Sem botão de submeter, e é
-- de propósito: o desenho da fase 5 fez de responder e rever o mesmo ecrã,
-- e um «terminei» num ecrã de revisão é um gesto a mais. Ela responde à
-- última pergunta, a pendência desaparece, e a Nádia recebe o aviso.
--
-- A função de entregar à mão morre: uma RPC que promete um gesto que não
-- existe é a mesma classe de defeito que esta migração corrige.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · Gravar um campo passa a poder fechar o questionário ────────────────
--
-- Cópia fiel da 063 com UM bloco acrescentado antes do return, gerado a
-- partir do texto original e verificado por diff.

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
           coalesce(v_nome, 'A cliente') || ' respondeu ao questionário',
           v_ev.id, v_ev.cliente_id, v_ev.event_type_id, '{}'::jsonb);
      end if;
    end;
  end if;

  return jsonb_build_object('estado', 'ok', 'guardado_em', now());
end
$$;

revoke all     on function public.dlm_portal_responder(text, text, jsonb) from public;
grant  execute on function public.dlm_portal_responder(text, text, jsonb) to anon, authenticated;


-- ─── 2 · A função que ninguém chamava ───────────────────────────────────────

drop function if exists public.dlm_portal_entregar_questionario(text);


-- ─── 3 · A projecção lê a coluna certa, e diz se há perguntas ───────────────
--
-- Cópia fiel da 068 com DUAS alterações, verificadas por diff.

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

  -- A COLUNA DO EVENTO PRIMEIRO. A 062 criou-a, fez backfill e foi
  -- carimbada à mão — mas esta projecção continuava a ler só os convites, e
  -- por isso o portal nunca soube que o questionário estava entregue. Quem
  -- responde PELO PORTAL pode não ter convite nenhum.
  select coalesce(v_ev.questionario_entregue_em, min(i.preenchido_em))
    into v_questionario_em
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
      -- 055 · Uma data que passou NÃO é um evento que aconteceu. Sem
      -- sinal pago, a data ter passado significa o contrário: o pedido
      -- caducou. FASES_POS_SINAL, a lista canónica de sempre.
      (7, 'grande_dia',
          v_ev.data_evento is not null
            and v_ev.data_evento < current_date
            and v_ev.fase in ('cliente','projecto','contrato'),
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
             and v_ev.fase in ('cliente','projecto','contrato');

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
    'marcos_datados', jsonb_build_object(
      'orcamento', v_orcamento_em,
      'projecto',  v_projecto_em,
      'contrato',  v_contrato_em,
      'sinal',     v_sinal_em
    )
  );
end;
$$;

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- 4 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 4.1 · 🔴 O CARIMBO QUE NUNCA ERA POSTO. Num evento de Casamento sem
--   questionário entregue, responde a TODOS os campos obrigatórios pelo
--   portal e depois:
--   select questionario_entregue_em from submissions where id='<EVENTO>'::uuid;
--   -- Esperado: PREENCHIDO. Antesta migração ficava null para sempre.
--   select count(*) from notificacoes where tipo='questionario_entregue';
--   -- Esperado: subiu UM.

-- 4.2 · E a pendência desaparece:
--   select public.dlm_portal_ver('<TOKEN>')->'questionario'->'entregue_em';
--   -- Esperado: a data. E no portal, o cartão «O questionário» some.

-- 4.3 · Falta UM obrigatório, e não se carimba:
--   Apaga uma resposta obrigatória e grava outro campo.
--   -- Esperado: questionario_entregue_em NÃO muda (uma vez posto, fica).

-- 4.4 · 🔴 A verdade lida do sítio certo. Num evento carimbado à MÃO (o que
--   respondeu por fora e não tinha convite preenchido):
--   select public.dlm_portal_ver('<TOKEN_DESSE>')->'questionario'->'entregue_em';
--   -- Esperado: a data que carimbaste. Antes vinha null.

-- 4.5 · 🔴 Os modelos magros deixam de convidar:
--   select public.dlm_portal_ver('<TOKEN_FESTINHAS>')->'questionario'->'tem_perguntas';
--   -- Esperado: false. E num Casamento: true.

-- 4.6 · A invariante, que muda de função outra vez:
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Esperado: FALSE.
