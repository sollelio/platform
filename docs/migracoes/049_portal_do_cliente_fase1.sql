-- ============================================================================
-- 049 · Portal do Cliente — fase 1: a porta e a leitura
--
-- Cria portal_acessos (token opaco por evento) e o RPC anónimo de leitura,
-- com projecção explícita. NADA de escrita do lado do cliente nesta fase.
--
-- 🔴 A regra que este ficheiro existe para respeitar:
--    submissions.id NUNCA sai. Nenhum campo devolvido pelo RPC o contém,
--    nem directa nem indirectamente.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 0 · pgcrypto (gen_random_bytes) ────────────────────────────────────────
-- Se falhar por falta de privilégios, activa a extensão pelo painel do
-- Supabase (Database → Extensions → pgcrypto) e volta a correr daqui.

create extension if not exists pgcrypto;


-- ─── 1 · O token ────────────────────────────────────────────────────────────
-- 24 bytes aleatórios → 32 caracteres base64url. Sem relação derivável com o
-- id do evento: não é hash, não é cifra, não é nada que se possa reverter.

create or replace function public.dlm_token_portal()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

comment on function public.dlm_token_portal() is
  'Gera um token opaco para o portal do cliente. 24 bytes aleatórios em '
  'base64url. Não deriva do id do evento — reverter é impossível por desenho.';


-- ─── 2 · A tabela ───────────────────────────────────────────────────────────

create table if not exists public.portal_acessos (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null
                     references public.submissions(id) on delete cascade,
  token            text not null unique default public.dlm_token_portal(),

  criado_em        timestamptz not null default now(),
  expira_em        timestamptz,
  revogado_em      timestamptz,
  motivo           text,

  ultimo_acesso_em timestamptz,
  n_acessos        integer not null default 0,

  constraint portal_acessos_motivo_check
    check (motivo is null or motivo in ('avaliado', 'prazo', 'manual')),
  constraint portal_acessos_revogado_com_motivo
    check ((revogado_em is null) = (motivo is null))
);

comment on table public.portal_acessos is
  'Uma porta por evento para o portal do cliente. Revogar fecha a porta; '
  'não apaga o evento, os documentos nem a avaliação.';

-- Um só acesso vivo por evento. Para emitir outro, revoga-se o anterior.
create unique index if not exists portal_acessos_vivo_idx
  on public.portal_acessos (submission_id)
  where revogado_em is null;

create index if not exists portal_acessos_token_idx
  on public.portal_acessos (token);

alter table public.portal_acessos enable row level security;

-- anon não lê nada aqui: chega ao evento só pelo RPC da secção 5.
drop policy if exists "admin acesso total" on public.portal_acessos;
create policy "admin acesso total" on public.portal_acessos
  for all to authenticated using (true) with check (true);


-- ─── 3 · Abrir uma porta (backoffice) ───────────────────────────────────────
-- Devolve o token. Se já houver acesso vivo, devolve esse — nunca cria dois.
-- expira_em = data do evento + 30 dias. Sem data de evento, fica em aberto
-- e a revogação é manual.

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
               then (v_data + interval '30 days')::timestamptz end)
  returning token into v_token;

  return v_token;
end;
$$;


-- ─── 4 · Fechar a porta (backoffice) ────────────────────────────────────────

create or replace function public.dlm_portal_revogar(
  p_submission_id uuid,
  p_motivo        text default 'manual'
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.portal_acessos
     set revogado_em = now(),
         motivo      = p_motivo
   where submission_id = p_submission_id
     and revogado_em is null;
$$;


-- ─── 5 · A leitura pública ──────────────────────────────────────────────────
--
-- SECURITY DEFINER porque anon não lê nenhuma tabela. Recebe o token e
-- devolve uma PROJECÇÃO EXPLÍCITA — cada campo aqui é uma decisão consciente.
--
-- O que NÃO sai, e é de propósito:
--   · submissions.id e qualquer outro id interno
--   · valores em euros (ficam atrás da verificação — fase 4)
--   · morada exacta, quem abre o espaço e o contacto dessa pessoa
--   · briefing, materiais, notas internas
--
-- Inexistente, revogado e expirado devolvem a MESMA resposta: não se confirma
-- nem se desmente a existência de um token.

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

  -- artefactos datados (só estes podem datar a Jornada)
  v_pedido_em    timestamptz;
  v_orcamento_em timestamptz;
  v_sinal_em     timestamptz;
  v_projecto_em  timestamptz;
  v_contrato_em  timestamptz;

  -- se o artefacto existe, mesmo sem data
  v_tem_orcamento boolean;
  v_tem_projecto  boolean;
  v_tem_contrato  boolean;

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

  -- Título: os nomes do evento; se não houver, o nome do contacto.
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

  select min(d.created_at), count(*) > 0
    into v_orcamento_em, v_tem_orcamento
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'orcamento';

  select min(d.created_at), count(*) > 0
    into v_projecto_em, v_tem_projecto
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'proposta';

  select min(d.assinado_em), count(*) > 0
    into v_contrato_em, v_tem_contrato
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'contrato';

  -- Só pagamentos com data fiável. reconstituido = true significa que a
  -- data se perdeu: conta como facto, mas sem dia.
  select min(p.data)::timestamptz into v_sinal_em
    from public.pagamentos p
   where p.submission_id = v_ev.id
     and p.origem        = 'sinal'
     and p.reconstituido = false;

  -- ── A Jornada ─────────────────────────────────────────────────────────
  -- Três estados, nunca dois. «feito_sem_data» existe porque um carimbo em
  -- falta NÃO prova que a coisa não aconteceu.

  select jsonb_agg(
           jsonb_build_object(
             'etapa',  m.etapa,
             'rotulo', m.rotulo,
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
      (1, 'interessada', 'Interessada',
          true,
          coalesce(v_pedido_em, v_ev.created_at)),

      (2, 'orcamento', 'Orçamento',
          v_tem_orcamento
            or v_ev.fase in ('orcamento','sinal','cliente','projecto','contrato'),
          v_orcamento_em),

      (3, 'sinal', 'Sinal',
          v_sinal_em is not null
            or v_ev.fase in ('cliente','projecto','contrato')
            or exists (select 1 from public.pagamentos p
                        where p.submission_id = v_ev.id and p.origem = 'sinal'),
          v_sinal_em),

      (4, 'projecto', 'Projecto',
          v_tem_projecto or v_ev.fase in ('projecto','contrato'),
          v_projecto_em),

      (5, 'contrato', 'Contrato',
          v_contrato_em is not null or v_ev.fase = 'contrato',
          v_contrato_em),

      -- Preparação não tem artefacto: é o status a dizê-lo, e nunca tem data.
      (6, 'preparacao', 'Preparação',
          v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          null::timestamptz),

      (7, 'grande_dia', 'O grande dia',
          v_ev.data_evento is not null and v_ev.data_evento < current_date,
          case when v_ev.data_evento is not null
               then v_ev.data_evento::timestamptz end)
    ) as m(ord, etapa, rotulo, feito, quando);

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
      -- para o portal saber que ainda está no princípio e desenhar-se
      -- em conformidade, sem expor a fase interna tal e qual
      'principio',  v_ev.fase in ('interessado','orcamento')
    ),
    'jornada', coalesce(v_marcos, '[]'::jsonb)
  );
end;
$$;

comment on function public.dlm_portal_ver(text) is
  'Leitura pública do portal do cliente. Projecção explícita — submissions.id '
  'nunca sai. Inexistente, revogado e expirado devolvem a mesma resposta.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;

revoke all     on function public.dlm_portal_abrir(uuid)         from public, anon;
revoke all     on function public.dlm_portal_revogar(uuid, text) from public, anon;
grant  execute on function public.dlm_portal_abrir(uuid)         to authenticated;
grant  execute on function public.dlm_portal_revogar(uuid, text) to authenticated;


-- ─── 6 · Verificação — correr depois, em teste ──────────────────────────────

-- 6.1 · Abrir uma porta para um evento e ver o que sai.
--   select public.dlm_portal_abrir('<EVENTO_ID>'::uuid);
--   select jsonb_pretty(public.dlm_portal_ver('<TOKEN_DEVOLVIDO>'));

-- 6.2 · ⭐ Testar o evento VAZIO — é o estado mais comum.
--   Escolhe um em fase 'interessado' (há 4 em teste) e repara em quantas
--   etapas ficam «por_acontecer». É esse ecrã que temos de desenhar bem.

-- 6.3 · A cortina: os três casos têm de devolver exactamente o mesmo.
--   select public.dlm_portal_ver('token-que-nao-existe');
--   select public.dlm_portal_revogar('<EVENTO_ID>'::uuid, 'manual');
--   select public.dlm_portal_ver('<TOKEN_DEVOLVIDO>');

-- 6.4 · 🔴 O teste que mais importa: procurar o id no que sai.
--   select public.dlm_portal_ver('<TOKEN>')::text like '%<EVENTO_ID>%';
--   Tem de dar FALSE. Se der true, para tudo.

-- 6.5 · anon não chega à tabela por fora.
--   set role anon;
--     select * from public.portal_acessos;   -- tem de dar 0 linhas
--   reset role;