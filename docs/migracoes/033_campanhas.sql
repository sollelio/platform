-- ============================================================
-- 033 — Contribuição coletiva: a campanha de um evento.
--
-- A campanha é o ESTADO da contribuição coletiva (meta, link, fase de
-- vida); o DINHEIRO nunca vive aqui — cada contribuição confirmada é
-- uma linha em `pagamentos` com origem='contribuicao' e contribuinte,
-- como a 025 previu. Somar contribuições é somar pagamentos: o
-- cabeçalho, a Jornada e os alertas ficam certos sem aprender nada.
--
-- Decisões (26/07/2026):
--   • token com aleatoriedade criptográfica, gerado na app (32 bytes
--     hex via crypto.getRandomValues) — nunca sequencial nem derivado
--     do id — e REVOGÁVEL: regenerar substitui-o e o link antigo morre;
--   • uma campanha ATIVA por evento (índice único parcial); fechar ou
--     concluir liberta o lugar para outra;
--   • estado com CHECK (ativa|fechada|concluida) — o precedente da
--     `fase` (016), não o do metodo/origem: os três estados são eixos
--     da UI, não vocabulário aberto;
--   • ON DELETE CASCADE: a campanha é plano/estado, como os
--     pagamentos_previstos — apagar o evento torna-a irrelevante. O
--     dinheiro real continua protegido pelo RESTRICT de `pagamentos`;
--   • celebrada_em: a celebração de meta atingida acontece UMA vez —
--     fica carimbada para nunca repetir fogos a cada abertura.
--
-- Idempotente: correr duas vezes é igual a correr uma.
-- ============================================================

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    constraint campanhas_submission_fk
    references public.submissions(id) on delete cascade,
  objetivo numeric(10,2) not null
    constraint campanhas_objetivo_check check (objetivo > 0),
  mensagem text,
  token text not null
    constraint campanhas_token_unico unique,
  estado text not null default 'ativa'
    constraint campanhas_estado_check
    check (estado in ('ativa', 'fechada', 'concluida')),
  celebrada_em timestamptz,
  fechada_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campanhas_submission_idx
  on public.campanhas (submission_id);

-- uma campanha ativa por evento, e só uma
create unique index if not exists campanhas_uma_ativa_idx
  on public.campanhas (submission_id)
  where estado = 'ativa';

-- RLS — padrão da 021/025: só authenticated; o público (anon) nem lê.
-- O acesso público da página /contribuir/:token (F2) virá por RPC
-- SECURITY DEFINER com o token, como as 020/026.
alter table public.campanhas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campanhas'
      and policyname = 'admin acesso total'
  ) then
    create policy "admin acesso total" on public.campanhas
      for all to authenticated using (true) with check (true);
  end if;
end $$;
