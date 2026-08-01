-- ============================================================================
-- 067 · A avaliação — as RPC e a despedida (fase 7, bloco 2)
--
-- A 066 pôs a estrutura e o mapa. Isto é a canalização: ler o que se
-- pergunta a ESTE evento, gravar a avaliação, e pôr o estado de despedida
-- na projecção.
--
-- ─── AS REGRAS QUE FICAM AQUI DENTRO ───────────────────────────────────────
--
-- 1 · O CONVITE APARECE TRÊS DIAS DEPOIS. Não no dia seguinte. Tempo para
--     as fotografias do dia estarem carregadas e para ela ter dormido.
--     Antes disso o convite não existe — nem rótulo, nem «por responder»,
--     nem prazo à vista. E quem não avalia nunca vê nada de diferente.
--
-- 2 · A AVALIAÇÃO NÃO REVOGA O ACESSO. Estava no plano e mudou. O portal
--     entra em despedida e vive até ao prazo acabar, com as fotografias e
--     nada a pedir. Nenhuma destas funções toca em `portal_acessos`.
--
-- 3 · A FOTOGRAFIA IDENTIFICA-SE PELO URL, nunca pelo id. O URL já é
--     público — passá-lo de volta não revela nada de novo. Mandar o id
--     interno da linha seria abrir uma porta que a casa fechou na 049.
--
-- 4 · A AUTORIZAÇÃO NASCE FALSA e é só sobre AS PALAVRAS. A fotografia
--     não se lhe pergunta: se tiver convidados, essas pessoas não
--     consentiram. Quem marca é a casa (evento_fotografias.pode_publicar).
--
-- 5 · UMA AVALIAÇÃO POR EVENTO, e reenviar ACTUALIZA em vez de recusar.
--     Ela pode mudar de ideias sobre a autorização — o próprio ecrã do
--     obrigado lhe promete que sai do site no mesmo dia.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O que se pergunta a este evento ────────────────────────────────────

create or replace function public.dlm_portal_avaliacao(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
           'assunto', f.assunto)
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

revoke all     on function public.dlm_portal_avaliacao(text) from public;
grant  execute on function public.dlm_portal_avaliacao(text) to anon, authenticated;


-- ─── 2 · Gravar a avaliação ─────────────────────────────────────────────────

create or replace function public.dlm_portal_avaliar(
  p_token      text,
  p_frase      text,
  p_eixos      jsonb,
  p_fotografia text default null,
  p_autorizar  boolean default false,
  p_nome_como  text default 'completo'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all     on function public.dlm_portal_avaliar(text, text, jsonb, text, boolean, text) from public;
grant  execute on function public.dlm_portal_avaliar(text, text, jsonb, text, boolean, text) to anon, authenticated;


-- ─── 3 · A projecção ────────────────────────────────────────────────────────
--
-- Cópia fiel da 065 com TRÊS alterações, geradas do texto original e
-- verificadas por diff: as declarações, o cálculo, e a chave nova.

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
    select coalesce(f.pode_publicar, false) into v_foto_site
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

comment on function public.dlm_portal_ver(text) is
  'Leitura pública do portal. Projecção explícita — submissions.id nunca sai, '
  'nem valores em euros, nem morada exacta, nem briefing. A partir da 067 '
  'inclui o estado da avaliação e da despedida.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- 4 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 4.1 · 🔴 A INVARIANTE, que muda de função em cada fase:
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   select public.dlm_portal_avaliacao('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Esperado: FALSE nas duas. Obrigatoriamente.

-- 4.2 · 🔴 E o id da FOTOGRAFIA também não sai:
--   select public.dlm_portal_avaliacao('<TOKEN>')::text like
--          '%' || (select id::text from evento_fotografias limit 1) || '%';
--   -- Esperado: FALSE.

-- 4.3 · Os três dias. Com o evento ontem:
--   update submissions set data_evento = current_date - 1 where id='<EVENTO>'::uuid;
--   select public.dlm_portal_avaliacao('<TOKEN>');
--   -- Esperado: {"estado":"ok","convidada":false} — e mais nada.
--   Com quatro dias:
--   update submissions set data_evento = current_date - 4 where id='<EVENTO>'::uuid;
--   -- Esperado: convidada true, com eixos e fotografias.

-- 4.4 · Os eixos são os do evento, e a tranquilidade fecha:
--   select e->>'rotulo', e->>'sempre'
--     from jsonb_array_elements(
--            public.dlm_portal_avaliacao('<TOKEN>')->'eixos') as t(e);
--   -- A última linha tem de ser a tranquilidade, com sempre=true.

-- 4.5 · 🔴 UMA FOTOGRAFIA DE OUTRA CLIENTE É RECUSADA:
--   select public.dlm_portal_avaliar('<TOKEN>', 'Correu bem', '[]'::jsonb,
--            '<URL_DE_FOTO_DE_OUTRO_EVENTO>');
--   -- Esperado: {"estado":"fotografia_desconhecida"} — e NADA gravado.

-- 4.6 · 🔴 A AVALIAÇÃO NÃO REVOGA O ACESSO:
--   select revogado_em, motivo from portal_acessos where submission_id='<EVENTO>'::uuid;
--   select public.dlm_portal_avaliar('<TOKEN>','Foi lindo','[]'::jsonb,null,true,'primeiro');
--   select revogado_em, motivo from portal_acessos where submission_id='<EVENTO>'::uuid;
--   -- Os dois têm de dar EXACTAMENTE o mesmo. E o portal continua a abrir.

-- 4.7 · A despedida aparece na projecção:
--   select public.dlm_portal_ver('<TOKEN>')->'avaliacao';
--   -- feita_em preenchido, palavras_no_site true, nome_publicado com o
--   -- primeiro nome só, foto_no_site FALSE (nenhuma nasce publicável).

-- 4.8 · Reenviar actualiza e NÃO toca a campainha outra vez:
--   select count(*) from notificacoes where tipo='avaliacao_recebida';
--   select public.dlm_portal_avaliar('<TOKEN>','Outra frase','[]'::jsonb,null,false,'anonimo');
--   select count(*) from notificacoes where tipo='avaliacao_recebida';
--   -- A contagem NÃO pode subir. E a frase mudou, e nome_publicado é null.

-- 4.9 · Quem não fechou negócio não é convidado:
--   update submissions set fase='perdido' where id='<EVENTO>'::uuid;
--   select public.dlm_portal_avaliacao('<TOKEN>');   -- convidada: false
