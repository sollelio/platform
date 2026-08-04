-- 081_comunicados_fase3.sql
--
-- OS MOLDES — fase 3.
--
-- CONFIRMA O NÚMERO. A fase 2 ficou na 080; renumera se entretanto entrou
-- outra e diz qual ficou.
--
-- Um molde guarda três coisas: a folha, a mensagem e a REGRA de público.
-- Nunca os nomes, nunca o endereço, nunca as leituras — cada comunicado que
-- nasce de um molde é novo e ganha endereço próprio.
--
-- ⚠️ Aviso, outra vez: escrita sem o esquema à frente. Valida antes de
-- correr. E repara no que NÃO está aqui: nenhuma vista. A da 080 nascia
-- legível pelo anon, e a lição foi que neste projecto tudo o que é público
-- passa por RPC. Aqui nada é público — os moldes são só da casa.
--
-- (Validação feita a 04/08/2026, antes de correr: os nomes e as
-- referências estavam TODOS certos, e a decisão sem vista é a certa. O
-- que faltava desta vez não era um nome — era um INVARIANTE: nada
-- impedia uma linha dispensada de ganhar carimbos de envio. O
-- marcarTodosEnviados da difusão (fase 2) marca «tudo o que está por
-- enviar com telefone», e uma dispensada não tem carimbos — seria
-- marcada como ENVIADA, pondo no registo «a mensagem saiu» sobre a
-- pessoa que ela decidiu não contactar. Ver a CORRECÇÃO 081 na secção 3;
-- o código da difusão também passou a excluí-las, cinta e suspensórios.)

-- ─────────────────────────────────────────────────────────────
-- 1. A tabela dos moldes
-- ─────────────────────────────────────────────────────────────

create table if not exists public.comunicado_modelos (
  id             uuid primary key default gen_random_uuid(),

  -- o nome INTERNO, o que ela escreve ao guardar. Não é o título da folha:
  -- este só o vê a casa, aquele é o que as clientes lêem.
  nome           text not null,

  -- a folha, tal e qual como em `comunicados`
  registo        text not null default 'aviso',
  titulo         text not null,
  subtitulo      text,
  blocos         jsonb not null default '[]'::jsonb,

  -- o texto que acompanha o endereço na conversa
  mensagem       text,

  -- a REGRA, não os nomes
  publico        jsonb,

  created_at     timestamptz not null default now(),
  actualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comunicado_modelos_registo_valido'
  ) then
    alter table public.comunicado_modelos
      add constraint comunicado_modelos_registo_valido
      check (registo in ('aviso', 'oferta'));
  end if;
end $$;

comment on column public.comunicado_modelos.blocos is
  'A mesma forma dos blocos de `comunicados`, com dois campos a mais que só '
  'fazem sentido num molde: `rever` (booleano) e `pergunta` (texto). Um bloco '
  'com rever=true nasce editável e assinalado quando o molde for usado, com a '
  '`pergunta` ao lado — «Vem de abril de 2026. A data ainda serve?». '
  'A marca decide-se ao GUARDAR o molde, não ao usá-lo: é aí que ela tem o '
  'contexto todo à frente.';

comment on column public.comunicado_modelos.publico is
  'A regra: { origem, event_type_id, janela, quem }. Os nomes contam-se de '
  'novo de cada vez que o molde for usado.';

alter table public.comunicado_modelos enable row level security;

drop policy if exists comunicado_modelos_equipa on public.comunicado_modelos;
create policy comunicado_modelos_equipa on public.comunicado_modelos
  for all to authenticated using (true) with check (true);

-- O anon não tem nada aqui. Um molde nunca é público.

-- ─────────────────────────────────────────────────────────────
-- 2. O comunicado passa a saber de onde veio
-- ─────────────────────────────────────────────────────────────
-- `on delete set null`: apagar um molde NÃO apaga os comunicados que dele
-- nasceram. Ficam órfãos e continuam a valer — o que se perde é só a
-- contagem de utilizações desse molde.

alter table public.comunicados
  add column if not exists modelo_id uuid references public.comunicado_modelos(id) on delete set null;

create index if not exists comunicados_modelo_idx
  on public.comunicados (modelo_id) where modelo_id is not null;

-- A «história» do cartão do molde («Usado 2 vezes · o último em agosto»)
-- DERIVA-SE daqui: count(*) e max(created_at) sobre os comunicados com este
-- modelo_id. Não se guarda contador — contadores guardados derivam.

-- ─────────────────────────────────────────────────────────────
-- 3. Quem entrou depois de a lista fechar
-- ─────────────────────────────────────────────────────────────
-- Congelar foi um acto deliberado, e continua a valer. Mas quando entra um
-- evento que a regra deste comunicado abrangia, ela decide: acrescenta uma
-- linha, ou dispensa — e nesse caso não se volta a perguntar.
--
-- A dispensa GRAVA-SE como linha dispensada, em vez de tabela nova:
--   · o instantâneo (nome, âncora, telefone) já fica guardado
--   · «Desfazer» é limpar uma coluna
--   · o índice único continua a impedir a mesma pessoa duas vezes
--
-- E «acrescentada» não precisa de coluna: é a linha cujo created_at é
-- posterior ao congelado_em do comunicado.

alter table public.comunicado_destinatarios
  add column if not exists dispensado_em timestamptz;

comment on column public.comunicado_destinatarios.dispensado_em is
  'Preenchido = entrou depois de a lista fechar e ela decidiu deixar como '
  'estava. Não conta para a lista nem para as contagens, e não se volta a '
  'perguntar por esta pessoa. Limpar a coluna é o «Desfazer».';

-- CORRECÇÃO 081 — o invariante que faltava: uma linha dispensada NUNCA
-- tem carimbos de envio. «Dispensada e enviada» é uma contradição — a
-- casa decidiu não contactar E registou que a mensagem saiu — e sem este
-- CHECK a difusão da fase 2 (marcar todos como enviados) produzia
-- exactamente isso em silêncio. Com ele, o engano rebenta na base em vez
-- de dormir no registo. (O código também passou a excluir dispensadas —
-- este CHECK é a rede para o próximo código que se esqueça.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'comunicado_destinatarios_dispensada_sem_carimbos'
  ) then
    alter table public.comunicado_destinatarios
      add constraint comunicado_destinatarios_dispensada_sem_carimbos
      check (dispensado_em is null or (aberto_em is null and enviado_em is null));
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════
-- VERIFICAÇÕES
-- ═════════════════════════════════════════════════════════════
--
-- 1) O anon não vê moldes:
--      (chave anon) select * from comunicado_modelos;
--      → falha ou zero linhas
--
-- 2) Apagar um molde não leva os comunicados atrás:
--      criar molde → criar comunicado com modelo_id → apagar o molde
--      → o comunicado continua lá, com modelo_id a null
--
-- 3) A dispensa não quebra a regra de uma-pessoa-um-envio:
--      dispensar uma linha e tentar inserir outra com o mesmo
--      telefone_chave no mesmo comunicado → rejeitada
--
-- 4) Nenhuma vista nova neste ficheiro:
--      select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--       where n.nspname='public' and c.relkind='v';
--      → continua a ser 1 (a v_destinatarios_possiveis)
--
-- 5) Uma dispensada não pode ganhar carimbos (a correcção 081):
--      inserir uma linha com dispensado_em preenchido e depois tentar
--      update ... set enviado_em = now() nessa linha
--      → rejeitada pelo CHECK comunicado_destinatarios_dispensada_sem_carimbos
