-- ============================================================================
-- 092 · O tenant por omissão — a coluna que a 090 tornou obrigatória
--
-- A 090 pôs `not null` no tenant_id de nove tabelas e esqueceu-se do lado
-- de lá: nenhum insert no código fornece a coluna, porque até então ela não
-- existia. Resultado — criar cliente, material, convite ou comunicado passou
-- a falhar, e o formulário público de entrada com eles.
--
-- Não se detectou nos testes porque ler continua a funcionar e `update`
-- também: nenhum dos dois toca na coluna. Só o insert em tabela-raiz cai.
--
-- A saída não é tirar o `not null` — é dar-lhe um default que saiba
-- responder. Um DEFAULT em Postgres não admite subconsulta, mas admite
-- chamada de função, e é isso que se usa aqui.
--
-- ⚠ Para o anon isto NÃO chega: auth.uid() é null nas funções públicas, o
-- default devolve null, e o insert falha na mesma. É deliberado — obriga a
-- resolver o tenant explicitamente em cada caminho público, em vez de o
-- adivinhar. Vai na 093, que é urgente pela mesma razão que esta.
-- ============================================================================

create or replace function public.tenant_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and t.estado = 'activo'
   order by m.criado_em
   limit 1;
$$;

revoke all     on function public.tenant_actual() from public;
grant  execute on function public.tenant_actual() to authenticated;

comment on function public.tenant_actual() is
  'A casa da sessão actual, para servir de default. Com duas casas devolve a mais antiga — quando isso passar a acontecer a sério, o tenant tem de vir do pedido, não daqui.';

alter table public.clientes            alter column tenant_id set default public.tenant_actual();
alter table public.submissions         alter column tenant_id set default public.tenant_actual();
alter table public.materiais           alter column tenant_id set default public.tenant_actual();
alter table public.app_config          alter column tenant_id set default public.tenant_actual();
alter table public.avaliacao_eixos     alter column tenant_id set default public.tenant_actual();
alter table public.mensagens_tipo      alter column tenant_id set default public.tenant_actual();
alter table public.comunicados         alter column tenant_id set default public.tenant_actual();
alter table public.comunicado_modelos  alter column tenant_id set default public.tenant_actual();
alter table public.invites             alter column tenant_id set default public.tenant_actual();
alter table public.questionario_grupos alter column tenant_id set default public.tenant_actual();
alter table public.event_types         alter column tenant_id set default public.tenant_actual();

-- ============================================================================
-- VERIFICAÇÃO — com SESSÃO ABERTA na app, não pelo SQL Editor
-- ============================================================================
-- O editor corre como service_role: auth.uid() é null e o default devolve
-- null. Testar aqui dá falso negativo. Testar NA APP:
--   · criar um cliente        · criar um material
--   · criar um convite        · publicar um comunicado
-- E depois confirmar que ficaram carimbados:
--   select nome, tenant_id from clientes order by created_at desc limit 3;
-- ============================================================================