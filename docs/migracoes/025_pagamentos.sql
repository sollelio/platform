-- ============================================================
-- 025 — Módulo de pagamentos: regista dinheiro, não o move.
--
-- Duas tabelas:
--   pagamentos_previstos — o que DEVE ser pago (o plano): sinal e
--     remanescente, tipicamente, mas aberto a mais parcelas. Vai
--     gerar-se sozinho quando `valor_acordado` é gravado num evento
--     (50% agora, 50% a 48h antes do evento — ver código, não esta
--     migração), e a Nádia pode editar se um caso for diferente.
--   pagamentos — o que FOI pago, de facto. Nunca se guarda o saldo
--     nem "está pago" nalgum lado — calcula-se sempre a partir daqui.
--
-- `metodo` e `origem` ficam texto livre de propósito (nunca enum, nunca
-- CHECK fechado) — a lista de sugestões (MB Way / Transferência
-- bancária / Numerário, para já) vive no frontend; um método novo
-- nunca deve exigir uma migração.
--
-- pagamentos_previstos.submission_id → ON DELETE CASCADE: é só um
-- plano; apagar o evento torna-o irrelevante, nada real se perde.
--
-- pagamentos.submission_id → ON DELETE RESTRICT: isto é dinheiro que
-- já entrou. Um evento com pelo menos um pagamento registado NUNCA se
-- apaga em cascata — a base de dados recusa-se. Se a Nádia registou um
-- pagamento no evento errado, apaga esse PAGAMENTO primeiro (a UI tem
-- de o permitir, com confirmação explícita a mostrar valor e data —
-- "vais apagar o registo de 300€ de 12 de julho"); só depois o evento
-- fica livre para remover. Isto é deliberado: um beco à entrada
-- (nunca se apaga por engano em cascata) é preferível a dados de
-- dinheiro perdidos silenciosamente.
--
-- Os nomes das constraints são explícitos de propósito — o Postgres
-- devolve o nome da constraint no erro 23503, e é isso que o código
-- vai usar para distinguir "bloqueado por um convite preenchido" de
-- "bloqueado por ter pagamentos" e mostrar a mensagem certa (ver
-- getVinculosEvento / handleConfirmarRemocaoEvento em
-- ClientesLista.jsx — ainda por actualizar nesse sentido).
--
-- reconstituido = true assinala linhas que NÃO vieram de um registo ao
-- vivo — vieram da reconciliação retroactiva dos eventos já em curso
-- (uma migração à parte, feita DEPOIS de esta ficar validada) ou da
-- importação de CSV histórico (importar_cliente, a actualizar também
-- à parte). A CHECK abaixo garante que só essas linhas podem ficar
-- sem data — um registo ao vivo tem sempre data a sério. Dado ausente
-- é melhor que dado inventado: nunca se preenche uma data plausível
-- mas falsa só para não deixar a coluna vazia.
-- ============================================================

create table public.pagamentos_previstos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    constraint pagamentos_previstos_submission_fk
    references public.submissions(id) on delete cascade,
  descricao text not null,
  valor numeric(10,2) not null
    constraint pagamentos_previstos_valor_check check (valor > 0),
  data_limite date,
  ordem smallint not null default 1,
  created_at timestamptz not null default now()
);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    constraint pagamentos_submission_fk
    references public.submissions(id) on delete restrict,
  previsto_id uuid
    constraint pagamentos_previsto_fk
    references public.pagamentos_previstos(id) on delete set null,
  valor numeric(10,2) not null
    constraint pagamentos_valor_check check (valor > 0),
  data date,
  metodo text not null,
  origem text not null default 'sinal',
  contribuinte text,
  notas text,
  reconstituido boolean not null default false,
  created_at timestamptz not null default now(),
  constraint pagamentos_data_reconstituido_check
    check (data is not null or reconstituido = true)
);

create index pagamentos_previstos_submission_idx
  on public.pagamentos_previstos (submission_id);
create index pagamentos_submission_idx
  on public.pagamentos (submission_id);

-- RLS — mesmo padrão da migração 021: só authenticated (a Nádia com
-- login) mexe nisto; sem excepção nenhuma para o público (anon).
alter table public.pagamentos_previstos enable row level security;
alter table public.pagamentos enable row level security;

create policy "admin acesso total" on public.pagamentos_previstos
  for all to authenticated using (true) with check (true);

create policy "admin acesso total" on public.pagamentos
  for all to authenticated using (true) with check (true);
