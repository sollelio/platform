-- ============================================================================
-- 065 · As fotografias do dia (fase 6, bloco 1)
--
-- No dia da montagem alguém da equipa fotografa o espaço a ficar pronto. A
-- cliente vê-o horas antes de lá chegar. Depois do evento a mesma divisão
-- muda de sentido: deixa de ser expectativa e passa a ser memória.
--
-- ─── AS QUATRO REGRAS QUE FICAM AQUI DENTRO ────────────────────────────────
--
-- 1 · SEM FOTOGRAFIAS NÃO HÁ DIVISÃO. Nem rótulo, nem espaço reservado, nem
--     «ainda sem fotografias». A projecção devolve a lista vazia e a página
--     não pinta nada. Um lugar reservado transforma uma surpresa numa
--     promessa por cumprir — e a maior parte do tempo é assim que está.
--
-- 2 · TUDO O QUE SE CARREGA É PARA ELA VER. Não há visibilidade por
--     fotografia. Uma opção que se decide a cada carregamento é uma opção
--     que vai ser ignorada ou enganada; se um dia fizerem falta fotografias
--     internas, é outra funcionalidade.
--
-- 3 · O CAMINHO NÃO LEVA O ID. `foto_{carimbo}_{aleatório}.jpg`, como as
--     imagens de referência da fase 2 — a razão está escrita na 054:
--     reorganizar os caminhos «por evento» é que exporia o id.
--
-- 4 · O BALDE É PÚBLICO PARA LER, FECHADO PARA ENUMERAR. Um GET directo a um
--     URL não passa pelas políticas; a LISTAGEM é que exige uma política
--     SELECT em storage.objects. Por isso dá para servir a fotografia e
--     manter a enumeração fechada — e desta vez fecha-se à nascença, em vez
--     de se descobrir depois como aconteceu na 056.
--
-- ⚠ O balde é MAIS APERTADO que o `referencias`: aquele precisa de INSERT
--   anónimo porque o formulário público carrega para lá. Aqui só a equipa
--   carrega, portanto o INSERT é só para autenticados.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O balde ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('fotografias', 'fotografias', true)
on conflict (id) do nothing;

-- Só a equipa carrega, muda e apaga. O `anon` não tem política nenhuma —
-- nem de INSERT, nem de SELECT. Sem política SELECT, a listagem está
-- fechada à nascença.
drop policy if exists "equipa carrega fotografias" on storage.objects;
create policy "equipa carrega fotografias" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotografias');

drop policy if exists "equipa ve fotografias" on storage.objects;
create policy "equipa ve fotografias" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotografias');

drop policy if exists "equipa apaga fotografias" on storage.objects;
create policy "equipa apaga fotografias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotografias');

-- Guarda contra o passado: se alguma política de SELECT herdada abranger o
-- `anon` e tocar neste balde, morre aqui. Copiado da 056, que teve de
-- descobrir as políticas dinamicamente porque foram criadas no painel e
-- ninguém sabe os nomes.
do $guarda$
declare r record;
begin
  for r in
    select policyname
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and cmd = 'SELECT'
       and roles::text[] && array['anon','public']
       and coalesce(qual, '') ilike '%fotografias%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'Apagada política de SELECT anónima sobre fotografias: %', r.policyname;
  end loop;
end
$guarda$;


-- ─── 2 · A tabela ───────────────────────────────────────────────────────────

create table if not exists public.evento_fotografias (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  caminho       text not null,
  url_pequena   text not null,
  url_grande    text not null,
  assunto       text,
  momento       text not null default 'montagem'
                check (momento in ('montagem', 'evento')),
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  criado_por    uuid
);

create index if not exists evento_fotografias_evento_idx
  on public.evento_fotografias (submission_id, ordem, criado_em);

comment on table public.evento_fotografias is
  'As fotografias que a equipa tira no dia. Tudo o que aqui está é para a '
  'cliente ver — não há visibilidade por fotografia, de propósito.';

comment on column public.evento_fotografias.momento is
  'montagem ou evento. O valor por omissão deriva da data (carregada no dia '
  'ou antes = montagem), mas é CAMPO e não conta: carregar as fotografias '
  'da montagem no dia seguinte não é o caso raro, é terça-feira.';

comment on column public.evento_fotografias.ordem is
  'A CAPA é a primeira. A casa escolhe-a, e a regra da casa é que seja a '
  'mais adiantada: o trabalho a acontecer aparece por baixo, nunca primeiro '
  '— ninguém precisa de ver o espaço a meio às onze da manhã. O código não '
  'adivinha o que é «mais adiantada»; ela decide, ordenando.';

comment on column public.evento_fotografias.caminho is
  'O nome no balde. Guarda-se para poder apagar o ficheiro quando a linha '
  'sai — sem isto, apagar do ecrã deixava lixo no armazenamento para sempre.';

alter table public.evento_fotografias enable row level security;
drop policy if exists "admin acesso total" on public.evento_fotografias;
create policy "admin acesso total" on public.evento_fotografias
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.evento_fotografias to authenticated;

-- O anon não lê a tabela. O que a página pública vê passa pela projecção.
revoke all on public.evento_fotografias from anon;


-- ─── 3 · A projecção ────────────────────────────────────────────────────────
--
-- Cópia fiel da 055 com TRÊS alterações, geradas a partir do texto original
-- e verificadas por diff: as declarações, o cálculo das fotografias, e a
-- chave nova. Tudo o resto — jornada, véu, janela dos 30 minutos, as sete
-- etapas — fica byte a byte como estava.

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
  'nem valores em euros, nem morada exacta, nem briefing. A partir da 065 '
  'inclui as fotografias do dia, com URLs públicos de nome inadivinhável.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- 4 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 4.1 · 🔴 A INVARIANTE, que muda de função em cada fase:
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Esperado: FALSE. Obrigatoriamente.

-- 4.2 · E nada mais escapou (o segundo teste de sempre):
--   select public.dlm_portal_ver('<TOKEN>')::text ilike any (array[
--     '%valor_acordado%', '%moradaExacta%', '%morada_exacta%',
--     '%pessoaAbre%', '%briefing%']);
--   -- Esperado: FALSE.

-- 4.3 · Sem fotografias, a chave vem vazia — e a página não pinta nada:
--   select public.dlm_portal_ver('<TOKEN>')->'fotografias';
--   -- Esperado: {"quando":"montagem","lista":[],"total":0}

-- 4.4 · 🔴 A LISTAGEM ANÓNIMA ESTÁ FECHADA À NASCENÇA. De DENTRO:
--   select policyname, cmd, roles from pg_policies
--    where schemaname='storage' and tablename='objects' and cmd='SELECT'
--      and roles::text[] && array['anon','public']
--      and coalesce(qual,'') ilike '%fotografias%';
--   -- Esperado: ZERO linhas.
--
--   E de FORA, com a chave anónima que está no JavaScript do site:
--     curl -s -X POST 'https://<PROJECTO>.supabase.co/storage/v1/object/list/fotografias' \
--       -H "apikey: <ANON>" -H "Authorization: Bearer <ANON>" \
--       -H 'Content-Type: application/json' -d '{"prefix":"","limit":100}'
--   -- Esperado: []

-- 4.5 · E o GET de uma fotografia continua a abrir (o balde é público):
--   Depois de carregar uma no backoffice, abre o url_pequena numa janela
--   anónima. Tem de aparecer.

-- 4.6 · O anon não chega à tabela:
--   set role anon;
--   select * from evento_fotografias;   -- Esperado: ERRO de permissão
--   reset role;

-- 4.7 · Os dois enquadramentos:
--   -- com data futura → {"quando":"montagem"} e só as de momento='montagem'
--   update submissions set data_evento = current_date + 5 where id='<EVENTO>'::uuid;
--   -- com data passada → {"quando":"memoria"} e TODAS
--   update submissions set data_evento = current_date - 5 where id='<EVENTO>'::uuid;
--   -- sem data → {"quando":"montagem"} (não se afirma que um dia passou
--   --            quando não se sabe qual é)
--   update submissions set data_evento = null where id='<EVENTO>'::uuid;
