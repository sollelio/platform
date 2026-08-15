-- ============================================================================
-- 098 · A identidade tem porta própria
--
-- A 097 pôs a identidade na base. Falta o caminho até ao lado público — e a
-- escolha do caminho não é indiferente.
--
-- A alternativa era embutir a chave `casa` nas cinco projecções públicas
-- (dlm_portal_ver, dlm_comunicado_ver, campanha_publica,
-- formulario_validar_convite, formulario_briefing). Ficou de fora por duas
-- razões:
--
--   · A identidade é IMUTÁVEL na prática — o IBAN e o logótipo mudam uma vez
--     por ano — e as projecções mudam a cada visita. Embutida, viajaria em
--     todos os refrescares, em todas as reconferências de foco, sempre com o
--     mesmo conteúdo. Com porta própria, pede-se uma vez e fica em cache.
--     Ao contrário do que parece, é a porta própria que escala.
--   · Cinco projecções com a mesma chave são cinco sítios para manter em
--     sincronia. Já custou caro duas vezes: as três cópias da lista de tipos
--     de notificação (curadas a 10/08 com «uma lista só») e o dlm_dia_estado
--     em duas versões (095). Uma porta única é a regra da casa.
--
-- TRÊS PORTAS DE ENTRADA, três funções — nenhuma projecção é tocada:
--   · slug     → o pedido de orçamento (a 097 já deixou a função feita)
--   · token    → o portal do noivo, a folha de comunicado, a campanha
--   · código   → o formulário de convite
--
-- Nada muda no comportamento. As funções ficam no ar à espera de quem as
-- chame; quem as chama é a 099.
-- ============================================================================

-- ── 1 · Pelo token ──────────────────────────────────────────────────────────
--
-- Três tokens diferentes chegam por aqui, e o front nem sempre sabe qual
-- tem na mão — a folha de comunicado e o portal são páginas distintas, mas
-- a campanha vive num endereço com a mesma forma. Uma função que aceita os
-- três poupa ao front a pergunta.
--
-- A ordem do coalesce é a da frequência, não a da importância: o portal é o
-- caso comum e resolve à primeira.
--
-- Um token desconhecido devolve NULL, nunca a identidade de uma casa
-- qualquer. Adivinhar aqui seria mostrar o IBAN errado a quem escreveu mal
-- o endereço.

create or replace function public.identidade_por_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_da_casa(
    coalesce(
      -- o portal do noivo
      (select s.tenant_id
         from public.portal_acessos pa
         join public.submissions s on s.id = pa.submission_id
        where pa.token = p_token
          and pa.revogado_em is null
          and (pa.expira_em is null or pa.expira_em > now())),
      -- a folha de comunicado (raiz: comunicados tem tenant_id próprio)
      (select c.tenant_id
         from public.comunicados c
        where c.token = p_token
          and c.publicado_em is not null
          and c.retirado_em is null
          and (c.expira_em is null or c.expira_em > now())),
      -- a campanha de contribuição
      (select s.tenant_id
         from public.campanhas ca
         join public.submissions s on s.id = ca.submission_id
        where ca.token = p_token
          and ca.estado = 'ativa')
    )
  );
$$;

revoke all     on function public.identidade_por_token(text) from public;
grant  execute on function public.identidade_por_token(text) to anon, authenticated;

comment on function public.identidade_por_token(text) is
  'A identidade da casa a partir de qualquer token público — portal, folha ou campanha. Respeita revogação, prazo e estado: um token morto não devolve casa nenhuma.';

-- ── 2 · Pelo código do convite ──────────────────────────────────────────────
--
-- O formulário de convite (DLM-WK6Q-49TE) resolve a casa pelo prefixo — mas
-- não se lê o prefixo do texto: lê-se a linha. O convite tem tenant_id
-- desde a 090, e é essa a fonte. Partir a string seria confiar no formato.
--
-- Sem filtro por estado do convite, de propósito: um convite já preenchido
-- continua a precisar de mostrar a casa certa a quem reabre a página.

create or replace function public.identidade_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_da_casa(
    (select i.tenant_id from public.invites i
      where i.code = upper(btrim(coalesce(p_codigo, ''))))
  );
$$;

revoke all     on function public.identidade_por_codigo(text) from public;
grant  execute on function public.identidade_por_codigo(text) to anon, authenticated;

-- ── 3 · Para dentro do admin ────────────────────────────────────────────────
--
-- O backoffice também precisa dela: o gerador de orçamentos imprime o NIF e
-- o IBAN, o contrato imprime a morada e o foro, o briefing imprime o
-- slogan. Aí há sessão, e a casa vem de lá.

create or replace function public.identidade_da_minha_casa()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_da_casa(public.tenant_actual());
$$;

revoke all     on function public.identidade_da_minha_casa() from public;
grant  execute on function public.identidade_da_minha_casa() to authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Pelo token do portal (um vivo, tirado da tabela):
--   select public.identidade_por_token(
--     (select token from portal_acessos
--       where revogado_em is null limit 1));
--   -- Esperado: o objecto da Do Luxo à Mesa, com iban e logo_url
--
-- 2 · Token inventado devolve NULL, nunca uma casa qualquer:
--   select public.identidade_por_token('nada-disto-existe');
--
-- 3 · Pelo código de um convite:
--   select public.identidade_por_codigo((select code from invites limit 1));
--
-- 4 · A do admin NÃO responde no SQL Editor (auth.uid() é null lá) —
--   confirma-se na app, na 099. Aqui devolve null e está certo:
--   select public.identidade_da_minha_casa();
--
-- 5 · A APP: nada mudou. Ninguém chama estas funções ainda.
-- ============================================================================