-- ============================================================================
-- 085 · A SAUDAÇÃO EXPLÍCITA E O PORTAL EXPLÍCITO
-- ============================================================================
-- Fase C dos Comunicados (briefing aprovado, pontos 4.2 e 4.4). Duas regras
-- implícitas passam a escolhas escritas:
--
--   4.2 · A SAUDAÇÃO deixa de derivar da vírgula. A armadilha está registada
--         no próprio código (src/lib/comunicados.js:179-182): «Queridos
--         noivos» SEM a vírgula vira parágrafo normal e nada avisa quem
--         escreve. A saudação passa a coluna própria — quem escreve vê um
--         campo, não adivinha uma pontuação.
--
--   4.4 · A PRESENÇA NO PORTAL deixa de ser efeito colateral do carimbo
--         «enviado». Desde a 082, enviar uma folha a um evento punha-a no
--         portal dele sem ninguém o ter decidido. Passa a escolha explícita,
--         por destinatário: a caixa é o gesto.
--
-- CINCO PARTES:
--   1. As colunas `saudacao` em comunicados E comunicado_modelos.
--   2. A migração de dados: extrair a saudação de ABERTURA (1.ª linha do
--      bloco 0) para a coluna, SÓ onde a regra actual a teria derivado —
--      as guardas são a cópia fiel de comporFolha (comunicados.js:229-239).
--   3. A coluna `no_portal` em comunicado_destinatarios + backfill honesto
--      (o que já está visível hoje continua visível; o novo nasce desligado).
--   4. dlm_portal_ver reescrita POR INTEIRO a partir do texto da 084, com
--      UM delta: o filtro dos comunicados ganha `and d.no_portal = true`.
--   5. dlm_comunicado_ver reescrita POR INTEIRO a partir do texto da 080,
--      com UM delta: a `saudacao` entra na projecção. Sem isto a coluna
--      seria um beco — a única porta pública nunca a devolveria, e o
--      código da fase C não teria de onde a ler.
--
-- ORDEM: correr DEPOIS da 084 e ANTES do código da fase C — mas perto dele:
-- entre a parte 2 desta migração e o deploy, a folha pública compõe o bloco 0
-- sem a primeira linha (a saudação já está na coluna, que o código velho não
-- lê). Nada parte; a saudação volta com o código. Janela curta, de propósito.
--
-- Idempotente: correr duas vezes não parte nada nem repete nada.
-- Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. As colunas da saudação
-- ─────────────────────────────────────────────────────────────
-- text, nullable: uma folha SEM saudação é legítima (um aviso seco não
-- cumprimenta). O campo substitui a regra da vírgula — a armadilha de
-- lib/comunicados.js:179-182 morre no código na fase seguinte; a coluna
-- nasce primeiro para os dados já estarem no sítio quando a regra sair.

alter table public.comunicados
  add column if not exists saudacao text;

alter table public.comunicado_modelos
  add column if not exists saudacao text;

comment on column public.comunicados.saudacao is
  'A saudação de abertura («Queridos noivos,»), campo explícito. Substitui a '
  'regra da vírgula de comporFolha (a 1.ª linha curta de prosa terminada em '
  'vírgula) — a armadilha registada em src/lib/comunicados.js:179-182. '
  'NULL = a folha abre sem saudação, e é uma escolha, não um esquecimento.';

comment on column public.comunicado_modelos.saudacao is
  'A mesma saudação explícita de comunicados.saudacao, no molde: quem usar o '
  'molde herda a saudação como campo, não como pontuação a adivinhar.';

-- ─────────────────────────────────────────────────────────────
-- 2. A migração de dados — a saudação de ABERTURA sai do bloco 0
-- ─────────────────────────────────────────────────────────────
-- SÓ mexe onde a regra actual teria derivado a saudação — as guardas abaixo
-- são a cópia fiel de comporFolha (src/lib/comunicados.js:229-239), aplicadas
-- ao bloco 0:
--   · bloco 0 sem `tipo` DECLARADO (imagem/chamada) — como TIPOS_DE_BLOCO:
--     qualquer outro valor, ou nenhum, cai na derivação (retrocompatível,
--     comunicados.js:186-189); `not (? 'tipo')` seria mais estreito que o JS
--   · sem rótulo, aparado como o .trim() do JS (todo o whitespace, não só
--     espaços — o trim() do SQL só apara espaços e divergia do original)
--     (sem rótulo, o bloco 0 nunca é nota nem remate — esses exigem ambos)
--   · a 1.ª linha, aparada, termina em vírgula
--   · com length ≤ 60
--   · e o texto tem mais do que uma linha (linhas.length > 1)
-- Cumprida a regra, a 1.ª linha vai para a coluna e SAI do texto do bloco —
-- exactamente o que comporFolha fazia em memória, agora feito uma vez, nos
-- dados.
--
-- Idempotente: só corre onde `saudacao is null` E a condição bate — na
-- segunda passagem o texto já não tem a linha e a coluna já não é null.
--
-- ⚠ SÓ A ABERTURA, de propósito. A regra da vírgula aplicava-se a QUALQUER
-- bloco de prosa; esta migração cobre apenas o bloco 0. As saudações do MEIO
-- da folha viram parágrafo normal quando a regra sair do código — é o
-- comportamento assumido pelo briefing (uma saudação a meio da folha era a
-- própria armadilha a disparar onde ninguém a queria).
--
-- O caso real que tem de passar: a folha semeada das Condições
-- (semear-comunicado-condicoes.sql), bloco b1 — rótulo vazio, sem tipo,
-- «Queridos noivos,» (16 caracteres, vírgula no fim) e mais texto abaixo.
-- As guardas apanham-na: saudacao ← «Queridos noivos,», e o bloco fica a
-- começar em «Para garantir…».

update public.comunicados c
   set saudacao       = a.primeira,
       blocos         = jsonb_set(c.blocos, '{0,texto}', to_jsonb(a.resto)),
       actualizado_em = now()
  from (
    select c2.id,
           l.primeira,
           l.resto
      from public.comunicados c2
      cross join lateral (
        -- o texto do bloco 0, aparado como o .trim() do JS
        select regexp_replace(coalesce(c2.blocos->0->>'texto', ''),
                              '^\s+|\s+$', '', 'g') as texto
      ) t
      cross join lateral (
        select regexp_replace(split_part(t.texto, E'\n', 1),
                              '^\s+|\s+$', '', 'g') as primeira,
               -- o resto: tudo depois da 1.ª linha, aparado
               -- (linhas.slice(1).join('\n').trim(), em SQL)
               regexp_replace(regexp_replace(t.texto, '^[^\n]*\n', ''),
                              '^\s+|\s+$', '', 'g') as resto
      ) l
     where c2.saudacao is null
       and jsonb_typeof(c2.blocos->0) = 'object'
       and coalesce(c2.blocos->0->>'tipo', '') not in ('imagem', 'chamada')
       and coalesce(regexp_replace(c2.blocos->0->>'rotulo',
                                   '^\s+|\s+$', '', 'g'), '') = ''
       and position(E'\n' in t.texto) > 0          -- linhas.length > 1
       and l.primeira like '%,'                    -- endsWith(',')
       and length(l.primeira) <= 60
  ) a
 where c.id = a.id;

-- O mesmo, palavra a palavra, para os moldes.
update public.comunicado_modelos m
   set saudacao       = a.primeira,
       blocos         = jsonb_set(m.blocos, '{0,texto}', to_jsonb(a.resto)),
       actualizado_em = now()
  from (
    select m2.id,
           l.primeira,
           l.resto
      from public.comunicado_modelos m2
      cross join lateral (
        select regexp_replace(coalesce(m2.blocos->0->>'texto', ''),
                              '^\s+|\s+$', '', 'g') as texto
      ) t
      cross join lateral (
        select regexp_replace(split_part(t.texto, E'\n', 1),
                              '^\s+|\s+$', '', 'g') as primeira,
               regexp_replace(regexp_replace(t.texto, '^[^\n]*\n', ''),
                              '^\s+|\s+$', '', 'g') as resto
      ) l
     where m2.saudacao is null
       and jsonb_typeof(m2.blocos->0) = 'object'
       and coalesce(m2.blocos->0->>'tipo', '') not in ('imagem', 'chamada')
       and coalesce(regexp_replace(m2.blocos->0->>'rotulo',
                                   '^\s+|\s+$', '', 'g'), '') = ''
       and position(E'\n' in t.texto) > 0
       and l.primeira like '%,'
       and length(l.primeira) <= 60
  ) a
 where m.id = a.id;

-- ─────────────────────────────────────────────────────────────
-- 3. O portal explícito — a caixa é o gesto
-- ─────────────────────────────────────────────────────────────
-- Desde a 082, uma folha aparecia no portal de um evento por efeito colateral
-- do carimbo `enviado_em`. A coluna torna a presença uma escolha por
-- destinatário: os envios de HOJE já estão visíveis e assim continuam (o
-- backfill honra o que as clientes já vêem); os NOVOS nascem desligados — é
-- a caixa, no ecrã do envio, que os põe no portal.
--
-- O backfill vive DENTRO do guarda da coluna, e é essa a idempotência que
-- interessa: ele traduz o estado do mundo ANTERIOR à regra nova, por isso só
-- pode correr no instante em que a coluna nasce. Re-correr o ficheiro depois
-- da fase C não pode voltar a carimbar `no_portal = true` em envios que a
-- Nádia decidiu deixar FORA do portal.

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'comunicado_destinatarios'
       and column_name  = 'no_portal'
  ) then
    alter table public.comunicado_destinatarios
      add column no_portal boolean not null default false;

    -- O backfill honesto: o que já estava visível continua visível.
    update public.comunicado_destinatarios
       set no_portal = true
     where enviado_em is not null;
  end if;
end $$;

comment on column public.comunicado_destinatarios.no_portal is
  'A escolha explícita: esta folha aparece no portal DESTE evento. Não deriva '
  'do envio — enviar pelo WhatsApp e publicar no portal são gestos diferentes '
  '(briefing da fase C, 4.4). O backfill da 085 marcou true nos envios '
  'anteriores à regra, porque essas folhas já estavam visíveis desde a 082.';

-- ─────────────────────────────────────────────────────────────
-- 4. dlm_portal_ver — reescrita POR INTEIRO, com UM delta
-- ─────────────────────────────────────────────────────────────
-- O corpo abaixo é a cópia FIEL da versão da 084 (que veio da 083, 082, 078,
-- 076/073/070 — o ficheiro, não a memória), com o delta da 085 marcado no
-- filtro dos comunicados: `and d.no_portal = true`. Perder uma linha das
-- 070..084 é regressão no portal inteiro. Nada mais muda.

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
  --
  -- 085 · E SÓ AS QUE ELA PÔS NO PORTAL: `no_portal` é a escolha explícita
  -- por destinatário (fase C, 4.4). O envio deixou de valer por presença —
  -- os envios anteriores à regra foram carimbados true no backfill da 085
  -- e continuam visíveis; os novos só entram pela caixa.
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
     and d.no_portal = true          -- 085 · o delta: a caixa é o gesto
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

-- ─────────────────────────────────────────────────────────────
-- 5. dlm_comunicado_ver — a porta pública aprende a saudação
-- ─────────────────────────────────────────────────────────────
-- SEM ESTA PARTE, A PARTE 2 ERA UM BECO: a saudação sai do bloco 0 para a
-- coluna, mas a única porta pública da folha (dlm_comunicado_ver, a que a
-- ComunicadoPage chama — src/pages/ComunicadoPage.jsx:840) projectava só
-- titulo/subtitulo/registo/blocos. O código da fase C não teria de onde ler
-- a saudação, e «a saudação volta com o código» (o cabeçalho desta migração)
-- seria falso — ela desaparecia das folhas públicas de vez, não pela janela
-- curta.
--
-- O corpo abaixo é a cópia FIEL da versão da 080 (o ficheiro, não a
-- memória), com UM delta marcado: `saudacao` no select e na projecção. O
-- código de HOJE ignora a chave a mais — a janela é a mesma que o cabeçalho
-- assume. Nada mais muda: mesma resposta única para inexistente/retirada/
-- expirada, mesma contagem, mesmo grant só ao anon.

create or replace function public.dlm_comunicado_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select id, titulo, subtitulo, saudacao,   -- 085 · o delta: a saudação
         blocos, registo, retirado_em, expira_em
    into r
    from public.comunicados
   where token = p_token
     and publicado_em is not null;

  if not found
     or r.retirado_em is not null
     or (r.expira_em is not null and r.expira_em < now()) then
    return jsonb_build_object('estado', 'terminado');
  end if;

  update public.comunicados set n_acessos = n_acessos + 1 where id = r.id;

  return jsonb_build_object(
    'estado',    'activo',
    'titulo',    r.titulo,
    'subtitulo', r.subtitulo,
    'saudacao',  r.saudacao,   -- 085 · o delta: a saudação
    'registo',   r.registo,
    'blocos',    r.blocos
  );
end;
$$;

revoke all on function public.dlm_comunicado_ver(text) from public;
grant execute on function public.dlm_comunicado_ver(text) to anon;
-- Continua a NÃO ser concedida a authenticated, de propósito: a função conta
-- uma leitura, e uma espreitadela do backoffice não pode contar como visita.


-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÕES
-- ═════════════════════════════════════════════════════════════
--
-- 1) As saudações migradas, contadas:
--      select 'comunicados' as tabela,
--             count(*) as total,
--             count(*) filter (where saudacao is not null) as com_saudacao
--        from comunicados
--      union all
--      select 'comunicado_modelos',
--             count(*),
--             count(*) filter (where saudacao is not null)
--        from comunicado_modelos;
--    → com_saudacao = o nº de folhas/moldes cujo bloco 0 abria com a
--      linha da vírgula. Nenhuma folha perdeu texto: a linha mudou de
--      sítio, não desapareceu.
--
-- 2) O caso real — a folha das Condições:
--      select saudacao, left(blocos->0->>'texto', 40) as bloco0
--        from comunicados
--       where titulo like 'Condições para a montagem%';
--      → saudacao = 'Queridos noivos,' e o bloco 0 a começar em
--        «Para garantir que o vosso cenário…».
--
-- 3) Quem NÃO cumpria a regra não foi tocado: uma folha cujo bloco 0
--    tenha rótulo, ou primeira linha sem vírgula, ou linha única, fica
--    com saudacao NULL e blocos intactos — a vírgula em falta deixa de
--    ser armadilha quando o campo chegar ao editor, não por magia aqui.
--
-- 4) no_portal por estado:
--      select (enviado_em is not null) as enviado, no_portal, count(*)
--        from comunicado_destinatarios
--       group by 1, 2 order by 1, 2;
--    → enviado = true  ⇒ no_portal = true  (o backfill: já estavam
--      visíveis desde a 082 e assim continuam);
--      enviado = false ⇒ no_portal = false (os novos nascem desligados).
--
-- 5) O portal obedece à caixa: num evento com folha enviada, pôr
--    `no_portal = false` na linha e chamar
--      select dlm_portal_ver('<token do evento>') -> 'comunicados';
--    → [] — a folha sai do portal sem mexer no carimbo do envio.
--    Repor `no_portal = true` → a folha volta, com o mesmo enviado_em.
--
-- 6) Nada do resto mexeu: jornada, sinal, estado_do_dia, marcos_datados,
--    publicado_em, avaliação e fotografias respondem exactamente como na
--    084 — o delta é UMA condição num único filtro.
--
-- 7) A porta pública devolve a saudação (e o código de hoje ignora-a):
--      select public.dlm_comunicado_ver('<token da folha das Condições>')
--             ->> 'saudacao';
--    → 'Queridos noivos,' — a chave existe na resposta desde já; a página
--      só a lê quando o código da fase C sair. ⚠ Esta chamada conta uma
--      leitura (n_acessos +1) — em TESTE não faz mal; em produção, uma.
--
-- 8) Correr o ficheiro OUTRA VEZ não muda nada: as duas UPDATEs devolvem
--    0 linhas (saudacao já não é null), o DO block não re-executa o
--    backfill (a coluna já existe — e é isso que protege os envios
--    pós-fase C em que a Nádia deixou a caixa desligada), e os dois
--    create or replace são o mesmo texto.
