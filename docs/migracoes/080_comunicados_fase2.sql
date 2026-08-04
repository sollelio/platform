-- 080_comunicados_fase2.sql
--
-- O PÚBLICO E A EXPEDIÇÃO — fase 2.
--
-- CONFIRMA O NÚMERO antes de correr. A fase 1 acabou na 079; se entretanto
-- entrou outra migração, renumera e diz qual ficou.
--
-- ⚠️ AVISO HONESTO: este ficheiro foi escrito sem o esquema à frente. Os
-- nomes das colunas de `clientes` e de `submissions` vêm do levantamento, não
-- de introspecção. Valida cada referência antes de correr — sobretudo na
-- secção 6, que é a mais frágil. Na fase 1 escapou-me um grant e um
-- search_path; parte do princípio de que aqui também há algo.
--
-- (Validação feita a 04/08/2026, antes de correr: os nomes das colunas da
-- secção 6 estavam TODOS certos — clientes.nome/contacto, submissions.
-- cliente_id/respostas/event_type_id/data_evento/fase — e a 043 não expõe
-- função de normalização, pelo que a expressão em linha fica, igual à dela.
-- O que o aviso previa estava noutro sítio: a vista NASCIA LEGÍVEL PELO
-- ANON. Ver a CORRECÇÃO 080 na própria secção 6.)
--
-- O que esta fase acrescenta:
--   · a lista congelada de destinatários, com o texto de cada pessoa
--   · o temperamento da folha (aviso sóbrio / oferta desejável)
--   · a regra de público guardada, para a fase 3 a reutilizar
--   · a marca de quem não quer receber promoções
--   · o balde das imagens da folha

-- ─────────────────────────────────────────────────────────────
-- 1. A folha ganha temperamento e memória do recorte
-- ─────────────────────────────────────────────────────────────

alter table public.comunicados
  add column if not exists registo      text        not null default 'aviso',
  add column if not exists publico      jsonb,
  add column if not exists congelado_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comunicados_registo_valido'
  ) then
    alter table public.comunicados
      add constraint comunicados_registo_valido
      check (registo in ('aviso', 'oferta'));
  end if;
end $$;

comment on column public.comunicados.registo is
  'O temperamento da MESMA folha: aviso (sóbrio) ou oferta (desejo). Não são '
  'duas folhas — é a mesma com dois registos visuais.';

comment on column public.comunicados.publico is
  'A regra que produziu a lista, guardada para a fase 3 a reutilizar: '
  '{ origem:"eventos"|"contactos", event_type_id, janela, quem }. '
  'Guarda-se a REGRA; quem recebeu está em comunicado_destinatarios.';

comment on column public.comunicados.congelado_em is
  'Quando a lista foi fixada. A partir daqui um evento novo já não entra: '
  'a lista não se mexe debaixo dos pés de quem está a enviar.';

-- ─────────────────────────────────────────────────────────────
-- 2. A lista congelada
-- ─────────────────────────────────────────────────────────────

create table if not exists public.comunicado_destinatarios (
  id             uuid primary key default gen_random_uuid(),
  comunicado_id  uuid not null references public.comunicados(id) on delete cascade,

  -- de onde veio (um dos dois, nunca os dois)
  submission_id  uuid references public.submissions(id) on delete set null,
  cliente_id     uuid references public.clientes(id)    on delete set null,

  -- INSTANTÂNEOS. A lista é congelada: se a ficha mudar depois, a linha
  -- continua a dizer o que dizia quando ela começou a enviar.
  nome           text not null,
  ancora         text,                 -- «Casamento · 12 de setembro»
  telefone       text,                 -- null = sem número utilizável
  telefone_chave text,                 -- os 9 dígitos canónicos (ver 043)

  -- o texto desta pessoa. null = usa a mensagem base do comunicado.
  mensagem       text,

  -- a viagem de ida e volta ao WhatsApp, em dois carimbos:
  --   aberto_em preenchido, enviado_em vazio  → à espera de resposta
  --   enviado_em preenchido                   → enviado
  --   ambos vazios                            → por enviar
  -- «Não saiu» limpa o aberto_em e a linha volta ao princípio.
  aberto_em      timestamptz,
  enviado_em     timestamptz,

  ordem          integer not null default 0,
  created_at     timestamptz not null default now()
);

comment on column public.comunicado_destinatarios.enviado_em is
  'Quer dizer: a conversa abriu-se e ela confirmou que a mensagem saiu. NÃO '
  'quer dizer que foi recebida nem lida. A interface tem de o dizer.';

create index if not exists comunicado_destinatarios_comunicado_idx
  on public.comunicado_destinatarios (comunicado_id, ordem);

-- Uma pessoa, um envio. A mesma cliente com dois eventos entra uma vez só.
-- Quem não tem número tem chave nula, e nulos não colidem — logo continuam
-- todos na lista, contados, como o desenho manda.
create unique index if not exists comunicado_destinatarios_sem_repetidos
  on public.comunicado_destinatarios (comunicado_id, telefone_chave)
  where telefone_chave is not null;

alter table public.comunicado_destinatarios enable row level security;

drop policy if exists comunicado_destinatarios_equipa on public.comunicado_destinatarios;
create policy comunicado_destinatarios_equipa on public.comunicado_destinatarios
  for all to authenticated using (true) with check (true);

-- O anon não tem nada aqui. A folha pública não sabe que esta tabela existe.

-- ─────────────────────────────────────────────────────────────
-- 3. Quem não quer receber promoções
-- ─────────────────────────────────────────────────────────────

alter table public.clientes
  add column if not exists recusou_promocoes_em timestamptz;

comment on column public.clientes.recusou_promocoes_em is
  'Null = pode receber. Preenchido = fica de fora de qualquer recorte por '
  'CONTACTOS. Não afecta comunicados por EVENTOS: um aviso de montagem a quem '
  'tem casamento marcado é operação, não promoção.';

-- ─────────────────────────────────────────────────────────────
-- 4. A porta pública passa a levar o temperamento
-- ─────────────────────────────────────────────────────────────
-- Única alteração: o `registo` entra na projecção, para a folha saber com que
-- cara se desenhar. Tudo o resto fica exactamente como estava — mesma
-- resposta única para inexistente/retirada/expirada, mesmo grant só ao anon.

create or replace function public.dlm_comunicado_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select id, titulo, subtitulo, blocos, registo, retirado_em, expira_em
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
    'registo',   r.registo,
    'blocos',    r.blocos
  );
end;
$$;

revoke all on function public.dlm_comunicado_ver(text) from public;
grant execute on function public.dlm_comunicado_ver(text) to anon;
-- Continua a NÃO ser concedida a authenticated, de propósito: a função conta
-- uma leitura, e uma espreitadela do backoffice não pode contar como visita.

-- ─────────────────────────────────────────────────────────────
-- 5. O balde das imagens da folha
-- ─────────────────────────────────────────────────────────────
-- A folha é pública, logo a imagem tem de ser legível por URL. O que NÃO pode
-- é ser enumerável: sem política de select para o anon, ninguém lista o balde.
--
-- ⚠️ ALINHA COM O QUE JÁ EXISTE. O balde das fotografias do portal (fase 6)
-- já resolveu isto; copia-lhe as políticas em vez de seguires as minhas se
-- forem diferentes. Os caminhos não levam o id de nada.

insert into storage.buckets (id, name, public)
values ('comunicados', 'comunicados', true)
on conflict (id) do nothing;

drop policy if exists comunicados_img_equipa_escreve on storage.objects;
create policy comunicados_img_equipa_escreve on storage.objects
  for all to authenticated
  using (bucket_id = 'comunicados')
  with check (bucket_id = 'comunicados');

-- ─────────────────────────────────────────────────────────────
-- 6. A vista que resolve o número de cada pessoa
-- ─────────────────────────────────────────────────────────────
-- ⚠️ A PARTE FRÁGIL DESTE FICHEIRO. Escrita às cegas.
--
-- O telefone vive em dois sítios: na ficha do contacto e nas respostas do
-- próprio evento. A regra da casa é coluna primeiro, JSONB como recurso — e a
-- chave canónica são os últimos 9 dígitos (migração 043).
--
-- ANTES DE CORRER:
--   1. confirma os nomes reais das colunas (`clientes.contacto`, o campo do
--      nome, `submissions.cliente_id`, `submissions.data_evento`);
--   2. se a 043 já expõe uma função de normalização, USA-A e deita fora a
--      minha expressão em linha — duas normalizações é uma a mais;
--   3. se a vista não compensar, diz e faz-se em JS: são 13 contactos.

create or replace view public.v_destinatarios_possiveis as
with normaliza as (
  select
    s.id                as submission_id,
    s.cliente_id,
    c.nome              as nome,
    coalesce(
      nullif(c.contacto, ''),
      nullif(s.respostas ->> 'numeroWhatsapp', ''),
      nullif(s.respostas ->> 'contactoPrincipal', '')
    )                   as telefone_bruto,
    s.event_type_id,
    s.data_evento,
    s.fase
  from public.submissions s
  left join public.clientes c on c.id = s.cliente_id
)
select
  submission_id,
  cliente_id,
  nome,
  telefone_bruto as telefone,
  nullif(right(regexp_replace(coalesce(telefone_bruto, ''), '\D', '', 'g'), 9), '')
    as telefone_chave,
  event_type_id,
  data_evento,
  fase
from normaliza;

comment on view public.v_destinatarios_possiveis is
  'Um sítio só para a pergunta «qual é o número desta pessoa?». Coluna '
  'primeiro, respostas do evento como recurso. Usada pelo recorte por eventos.';

-- CORRECÇÃO 080 — a que o cabeçalho previa, e era grave: no Supabase os
-- privilégios por omissão dão SELECT ao anon em qualquer vista nova do
-- schema public, e uma vista corre com os direitos do DONO — por cima do
-- RLS de submissions e clientes (o RLS da 021 nem chega a ser consultado).
-- Tal como vinha, o anon lia nomes e telefones de toda a gente. Duas
-- defesas, porque uma só é uma aposta:
--   1. a vista passa a security_invoker: quem a lê responde pelo RLS das
--      tabelas por baixo, como se as lesse directamente;
--   2. revogam-se os privilégios do anon (e do public) na própria vista.
alter view public.v_destinatarios_possiveis set (security_invoker = true);

revoke all on public.v_destinatarios_possiveis from anon, public;
grant select on public.v_destinatarios_possiveis to authenticated;


-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÕES
-- ═════════════════════════════════════════════════════════════
--
-- 1) A folha pública já diz o temperamento:
--      select dlm_comunicado_ver('<token>') -> 'registo';
--      → "aviso" ou "oferta"
--
-- 2) O anon não vê a lista de destinatários:
--      (com a chave anon) select * from comunicado_destinatarios;
--      → falha ou zero linhas
--
-- 3) A mesma pessoa não entra duas vezes:
--      inserir duas linhas com o mesmo comunicado_id e o mesmo
--      telefone_chave → a segunda tem de ser rejeitada
--
-- 4) Quem não tem número não é bloqueado:
--      inserir duas linhas com telefone_chave nulo → as duas entram
--
-- 5) O balde não se enumera:
--      (com a chave anon) listar o balde `comunicados` → vazio ou negado,
--      mas um URL directo de uma imagem abre
--
-- 6) A vista NÃO se lê com a chave anon (a correcção 080):
--      (com a chave anon) select * from v_destinatarios_possiveis;
--      → falha por falta de permissão, ou zero linhas
--    e com um utilizador autenticado devolve as linhas todas.
