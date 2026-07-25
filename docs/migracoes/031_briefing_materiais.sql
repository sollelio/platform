-- ============================================================
-- 031 — A ficha de materiais na folha impressa do briefing.
--
-- A folha passa a levar a ficha de materiais no fim: é o que ela
-- consulta no dia, com uma caixa por linha para riscar no terreno.
--
-- O problema: /briefing/:id é rota PÚBLICA (está nos favoritos dela e
-- abre-se numa segunda janela no dia do evento, sem login), mas
-- `evento_materiais` e `materiais` estão fechadas a authenticated desde
-- a migração 021. Sem isto, a ficha só aparecia se houvesse sessão
-- naquele separador — ou seja, quase nunca no dia do evento.
--
-- A solução é a mesma de formulario_briefing (migração 020): uma função
-- security definer que devolve EXACTAMENTE o que a folha precisa e mais
-- nada. Não abre as tabelas — abre esta pergunta.
--
-- O que sai: nome, categoria, unidade, quantidade, cores, observações e
-- as três listas (carga/montagem/higienização). O que NÃO sai: stock,
-- preços, o catálogo inteiro, ou qualquer material que não esteja nesta
-- ficha. Um id de evento só revela a ficha desse evento — a mesma
-- superfície que a folha já revela.
-- ============================================================

create or replace function public.briefing_materiais(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', em.id,
        'nome', m.nome,
        'categoria', m.categoria,
        'unidade', m.unidade,
        'quantidade', em.quantidade,
        'cores', em.cores,
        'observacoes', em.observacoes,
        'lista_carga', em.lista_carga,
        'lista_montagem', em.lista_montagem,
        'lista_higienizacao', em.lista_higienizacao
      )
      order by m.categoria, m.ordem nulls last, m.nome
    ),
    '[]'::jsonb
  )
  from public.evento_materiais em
  join public.materiais m on m.id = em.material_id
  where em.submission_id = p_id;
$$;

revoke all on function public.briefing_materiais(uuid) from public;
grant execute on function public.briefing_materiais(uuid) to anon, authenticated;
