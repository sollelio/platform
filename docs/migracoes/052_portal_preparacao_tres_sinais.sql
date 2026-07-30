-- ============================================================================
-- 052 · Portal do Cliente — a «Preparação» deixa de depender de uma só coluna
--
-- O ACHADO que motiva esta migração (contagem em produção, 30/07/2026):
--
--     status          n
--     Recebido       10   ← o DEFAULT. Ninguém lhe tocou.
--     Em Preparação   1
--     Confirmado      0   ← nunca usado
--     Concluído       0   ← nunca usado
--
-- A etapa 6 acendia com `status in ('Em Preparação','Confirmado','Concluído')`.
-- As grafias estão certas (é o vocabulário real, ver 040 e STATUS_OPTIONS) —
-- o problema é que 10 de 11 eventos estão no valor por omissão. A etapa lia
-- «por_acontecer» para praticamente todos, incluindo eventos com sinal pago,
-- contrato assinado e data à porta.
--
-- É o erro que a 051 corrigiu, virado ao contrário: em vez de afirmar um facto
-- que não aconteceu, NEGAVA um facto que estava claramente a acontecer. Para a
-- cliente, ler «Preparação — por acontecer» a duas semanas do casamento é pior
-- do que não ver a etapa nenhuma.
--
-- Razão estrutural, que fica registada porque explica o número: o `status` só
-- se muda a partir do Dashboard (STATUS_OPTIONS aparece em DashboardTab e
-- Jornada, e em mais nenhum sítio) — longe de onde a Nádia trabalha o evento.
-- Não é desleixo; é a app a pedir um gesto onde ele não cabe.
--
--
-- A DECISÃO (Hélio, 30/07/2026): TRÊS SINAIS, não um.
--
--   `preparacao` fica «feito» se QUALQUER um destes for verdade:
--     1. invites.preenchido_em is not null      ← o questionário foi entregue
--     2. fase in ('cliente','projecto','contrato')       ← FASES_POS_SINAL
--     3. status in ('Em Preparação','Confirmado','Concluído')
--
--   Datada por `preenchido_em` quando existir; «feito_sem_data» nos outros.
--
-- Porquê os três e não só o carimbo novo da 048: a entrega do questionário é o
-- melhor carimbo que temos — é facto DELA, e é datado — mas não é o único
-- caminho. Há eventos que chegam a cliente com sinal pago e sem questionário
-- nenhum (5 dos 11 não têm formulário). Qualquer um dos três significa que a
-- preparação está mesmo a acontecer, e o sinal mais forte não deve apagar os
-- outros.
--
-- A lista da condição 2 é a canónica `FASES_POS_SINAL` — a mesma da conferência
-- da Logística e de `ehLacunaDeFormulario`. NÃO é uma lista nova.
--
-- E o `status` fica como terceiro sinal em vez de desaparecer: quando a Nádia o
-- marcar, conta. Tirá-lo seria descartar informação verdadeira só porque é rara.
--
--
-- NÃO se criou etapa própria para o questionário (a alternativa discutida):
-- oito etapas pioram o ecrã vazio — uma bolinha acesa em oito em vez de uma em
-- sete — e o questionário vai ter secção própria no portal mais à frente.
--
--
-- ÚNICA alteração face à 051: a etapa 6 e a consulta que a alimenta. Todo o
-- resto é byte a byte igual, de propósito — o mesmo critério que a 050 usou
-- face à 049 e a 051 face à 050: o diff tem de ser revisível de relance.
--
-- Idempotente (CREATE OR REPLACE). Correr primeiro em TESTE, depois em
-- PRODUÇÃO. Read-write, não destrutiva: não toca em dados, só na função.
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
  v_modelo      text;
  v_titulo      text;

  -- Só carimbos que significam algo DO LADO DA CLIENTE.
  v_pedido_em       timestamptz;
  v_orcamento_em    timestamptz;
  v_sinal_em        timestamptz;
  v_projecto_em     timestamptz;
  v_contrato_em     timestamptz;
  v_questionario_em timestamptz;  -- 052: o carimbo da 048

  v_marcos jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_acesso
    from public.portal_acessos
   where token = p_token;

  if not found
     or v_acesso.revogado_em is not null
     or (v_acesso.expira_em is not null and v_acesso.expira_em < now())
  then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev
    from public.submissions
   where id = v_acesso.submission_id;

  if not found then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select nome into v_modelo
    from public.event_types
   where id = v_ev.event_type_id;

  v_titulo := nullif(
    concat_ws(' & ',
      nullif(btrim(coalesce(v_ev.nome_noivo, '')), ''),
      nullif(btrim(coalesce(v_ev.nome_noiva, '')), '')
    ), '');

  if v_titulo is null then
    select c.nome into v_titulo
      from public.clientes c
     where c.id = v_ev.cliente_id;
  end if;

  -- ── Artefactos ────────────────────────────────────────────────────────
  -- documentos.submission_id é NULLABLE: a junção por igualdade já exclui
  -- os órfãos, mas fica dito porque não é óbvio a ler.

  select min(n.created_at) into v_pedido_em
    from public.notificacoes n
   where n.submission_id = v_ev.id and n.tipo = 'captacao';

  -- O orçamento conta quando SAIU, não quando foi gerado (051).
  select min(d.enviado_em) into v_orcamento_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'orcamento';

  -- O projecto conta quando ela APROVOU (051).
  -- Nota de tradução, a armadilha mais fácil deste esquema:
  -- `tipo = 'proposta'` É o Projecto. 'proposta' nunca foi o orçamento.
  select min(d.assinado_em) into v_projecto_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'proposta';

  select min(d.assinado_em) into v_contrato_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'contrato';

  -- Só pagamentos com data fiável. reconstituido = true significa que a
  -- data se perdeu: conta como facto, mas sem dia.
  select min(p.data)::timestamptz into v_sinal_em
    from public.pagamentos p
   where p.submission_id = v_ev.id
     and p.origem        = 'sinal'
     and p.reconstituido = false;

  -- 052 · Quando a cliente entregou o questionário.
  --
  -- Os DOIS ponteiros de propósito: `submission_alvo_id` é o evento a que o
  -- formulário se destinava (posto na criação) e `submission_id` é o que
  -- resultou do preenchimento. Um questionário deste evento pode estar ligado
  -- por qualquer dos dois, conforme o caminho que seguiu.
  --
  -- Sem filtro por `status`: `preenchido_em` só é escrito pelo gatilho da 048
  -- na transição para 'Preenchido', por isso min() já ignora o resto.
  select min(i.preenchido_em) into v_questionario_em
    from public.invites i
   where i.submission_id     = v_ev.id
      or i.submission_alvo_id = v_ev.id;

  -- ── A Jornada — só chaves, sem rótulos (regra da 050) ─────────────────
  --
  -- Três estados, nunca dois. «feito_sem_data» existe porque um carimbo em
  -- falta NÃO prova que a coisa não aconteceu.
  --
  -- O `feito` de cada etapa tem duas fontes (051): o carimbo que interessa à
  -- cliente, ou a FASE do evento — o reconhecimento honesto de que muita coisa
  -- se combina por telefone e nunca é marcada na app.

  select jsonb_agg(
           jsonb_build_object(
             'etapa',  m.etapa,
             'estado', case
                         when not m.feito       then 'por_acontecer'
                         when m.quando is null  then 'feito_sem_data'
                         else                        'feito_datado'
                       end,
             'quando', m.quando
           ) order by m.ord
         )
    into v_marcos
    from (values
      (1, 'interessada',
          true,
          coalesce(v_pedido_em, v_ev.created_at)),

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

      (4, 'projecto',
          v_projecto_em is not null or v_ev.fase in ('projecto','contrato'),
          v_projecto_em),

      (5, 'contrato',
          v_contrato_em is not null or v_ev.fase = 'contrato',
          v_contrato_em),

      -- 052 · TRÊS SINAIS. Qualquer um significa que a preparação começou;
      -- o mais forte (o questionário) dá a data, e não apaga os outros.
      (6, 'preparacao',
          v_questionario_em is not null
            or v_ev.fase   in ('cliente','projecto','contrato')
            or v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          v_questionario_em),

      (7, 'grande_dia',
          v_ev.data_evento is not null and v_ev.data_evento < current_date,
          case when v_ev.data_evento is not null
               then v_ev.data_evento::timestamptz end)
    ) as m(ord, etapa, feito, quando);

  -- ── Sinal de vida ─────────────────────────────────────────────────────
  update public.portal_acessos
     set ultimo_acesso_em = now(),
         n_acessos        = n_acessos + 1
   where id = v_acesso.id;

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
      'principio',  v_ev.fase in ('interessado','orcamento')
    ),
    'jornada', coalesce(v_marcos, '[]'::jsonb)
  );
end;
$$;

comment on function public.dlm_portal_ver(text) is
  'Leitura pública do portal do cliente. Projecção explícita — submissions.id '
  'nunca sai, e os rótulos são do front end (050). Cada etapa é datada pelo '
  'momento em que se tornou verdade para a cliente: orçamento=enviado_em, '
  'projecto e contrato=assinado_em (051), preparação=questionário entregue com '
  'fase e status como sinais alternativos (052). Inexistente, revogado e '
  'expirado devolvem a mesma resposta.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- Verificação — correr depois, em TESTE
-- ============================================================================

-- 1 · ⭐ O teste desta migração: quantos eventos passam a ter a preparação
--      acesa, e quantos com data. Antes da 052 era 1 em 11.
--      Read-only, não precisa do portal aberto.
--
--   select s.fase,
--          s.status,
--          (select min(i.preenchido_em) from public.invites i
--            where i.submission_id = s.id or i.submission_alvo_id = s.id)
--            as questionario_em,
--          -- a condição da etapa 6, tal e qual
--          ((select min(i.preenchido_em) from public.invites i
--             where i.submission_id = s.id or i.submission_alvo_id = s.id)
--             is not null
--           or s.fase   in ('cliente','projecto','contrato')
--           or s.status in ('Em Preparação','Confirmado','Concluído'))
--            as preparacao_feita
--     from public.submissions s
--    where s.fase <> 'perdido'
--    order by s.data_evento nulls last;

-- 2 · A etapa 6 vista pelo próprio RPC, para um evento com portal aberto:
--
--   select jsonb_pretty(
--            jsonb_path_query_first(
--              public.dlm_portal_ver('<TOKEN>'),
--              '$.jornada[*] ? (@.etapa == "preparacao")'));

-- 3 · ⭐ O ecrã vazio, que é o mais comum e o mais difícil de desenhar:
--      um evento em 'interessado' tem de continuar com a etapa 6 apagada.
--      (Se acender num interessado, a condição está errada.)
--
--   select public.dlm_portal_abrir('<EVENTO_EM_INTERESSADO>'::uuid);
--   select jsonb_pretty(public.dlm_portal_ver('<TOKEN_DEVOLVIDO>'));

-- 4 · 🔴 A regra de sempre, verificada a cada mudança no RPC:
--
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Tem de dar FALSE. Se der true, para tudo.


-- ============================================================================
-- CONTINUA EM ABERTO (herdado da 051, nada disto muda aqui)
--
-- 1 · A chave da etapa 1 é 'interessada' (feminino) e `submissions.fase` diz
--     'interessado'. É um NOME: muda primeiro no `glossario.md`. Grátis
--     enquanto nenhum front end a consome — depois é nos dois lados.
--
-- 2 · O CHECK em `invites.status` que a 048 deixou como dívida. O gatilho
--     depende da grafia exacta 'Preenchido'; se algum caminho futuro escrever
--     'preenchido', o carimbo não é escrito e ninguém dá por isso. A query que
--     o desbloqueia é uma linha:
--       select status, count(*) from public.invites group by status;
-- ============================================================================
