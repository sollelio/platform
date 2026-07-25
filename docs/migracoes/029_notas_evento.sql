-- ============================================================
-- 029 — Notas do evento: o histórico do que foi combinado.
--
-- O separador Notas junta DUAS coisas de origens diferentes, e só uma
-- delas mora nesta tabela:
--
--   • o que a Nádia ESCREVE — "a mãe da noiva ligou a pedir toalhas
--     em marfim". Isto não existe em lado nenhum na app; é o que esta
--     tabela guarda.
--   • o que o sistema JÁ SABE — formulário preenchido, sinal
--     registado, orçamento gerado. Isto NÃO se grava aqui: constrói-se
--     na leitura, a partir de submissions/pagamentos/documentos/
--     invites (ver construirHistorico em src/lib/notas.js).
--
-- Derivar em vez de gravar foi decisão deliberada: uma linha gravada
-- por acontecimento seria um segundo registo da mesma verdade, que
-- diverge à primeira correcção feita do outro lado, e só saberia
-- contar a história a partir do dia em que fosse instalada. Derivado,
-- o histórico dos eventos antigos aparece todo, sem backfill nenhum.
--
-- `tipo` fica texto livre com CHECK aberto aos quatro que a UI oferece
-- hoje (chamada, mensagem, alteracao, interna) — são categorias de
-- conversa, não estados de máquina; acrescentar um quinto não devia
-- ser mais do que mudar uma lista no frontend, mas enganar-se na
-- escrita também não devia passar silenciosamente.
--
-- submission_id → ON DELETE CASCADE: a nota é sobre o evento e não
-- sobrevive a ele. Ao contrário dos pagamentos (RESTRICT, porque
-- dinheiro registado é um facto contabilístico), uma nota perde
-- sentido sem o evento a que se refere.
-- ============================================================

create table public.notas_evento (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    constraint notas_evento_submission_fk
    references public.submissions(id) on delete cascade,
  tipo text not null default 'interna'
    constraint notas_evento_tipo_check
    check (tipo in ('chamada', 'mensagem', 'alteracao', 'interna')),
  corpo text not null
    constraint notas_evento_corpo_check check (btrim(corpo) <> ''),
  autor text,
  created_at timestamptz not null default now()
);

-- A leitura é sempre "as notas deste evento, da mais recente para a
-- mais antiga" — é esse o índice.
create index notas_evento_submission_idx
  on public.notas_evento (submission_id, created_at desc);

-- RLS — mesmo padrão da migração 021: só authenticated (a Nádia com
-- login) mexe nisto. Sem excepção nenhuma para o público (anon): as
-- notas internas são, literalmente, "só eu vejo".
alter table public.notas_evento enable row level security;

create policy "admin acesso total" on public.notas_evento
  for all to authenticated using (true) with check (true);
