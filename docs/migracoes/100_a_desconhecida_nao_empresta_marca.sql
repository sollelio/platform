-- ============================================================================
-- 100 · A casa desconhecida não empresta marca
--
-- A 098 deu à identidade porta própria e a 099 pô-la a desenhar as folhas.
-- Ficou um buraco que só se vê com duas casas: `identidade_por_token`
-- devolve NULL tanto para «este token não existe» como para «a rede
-- falhou», e o CasaProvider mantém a omissão nos dois casos.
--
-- Com uma casa, invisível — a omissão É a casa. Com duas, um link morto da
-- casa B abre uma página assinada com a marca da casa A: nome, logótipo,
-- WhatsApp. Pior do que uma página sem marca, porque nomeia a empresa
-- errada a uma cliente que a reconhece.
--
-- ── AS TRÊS SITUAÇÕES, que hoje são uma ──────────────────────────────────
--
--   · A REDE FALHOU — não houve resposta. Mantém-se a identidade que já se
--     tinha: é a de ontem, e a de ontem está certa. Uma folha com o
--     cabeçalho de ontem é melhor do que uma folha sem cabeçalho.
--   · O TOKEN NÃO EXISTE — houve resposta, e diz que não há casa nenhuma.
--     Nenhuma marca. Quem escreveu mal o endereço não deve ver o nome de um
--     buffet ao acaso.
--   · O TOKEN MORREU (expirado, revogado) — a casa é CONHECIDA: o token
--     está na base e sabe-se de quem é. A marca fica. Um prazo terminado é
--     o acesso que acabou, não a casa que desapareceu — e a página que diz
--     «isto terminou» é mais humana com o nome deles do que sem (o mesmo
--     princípio da decisão de 01/08 sobre a avaliação não revogar o acesso).
--
-- A CASA SUSPENSA é o caso que se separa deste último, e de propósito:
-- suspender é cortar a presença. Tokens continuam válidos na base, mas
-- `identidade_da_casa` já filtra por `estado = 'activo'` desde a 097 — e
-- aqui devolve «desconhecida», não «conhecida sem dados».
--
-- ⚠ ESTA MIGRAÇÃO MUDA A FORMA DA RESPOSTA. As funções passam a devolver
-- {estado, casa} em vez do objecto directo. O frontend tem de ir junto —
-- ver a segunda parte, no fim do ficheiro.
-- ============================================================================

-- ── 1 · A resposta com estado ───────────────────────────────────────────────
--
-- Duas formas, e só duas. Nada de terceiro estado para «expirado»: quem
-- chama não precisa de saber porque é que o acesso acabou — a projecção do
-- portal já lho diz. Aqui a pergunta é só «de quem é esta página?».

create or replace function public.identidade_conhecida(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_tenant is null then jsonb_build_object('estado', 'desconhecida')
    else coalesce(
      (select jsonb_build_object('estado', 'conhecida', 'casa',
                public.identidade_da_casa(p_tenant))
         from public.tenants t
        where t.id = p_tenant and t.estado = 'activo'),
      -- A casa existe mas está suspensa (ou encerrada): trata-se como
      -- desconhecida. Suspender é cortar a presença, não só o acesso.
      jsonb_build_object('estado', 'desconhecida'))
  end;
$$;

revoke all on function public.identidade_conhecida(uuid) from public;

comment on function public.identidade_conhecida(uuid) is
  'A identidade envolvida em estado. `desconhecida` é resposta legítima — o front limpa a marca; ausência de resposta (rede) é outra coisa e mantém a que tinha.';

-- ── 2 · As portas, agora a dizer o que sabem ────────────────────────────────
--
-- A resolução do tenant separa-se da resposta: cada porta procura a casa e
-- entrega o que encontrou (ou nada) à `identidade_conhecida`. Um token
-- expirado ou revogado ENCONTRA a casa — é isso que muda em relação à 098,
-- onde os filtros de validade estavam dentro da consulta e faziam um token
-- morto parecer inexistente.

create or replace function public.identidade_por_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_conhecida(
    coalesce(
      -- o portal do noivo — SEM filtro de revogação ou prazo: um acesso
      -- terminado continua a ser de uma casa, e a página que o diz assina
      -- com ela.
      (select s.tenant_id
         from public.portal_acessos pa
         join public.submissions s on s.id = pa.submission_id
        where pa.token = p_token),
      -- a folha de comunicado (raiz: comunicados tem tenant_id próprio)
      (select c.tenant_id from public.comunicados c where c.token = p_token),
      -- a campanha de contribuição
      (select s.tenant_id
         from public.campanhas ca
         join public.submissions s on s.id = ca.submission_id
        where ca.token = p_token)
    )
  );
$$;

revoke all     on function public.identidade_por_token(text) from public;
grant  execute on function public.identidade_por_token(text) to anon, authenticated;

create or replace function public.identidade_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_conhecida(
    (select i.tenant_id from public.invites i
      where i.code = upper(btrim(coalesce(p_codigo, ''))))
  );
$$;

revoke all     on function public.identidade_por_codigo(text) from public;
grant  execute on function public.identidade_por_codigo(text) to anon, authenticated;

create or replace function public.identidade_da_casa_por_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_conhecida(public.tenant_por_slug(p_slug));
$$;

revoke all     on function public.identidade_da_casa_por_slug(text) from public;
grant  execute on function public.identidade_da_casa_por_slug(text) to anon, authenticated;

create or replace function public.identidade_da_minha_casa()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.identidade_conhecida(public.tenant_actual());
$$;

revoke all     on function public.identidade_da_minha_casa() from public;
grant  execute on function public.identidade_da_minha_casa() to authenticated;

-- ── 3 · O convite passa a dizer de que casa é ───────────────────────────────
--
-- O buraco honesto que ficou por fechar na 099: quem escreve o código à mão
-- (em vez de abrir o link com ?codigo=) só sabe a casa DEPOIS de validar o
-- convite — e as mensagens de erro «contacta X» saíam com o nome de
-- omissão. A projecção já devolve a linha do convite; passa a devolver
-- também a casa dela.
--
-- Cópia fiel da 093 com uma chave a mais.

create or replace function public.formulario_validar_convite(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(i)
    || jsonb_build_object(
         'event_types',
         (select jsonb_build_object(
                   'nome', et.nome, 'steps', et.steps, 'icone', et.icone)
            from event_types et
           where et.id = i.event_type_id),
         'alvo_dados',
         (select jsonb_build_object(
                   'respostas', s.respostas,
                   'data_evento', s.data_evento,
                   'numero_convidados', s.numero_convidados)
            from submissions s
           where s.id = i.submission_alvo_id),
         -- 100 · a casa do convite, para as mensagens de erro nomearem
         -- quem contactar. É a única projecção pública que leva a
         -- identidade embutida, e por uma razão: o código escrito à mão
         -- não tem outra porta por onde a pedir.
         'casa', public.identidade_da_casa(i.tenant_id)
       )
    from invites i
   where i.code = upper(btrim(p_codigo))
   limit 1
$$;

revoke all     on function public.formulario_validar_convite(text) from public;
grant  execute on function public.formulario_validar_convite(text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Token vivo → conhecida, com a casa:
--   select public.identidade_por_token(
--     (select token from portal_acessos where revogado_em is null limit 1));
--
-- 2 · Token inventado → desconhecida, SEM casa:
--   select public.identidade_por_token('nada-disto-existe');
--   -- Esperado: {"estado": "desconhecida"}
--
-- 3 · Token revogado → CONHECIDA na mesma (o delta desta migração).
--   Se não houver nenhum revogado, revogar um de teste e repor:
--   select public.identidade_por_token(
--     (select token from portal_acessos where revogado_em is not null limit 1));
--
-- 4 · Casa suspensa → desconhecida, mesmo com token vivo:
--   update tenants set estado = 'suspenso' where slug = 'doluxoamesa';
--   select public.identidade_por_token(
--     (select token from portal_acessos limit 1));
--   -- Esperado: {"estado": "desconhecida"}
--   update tenants set estado = 'activo' where slug = 'doluxoamesa';   -- ⚠ REPOR
--
-- 5 · O convite traz a casa:
--   select public.formulario_validar_convite((select code from invites limit 1))
--       -> 'casa' ->> 'nome';
--
-- 6 · A APP — com o frontend já actualizado (ver abaixo): portal, folha,
--   campanha, formulário, pedido e admin desenham com a marca certa; um
--   endereço inventado desenha SEM marca nenhuma.
-- ============================================================================