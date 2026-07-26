-- ============================================================
-- 035 — Intenções de contribuição (F3).
--
-- Uma intenção é uma PROMESSA deixada na página pública: nome, valor,
-- uma palavra aos anfitriões. NÃO é dinheiro — o módulo regista
-- dinheiro, não o move (025), e uma promessa não entrou em conta
-- nenhuma. Só quando a Nádia confirma é que nasce o pagamento real
-- (origem='contribuicao', imputado por ordem), e a intenção fica
-- carimbada como confirmada.
--
-- Escrita pública SÓ pela RPC prometer_contribuicao (security
-- definer, por token de campanha ATIVA), com os travões de uma porta
-- aberta à rua: nome obrigatório e aparado a 80, mensagem a 280,
-- valor em (0, 99999], e no máximo 200 pendentes por campanha — chega
-- para qualquer casamento, trava qualquer robô.
--
-- A tabela entra na publicação realtime: uma intenção que chega
-- enquanto a Nádia está no separador aparece-lhe na hora — cada
-- contribuinte que chega é um pequeno acontecimento.
--
-- Idempotente: correr duas vezes é igual a correr uma.
-- ============================================================

create table if not exists public.campanha_intencoes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null
    constraint campanha_intencoes_campanha_fk
    references public.campanhas(id) on delete cascade,
  nome text not null,
  valor numeric(10,2) not null
    constraint campanha_intencoes_valor_check check (valor > 0),
  mensagem text,
  estado text not null default 'pendente'
    constraint campanha_intencoes_estado_check
    check (estado in ('pendente', 'confirmada', 'anulada')),
  confirmada_em timestamptz,
  anulada_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campanha_intencoes_campanha_idx
  on public.campanha_intencoes (campanha_id);

alter table public.campanha_intencoes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campanha_intencoes'
      and policyname = 'admin acesso total'
  ) then
    create policy "admin acesso total" on public.campanha_intencoes
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- A única porta pública de escrita.
create or replace function public.prometer_contribuicao(
  p_token text,
  p_nome text,
  p_valor numeric,
  p_mensagem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha campanhas%rowtype;
  v_pendentes int;
begin
  select * into v_campanha
    from campanhas
   where token = p_token and estado = 'ativa';
  if v_campanha.id is null then
    raise exception 'campanha_indisponivel';
  end if;

  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'nome_em_falta';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > 99999 then
    raise exception 'valor_invalido';
  end if;

  select count(*) into v_pendentes
    from campanha_intencoes
   where campanha_id = v_campanha.id and estado = 'pendente';
  if v_pendentes >= 200 then
    raise exception 'campanha_cheia';
  end if;

  insert into campanha_intencoes (campanha_id, nome, valor, mensagem)
  values (
    v_campanha.id,
    left(trim(p_nome), 80),
    round(p_valor, 2),
    nullif(left(trim(coalesce(p_mensagem, '')), 280), '')
  );

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.prometer_contribuicao(text, text, numeric, text) from public;
grant execute on function public.prometer_contribuicao(text, text, numeric, text)
  to anon, authenticated;

-- Realtime: a chegada vê-se na hora (o RLS continua a mandar — só a
-- sessão autenticada da Nádia recebe os eventos).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campanha_intencoes'
  ) then
    alter publication supabase_realtime add table public.campanha_intencoes;
  end if;
end $$;
