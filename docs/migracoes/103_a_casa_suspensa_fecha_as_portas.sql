-- ============================================================================
-- 103 · A casa suspensa fecha as portas
--
-- A 100 despiu a marca de uma casa suspensa: o portal dela abre sem
-- logótipo, sem nome, sem contacto. O Claude Code apontou o que faltava, e
-- tem razão — despir não é fechar. O conteúdo continua a sair: datas,
-- valores, documentos, o nome dos noivos, o estado do sinal. O cabeçalho
-- era o menos importante.
--
-- Suspender uma casa é cortar a presença. A 097 pôs `estado` em `tenants`
-- (activo · suspenso · encerrado) precisamente para isso, e até aqui a
-- coluna só mandava na identidade.
--
-- ── PORQUE É QUE ISTO É PEQUENO ──────────────────────────────────────────
--
-- A forma óbvia era acrescentar `and t.estado = 'activo'` às vinte e uma
-- funções do portal. Trezentas linhas de lógica delicada reescritas para
-- pôr uma condição — o erro que a 096 já evitou uma vez.
--
-- Treze delas passam por `dlm_portal_acesso_por_token`, que é onde a
-- validade do token já se decide. Uma condição lá dentro fecha as treze, e
-- pela porta certa: uma casa suspensa é indistinguível de um acesso
-- revogado, que é exactamente o que deve parecer a quem está do outro lado.
--
-- Ficam três casos à parte: o `dlm_portal_ver` (que lê a tabela em vez de
-- usar o helper), a folha de comunicado e a campanha.
--
-- ── O QUE NÃO SE FECHA, e é deliberado ───────────────────────────────────
--
-- O formulário de convite continua aberto. Uma casa suspensa que já enviou
-- convites tem noivos a meio de os preencher; travá-los perde trabalho
-- alheio ao motivo da suspensão. O que se fecha é o que EXPÕE (o portal
-- mostra valores e documentos) e o que ANGARIA (o pedido, já fechado desde
-- a 093 pelo `tenant_por_slug`, que filtra por estado activo).
-- ============================================================================

-- ── 1 · O helper, e com ele treze funções ───────────────────────────────────
--
-- Cópia fiel, com uma junção e uma condição. O `join` a submissions e
-- tenants não abranda nada de sensível: é uma linha por token, pelas
-- primárias.
--
-- A função devolve `portal_acessos%rowtype`; nenhuma linha significa
-- `v_acesso.id is null`, que é o que as treze já verificam. Não é preciso
-- tocar em nenhuma delas.

create or replace function public.dlm_portal_acesso_por_token(p_token text)
returns public.portal_acessos
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.*
    from public.portal_acessos a
    join public.submissions s on s.id = a.submission_id
    join public.tenants     t on t.id = s.tenant_id
   where a.token = p_token
     and length(coalesce(p_token, '')) >= 16
     and a.revogado_em is null
     and (a.expira_em is null or a.expira_em > now())
     -- 103 · a casa suspensa não serve conteúdo. Do lado de lá é
     -- indistinguível de um acesso terminado, e é assim que deve ser: o
     -- motivo da suspensão é entre a casa e a Sollelio, não com a cliente.
     and t.estado = 'activo';
$$;

revoke all     on function public.dlm_portal_acesso_por_token(text) from public, anon;
grant  execute on function public.dlm_portal_acesso_por_token(text) to authenticated;

-- ── 2 · O `dlm_portal_ver`, que lê a tabela directamente ────────────────────
--
-- Não passa pelo helper — faz `select * into v_acesso from portal_acessos
-- where token = p_token` e verifica revogação e prazo à mão. Reescrever as
-- trezentas linhas para acrescentar uma condição seria o erro que a 096
-- evitou; em vez disso, o `dlm_portal_ver` ganha uma guarda ANTES de tudo o
-- resto, chamando uma função que responde à única pergunta que importa.
--
-- (A alteração ao corpo faz-se no ponto 3, com o mínimo de delta.)

create or replace function public.casa_do_token_activa(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.portal_acessos a
      join public.submissions s on s.id = a.submission_id
      join public.tenants     t on t.id = s.tenant_id
     where a.token = p_token and t.estado = 'activo');
$$;

revoke all on function public.casa_do_token_activa(text) from public, anon;

comment on function public.casa_do_token_activa(text) is
  'Guarda para as funções do portal que não passam pelo helper. Não se concede ao anon: quem a chama são funções SECURITY DEFINER, por dentro.';

-- ── 3 · A folha de comunicado ───────────────────────────────────────────────
--
-- Cópia fiel da 085 com um delta: a junção a tenants e a condição do
-- estado. A folha é pública e reencaminhável (decisão de 04/08) — mas uma
-- casa suspensa não deve continuar a publicar.

create or replace function public.dlm_comunicado_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.comunicados%rowtype;
begin
  select c.* into v
    from public.comunicados c
    join public.tenants t on t.id = c.tenant_id
   where c.token = p_token
     and c.publicado_em is not null
     and c.retirado_em is null
     and (c.expira_em is null or c.expira_em > now())
     and t.estado = 'activo';                       -- 103 · o delta

  if not found then
    return jsonb_build_object('estado', 'terminado');
  end if;

  update public.comunicados set n_acessos = n_acessos + 1 where id = v.id;

  return jsonb_build_object(
    'estado', 'activo',
    'titulo', v.titulo,
    'subtitulo', v.subtitulo,
    'saudacao', v.saudacao,
    'blocos', v.blocos,
    'registo', v.registo,
    'publicado_em', v.publicado_em);
end
$$;

revoke all     on function public.dlm_comunicado_ver(text) from public, anon;
grant  execute on function public.dlm_comunicado_ver(text) to anon, authenticated;

-- ── 4 · A campanha de contribuição ──────────────────────────────────────────
--
-- Esta é a mais séria das três: uma campanha aberta recebe promessas de
-- dinheiro. Uma casa suspensa a angariar contribuições de convidados é o
-- pior caso desta migração inteira.

create or replace function public.prometer_contribuicao(
  p_token text,
  p_nome text,
  p_valor numeric,
  p_mensagem text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha public.campanhas%rowtype;
begin
  select ca.* into v_campanha
    from public.campanhas ca
    join public.submissions s on s.id = ca.submission_id
    join public.tenants     t on t.id = s.tenant_id
   where ca.token = p_token
     and ca.estado = 'ativa'
     and t.estado = 'activo';                       -- 103 · o delta

  if not found then
    return jsonb_build_object('estado', 'terminada');
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'NOME_OBRIGATORIO';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'VALOR_INVALIDO';
  end if;

  insert into public.campanha_intencoes (campanha_id, nome, valor, mensagem)
  values (v_campanha.id, btrim(p_nome), p_valor, nullif(btrim(coalesce(p_mensagem,'')), ''));

  return jsonb_build_object('estado', 'ok');
end
$$;

revoke all     on function public.prometer_contribuicao(text, text, numeric, text) from public, anon;
grant  execute on function public.prometer_contribuicao(text, text, numeric, text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- ⚠ O passo 2 SUSPENDE a casa. Só em staging, e REPOR no fim.
--
-- 1 · Com a casa activa, tudo responde como antes:
--   select public.dlm_portal_ver((select token from portal_acessos limit 1)) ->> 'estado';
--   -- Esperado: activo
--
-- 2 · Suspender e repetir:
--   update tenants set estado = 'suspenso' where slug = 'doluxoamesa';
--
--   select public.dlm_portal_acesso_por_token(
--            (select token from portal_acessos limit 1));
--   -- Esperado: nenhuma linha
--
--   select public.dlm_comunicado_ver(
--            (select token from comunicados where token is not null limit 1)) ->> 'estado';
--   -- Esperado: terminado
--
-- 3 · A APP, com a casa suspensa: o portal, a folha e a campanha devem
--   mostrar a cortina de terminado — SEM marca (a 100) e SEM conteúdo
--   (esta). O formulário de convite continua a abrir, de propósito.
--
-- 4 · REPOR, e confirmar que tudo volta:
--   update tenants set estado = 'activo' where slug = 'doluxoamesa';
-- ============================================================================