-- ============================================================================
-- 084 · A PROMESSA QUEBRADA NO PORTAL
-- ============================================================================
-- O ecrã H″ do mockup aprovado (secção 2b — «o custo da decisão 11»): quando
-- a Nádia regista um sinal rival POR CIMA de um prazo activo (p_forcar na
-- porta do registo, 083), o portal da preterida tem de mostrar as desculpas
-- da casa — nunca um «ficou reservado» seco por cima de um «guardado para
-- si até DD/MM» que ela ainda tinha à vista.
--
-- A 083 já deixou a metade escrita: «tomado» cala tudo, incluindo o prazo
-- próprio, e a verificação 5 da parte B prometia que a promessa quebrada
-- «mostra-se, não se esconde». Faltava a projecção DIZER que houve promessa:
-- com só {estado:'tomado'}, o front não distingue a preterida de um rival
-- qualquer, e o H″ ficava sem chão.
--
-- UM DELTA, e mais nada: no estado_do_dia, quando o dia está 'tomado' E o
-- PRÓPRIO evento tem dia_guardado_ate >= current_date, sai
-- {estado:'tomado', promessa_quebrada:true}. Sem promessa de pé, sai
-- {estado:'tomado'} como sempre saiu — o front pergunta pela chave, e a
-- ausência dela é o estado antigo, byte a byte.
--
-- A FUNÇÃO É REESCRITA POR INTEIRO, como sempre: o corpo abaixo é a cópia
-- FIEL da versão da 083 (que veio da 082, 078, 076/073/070 — o ficheiro,
-- não a memória), com o delta da 084 marcado. Perder uma linha desta
-- função é regressão no portal inteiro.
--
-- Correr DEPOIS da 083 (o corpo lê submissions.dia_guardado_ate e chama
-- dlm_dia_estado — peças da parte A da 083). Idempotente: correr duas
-- vezes não parte nada. Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================

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
$$;

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÕES
-- ═════════════════════════════════════════════════════════════
--
-- 1) A promessa quebrada mostra-se: evento A com dia_guardado_ate de hoje
--    ou futuro (e data_evento futura); a Nádia regista um sinal ao rival B
--    da mesma data com p_forcar →
--      select jsonb_pretty(dlm_portal_ver('<token de A>') -> 'sinal' -> 'estado_do_dia');
--      → {"estado": "tomado", "promessa_quebrada": true}
--
-- 2) Sem promessa não há bandeira: um terceiro evento C da mesma data,
--    sem dia_guardado_ate (ou com o prazo já passado) →
--      select dlm_portal_ver('<token de C>') -> 'sinal' -> 'estado_do_dia';
--      → {"estado": "tomado"} — a chave promessa_quebrada NEM EXISTE.
--
-- 3) A bandeira dissolve-se em leitura, sem vassoura: passado o
--    dia_guardado_ate de A (ou mudada a data do evento), a mesma consulta
--    volta a {"estado": "tomado"} — a promessa teria expirado pelos
--    próprios termos, e «ficou reservado» é a verdade simples.
--
-- 4) Privacidade intacta: na resposta de A não aparece nome, id nem
--    migalha do rival —
--      select dlm_portal_ver('<token de A>')::text ilike '%<nome do rival>%' as vazou;
--      → false
--
-- 5) Nada do resto mexeu: valor/total/config/confirmacao do bloco sinal,
--    comunicados, jornada, portão do sinal (078), marcos_datados e
--    publicado_em respondem exactamente como na 083. O delta é UMA chave
--    nova num único ramo — tudo o resto é byte a byte a versão da 083.
--
-- 6) Token inexistente/revogado/expirado continua a dar a resposta de
--    sempre: select dlm_portal_ver('nao-existe'); → {"estado":"terminado"}
