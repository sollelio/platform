-- 079_comunicados_fase1.sql
--
-- (Nasceu «078», mas o 078 já era d'«o pórtico das condições» — renumerada
-- ao entrar no repositório, conteúdo intacto salvo três correcções, todas
-- assinaladas com «CORRECÇÃO 079» no sítio: o grant do gerador de token a
-- authenticated, o search_path do pgcrypto, e o comentário de `blocos`
-- alinhado com o modelo que o Design fixou.)
--
-- A FOLHA DE UM COMUNICADO — fase 1.
--
-- O que é: uma página com endereço próprio, pública e reencaminhável, sem um
-- único dado pessoal. Existe precisamente para ser passada adiante — dos
-- noivos para o espaço, para a wedding planner, para os fornecedores. Por
-- isso não pode viver atrás do token do portal, que é pessoal e escrevível.
--
-- Regras herdadas da 049, sem desvios:
--   · o token é opaco e não deriva de id nenhum
--   · a RPC é a ÚNICA janela do público, com projecção explícita
--   · token inexistente, retirado e expirado devolvem a MESMA resposta
--   · o anon não lê a tabela; só chama a função
--
-- Vocabulário: RETIRAR uma folha (pública) não é REVOGAR um acesso (pessoal).
-- São actos diferentes sobre objectos diferentes, e ficam com palavras
-- diferentes. Entram os dois no glossário.

-- ─────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────

create table if not exists public.comunicados (
  id             uuid primary key default gen_random_uuid(),

  -- o que se lê
  titulo         text not null,
  subtitulo      text,
  blocos         jsonb not null default '[]'::jsonb,

  -- fase 2: o texto que acompanha a folha na conversa. Fica já a coluna
  -- para a fase 2 não precisar de migração só por causa dela.
  mensagem       text,

  -- o endereço
  token          text unique,          -- null enquanto não for publicada
  publicado_em   timestamptz,
  retirado_em    timestamptz,
  expira_em      timestamptz,          -- null = não expira

  n_acessos      integer not null default 0,

  created_at     timestamptz not null default now(),
  actualizado_em timestamptz not null default now()
);

-- CORRECÇÃO 079: o comentário original descrevia blocos tipados
-- (saudacao/paragrafo/seccao/despedida). O Design fixou um modelo mais
-- simples e este comentário passou a dizer a verdade: cada bloco é
-- {id, rotulo, texto} e o PAPEL deriva da posição e do conteúdo, na
-- função comporFolha (src/lib/comunicados.js) — só rótulo abre um grupo,
-- só texto é prosa, ambos é cláusula numerada; o primeiro com ambos é a
-- nota em destaque, o último com ambos é o remate. Guardar o papel seria
-- guardar duas vezes a mesma coisa, e das duas uma mentiria.
comment on column public.comunicados.blocos is
  'Array de blocos {id, rotulo, texto}, no molde de event_types.steps — '
  'editável sem deploy. O id gera-se no cliente e NUNCA se regenera. O papel '
  'de cada bloco (prosa, nota, grupo, cláusula, remate) não se guarda: '
  'deriva-se da posição e do conteúdo em comporFolha (src/lib/comunicados.js).';

comment on column public.comunicados.n_acessos is
  'Total de aberturas. NUNCA se atribui a ninguém: a folha é pública e '
  'reencaminhável, logo não se sabe quem a abriu. A interface tem de dizer isto.';

create index if not exists comunicados_token_idx
  on public.comunicados (token) where token is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. RLS — o anon não tem nada aqui
-- ─────────────────────────────────────────────────────────────

alter table public.comunicados enable row level security;

drop policy if exists comunicados_equipa on public.comunicados;
create policy comunicados_equipa on public.comunicados
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 3. O token
-- ─────────────────────────────────────────────────────────────

create or replace function public.dlm_token_comunicado()
returns text
language sql
volatile
-- CORRECÇÃO 079: sem isto, gen_random_bytes não se encontra — no Supabase o
-- pgcrypto vive no schema `extensions` (o precedente é dlm_token_portal, 049).
set search_path = public, extensions
as $$
  -- 24 bytes aleatórios em base64url: 32 caracteres, sem enchimento
  select replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Publicar e retirar (só a equipa)
-- ─────────────────────────────────────────────────────────────

create or replace function public.dlm_comunicado_publicar(p_id uuid)
returns text
language plpgsql
as $$
declare
  v_token text;
begin
  select token into v_token from public.comunicados where id = p_id;
  if not found then
    raise exception 'COMUNICADO_NAO_EXISTE';
  end if;

  -- Republicar depois de retirar devolve o MESMO endereço: quem já tem a
  -- ligação volta a poder abri-la. O endereço é a identidade da folha.
  if v_token is null then
    v_token := public.dlm_token_comunicado();
  end if;

  update public.comunicados
     set token          = v_token,
         publicado_em   = coalesce(publicado_em, now()),
         retirado_em    = null,
         actualizado_em = now()
   where id = p_id;

  return v_token;
end;
$$;

create or replace function public.dlm_comunicado_retirar(p_id uuid)
returns void
language plpgsql
as $$
begin
  update public.comunicados
     set retirado_em    = now(),
         actualizado_em = now()
   where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. A porta pública — a ÚNICA
-- ─────────────────────────────────────────────────────────────

create or replace function public.dlm_comunicado_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select id, titulo, subtitulo, blocos, retirado_em, expira_em
    into r
    from public.comunicados
   where token = p_token
     and publicado_em is not null;

  -- Inexistente, retirada e expirada dão a MESMA resposta. Dizer qual é
  -- ajudaria quem está a tentar adivinhar endereços.
  if not found
     or r.retirado_em is not null
     or (r.expira_em is not null and r.expira_em < now()) then
    return jsonb_build_object('estado', 'terminado');
  end if;

  update public.comunicados set n_acessos = n_acessos + 1 where id = r.id;

  -- Projecção explícita. O id é usado aqui dentro e não sai.
  return jsonb_build_object(
    'estado',    'activo',
    'titulo',    r.titulo,
    'subtitulo', r.subtitulo,
    'blocos',    r.blocos
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Permissões
-- ─────────────────────────────────────────────────────────────

revoke all on function public.dlm_token_comunicado()      from public;
revoke all on function public.dlm_comunicado_publicar(uuid) from public;
revoke all on function public.dlm_comunicado_retirar(uuid)  from public;
revoke all on function public.dlm_comunicado_ver(text)      from public;

grant execute on function public.dlm_comunicado_publicar(uuid) to authenticated;
grant execute on function public.dlm_comunicado_retirar(uuid)  to authenticated;

-- CORRECÇÃO 079: dlm_comunicado_publicar corre como INVOKER (é esse o
-- desenho — a RLS da equipa é quem manda na tabela), e por isso a chamada
-- interior a dlm_token_comunicado() é verificada contra quem invoca. Com o
-- revoke acima e sem este grant, publicar falhava com «permission denied
-- for function dlm_token_comunicado». Conceder não vaza nada: a função gera
-- uma string aleatória e não lê tabela nenhuma.
grant execute on function public.dlm_token_comunicado() to authenticated;

-- ATENÇÃO: dlm_comunicado_ver é concedida SÓ ao anon, de propósito.
-- A função conta uma leitura de cada vez que corre. Se o backoffice a
-- pudesse chamar, uma espreitadela da anfitriã contava como leitura de uma
-- cliente e o número deixava de valer. A pré-visualização do backoffice lê a
-- tabela directamente, que é o que a RLS lhe permite.
-- (É a mesma armadilha que o dlm_portal_ver tem, aqui fechada à chave.)
grant execute on function public.dlm_comunicado_ver(text) to anon;


-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÕES — correr depois, com a chave anon
-- ═════════════════════════════════════════════════════════════
--
-- 1) O anon não lê a tabela:
--      select * from comunicados;
--      → deve falhar ou devolver zero linhas
--
-- 2) Token que não existe dá cortina:
--      select dlm_comunicado_ver('nao-existe');
--      → {"estado":"terminado"}
--
-- 3) O id não vaza (com uma folha publicada e o token real):
--      select (dlm_comunicado_ver('<token>')::text ilike '%' || '<id>' || '%')
--        as id_vazou;
--      → false
--
-- 4) O backoffice não consegue contar leituras por engano:
--      (autenticado) select dlm_comunicado_ver('<token>');
--      → deve falhar por falta de permissão
