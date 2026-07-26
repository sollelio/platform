-- ============================================================
-- 034 — A face pública da contribuição coletiva (F2).
--
-- Duas peças:
--
--   como_contribuir — o texto que diz aos convidados COMO fazer chegar
--     o dinheiro (MB Way, IBAN…). Coluna própria, não misturada na
--     mensagem: uma é a voz da anfitriã, a outra é instrução prática.
--
--   campanha_publica(token) — a única janela do público para a
--     campanha, pelo padrão das 020/026: SECURITY DEFINER, procura por
--     token (aleatório, revogável), devolve SÓ o que a página pública
--     mostra. Decisão de privacidade (26/07/2026): o público vê a
--     percentagem e o nº de pessoas — NUNCA valores absolutos, nem a
--     meta, nem contribuições individuais, nem nomes. Token errado ou
--     regenerado devolve zero linhas: o link antigo morre em silêncio.
--
-- As "pessoas" contam-se como a UI agrupa: contribuinte + método +
-- created_at (o carimbo idêntico do insert em lote da divisão).
--
-- Idempotente: correr duas vezes é igual a correr uma.
-- ============================================================

alter table public.campanhas
  add column if not exists como_contribuir text;

create or replace function public.campanha_publica(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'estado', c.estado,
    'pct', least(
      100,
      coalesce(round(100 * soma.total / c.objetivo), 0)
    ),
    'pessoas', coalesce(soma.pessoas, 0),
    'mensagem', c.mensagem,
    'como_contribuir', c.como_contribuir,
    'tipo_evento', et.nome,
    'data_evento', s.data_evento
  )
  from campanhas c
  join submissions s on s.id = c.submission_id
  left join event_types et on et.id = s.event_type_id
  left join lateral (
    select
      sum(p.valor) as total,
      count(distinct
        coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text
      ) as pessoas
    from pagamentos p
    where p.submission_id = c.submission_id
      and p.origem = 'contribuicao'
  ) soma on true
  where c.token = p_token;
$$;

revoke all on function public.campanha_publica(text) from public;
grant execute on function public.campanha_publica(text) to anon, authenticated;
