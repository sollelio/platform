-- ============================================================================
-- 083 · O ECRÃ DO SINAL E A DISPUTA DO DIA
-- ============================================================================
-- As 17 decisões aprovadas pelo Hélio a 08/08/2026 — a fonte é o registo em
-- docs/decisoes-de-produto.md («O ecrã do sinal e a disputa do dia») e o
-- mockup validado. Em resumo:
--   · o véu dos valores do ORÇAMENTO morre (o do contrato fica — tapa NIF,
--     morada e contacto); aceitar/pedir alteração deixam de exigir código
--     (a posse da ligação é a prova); ASSINAR não muda;
--   · nasce o ecrã do sinal: config de pagamento por evento, valor = metade
--     do total do instantâneo aceite, confirmação «já paguei» com prova e
--     aviso na Caixa — que nunca reserva: quem carimba é o registo da Nádia;
--   · a disputa do dia: dlm_dia_estado é a definição única; o prazo
--     («guardado até») e o «em confirmação» fecham o ecrã aos rivais; a
--     guarda do dia vive no servidor (dlm_registar_sinal, advisory lock);
--     tudo deriva de data_evento em leitura — sem relógios novos.
--
-- ORDEM DAS PARTES (dependências): A fundações → C documentos → D acto →
-- B a projecção dlm_portal_ver (usa as peças da A).
--
-- Correr PRIMEIRO em teste, como sempre. Idempotente: correr duas vezes
-- não parte nada.
-- ============================================================================

-- ============================================================================
-- 083 · o ecrã do sinal e a disputa do dia — PARTE A · as fundações novas
-- ============================================================================
-- A DECISÃO (Hélio, 08/08/2026 — as 17 decisões do mockup aprovado; ver
-- docs/decisoes-de-produto.md, «O ecrã do sinal e a disputa do dia»):
--
--   · O ecrã do sinal no portal: pós-aceite, o cliente vê a forma de
--     pagamento que a Nádia configurou POR EVENTO e pode dizer «já fiz o
--     pagamento». A confirmação NUNCA reserva — quem carimba é o registo
--     da Nádia. Mas fecha o ecrã aos rivais («em confirmação») até ela
--     registar ou limpar: ESTREITA a janela do duplo pagamento, não a
--     fecha.
--   · A disputa do dia: tomado = evento vivo com o sinal feito;
--     vivo = fase ≠ perdido, data futura. O prazo «guardado para si até
--     DD/MM» (gesto da Nádia, um por dia no máximo) mostra-se ao
--     preferido e fecha o ecrã do sinal aos rivais por inteiro.
--   · TUDO deriva de `data_evento` em leitura (o padrão do caducou):
--     mudar a data dissolve disputa, prazo e preferência sozinha —
--     nenhuma mesa guarda «o dono do dia».
--   · A guarda do dia no servidor: todas as portas por onde um dia muda
--     de mãos passam pela MESMA verificação — dlm_dia_estado é a
--     definição única. As outras portas (Funil, avulsos, avanço de fase)
--     apertam-se nas partes seguintes desta migração.
--
-- CINCO peças nesta parte:
--   1 · submissions.sinal_pagamento + submissions.dia_guardado_ate;
--   2 · a mesa da prova portal_sinal_confirmacoes (padrão da 078);
--   3 · dlm_dia_estado — a definição ÚNICA do estado de um dia;
--   4 · dlm_registar_sinal — a porta do registo, com a guarda e o lock;
--   5 · dlm_portal_confirmar_sinal — o «já paguei» do portal, que
--       reconfere o dia no clique e avisa a Caixa de Entrada.
--
-- Correr DEPOIS da 082. Idempotente. Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · As colunas novas de submissions ────────────────────────────────────

-- A forma de pagamento do sinal, configurada pela Nádia POR EVENTO:
--   {metodo: 'mbway_iban' | 'conversa' | 'dinheiro' | 'outra',
--    mbway, iban, instrucao}
-- NULL = o default do front: os dados da casa (e sem MB Way da casa
-- registado, o default é só IBAN). Jsonb LIVRE de propósito, como o
-- `metodo` dos pagamentos (025): uma forma nova de receber nunca deve
-- exigir uma migração.
alter table public.submissions
  add column if not exists sinal_pagamento jsonb;

-- O prazo da preferência: «guardado para si até DD/MM». NULL = sem prazo
-- — e sem prazo os clientes NÃO veem a disputa (a pressão visível é
-- gesto da Nádia, nunca do sistema). O prazo só vale enquanto
-- dia_guardado_ate >= current_date: expira sozinho em leitura, sem
-- vassoura nenhuma — e mudar a data do evento dissolve-o também, porque
-- a preferência conta-se sempre pelos eventos vivos DA data.
alter table public.submissions
  add column if not exists dia_guardado_ate date;

comment on column public.submissions.sinal_pagamento is
  'A forma de pagamento do sinal configurada pela Nádia para ESTE evento: '
  '{metodo: mbway_iban|conversa|dinheiro|outra, mbway, iban, instrucao}. '
  'NULL = default do front (os dados da casa). Livre de propósito — uma '
  'forma nova nunca deve exigir migração.';

comment on column public.submissions.dia_guardado_ate is
  'O prazo da preferência do dia: «guardado para si até …». NULL = sem '
  'prazo (e os rivais não veem disputa nenhuma). Expira em leitura '
  '(>= current_date) e um por dia no máximo — quem verifica é '
  'dlm_dia_estado, nunca uma coluna de dono.';


-- ─── 2 · A mesa da prova — portal_sinal_confirmacoes ────────────────────────
--
-- O «já fiz o pagamento» do cliente, com a prova de sempre: o token
-- privado, o IP, o user-agent e o carimbo (padrão portal_condicoes_lidas,
-- 078). A confirmação NÃO reserva o dia — mas fecha o ecrã do sinal aos
-- rivais até a Nádia registar o pagamento ou LIMPAR a confirmação
-- (anulada_em): «afinal não pagou» não se apaga, anula-se com assinatura,
-- porque amanhã é preciso saber que a promessa existiu.

create table if not exists public.portal_sinal_confirmacoes (
  id              uuid primary key default gen_random_uuid(),
  acesso_id       uuid not null references public.portal_acessos(id) on delete restrict,
  submission_id   uuid not null references public.submissions(id) on delete restrict,
  metodo_indicado text,
  ip              text,
  user_agent      text,
  criado_em       timestamptz not null default now(),
  anulada_em      timestamptz,
  anulada_por     text
);

comment on table public.portal_sinal_confirmacoes is
  'O «já fiz o pagamento do sinal» do cliente, pelo portal. Prova '
  'pré-registo: o token privado, o IP, o user-agent e o carimbo — como o '
  'pórtico das condições (078). NUNCA reserva o dia (quem carimba é o '
  'registo da Nádia); enquanto viva (anulada_em IS NULL) fecha o ecrã do '
  'sinal aos rivais. on delete RESTRICT nos dois lados: prova não se '
  'apaga por arrasto.';

comment on column public.portal_sinal_confirmacoes.acesso_id is
  'A ligação privada por onde a confirmação entrou. Sem sessão '
  'verificada, o token É a prova de quem esteve do outro lado.';
comment on column public.portal_sinal_confirmacoes.metodo_indicado is
  'O método que o cliente DISSE ter usado (opcional). Texto livre — é '
  'uma indicação para a Nádia conferir, nunca um facto contabilístico.';
comment on column public.portal_sinal_confirmacoes.anulada_em is
  'NULL = confirmação viva (fecha o ecrã aos rivais). Preenchido = a '
  'Nádia limpou-a («afinal não pagou») — anula-se, nunca se apaga.';
comment on column public.portal_sinal_confirmacoes.anulada_por is
  'Quem limpou a confirmação, para a história dizer verdade.';

alter table public.portal_sinal_confirmacoes enable row level security;

-- O backoffice lê e ANULA (o único update legítimo é preencher
-- anulada_em/anulada_por — a UI da Nádia só faz esse gesto). A escrita
-- nova entra SÓ pela RPC security definer: sem policy de insert, nem o
-- anon nem o authenticated criam confirmações por fora.
drop policy if exists "admin le as confirmacoes" on public.portal_sinal_confirmacoes;
create policy "admin le as confirmacoes" on public.portal_sinal_confirmacoes
  for select to authenticated using (true);

drop policy if exists "admin anula confirmacoes" on public.portal_sinal_confirmacoes;
create policy "admin anula confirmacoes" on public.portal_sinal_confirmacoes
  for update to authenticated using (true) with check (true);

-- UMA confirmação VIVA por evento de cada vez: confirmar duas vezes não
-- faz duas promessas, e limpar (anulada_em) liberta o lugar para uma
-- confirmação nova — a história fica toda, viva só há uma.
create unique index if not exists portal_sinal_confirmacoes_viva_uidx
  on public.portal_sinal_confirmacoes (submission_id)
  where anulada_em is null;

create index if not exists portal_sinal_confirmacoes_acesso_idx
  on public.portal_sinal_confirmacoes (acesso_id);


-- ─── 3 · dlm_dia_estado — a definição ÚNICA do estado de um dia ─────────────
--
-- TODAS as portas por onde um dia muda de mãos perguntam AQUI — o registo
-- na ficha, o «Sinal recebido» do Funil, os avulsos de origem sinal, o
-- avanço de fase à mão, o ecrã do sinal do portal e o banner do
-- backoffice. Divergir numa porta seria a mesma mentira da 078 ao
-- contrário: um dia «livre» numa porta e «tomado» na outra.
--
-- O estado, face a UM evento (p_excluir tira-o da conta — o próprio nunca
-- é rival de si mesmo):
--   'tomado'         — algum evento vivo dessa data tem o sinal FEITO.
--                      Definição canónica (077/078): pagamento de origem
--                      'sinal' não reconstituído, OU fase pós-sinal
--                      (contrato · cliente · projecto).
--   'preferencia'    — senão, algum tem dia_guardado_ate >= current_date
--                      (o prazo da Nádia, ainda de pé).
--   'em_confirmacao' — senão, algum tem confirmação viva do «já paguei».
--   'livre'          — senão.
--
-- Vivo = fase <> 'perdido'. Dias passados (e data NULL) são sempre
-- 'livre': não há disputa sobre história — o padrão do caducou já conta
-- essa parte, e registar um sinal tardio num evento passado não pode
-- ficar refém de um rival que também já passou.
--
-- rival_nome: o nome do cliente do rival, como as outras RPCs o buscam
-- (061). 'ate' só na preferência — é o prazo que o rival tem de pé.

create or replace function public.dlm_dia_estado(
  p_data    date,
  p_excluir uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rival public.submissions%rowtype;
  v_nome  text;
begin
  if p_data is null or p_data < current_date then
    return jsonb_build_object('estado', 'livre');
  end if;

  -- 1º · TOMADO: um evento vivo com o sinal feito. Havendo mais do que
  -- um (não devia, mas os dados mandam), o mais antigo é o dono.
  select s.* into v_rival
    from public.submissions s
   where s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and (s.fase in ('contrato', 'cliente', 'projecto')
          or exists (select 1 from public.pagamentos p
                      where p.submission_id = s.id
                        and p.origem = 'sinal'
                        and p.reconstituido = false))
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object(
      'estado',     'tomado',
      'rival_id',   v_rival.id,
      'rival_nome', v_nome);
  end if;

  -- 2º · PREFERÊNCIA: o prazo da Nádia, ainda de pé. Um por dia no
  -- máximo (regra da casa, guardada na UI); se os dados trouxerem dois,
  -- vale o prazo mais longo — é a promessa maior que está de pé.
  select s.* into v_rival
    from public.submissions s
   where s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and s.dia_guardado_ate is not null
     and s.dia_guardado_ate >= current_date
   order by s.dia_guardado_ate desc, s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object(
      'estado',     'preferencia',
      'rival_id',   v_rival.id,
      'rival_nome', v_nome,
      'ate',        v_rival.dia_guardado_ate);
  end if;

  -- 3º · EM CONFIRMAÇÃO: um cliente disse «já paguei» e a Nádia ainda
  -- não registou nem limpou. Fecha o ecrã aos rivais — estreita a
  -- janela do duplo pagamento.
  select s.* into v_rival
    from public.submissions s
   where s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and exists (select 1 from public.portal_sinal_confirmacoes psc
                  where psc.submission_id = s.id
                    and psc.anulada_em is null)
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object(
      'estado',     'em_confirmacao',
      'rival_id',   v_rival.id,
      'rival_nome', v_nome);
  end if;

  return jsonb_build_object('estado', 'livre');
end
$$;

revoke all     on function public.dlm_dia_estado(date, uuid) from public, anon;
grant  execute on function public.dlm_dia_estado(date, uuid) to authenticated;


-- ─── 4 · dlm_registar_sinal — a porta do registo, com a guarda ──────────────
--
-- O registo da Nádia é O carimbo que reserva o dia — e por isso é a porta
-- que mais precisa da guarda. A ORDEM INVERTIDA do Funil: guarda primeiro
-- (esta função), fase depois (o cliente da UI avança a fase SÓ depois do
-- 'ok') — nunca ao contrário, para a fase não afirmar um sinal que a
-- guarda ia recusar.
--
--   'dia_tomado'   — NUNCA se regista por cima de um dia tomado, nem com
--                    p_forcar: dois sinais no mesmo dia é o desastre que
--                    esta migração existe para impedir. O desfecho do
--                    cruzamento que ainda assim aconteça (janela antes
--                    desta guarda) é a devolução integral do segundo.
--   'ja_registado' — o PRÓPRIO evento já tem um sinal vivo (não
--                    reconstituído): o duplo clique não escreve dois
--                    pagamentos no livro.
--   'prazo_alheio' — um prazo ativo de OUTRO evento trava sem p_forcar.
--                    COM p_forcar regista-se: a Nádia PODE quebrar a
--                    promessa (o aviso é dela para dar; o portal da
--                    preterida mostra-o com as desculpas da casa) — e o
--                    rival nunca é marcado perdido automaticamente.
--   'em_confirmacao' alheia NÃO trava de propósito: é exactamente o
--                    momento em que a Nádia decide o cruzamento — travar
--                    aqui deixava o dia refém de uma promessa por conferir.
--
-- pg_advisory_xact_lock sobre o NÚMERO do dia do evento (dias desde
-- 2000-01-01 — nunca o texto da data, que muda com o DateStyle da sessão
-- e faria duas portas fecharem cadeados diferentes): dois registos
-- simultâneos para o mesmo dia serializam-se, e o segundo já vê o dia
-- tomado pelo primeiro. Evento sem data não tem dia que se dispute —
-- tranca-se a si mesmo (pelo id), para o duplo clique não passar aos
-- pares. O lock morre com a transação — sem unlock a gerir.

create or replace function public.dlm_registar_sinal(
  p_submission   uuid,
  p_valor        numeric,
  p_data         date,
  p_metodo       text,
  p_contribuinte text default null,
  p_notas        text default null,
  p_forcar       boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev       public.submissions%rowtype;
  v_dia      jsonb;
  v_previsto uuid;
  v_id       uuid;
begin
  select * into v_ev from public.submissions where id = p_submission;
  if not found then
    return jsonb_build_object('estado', 'nao_encontrado');
  end if;

  -- Um registo ao vivo tem sempre valor, data e método a sério — a
  -- própria mesa (025) recusaria; aqui recusa-se com estado, não com
  -- exceção, para a UI falar português.
  if p_valor is null or p_valor <= 0
     or p_data is null
     or nullif(btrim(coalesce(p_metodo, '')), '') is null then
    return jsonb_build_object('estado', 'invalido');
  end if;

  -- A guarda serializa-se POR DIA: quem chega segundo espera, e quando
  -- entra já vê o que o primeiro fez. A chave é determinística (o número
  -- do dia; sem data, o próprio evento) — a MESMA fórmula da porta do
  -- portal, ou o cadeado não guardava nada.
  perform pg_advisory_xact_lock(
    hashtext('dlm_dia'),
    case when v_ev.data_evento is not null
         then v_ev.data_evento - date '2000-01-01'
         else hashtext(v_ev.id::text) end);

  -- O PRÓPRIO evento com um sinal vivo (não reconstituído) não leva
  -- segundo: o duplo clique — ou a ficha esquecida aberta — escrevia
  -- dois pagamentos de sinal no livro. A fase pós-sinal NÃO trava de
  -- propósito: um evento avançado à mão pode ter o pagamento real por
  -- registar, e este é exactamente o sítio de o registar.
  if exists (select 1 from public.pagamentos p
              where p.submission_id = v_ev.id
                and p.origem = 'sinal'
                and p.reconstituido = false) then
    return jsonb_build_object('estado', 'ja_registado');
  end if;

  v_dia := public.dlm_dia_estado(v_ev.data_evento, p_submission);

  if v_dia->>'estado' = 'tomado' then
    -- Nunca há forcar contra dia tomado.
    return jsonb_build_object(
      'estado',     'dia_tomado',
      'rival_id',   v_dia->'rival_id',
      'rival_nome', v_dia->'rival_nome');
  end if;

  if v_dia->>'estado' = 'preferencia' and not coalesce(p_forcar, false) then
    return jsonb_build_object(
      'estado',     'prazo_alheio',
      'rival_id',   v_dia->'rival_id',
      'rival_nome', v_dia->'rival_nome',
      'ate',        v_dia->'ate');
  end if;

  -- O previsto de ordem 1 (o sinal do plano), se o plano existir — o
  -- pagamento pendura-se nele para o saldo se contar sozinho. Sem plano,
  -- fica solto: o saldo calcula-se sempre dos pagamentos (025).
  select pp.id into v_previsto
    from public.pagamentos_previstos pp
   where pp.submission_id = p_submission
     and pp.ordem = 1
   order by pp.created_at
   limit 1;

  insert into public.pagamentos
    (submission_id, previsto_id, valor, data, metodo, origem,
     contribuinte, notas, reconstituido)
  values
    (p_submission, v_previsto, p_valor, p_data,
     btrim(p_metodo), 'sinal',
     nullif(btrim(coalesce(p_contribuinte, '')), ''),
     nullif(btrim(coalesce(p_notas, '')), ''),
     false)
  returning id into v_id;

  -- A fase NÃO se toca aqui — a ordem invertida do Funil: o cliente da
  -- UI avança a fase DEPOIS do 'ok', nunca antes da guarda.
  return jsonb_build_object('estado', 'ok', 'id', v_id);
end
$$;

revoke all     on function public.dlm_registar_sinal(uuid, numeric, date, text, text, text, boolean) from public, anon;
grant  execute on function public.dlm_registar_sinal(uuid, numeric, date, text, text, text, boolean) to authenticated;


-- ─── 5 · dlm_portal_confirmar_sinal — o «já paguei» do portal ───────────────
--
-- A verdade da canalização: a RPC RECONFERE o dia no clique — o ecrã pode
-- estar aberto há uma hora, e entretanto o dia mudou de mãos. Os estados
-- que fecham a porta:
--   'terminado'    — token morto, evento perdido, ou pedido caducado
--                    (data passada sem sinal — o padrão do caducou).
--   'ja_reservado' — o PRÓPRIO evento já tem o sinal feito: quem já
--                    pagou e volta é devolvido à jornada.
--   'dia_tomado'   — outro evento vivo do dia tem o sinal feito.
--   'fechado'      — prazo ou confirmação ALHEIA de pé: o ecrã nem devia
--                    estar aberto — esta é a guarda para quando estava.
--   'ja_feito'     — a confirmação viva DESTE evento já existe: devolve
--                    o carimbo que há, não faz segunda promessa.
-- Padrão dlm_portal_condicoes_lidas (078): token resolvido pela mesma
-- porta, IP/user-agent dos headers do PostgREST, prova gravada uma vez.

create or replace function public.dlm_portal_confirmar_sinal(
  p_token  text,
  p_metodo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso      public.portal_acessos%rowtype;
  v_ev          public.submissions%rowtype;
  v_sinal_feito boolean;
  v_dia         jsonb;
  v_quando      timestamptz;
  v_nome        text;
  v_disputado   boolean;
  v_ip          text;
  v_ua          text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  if not found or v_ev.fase = 'perdido' then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- O sinal do PRÓPRIO evento — a definição canónica (077/078): o
  -- pagamento de origem 'sinal' não reconstituído, ou uma fase que já
  -- só existe depois dele.
  v_sinal_feito :=
       v_ev.fase in ('contrato', 'cliente', 'projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_ev.id
                  and p.origem = 'sinal'
                  and p.reconstituido = false);
  if v_sinal_feito then
    return jsonb_build_object('estado', 'ja_reservado');
  end if;

  -- Sem sinal e com a data passada, o pedido caducou (o padrão de
  -- sempre): o ecrã do sinal já não tem nada para confirmar.
  if v_ev.data_evento is not null and v_ev.data_evento < current_date then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- A MESMA serialização por dia da porta do registo (secção 4), com a
  -- MESMA chave determinística (o número do dia; sem data, o próprio
  -- evento): a confirmação que entra a meio de um registo espera — e
  -- quando entra, já vê o dia tomado. E o duplo clique do «já paguei»
  -- serializa-se também, mesmo sem data. Estreita a janela; quem a
  -- fecha é a Nádia.
  perform pg_advisory_xact_lock(
    hashtext('dlm_dia'),
    case when v_ev.data_evento is not null
         then v_ev.data_evento - date '2000-01-01'
         else hashtext(v_ev.id::text) end);

  -- Reconferir o dia NO CLIQUE — nunca confiar no ecrã que ficou aberto.
  v_dia := public.dlm_dia_estado(v_ev.data_evento, v_ev.id);
  if v_dia->>'estado' = 'tomado' then
    return jsonb_build_object('estado', 'dia_tomado');
  end if;
  if v_dia->>'estado' in ('preferencia', 'em_confirmacao') then
    -- Alheias por construção (o próprio está excluído da conta). O ecrã
    -- nem devia estar aberto — sem rival nenhum na resposta: para o
    -- cliente a porta está fechada, e os porquês são da casa.
    return jsonb_build_object('estado', 'fechado');
  end if;

  -- Confirmar duas vezes não faz duas promessas: devolve-se o carimbo
  -- da confirmação viva que já existe.
  select psc.criado_em into v_quando
    from public.portal_sinal_confirmacoes psc
   where psc.submission_id = v_ev.id
     and psc.anulada_em is null
   order by psc.criado_em desc
   limit 1;
  if v_quando is not null then
    return jsonb_build_object('estado', 'ja_feito', 'quando', v_quando);
  end if;

  -- A prova, como na 078: o IP e o user-agent dos headers do PostgREST.
  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  -- O cinto além do cadeado: se apesar de tudo uma confirmação viva
  -- nasceu no meio-tempo, o índice parcial recusa — e devolve-se o
  -- carimbo dela, nunca uma exceção crua ao portal.
  insert into public.portal_sinal_confirmacoes
    (acesso_id, submission_id, metodo_indicado, ip, user_agent)
  values
    (v_acesso.id, v_ev.id,
     nullif(btrim(coalesce(p_metodo, '')), ''),
     nullif(v_ip, ''), v_ua)
  on conflict (submission_id) where anulada_em is null do nothing
  returning criado_em into v_quando;

  if v_quando is null then
    select psc.criado_em into v_quando
      from public.portal_sinal_confirmacoes psc
     where psc.submission_id = v_ev.id
       and psc.anulada_em is null
     order by psc.criado_em desc
     limit 1;
    return jsonb_build_object('estado', 'ja_feito', 'quando', v_quando);
  end if;

  -- O aviso na Caixa de Entrada (padrão 061): a Nádia é quem carimba, e
  -- por isso é a primeira a saber. `dia_disputado` diz-lhe já no título
  -- da triagem se há rivais vivos no mesmo dia — o caso que não pode
  -- esperar pelo fim da tarde.
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  v_disputado := v_ev.data_evento is not null and exists (
    select 1 from public.submissions r
     where r.data_evento = v_ev.data_evento
       and r.id <> v_ev.id
       and r.fase <> 'perdido');

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('sinal_confirmado',
     coalesce(v_nome, 'A cliente') || ' confirmou o pagamento do sinal',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object(
       'metodo_indicado', nullif(btrim(coalesce(p_metodo, '')), ''),
       'dia_disputado',   v_disputado));

  return jsonb_build_object('estado', 'ok', 'quando', v_quando);
end
$$;

revoke all     on function public.dlm_portal_confirmar_sinal(text, text) from public;
grant  execute on function public.dlm_portal_confirmar_sinal(text, text) to anon, authenticated;


-- ============================================================================
-- 6 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 6.1 · O dia livre: uma data futura sem eventos → 'livre'.
--   select public.dlm_dia_estado('2027-09-25');

-- 6.2 · O dia tomado: com um evento vivo pós-sinal (ou pagamento de
--   origem 'sinal' não reconstituído) nessa data →
--   {'estado':'tomado','rival_id':…,'rival_nome':…}; e com p_excluir =
--   esse evento → 'livre' (o próprio não é rival de si mesmo).

-- 6.3 · A preferência: dia_guardado_ate = amanhã num evento vivo →
--   'preferencia' com 'ate'; dia_guardado_ate = ontem → dissolve-se
--   sozinha ('livre'). Mudar a data_evento do preferido → 'livre' no dia
--   antigo (tudo deriva da data em leitura).

-- 6.4 · Datas passadas e NULL são sempre 'livre' — não há disputa sobre
--   história.

-- 6.5 · dlm_registar_sinal contra dia tomado → 'dia_tomado' e NADA
--   inserido, mesmo com p_forcar := true. Contra prazo alheio →
--   'prazo_alheio' sem p_forcar; com p_forcar → 'ok' e o pagamento
--   existe (origem 'sinal', reconstituido false, previsto_id = o de
--   ordem 1 se houver). A fase do evento NÃO mudou. Registar segunda
--   vez o MESMO evento → 'ja_registado' e nada inserido (um sinal
--   reconstituído antigo não conta — o real regista-se na mesma).

-- 6.6 · dlm_portal_confirmar_sinal:
--   token morto → 'terminado'; evento perdido ou caducado → 'terminado';
--   evento já com sinal → 'ja_reservado'; dia tomado por rival →
--   'dia_tomado'; prazo/confirmação alheia → 'fechado' (sem nome de
--   rival na resposta — nada do outro evento sai para o portal);
--   primeira vez → 'ok' com carimbo, linha com ip/user_agent, e a
--   notificação 'sinal_confirmado' na Caixa com dia_disputado certo;
--   segunda vez → 'ja_feito' com o MESMO carimbo.

-- 6.7 · Anular a confirmação (update anulada_em/anulada_por pelo
--   backoffice) reabre o dia ('livre') e deixa confirmar de novo — o
--   índice parcial só trava VIVAS duplicadas.

-- 6.8 · A mesa não se lê com a chave anónima, e o insert directo é
--   recusado (sem policy de insert): a escrita entra só pela RPC.

-- 6.9 · A invariante de sempre: nenhum id de evento sai pelas funções do
--   portal — dlm_portal_confirmar_sinal responde só com estados e
--   carimbos. (dlm_dia_estado devolve rival_id, mas é do backoffice:
--   grant só a authenticated.)


-- ============================================================================
-- 083 · PARTE C — o véu dos valores do orçamento morre
-- ============================================================================
-- A DECISÃO (Hélio, 08/08/2026, decisões 1+2 do ecrã do sinal): o ORÇAMENTO
-- deixa de ser velado e deixa de exigir código — os valores ficam à vista
-- desde o primeiro clique na ligação privada. O mecanismo do código FICA
-- (é a prova da assinatura do contrato); aceitar e pedir alteração passam a
-- servir-se da ligação privada, sem código — custo assumido: a posse da
-- ligação é a prova do aceite. O véu do CONTRATO fica intacto: tapa NIF,
-- morada e contacto (058 · lista de permissão), que não são para quem só
-- tem a ligação na mão.
--
-- COMO: as duas funções abaixo são as da 078, reescritas INTEIRAS com UMA
-- mudança de substância cada — em dlm_portal_ver_documento, o ramo que vela
-- e marca velado=true passa a aplicar-se SÓ ao tipo 'contrato'; em
-- dlm_portal_documentos, precisa_codigo passa a tipo = 'contrato' apenas.
-- Tudo o resto — o portão do sinal, condicoes_lidas_em, os estados da
-- verificação — fica como estava, byte a byte.
--
-- Correr DEPOIS da 078. Idempotente. Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── C1 · A projecção do documento — o véu já só conhece o contrato ─────────
--
-- Cópia fiel da 078 (secção 3), com UMA edição: o ramo do véu aplica-se SÓ
-- ao contrato. O orçamento sai sempre inteiro — velado=false, instantâneo
-- completo — porque os valores deixaram de se esconder atrás do código.
-- O portão do sinal (contrato e proposta sem sinal devolvem 'nada') e o
-- carimbo `condicoes_lidas_em` ficam exactamente como estavam.

create or replace function public.dlm_portal_ver_documento(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid default null,
  p_versao      integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_sessao  public.portal_verificacoes%rowtype;
  v_acto    record;
  v_velado  boolean := false;
  v_dados   jsonb;
  -- 078 · o carimbo da leitura das condições, por evento.
  v_condicoes timestamptz;
  -- 078 · o portão do sinal: sem ele, contrato e proposta não existem.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA, cedo: sem o sinal pago, o contrato e a
  -- proposta NÃO existem deste lado do portão — 'nada', indistinguível
  -- de nunca publicados, como a casa já responde aos tokens mortos. A
  -- inferência é a MESMA da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  if p_tipo in ('contrato', 'proposta') then
    select s.fase into v_fase
      from public.submissions s
     where s.id = v_acesso.submission_id;
    v_sinal_feito :=
         v_fase in ('contrato','cliente','projecto')
      or exists (select 1 from public.pagamentos p
                  where p.submission_id = v_acesso.submission_id
                    and p.origem = 'sinal');
    if not coalesce(v_sinal_feito, false) then
      return jsonb_build_object('estado', 'nada');
    end if;
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
     and (p_versao is null or versao = p_versao)
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  v_dados := v_pub.instantaneo;
  -- 083 · o véu já só conhece o CONTRATO: sem sessão verificada, tapa
  -- NIF, morada e contacto (058 · lista de permissão). O orçamento sai
  -- sempre inteiro — os valores estão à vista desde o primeiro clique,
  -- porque a posse da ligação privada passou a ser prova que chegue.
  if p_tipo = 'contrato' then
    v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);
    if v_sessao.id is null then
      v_dados  := public.dlm_velar_instantaneo(v_dados);
      v_velado := true;
    end if;
  end if;

  -- 074 · também a NATUREZA da prova: código verificado (digital) ou
  -- papel confirmado pela casa — a folha não pode afirmar «código
  -- verificado» de uma assinatura que veio no papel.
  select acto, criado_em, nome_escrito,
         case when verificacao_id is not null then 'codigo' else 'papel' end
           as prova
    into v_acto
    from public.portal_actos
   where publicacao_id = v_pub.id
   order by criado_em desc
   limit 1;

  -- 078 · a leitura das condições, por EVENTO e nunca por versão. O
  -- pórtico continua a vir ANTES de tudo — o orçamento já não tem estado
  -- velado (083), mas a folha precisa na mesma de saber se foi passado.
  if p_tipo = 'orcamento' then
    select max(l.criado_em) into v_condicoes
      from public.portal_condicoes_lidas l
      join public.portal_publicacoes pp on pp.id = l.publicacao_id
     where pp.submission_id = v_acesso.submission_id
       and pp.tipo = 'orcamento';
  end if;

  return jsonb_build_object(
    'estado',       'ok',
    'tipo',         v_pub.tipo,
    'versao',       v_pub.versao,
    'publicado_em', v_pub.publicado_em,
    'velado',       v_velado,
    'instantaneo',  v_dados,
    'acto',         case when v_acto.acto is null then null
                         else jsonb_build_object(
                                'acto',   v_acto.acto,
                                'quando', v_acto.criado_em,
                                'nome',   v_acto.nome_escrito,
                                'prova',  v_acto.prova) end,
    -- 078 · null enquanto não confirmar — e aí o pórtico fecha a porta.
    'condicoes_lidas_em', v_condicoes,
    -- 074 · a assinatura da casa, para a folha mostrar os dois lados.
    'assinatura_casa', (
      select case when d.assinado_casa_em is null then null
                  else jsonb_build_object(
                         'nome',   d.assinado_casa_por,
                         'quando', d.assinado_casa_em) end
        from public.documentos d
       where d.id = v_pub.documento_id));
end
$$;
revoke all     on function public.dlm_portal_ver_documento(text, text, uuid, integer) from public;
grant  execute on function public.dlm_portal_ver_documento(text, text, uuid, integer) to anon, authenticated;


-- ─── C2 · A lista dos documentos — só o contrato pede código ────────────────
--
-- Cópia fiel da 078 (secção 5), com UMA edição: precisa_codigo passa a
-- tipo = 'contrato' apenas — o orçamento abre-se com a ligação, sem código
-- (083). O portão do sinal (sem sinal, a lista só conhece o orçamento) e
-- os estados da verificação ficam exactamente como estavam.

-- A lista dos documentos publicados: só o estado, nunca o conteúdo.
create or replace function public.dlm_portal_documentos(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_docs   jsonb;
  -- 078 · o portão do sinal, com a inferência da etapa 3 da jornada.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA: «o acompanhamento compra-se com o sinal».
  -- A MESMA inferência da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  select s.fase into v_fase
    from public.submissions s
   where s.id = v_acesso.submission_id;
  v_sinal_feito :=
       v_fase in ('contrato','cliente','projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_acesso.submission_id
                  and p.origem = 'sinal');

  select jsonb_agg(
           jsonb_build_object(
             'tipo',          u.tipo,
             'versao',        u.versao,
             'publicado_em',  u.publicado_em,
             'n_versoes',     u.n_versoes,
             -- 083 · só o contrato pede código — é a prova da assinatura.
             -- O orçamento abre-se com a ligação privada, valores à vista.
             'precisa_codigo', u.tipo = 'contrato',
             'acto',          u.acto,
             'acto_em',       u.acto_em,
             'acto_nome',     u.acto_nome,
             -- O acto da VERSÃO ANTERIOR, quando a corrente ainda não tem
             -- resposta: é o que deixa dizer «a sua aceitação de 12 de
             -- Agosto fica onde está — esta versão pede uma resposta nova».
             'acto_anterior', case when u.acto is null and aa.acto is not null
               then jsonb_build_object('versao', aa.versao, 'acto', aa.acto,
                                       'acto_em', aa.criado_em)
               end
           ) order by array_position(
                       array['orcamento','proposta','contrato'], u.tipo))
    into v_docs
    from (
      select distinct on (p.tipo)
             p.tipo, p.versao, p.publicado_em, p.id,
             count(*) over (partition by p.tipo) as n_versoes,
             a.acto, a.criado_em as acto_em, a.nome_escrito as acto_nome
        from public.portal_publicacoes p
        left join lateral (
          -- o acto que conta é o último DESTA versão — versão nova, actos a zero
          select acto, criado_em, nome_escrito
            from public.portal_actos
           where publicacao_id = p.id
           order by criado_em desc
           limit 1
        ) a on true
       where p.submission_id = v_acesso.submission_id
         -- 078 · sem sinal, só o orçamento saiu da casa — os outros
         -- documentos comportam-se como se nunca publicados.
         and (v_sinal_feito or p.tipo = 'orcamento')
       order by p.tipo, p.versao desc
    ) u
    left join lateral (
      select pa.acto, pa.criado_em, pp.versao
        from public.portal_actos pa
        join public.portal_publicacoes pp on pp.id = pa.publicacao_id
       where pp.submission_id = v_acesso.submission_id
         and pp.tipo = u.tipo and pp.versao < u.versao
         and pa.acto in ('aceitou', 'assinou')
       order by pa.criado_em desc
       limit 1
    ) aa on true;

  -- O estado do código, para os ecrãs da espera e do regresso. SEM o
  -- código, claro — só o que a cliente pode saber.
  return jsonb_build_object(
    'estado', 'activo',
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'verificacao', (
      select jsonb_build_object(
               'estado', case
                 when v.usado_em is not null
                      and v.usado_em > now() - interval '60 minutes'
                   then 'sessao'
                 when v.codigo is not null and v.usado_em is null
                      and v.expira_em > now()
                   then 'emitido'
                 when v.emitido_em is null
                      and v.pedido_em > now() - interval '24 hours'
                   then 'pedido'
                 else 'nenhum'
               end,
               'pedido_em', v.pedido_em)
        from public.portal_verificacoes v
       where v.acesso_id = v_acesso.id
       order by v.pedido_em desc
       limit 1));
end
$$;

revoke all     on function public.dlm_portal_documentos(text) from public;
grant  execute on function public.dlm_portal_documentos(text) to anon, authenticated;


-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · O orçamento sai inteiro SEM sessão nenhuma:
--   select public.dlm_portal_ver_documento('<TOKEN>','orcamento')->>'velado';
--   -- esperado: false — e 'instantaneo' com os valores todos.
-- 2 · O contrato sem sessão continua velado (com sinal pago):
--   select public.dlm_portal_ver_documento('<TOKEN_COM_SINAL>','contrato')->>'velado';
--   -- esperado: true — e sem NIF/morada/contacto no 'instantaneo'.
-- 3 · Na lista, só o contrato pede código:
--   select jsonb_path_query_array(
--            public.dlm_portal_documentos('<TOKEN>')->'documentos',
--            '$[*] ? (@.precisa_codigo == true).tipo');
--   -- esperado: ["contrato"] ou [] — nunca "orcamento".
-- 4 · O portão do sinal não mexeu:
--   select public.dlm_portal_ver_documento('<TOKEN_SEM_SINAL>','contrato')->>'estado';
--   select public.dlm_portal_ver_documento('<TOKEN_SEM_SINAL>','proposta')->>'estado';
--   -- esperado: 'nada' nos dois.
-- 5 · O pórtico continua a mandar no orçamento:
--   select public.dlm_portal_ver_documento('<TOKEN>','orcamento')->>'condicoes_lidas_em';
--   -- esperado: null antes de confirmar; carimbo depois.
-- ============================================================================


-- ============================================================================
-- 083 · PARTE D — os actos servem-se da ligação privada
-- ============================================================================
-- A DECISÃO (Hélio, 08/08/2026 — decisão 1 do ecrã do sinal):
--
--   O véu dos valores do orçamento morre; e com ele morre a exigência do
--   código para ACEITAR e para PEDIR ALTERAÇÃO. Estes dois actos passam a
--   servir-se da ligação privada (o token) — exactamente como a confirmação
--   das condições (078). Custo assumido e aceite: a posse da ligação é a
--   prova do aceite.
--
--   ASSINAR não muda NADA: continua a exigir sessão verificada E código
--   pedido a partir do CONTRATO ('codigo_de_outro_documento'). É o acto que
--   tranca e que fica como prova jurídica — o rigor fica onde tem de ficar.
--
-- DUAS peças:
--   1 · o CHECK da 059 (portal_actos_tem_prova) exigia SEMPRE uma prova
--       forte — sessão verificada (digital) ou confirmação humana com
--       ficheiro (papel). Um aceite pela ligação não tem nenhuma das duas,
--       por isso o ajuste MÍNIMO: os actos 'aceitou' e 'pediu_alteracao'
--       podem viver sem elas (a prova deles é a posse da ligação, com IP e
--       user-agent no registo). Para 'assinou' o CHECK fica intocado.
--   2 · dlm_portal_acto reescrita a partir do texto COMPLETO e em vigor da
--       077 (as versões de 058/061/072/075 têm fases ERRADAS). Mudança
--       única: a sessão só se exige ao 'assinou'; p_verificacao passa a
--       opcional para os outros dois — aceita NULL e o acto regista-se com
--       verificacao_id null. A assinatura SQL da função NÃO muda (dar
--       DEFAULT ao 3.º parâmetro obrigaria a dar aos seguintes; o portal
--       já envia p_verificacao explícito, com null quando não há sessão).
--       O resto — guarda de versão, duplicados, nome obrigatório,
--       notificações, avanço de funil — byte a byte como na 077.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O CHECK da 059 admite a terceira prova ─────────────────────────────
--
-- Antes (059): prova = sessão verificada OU (confirmado_por + ficheiro).
-- Agora há uma terceira, mais leve, SÓ para aceitar e pedir alteração: a
-- posse da ligação privada. O 'assinou' continua a NÃO passar sem uma das
-- duas provas fortes — o CHECK garante-o ao nível da base, não só na RPC.

alter table public.portal_actos
  drop constraint if exists portal_actos_tem_prova;
alter table public.portal_actos
  add constraint portal_actos_tem_prova check (
    verificacao_id is not null
    or (confirmado_por is not null and ficheiro is not null)
    or acto in ('aceitou', 'pediu_alteracao')
  );


-- ─── 2 · dlm_portal_acto — a sessão só se exige a quem assina ───────────────

create or replace function public.dlm_portal_acto(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid,
  p_acto        text,
  p_nome        text,
  p_mensagem    text default null,
  p_versao      integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_sessao  public.portal_verificacoes%rowtype;
  v_ev      public.submissions%rowtype;
  v_nome_cl text;
  v_ip      text;
  v_ua      text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 083 · A ÚNICA alteração desta migração à função (o resto é cópia fiel
  -- da 077). Aceitar e pedir alteração servem-se da ligação privada, como
  -- a confirmação das condições (078): a posse da ligação é a prova, e a
  -- sessão — quando existir — regista-se na mesma. Só ASSINAR exige a
  -- sessão verificada: é o acto que tranca e que fica como prova, e o
  -- código tem de ter sido pedido A PARTIR DO CONTRATO, nunca um que veio
  -- para ver o orçamento e ficou de pé 60 minutos.
  v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);
  if p_acto = 'assinou' then
    if v_sessao.id is null then
      return jsonb_build_object('estado', 'precisa_codigo');
    end if;
    if coalesce(v_sessao.contexto, '') <> 'contrato' then
      return jsonb_build_object('estado', 'precisa_codigo',
                                'motivo', 'codigo_de_outro_documento');
    end if;
  end if;

  if length(btrim(coalesce(p_nome, ''))) < 3 then
    return jsonb_build_object('estado', 'nome_em_falta');
  end if;

  if p_acto not in ('aceitou', 'pediu_alteracao', 'assinou')
     or (p_acto = 'assinou'  and p_tipo <> 'contrato')
     or (p_acto = 'aceitou'  and p_tipo =  'contrato')
     or (p_acto = 'pediu_alteracao'
         and length(btrim(coalesce(p_mensagem, ''))) < 3)
  then
    return jsonb_build_object('estado', 'acto_invalido');
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  -- A versão que ela leu tem de ser a que está em vigor. Se saiu outra
  -- entretanto, o acto NÃO se grava: ela relê e responde de novo.
  if p_versao is not null and p_versao <> v_pub.versao then
    return jsonb_build_object('estado', 'versao_mudou', 'versao', v_pub.versao);
  end if;

  if p_acto in ('aceitou', 'assinou') and exists (
       select 1 from public.portal_actos
        where publicacao_id = v_pub.id and acto = p_acto)
  then
    return jsonb_build_object('estado', 'ja_feito');
  end if;

  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  -- 083 · Sem sessão, v_sessao.id é NULL e o acto regista-se assim — o
  -- CHECK ajustado na peça 1 admite-o para aceitar e pedir alteração.
  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, mensagem, ip, user_agent)
  values
    (v_pub.id, v_sessao.id, p_acto, btrim(p_nome),
     nullif(btrim(coalesce(p_mensagem, '')), ''), nullif(v_ip, ''), v_ua);

  if p_acto = 'aceitou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now())
     where id = v_pub.documento_id;
  elsif p_acto = 'assinou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now()),
           trancado_em = now()
     where id = v_pub.documento_id;
  end if;

  -- 072 · TODOS os actos tocam na Caixa de Entrada. Antes só o pedido
  -- de alteração avisava; aceitar, aprovar e assinar eram silêncio — e
  -- eram precisamente os momentos em que ela quer agir na hora.
  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome_cl from public.clientes c where c.id = v_ev.cliente_id;

  if p_acto = 'pediu_alteracao' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('pedido_alteracao',
       coalesce(v_nome_cl, 'A cliente') || ' pediu uma alteração',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'mensagem', btrim(p_mensagem)));
  elsif p_acto = 'aceitou' and p_tipo = 'orcamento' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('orcamento_aceite',
       coalesce(v_nome_cl, 'A cliente') || ' aceitou o orçamento',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'aceitou' and p_tipo = 'proposta' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('projecto_aprovado',
       coalesce(v_nome_cl, 'A cliente') || ' aprovou o projecto',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'assinou' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('contrato_assinado',
       coalesce(v_nome_cl, 'A cliente') || ' assinou o contrato',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  end if;

  -- 077 · o facto move o funil, pela ordem nova: aceite → fase sinal
  -- (50% por pagar); assinatura → fase cliente (fechado por inteiro).
  -- Nunca recua, nunca toca em perdidos, e falhar o avanço nunca falha
  -- o acto (o registo é o que importa).
  begin
    if p_acto = 'aceitou' and p_tipo = 'orcamento' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'sinal');
    elsif p_acto = 'assinou' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'cliente');
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;


-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- V.1 · Aceitar SEM sessão (a mudança desta parte):
--   select public.dlm_portal_acto('<TOKEN>', 'orcamento', null,
--            'aceitou', 'Sofia Isabel Ramalho', null, <VERSAO_LIDA>);
--   -- → {'estado':'ok', ...}  (antes: {'estado':'precisa_codigo'})
--   select acto, verificacao_id, confirmado_por, ip, user_agent
--     from portal_actos order by criado_em desc limit 1;
--   -- verificacao_id NULL, confirmado_por NULL, ip/user-agent preenchidos.

-- V.2 · O funil moveu na mesma: fase do evento → 'sinal' (se estava atrás).

-- V.3 · Assinar SEM sessão continua barrado:
--   select public.dlm_portal_acto('<TOKEN>', 'contrato', null,
--            'assinou', 'Sofia Isabel Ramalho', null, <VERSAO>);
--   -- → {'estado':'precisa_codigo'}
--   E com código pedido a partir do ORÇAMENTO:
--   -- → {'estado':'precisa_codigo','motivo':'codigo_de_outro_documento'}

-- V.4 · O CHECK continua a barrar um 'assinou' sem prova nenhuma:
--   insert into portal_actos (publicacao_id, acto, nome_escrito)
--   values ('<PUB_ID>'::uuid, 'assinou', 'Teste');
--   -- Esperado: ERRO «portal_actos_tem_prova».

-- V.5 · Duplicado e versão: repetir o aceite de V.1 → {'estado':'ja_feito'};
--   com p_versao desactualizada → {'estado':'versao_mudou','versao':N}.


-- ═══════════════════════════════════════════════════════════════════════════
-- 083 · PARTE B — dlm_portal_ver ganha a chave 'sinal'
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O ECRÃ DO SINAL E A DISPUTA DO DIA (decisões de 08/08/2026).
--
-- O ecrã do sinal precisa de quatro coisas que só o servidor sabe dizer com
-- verdade: QUANTO é o sinal, COMO a Nádia quer que este evento pague, EM QUE
-- ESTADO está o dia (guardado para ela? em disputa? tomado?) e SE ela já
-- disse «já paguei». Esta parte acrescenta tudo isso à projecção do portal,
-- numa chave única 'sinal' — presente apenas quando há orçamento publicado,
-- porque antes do orçamento não há valor nenhum de que falar.
--
-- AS REGRAS DA SUBSTÂNCIA:
--
--   · O VALOR é metade do total do INSTANTÂNEO da versão de orçamento em
--     vigor (a de maior número — a regra da 057). NUNCA de
--     pagamentos_previstos: o plano de pagamentos pode nem existir, e
--     quando existe é um artefacto da gestão, não a fonte da promessa. A
--     conta é a MESMA que a folha do portal mostra (CorpoOrcamento):
--     soma de qtd × valor das linhas CRUAS, mais o total da __logistica
--     (03/08/2026) quando as parcelas lá vivem — o cliente nunca viu uma
--     linha de logística, viu-a diluída, e o total dele já a incluía.
--     Divergir da folha seria pedir metade de um número que ela nunca viu.
--     Tudo arredondado a cêntimos.
--
--   · O ESTADO DO DIA sai TRADUZIDO para o lado de quem lê: primeiro o
--     lado próprio (o prazo «guardado para si» da Nádia), depois o do
--     rival, via dlm_dia_estado (parte A) — e NUNCA com o nome do rival.
--     A projecção constrói um objecto NOVO de raiz, com só 'estado' e
--     'ate': a dlm_dia_estado devolve mais (rival_id e rival_nome — o
--     backoffice precisa deles), e nada disso atravessa esta porta.
--     Privacidade por construção, não por disciplina.
--
--   · A CONFIRMAÇÃO devolve-se viva OU anulada (a mais recente): o portal
--     precisa de saber que ela carregou no «já fiz o pagamento» para não
--     lho voltar a pedir — e precisa de saber que a Nádia limpou a
--     confirmação para voltar a abrir a porta. A confirmação NUNCA
--     reserva o dia; quem carimba é o registo da Nádia.
--
--   · A CONFIG (sinal_pagamento) vai CRUA: os defaults da casa (sem
--     escolha → dados da casa; sem MB Way da casa → só IBAN) são regra de
--     apresentação e vivem no front, que é quem conhece os dados da casa.
--
-- DEPENDE DA PARTE A (no mesmo ficheiro 083, que corre antes desta):
--   · public.dlm_dia_estado(date, uuid) → jsonb {estado, rival_id?,
--     rival_nome?, ate?} — esta projecção só consome estado e ate
--   · public.portal_sinal_confirmacoes (submission_id, metodo_indicado,
--     criado_em, anulada_em, …)
--   · submissions.sinal_pagamento (jsonb) e submissions.dia_guardado_ate
--     (date) — entram sozinhas no %rowtype, sem mais nada a mexer.
--
-- A FUNÇÃO É REESCRITA POR INTEIRO, como sempre: o corpo abaixo é a cópia
-- FIEL da versão da 082 (que veio da 078, que veio da 076/073/070 — o
-- ficheiro, não a memória), com as adições da 083 marcadas. Perder uma
-- linha desta função é regressão no portal inteiro.
--
-- Sem véu a proteger o valor: a 083 matou o véu dos valores do orçamento
-- (decisão de 08/08/2026) — os valores estão à vista na folha, e o sinal
-- é metade deles. A posse da ligação é a prova, como no resto do portal.

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
      v_estado_dia := jsonb_build_object('estado', 'tomado');
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
-- VERIFICAÇÕES (parte B)
-- ═════════════════════════════════════════════════════════════
--
-- 1) Sem orçamento publicado, a chave nem existe:
--      select dlm_portal_ver('<token de evento sem publicação>') ? 'sinal';
--      → false
--
-- 2) Com orçamento publicado, a metade bate certo com a FOLHA (abre a
--    folha no portal e compara com o Total impresso):
--      select jsonb_pretty(dlm_portal_ver('<token>') -> 'sinal');
--      → valor = total / 2 (a cêntimos), total = o número da folha,
--        __logistica incluída quando o instantâneo a tem
--
-- 3) A versão que conta é a EM VIGOR: publica uma v2 com outro total →
--    o sinal acompanha a v2, nunca a v1.
--
-- 4) Privacidade da disputa — num dia disputado por outro evento:
--      select jsonb_pretty(dlm_portal_ver('<token do rival>') -> 'sinal' -> 'estado_do_dia');
--      → só 'estado' (e 'ate' na preferência); e o nome do outro não
--        aparece em lado nenhum:
--      select dlm_portal_ver('<token>')::text ilike '%<nome do rival>%' as vazou;
--      → false
--
-- 5) O prazo próprio ganha ao alheio — mas NUNCA ao dia tomado: com
--    dia_guardado_ate de hoje ou futuro no PRÓPRIO evento (e data_evento
--    futura) → {estado:'guardado_para_si', ate:...}, mesmo que outro
--    evento tenha prazo ou confirmação. Se a Nádia registar um sinal ao
--    rival com p_forcar → o portal da preterida passa a {estado:'tomado'}
--    (a promessa quebrada mostra-se, não se esconde). Com o prazo
--    passado, a data mudada ou a data já no passado, volta a valer o
--    veredicto da dlm_dia_estado (deriva em leitura — ninguém precisa
--    de limpar nada).
--
-- 6) A confirmação acompanha o ciclo: «já paguei» → confirmacao com
--    em/metodo e anulada_em null; a Nádia limpa → anulada_em preenchido;
--    nova confirmação → volta viva. Sem confirmação nenhuma → null.
--
-- 7) Token inexistente/revogado/expirado continua a dar a MESMA resposta
--    de sempre — a chave nova não muda a cortina:
--      select dlm_portal_ver('nao-existe');
--      → {"estado":"terminado"}
--
-- 8) Nada do resto mexeu: comunicados, jornada, portão do sinal (078),
--    marcos_datados e publicado_em respondem exactamente como na 082.
