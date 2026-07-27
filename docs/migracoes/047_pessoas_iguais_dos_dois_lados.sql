-- =====================================================================
-- 047 — A contagem de "pessoas" da página pública iguala a do admin
--
-- PORQUÊ: o admin conta PESSOAS (nomes distintos, ignorando maiúsculas
-- e espaços; contribuições anónimas contam uma a uma) — ver
-- ContribuicaoColetiva.jsx. A campanha_publica da 042 contava ATOS de
-- contribuição (contribuinte|metodo|created_at distintos): a Maria a
-- contribuir duas vezes aparecia como "2 pessoas" na página pública e
-- "1 pessoa" no admin. Dois ecrãs sobre a mesma realidade a dizerem
-- números diferentes.
--
-- O QUE FAZ: recria a campanha_publica (mesma assinatura, mesmos
-- grants) com a contagem alinhada:
--   pessoas = nomes distintos (lower/trim, não vazios)
--           + atos anónimos (sem nome), um a um — como no admin.
--
-- RESSALVA (herdada da 042, não introduzida aqui): pagamentos com
-- campanha_id NULL (pré-042, ou registados por código antigo na janela
-- migrações→deploy) contam no admin e não na página pública — o filtro
-- da RPC é deliberadamente estrito, porque alargá-lo reabriria a
-- herança de dinheiro entre campanhas que a 042 fechou. Re-correr o
-- backfill da 042 fecha a janela.
--
-- IDEMPOTENTE: create or replace + revoke/grant re-corríveis.
-- Depois de correr: `notify pgrst, 'reload schema';` se a página
-- pública não refletir logo.
-- =====================================================================

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
      -- pessoas como o admin as conta: nomes distintos + anónimos um a
      -- um. O filtro de "nomeado" é a truthiness do JS (não-null e
      -- não-'' CRUS): um nome só de espaços é nomeado no admin e
      -- colapsa para '' no lower(trim(...)) — aqui igual.
      count(distinct lower(trim(p.contribuinte)))
        filter (where p.contribuinte is not null and p.contribuinte <> '')
      + count(distinct coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text)
        filter (where p.contribuinte is null or p.contribuinte = '')
      as pessoas
    from pagamentos p
    where p.campanha_id = c.id
      and p.origem = 'contribuicao'
  ) soma on true
  where c.token = p_token;
$$;

revoke all on function public.campanha_publica(text) from public;
grant execute on function public.campanha_publica(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- DETEÇÃO (último statement): a contagem nova, campanha a campanha,
-- lado a lado com a antiga — onde divergirem era o bug a corrigir.
-- ---------------------------------------------------------------------
select
  c.id,
  c.estado,
  count(distinct lower(trim(p.contribuinte)))
    filter (where p.contribuinte is not null and p.contribuinte <> '')
  + count(distinct coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text)
    filter (where p.contribuinte is null or p.contribuinte = '')
    as pessoas_novo,
  count(distinct coalesce(p.contribuinte, '') || '|' || p.metodo || '|' || p.created_at::text)
    as pessoas_antigo
from campanhas c
left join pagamentos p
  on p.campanha_id = c.id and p.origem = 'contribuicao'
group by c.id, c.estado
order by c.id;
