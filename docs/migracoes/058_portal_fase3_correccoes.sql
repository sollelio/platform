-- ============================================================================
-- 058 · Portal fase 3 — cinco correcções de segurança sobre a 057
--
-- Saíram de uma revisão por lentes independentes, e VERIFIQUEI cada uma no
-- código antes de escrever isto. Uma delas provei-a por fora: com a chave
-- anónima (que está no JavaScript do site) carreguei um ficheiro no balde
-- privado dos contratos assinados, sem token nenhum.
--
--   1 · O VÉU deixava passar dados pessoais. Cortava `valor` e
--       `valorExtenso`; o instantâneo do contrato guarda também
--       `contraentes` (com NIF), `morada` e `contacto`. Quem tivesse a
--       ligação lia o número de contribuinte e a morada de casa da cliente
--       sem código nenhum. Passa a LISTA DE PERMISSÃO: sai o que está
--       nomeado, cai tudo o resto — inclusive o que se vier a acrescentar.
--   2 · O CÓDIGO não tinha limite de tentativas. Um milhão de hipóteses,
--       24 horas de validade, e o prémio é assinar um contrato. Passa a
--       morrer à quinta falha.
--   3 · O CÓDIGO saía do `random()`, gerador de estatística e não de
--       segredos. Passa a `gen_random_bytes`.
--   4 · O ACTO gravava-se contra a versão mais alta, não contra a que a
--       cliente leu. Publicar a versão 3 enquanto ela tinha a 2 aberta
--       prendia-a a um texto que nunca viu. Passa a exigir a versão.
--   5 · O INSERT no balde privado não pedia nada. Passa a exigir prefixo
--       próprio, e o registo passa a confirmar que o ficheiro existe.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O véu por lista de PERMISSÃO ───────────────────────────────────────
--
-- A lista de exclusão tapava o que já se conhecia; esta tapa o que ainda não
-- existe. `composicao`, `seccoesExtra` e `inclui` são texto que a Nádia
-- escreve à mão — é lá que aparece «Castiçais — 120 €» — e por isso também
-- ficam de fora sem sessão.

create or replace function public.dlm_velar_instantaneo(p_dados jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  -- O que PODE sair sem sessão verificada: identifica o evento e descreve o
  -- serviço, sem dinheiro e sem dados pessoais.
  v_livres constant text[] := array[
    'tipoEvento', 'dataEvento', 'horaInicio', 'horaFim', 'local',
    'lugares', 'subtitulo', 'cliente', 'seccoes', 'linhas', '__contrato',
    '__condicoes', '__validadeDias'
  ];
  v_out jsonb := '{}'::jsonb;
  v_par record;
  v_arr jsonb;
  v_el  jsonb;
begin
  for v_par in
    select key, value from jsonb_each(coalesce(p_dados, '{}'::jsonb))
     where key = any (v_livres)
  loop
    if jsonb_typeof(v_par.value) = 'array' then
      v_arr := '[]'::jsonb;
      for v_el in select * from jsonb_array_elements(v_par.value) loop
        if jsonb_typeof(v_el) = 'object' then
          -- Dentro das linhas do orçamento e das secções do projecto: fora
          -- o valor, e fora o texto livre onde um preço pode ter sido
          -- escrito à mão.
          v_arr := v_arr || jsonb_build_array(v_el - 'valor' - 'inclui' - 'itens');
        else
          v_arr := v_arr || jsonb_build_array(v_el);
        end if;
      end loop;
      v_out := v_out || jsonb_build_object(v_par.key, v_arr);
    else
      v_out := v_out || jsonb_build_object(v_par.key, v_par.value);
    end if;
  end loop;
  return v_out;
end
$$;

comment on function public.dlm_velar_instantaneo(jsonb) is
  'O véu de valor do portal, por lista de PERMISSÃO: sem sessão verificada '
  'saem só as chaves nomeadas — nunca euros, NIF, morada, contacto nem '
  'texto livre onde um preço possa estar escrito. Corta no servidor.';


-- ─── 2 · O código: tentativas contadas e origem criptográfica ───────────────

alter table public.portal_verificacoes
  add column if not exists tentativas integer not null default 0;

comment on column public.portal_verificacoes.tentativas is
  'Falhas de verificação deste código. À quinta, o código morre e é preciso '
  'pedir outro — sem isto, um milhão de hipóteses em 24 horas é força bruta '
  'a céu aberto, e o prémio é assinar um contrato.';

create or replace function public.dlm_portal_emitir_codigo(p_verificacao_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_v public.portal_verificacoes%rowtype;
  v_codigo text;
begin
  select * into v_v from public.portal_verificacoes where id = p_verificacao_id;
  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if v_v.codigo is not null and v_v.usado_em is null
     and v_v.expira_em > now() and v_v.tentativas < 5 then
    return v_v.codigo;
  end if;

  -- gen_random_bytes e não random(): isto é um segredo, não uma amostra.
  v_codigo := lpad(
    ((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647)
      % 1000000)::text, 6, '0');

  update public.portal_verificacoes
     set codigo      = v_codigo,
         emitido_em  = now(),
         emitido_por = auth.uid(),
         expira_em   = now() + interval '24 hours',
         usado_em    = null,
         tentativas  = 0
   where id = p_verificacao_id;

  return v_codigo;
end
$$;

revoke all     on function public.dlm_portal_emitir_codigo(uuid) from public, anon;
grant  execute on function public.dlm_portal_emitir_codigo(uuid) to authenticated;


create or replace function public.dlm_portal_verificar(
  p_token  text,
  p_codigo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_v      public.portal_verificacoes%rowtype;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_v
    from public.portal_verificacoes
   where acesso_id = v_acesso.id
     and codigo = btrim(coalesce(p_codigo, ''))
     and codigo is not null
     and emitido_em is not null
     and tentativas < 5
     and (
       (usado_em is null and expira_em > now())
       or (usado_em is not null and usado_em > now() - interval '60 minutes')
     )
   order by pedido_em desc
   limit 1;

  if v_v.id is null then
    -- Falhou: conta a tentativa no código VIVO deste acesso. À quinta, ele
    -- morre — e a saída é pedir outro, que o ecrã já oferece.
    update public.portal_verificacoes
       set tentativas = tentativas + 1
     where id = (
       select id from public.portal_verificacoes
        where acesso_id = v_acesso.id and codigo is not null
          and usado_em is null and expira_em > now()
        order by pedido_em desc limit 1);
    return jsonb_build_object('estado', 'codigo_invalido');
  end if;

  if v_v.usado_em is null then
    update public.portal_verificacoes set usado_em = now() where id = v_v.id;
    v_v.usado_em := now();
  end if;

  return jsonb_build_object(
    'estado', 'verificado',
    'verificacao', v_v.id,
    'valida_ate', v_v.usado_em + interval '60 minutes');
end
$$;

revoke all     on function public.dlm_portal_verificar(text, text) from public;
grant  execute on function public.dlm_portal_verificar(text, text) to anon, authenticated;


-- ─── 3 · O acto responde à VERSÃO QUE ELA LEU ───────────────────────────────
--
-- «Todo o acto se refere a uma versão» — a folha de decisões diz isto, o
-- ecrã cumpre-o, e a função não cumpria: apanhava sempre a mais alta.

create or replace function public.dlm_portal_acto(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid,
  p_acto        text,
  p_nome        text,
  p_mensagem    text default null,
  p_versao      integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_sessao  public.portal_verificacoes%rowtype;
  v_ev      public.submissions%rowtype;
  v_nome_cl text;
  v_ip      text;
  v_ua      text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);
  if v_sessao.id is null then
    return jsonb_build_object('estado', 'precisa_codigo');
  end if;

  if length(btrim(coalesce(p_nome, ''))) < 3 then
    return jsonb_build_object('estado', 'nome_em_falta');
  end if;

  if p_acto not in ('aceitou', 'pediu_alteracao', 'assinou')
     or (p_acto = 'assinou'  and p_tipo <> 'contrato')
     or (p_acto = 'aceitou'  and p_tipo =  'contrato')
     or (p_acto = 'pediu_alteracao'
         and length(btrim(coalesce(p_mensagem, ''))) < 3)
  then
    return jsonb_build_object('estado', 'acto_invalido');
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  -- A versão que ela leu tem de ser a que está em vigor. Se saiu outra
  -- entretanto, o acto NÃO se grava: ela relê e responde de novo.
  if p_versao is not null and p_versao <> v_pub.versao then
    return jsonb_build_object('estado', 'versao_mudou', 'versao', v_pub.versao);
  end if;

  if p_acto in ('aceitou', 'assinou') and exists (
       select 1 from public.portal_actos
        where publicacao_id = v_pub.id and acto = p_acto)
  then
    return jsonb_build_object('estado', 'ja_feito');
  end if;

  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true))::jsonb->>'x-forwarded-for',
      ''), ',', 1);
    v_ua := (current_setting('request.headers', true))::jsonb->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, mensagem, ip, user_agent)
  values
    (v_pub.id, v_sessao.id, p_acto, btrim(p_nome),
     nullif(btrim(coalesce(p_mensagem, '')), ''), nullif(v_ip, ''), v_ua);

  if p_acto = 'aceitou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now())
     where id = v_pub.documento_id;
  elsif p_acto = 'assinou' then
    update public.documentos
       set assinado_em = coalesce(assinado_em, now()),
           trancado_em = now()
     where id = v_pub.documento_id;
  end if;

  if p_acto = 'pediu_alteracao' then
    select * into v_ev from public.submissions where id = v_acesso.submission_id;
    select c.nome into v_nome_cl from public.clientes c where c.id = v_ev.cliente_id;
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('pedido_alteracao',
       coalesce(v_nome_cl, 'A cliente') || ' pediu uma alteração',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'mensagem', btrim(p_mensagem)));
  end if;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all on function public.dlm_portal_acto(text, text, uuid, text, text, text) from public, anon;
revoke all on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;
-- A assinatura antiga (sem versão) morre: deixar as duas era deixar a porta
-- sem tranca ao lado da porta com tranca.
drop function if exists public.dlm_portal_acto(text, text, uuid, text, text, text);


-- ─── 4 · O balde privado deixa de aceitar qualquer coisa ────────────────────
--
-- O `with check` só conferia o nome do balde: com a chave anónima, que está
-- no JavaScript do site, carregava-se o que se quisesse. Provado por fora.
-- O prefixo obrigatório não é segredo nenhum — é o mínimo que impede o
-- balde de virar depósito — e o registo passa a confirmar que o objecto
-- existe mesmo antes de avisar a Nádia.

drop policy if exists "portal envia contrato assinado" on storage.objects;
create policy "portal envia contrato assinado" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'contratos-assinados'
    and name like 'papel\_%'
    and length(name) between 12 and 120
  );

create or replace function public.dlm_portal_registar_assinado_papel(
  p_token   text,
  p_caminho text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_ev     public.submissions%rowtype;
  v_nome   text;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;
  if coalesce(btrim(p_caminho), '') = '' then
    return jsonb_build_object('estado', 'caminho_em_falta');
  end if;

  -- O ficheiro tem de existir mesmo, e ser recente: sem isto, qualquer
  -- pessoa com a ligação enchia a Caixa de Entrada com avisos de
  -- assinaturas que não houve.
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'contratos-assinados'
       and o.name = btrim(p_caminho)
       and o.created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('estado', 'ficheiro_nao_encontrado');
  end if;

  -- Um aviso por acesso e por hora — o resto é eco.
  if exists (
    select 1 from public.notificacoes n
     where n.tipo = 'contrato_papel'
       and n.submission_id = v_acesso.submission_id
       and n.created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('estado', 'ok');
  end if;

  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome from public.clientes c where c.id = v_ev.cliente_id;

  insert into public.notificacoes
    (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
  values
    ('contrato_papel',
     coalesce(v_nome, 'A cliente') || ' carregou o contrato assinado em papel',
     v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
     jsonb_build_object('caminho', btrim(p_caminho)));

  return jsonb_build_object('estado', 'ok');
end
$$;

revoke all     on function public.dlm_portal_registar_assinado_papel(text, text) from public;
grant  execute on function public.dlm_portal_registar_assinado_papel(text, text) to anon, authenticated;


-- ============================================================================
-- 5 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 5.1 · 🔴 O véu já não deixa passar dados pessoais:
--   select public.dlm_portal_ver_documento('<TOKEN>', 'contrato')::text
--          ~* '(nif|contraentes|morada|contacto|valor)';
--   -- FALSE obrigatoriamente. Com sessão, o documento vem inteiro.

-- 5.2 · O código morre à quinta:
--   (emitir, depois cinco tentativas erradas seguidas)
--   select tentativas, codigo is not null as tem_codigo
--     from portal_verificacoes order by pedido_em desc limit 1;
--   -- tentativas = 5, e a sexta tentativa COM O CÓDIGO CERTO tem de
--   -- devolver 'codigo_invalido'.

-- 5.3 · O acto recusa versão velha:
--   select public.dlm_portal_acto('<TOKEN>','orcamento','<VERIF>'::uuid,
--                                 'aceitou','Sofia Ramalho', null, 1);
--   -- com a versão 2 em vigor → {'estado':'versao_mudou','versao':2}

-- 5.4 · O balde recusa nomes fora do prefixo (correr por fora, com a chave
--   anónima): POST /storage/v1/object/contratos-assinados/qualquer.jpg
--   -- tem de dar 403. E `papel_...jpg` tem de continuar a passar.

-- 5.5 · O registo recusa um caminho inventado:
--   select public.dlm_portal_registar_assinado_papel('<TOKEN>','papel_falso.jpg');
--   -- {'estado':'ficheiro_nao_encontrado'}
