-- ============================================================================
-- 051 · Portal do Cliente — a Jornada com datas honestas
--
-- A 049/050 datavam as etapas «orçamento» e «projecto» com
-- `documentos.created_at` — o momento em que a Nádia GEROU o documento.
-- Do lado da cliente isso é uma data em que, possivelmente, nada lhe chegou:
-- um rascunho criado a 15/03 e nunca enviado aparecia-lhe como
-- «Orçamento · 15/03 ✓».
--
-- Numa superfície cuja única função é criar confiança, é o pior erro
-- possível: afirmar à cliente um facto que ela sabe que não aconteceu.
--
-- O PRINCÍPIO que esta migração aplica:
--
--     Cada etapa é datada pelo momento em que se tornou verdade
--     PARA A CLIENTE — não pelo momento em que deu trabalho à Nádia.
--
--   · orçamento → `enviado_em`   (ela recebeu)
--   · projecto  → `assinado_em`  (ela aprovou)
--   · contrato  → `assinado_em`  (ela assinou)   ← já estava certo
--
-- E resolve a variável morta: `v_tem_contrato` era calculada e nunca lida nas
-- duas migrações. Não era código a mais — era o sintoma de uma decisão a meio.
-- Para orçamento e projecto, EXISTIR contava como feito; para contrato, só
-- ASSINAR contava. Aqui as três passam a seguir a mesma regra, e as variáveis
-- de existência desaparecem por deixarem de ter trabalho.
--
-- O que NÃO muda: `feito_sem_data` continua a ser o estado para «aconteceu,
-- mas o carimbo não foi marcado». Foi a melhor decisão da 049 e é o que salva
-- este modelo — os carimbos `enviado_em`/`assinado_em` são cliques da Nádia,
-- e a ausência de um clique nunca prova a ausência do facto.
--
-- Fora do resto, o corpo é byte a byte igual ao da 050, de propósito — para o
-- diff ser revisível de relance (o mesmo critério que a 050 usou face à 049).
--
-- Idempotente (CREATE OR REPLACE). Correr primeiro em TESTE, depois em
-- PRODUÇÃO. Read-write, não destrutiva: não toca em dados, só na função.
-- ============================================================================


-- ─── 1 · A leitura pública, com as datas certas ─────────────────────────────

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
  v_pedido_em    timestamptz;
  v_orcamento_em timestamptz;  -- 051: era created_at, passa a enviado_em
  v_sinal_em     timestamptz;
  v_projecto_em  timestamptz;  -- 051: era created_at, passa a assinado_em
  v_contrato_em  timestamptz;

  -- 051: v_tem_orcamento / v_tem_projecto / v_tem_contrato removidas.
  -- A existência de um rascunho não é um marco da jornada dela.

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

  -- 051 · O orçamento conta quando SAIU, não quando foi gerado.
  -- min() ignora NULLs: se houver dois orçamentos e só um enviado, fica a
  -- data desse. Se nenhum foi enviado, fica NULL → «feito_sem_data» quando
  -- a fase disser que houve orçamento.
  select min(d.enviado_em) into v_orcamento_em
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'orcamento';

  -- 051 · O projecto conta quando ela APROVOU.
  -- Nota de tradução, que é a armadilha mais fácil deste esquema:
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

  -- ── A Jornada — só chaves, sem rótulos (regra da 050) ─────────────────
  --
  -- Três estados, nunca dois. «feito_sem_data» existe porque um carimbo em
  -- falta NÃO prova que a coisa não aconteceu.
  --
  -- 051 · O `feito` de cada etapa passa a ter duas fontes, e só duas:
  --   1. o carimbo que interessa à cliente (enviado/assinado/pago), ou
  --   2. a FASE do evento, que é o reconhecimento honesto de que muita
  --      coisa se combina por telefone e nunca é marcada na app.
  -- A existência de um documento deixou de contar: um rascunho na bancada
  -- da Nádia não é um acontecimento na vida da cliente.

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

      -- Preparação não tem artefacto: é o status a dizê-lo, e nunca tem data.
      -- ⚠ Ver secção 3.2: confirmar que estas três grafias são as únicas.
      (6, 'preparacao',
          v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          null::timestamptz),

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
  'projecto e contrato=assinado_em (051). Inexistente, revogado e expirado '
  'devolvem a mesma resposta.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ============================================================================
-- 2 · INDEPENDENTE — o token que nascia morto
--
-- Podes SALTAR esta secção sem afectar a de cima. Está aqui por ser uma linha
-- e o mesmo âmbito (a porta do portal), mas é outro problema.
--
-- `dlm_portal_abrir` punha `expira_em = data_evento + 30 dias`. Para um evento
-- que já passou há mais de 30 dias, a Nádia abre o portal, recebe um token, e
-- o link está expirado à nascença — sem nada que lho diga. Ela partilha-o e a
-- cliente vê a cortina.
--
-- Correcção: o prazo nunca é menor do que 30 dias a contar de AGORA. Se ela
-- abriu a porta deliberadamente, a porta abre-se — mesmo para um evento
-- antigo (uma cliente a rever o casamento do ano passado é um caso legítimo).
-- Para eventos futuros nada muda: 30 dias depois do evento continua a ser
-- mais tarde do que 30 dias a partir de hoje.
-- ============================================================================

create or replace function public.dlm_portal_abrir(p_submission_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token text;
  v_data  date;
begin
  select token into v_token
    from public.portal_acessos
   where submission_id = p_submission_id
     and revogado_em is null;

  if found then
    return v_token;
  end if;

  select data_evento into v_data
    from public.submissions
   where id = p_submission_id;

  insert into public.portal_acessos (submission_id, expira_em)
  values (p_submission_id,
          case when v_data is not null
               then greatest((v_data + interval '30 days')::timestamptz,
                             now() + interval '30 days')
               end)
  returning token into v_token;

  return v_token;
end;
$$;

comment on function public.dlm_portal_abrir(uuid) is
  'Abre (ou devolve) a porta do portal de um evento. Um só acesso vivo por '
  'evento. Prazo: 30 dias depois do evento, nunca menos de 30 dias a partir '
  'de agora (051). Sem data de evento, fica em aberto e revoga-se à mão.';

revoke all     on function public.dlm_portal_abrir(uuid) from public, anon;
grant  execute on function public.dlm_portal_abrir(uuid) to authenticated;


-- ============================================================================
-- 3 · Verificação — correr depois, em TESTE
-- ============================================================================

-- 3.1 · ⭐ O teste desta migração: um orçamento GERADO mas NÃO ENVIADO não
--        pode aparecer como datado. Dentro de transação abortada, sem rasto.
--
--   begin;
--     -- põe um orçamento sem enviado_em num evento que tenha portal aberto
--     update public.documentos
--        set enviado_em = null
--      where submission_id = '<EVENTO_ID>'::uuid and tipo = 'orcamento';
--
--     select jsonb_pretty(
--              jsonb_path_query_first(
--                public.dlm_portal_ver('<TOKEN>'),
--                '$.jornada[*] ? (@.etapa == "orcamento")'));
--     -- Esperado: estado = feito_sem_data (se a fase já passou de
--     -- interessado) ou por_acontecer (se não). NUNCA feito_datado.
--   rollback;

-- 3.2 · ⚠ A etapa `preparacao` depende de três grafias de `status`. Se
--        houver outras na base, a etapa nunca acende e ninguém dá por isso.
--        Esta é a única pergunta que não consigo responder sem a base:
--
--   select status, count(*) as n
--     from public.submissions
--    group by status
--    order by n desc;
--
--   Se aparecerem grafias fora de ('Em Preparação','Confirmado','Concluído'),
--   diz-me quais — é uma 052 de uma linha, não se adivinha aqui.

-- 3.3 · Quantos documentos têm carimbo de envio? Mede quanto da Jornada vai
--        ficar em «feito_sem_data» — ou seja, quanto do desenho depende
--        desse estado estar bem resolvido.
--
--   select tipo,
--          count(*)                                    as total,
--          count(enviado_em)                           as enviados,
--          count(assinado_em)                          as assinados,
--          count(*) - count(enviado_em)                 as sem_carimbo_envio
--     from public.documentos
--    group by tipo
--    order by total desc;

-- 3.4 · 🔴 A regra de sempre, que se verifica a cada mudança no RPC:
--
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   -- Tem de dar FALSE. Se der true, para tudo.

-- 3.5 · A cortina continua a não distinguir os três casos:
--
--   select public.dlm_portal_ver('token-que-nao-existe');   -- terminado
--   select public.dlm_portal_ver(null);                     -- terminado
--   select public.dlm_portal_ver('curto');                  -- terminado

-- 3.6 · O prazo já não nasce no passado (secção 2):
--
--   select s.data_evento, pa.criado_em, pa.expira_em,
--          pa.expira_em > now() as porta_viva
--     from public.portal_acessos pa
--     join public.submissions s on s.id = pa.submission_id
--    where pa.revogado_em is null
--    order by pa.criado_em desc;


-- ============================================================================
-- FICA REGISTADO — duas coisas que esta migração NÃO faz
--
-- 1 · A chave da etapa 1 é 'interessada', no feminino, enquanto
--     `submissions.fase` diz 'interessado'. Duas grafias para o mesmo
--     conceito em camadas diferentes — a divergência que o glossário existe
--     para evitar, e a sua pendência #2 a reaparecer num sítio novo.
--
--     Não se muda aqui de propósito: é um NOME, e a regra da casa é que os
--     nomes mudam primeiro no `glossario.md`. Como é chave de máquina, o
--     rótulo que a cliente lê fica livre no front end — por isso é cosmético
--     e não urgente. Mas é AGORA que é grátis: nenhum front end a consome
--     ainda. Depois de haver portal vivo, muda-se nos dois lados ao mesmo
--     tempo.
--
-- 2 · O CHECK em `invites.status` que a 048 deixou como dívida consciente
--     («vale a pena numa 049») nunca foi feito — a 049 foi para o portal. O
--     gatilho da 048 depende da grafia exacta 'Preenchido'; se algum caminho
--     futuro escrever 'preenchido', o carimbo não é escrito e ninguém dá por
--     isso. Continua em aberto, e a query que o desbloqueia é uma linha:
--       select status, count(*) from public.invites group by status;
-- ============================================================================
