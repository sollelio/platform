-- ============================================================================
-- 096 · A disputa volta ao portal
--
-- A 095 apagou a versão de dois argumentos e deixou uma lacuna: o
-- dlm_portal_ver chama dlm_dia_estado(data, id), o terceiro argumento cai no
-- default, e o tenant_actual() devolve NULL porque o noivo não tem sessão.
-- Resultado — o ecrã do sinal passou a dizer «livre» sempre, mesmo com o dia
-- tomado. Seguro (nada vaza), mas errado: a cliente deixou de ver que a data
-- que quer já está a ser disputada.
--
-- A saída não é reescrever as trezentas linhas do dlm_portal_ver para passar
-- v_ev.tenant_id. É fazer a própria dlm_dia_estado saber deduzi-lo: o
-- p_excluir É a submissão que está a consultar o dia, e a casa dela é a casa
-- certa. Vem da base, não do browser — um p_excluir forjado só devolveria o
-- tenant do próprio evento passado, que é o escopo correcto por definição.
--
-- Assim, qualquer caminho que passe p_excluir fica com escopo certo, hoje e
-- nas chamadas que ainda não existem. Nenhuma linha do portal muda.
--
-- A ordem do coalesce é a ordem da confiança: o que foi dito explicitamente,
-- depois o que se deduz do próprio evento, e só por fim a sessão.
-- ============================================================================

create or replace function public.dlm_dia_estado(
  p_data date,
  p_excluir uuid default null,
  p_tenant uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rival  public.submissions%rowtype;
  v_nome   text;
  -- A casa: dita, deduzida, ou da sessão — por esta ordem.
  v_tenant uuid := coalesce(
    p_tenant,
    (select s.tenant_id from public.submissions s where s.id = p_excluir),
    public.tenant_actual()
  );
begin
  if p_data is null or p_data < current_date or v_tenant is null then
    return jsonb_build_object('estado', 'livre');
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and (s.fase in ('contrato', 'cliente', 'projecto')
          or exists (select 1 from public.pagamentos p
                      where p.submission_id = s.id
                        and p.origem = 'sinal'
                        and p.reconstituido = false))
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','tomado','rival_id',v_rival.id,'rival_nome',v_nome);
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and s.dia_guardado_ate is not null
     and s.dia_guardado_ate >= current_date
   order by s.dia_guardado_ate desc, s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','preferencia','rival_id',v_rival.id,
                              'rival_nome',v_nome,'ate',v_rival.dia_guardado_ate);
  end if;

  select s.* into v_rival
    from public.submissions s
   where s.tenant_id = v_tenant
     and s.data_evento = p_data
     and s.fase <> 'perdido'
     and (p_excluir is null or s.id <> p_excluir)
     and exists (select 1 from public.portal_sinal_confirmacoes psc
                  where psc.submission_id = s.id and psc.anulada_em is null)
   order by s.created_at
   limit 1;
  if found then
    select c.nome into v_nome from public.clientes c where c.id = v_rival.cliente_id;
    return jsonb_build_object('estado','em_confirmacao','rival_id',v_rival.id,'rival_nome',v_nome);
  end if;

  return jsonb_build_object('estado', 'livre');
end
$$;

-- ── O invólucro que a 093 criou e nunca foi ligado a nada ───────────────────
-- Fica sem propósito: a dedução acima faz o mesmo, sem quem chama ter de
-- saber que existe. Uma função que ninguém usa é uma mentira à espera de ser
-- lida como verdade.

drop function if exists public.dlm_portal_dia_do_evento(uuid);

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Continua a ser uma só:
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'dlm_%dia%';
--   -- Esperado: uma linha, três argumentos
--
-- 2 · A dedução funciona SEM sessão (o caso do portal). Pelo SQL Editor,
--   onde auth.uid() é null — se devolver o estado certo, o tenant veio do
--   p_excluir e não da sessão:
--     select public.dlm_dia_estado(
--       (select data_evento from submissions where data_evento >= current_date limit 1),
--       (select id from submissions where data_evento >= current_date limit 1));
--
-- 3 · A APP:
--   · admin, escolher uma data ocupada — o aviso de disputa aparece
--   · portal de um noivo com sinal por pagar e a data disputada — o ecrã
--     do sinal volta a mostrar o estado do dia
-- ============================================================================