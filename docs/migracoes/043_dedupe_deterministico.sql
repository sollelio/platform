-- ============================================================
-- 043 — captacao_dedupe determinístico
--
-- O diagnóstico (Fase 1) e a revisão do Lote 1 notaram: os dois
-- `limit 1` do captacao_dedupe não têm ORDER BY — com dois clientes a
-- partilharem a mesma chave de telefone (o estado que os duplicados
-- históricos criam), a escolha do "cliente existente" era arbitrária
-- e podia variar entre chamadas. Passa a ser sempre o MAIS ANTIGO
-- (created_at asc) — o registo original, por convenção — nas duas
-- pesquisas (clientes.contacto e respostas dos eventos) e no evento
-- vivo da mesma data.
--
-- O dedupe ganhou um terceiro chamador no Lote 3A (createReserva, o
-- precedente da captação) — o determinismo passou de detalhe a
-- contrato.
--
-- DESACOPLADA do deploy (mesma assinatura). Uma mudança de
-- comportamento além do determinismo, deliberada: o segundo select
-- ganhou um JOIN a clientes — uma submission cujo cliente_id aponte a
-- um cliente APAGADO deixa de devolver esse id órfão (a 026 podia
-- devolvê-lo, e o chamador tentava criar eventos pendurados num morto).
-- Idempotente: CREATE OR REPLACE. Correr em TEST 2×; produção decide
-- o Hélio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.captacao_dedupe(p_digitos text, p_data date DEFAULT NULL::date)
 RETURNS TABLE(cliente_id uuid, evento_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_digitos text := right(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g'), 9);
  v_cliente uuid;
  v_evento uuid;
begin
  -- Sem dígitos suficientes, não há deduplicação possível
  if length(v_digitos) < 9 then
    return;
  end if;

  -- 1) Cliente com o mesmo telefone: compara o contacto da ficha E
  --    o numeroWhatsapp/contactoPrincipal guardados nos eventos.
  --    O mais ANTIGO ganha — é o registo original.
  select c.id into v_cliente
  from public.clientes c
  where right(regexp_replace(coalesce(c.contacto, ''), '\D', '', 'g'), 9) = v_digitos
  order by c.created_at asc, c.id asc
  limit 1;

  if v_cliente is null then
    select s.cliente_id into v_cliente
    from public.submissions s
    join public.clientes c on c.id = s.cliente_id
    where s.cliente_id is not null
      and (
        right(regexp_replace(coalesce(s.respostas->>'numeroWhatsapp', ''), '\D', '', 'g'), 9) = v_digitos
        or right(regexp_replace(coalesce(s.respostas->>'contactoPrincipal', ''), '\D', '', 'g'), 9) = v_digitos
      )
    order by c.created_at asc, c.id asc
    limit 1;
  end if;

  if v_cliente is null then
    return;
  end if;

  -- 2) Evento VIVO do mesmo cliente na mesma data (trava o duplo envio)
  --    — também determinístico: o mais antigo.
  if p_data is not null then
    select s.id into v_evento
    from public.submissions s
    where s.cliente_id = v_cliente
      and s.data_evento = p_data
      and coalesce(s.fase, '') <> 'perdido'
      and coalesce(s.status, '') <> 'Concluído'
    order by s.created_at asc, s.id asc
    limit 1;
  end if;

  cliente_id := v_cliente;
  evento_id := v_evento;
  return next;
end;
$function$;

-- O padrão da casa (034/038/042): o EXECUTE herdado dos default
-- privileges SAI e entra só quem precisa — o anon fica (o fallback da
-- captação pública em captacao.js ainda a chama diretamente do
-- browser) e o authenticated cobre a porta interna e a reserva. Os
-- wrappers SECURITY DEFINER (captacao_submeter) não precisam de grant
-- do chamador. Quando o fallback público for removido, retirar o anon.
revoke all on function public.captacao_dedupe(text, date) from public;
grant execute on function public.captacao_dedupe(text, date) to anon, authenticated;
