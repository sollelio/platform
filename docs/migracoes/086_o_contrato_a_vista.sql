-- ============================================================================
-- 086 · O CONTRATO À VISTA — o véu morre, e o código morre com ele
-- ============================================================================
-- A DECISÃO (Hélio, 10/08/2026, em dois tempos no mesmo dia): o CONTRATO
-- deixa de pedir código para se LER — a informação mostra-se sempre, como
-- o orçamento desde a 083 — E deixa de pedir código para se ASSINAR: a
-- posse da ligação privada é a prova, como já era do aceite do orçamento.
-- Logo que a publicação fica no ar (e o portão do sinal a deixa passar), a
-- cliente lê e assina o contrato pela ligação, com o nome escrito.
--
-- CUSTO ASSUMIDO, dito às claras: (a) o véu da 058 tapava NIF, morada,
-- contacto e contraentes a quem só tivesse a ligação na mão — passam a
-- estar à vista de quem a tem; (b) a assinatura deixa de ter a prova
-- forte do código («o código prova que é ela», 057) — fica a prova da
-- ligação: nome escrito, IP, user-agent, data e hora. É a régua da 083
-- («a posse da ligação é a prova»), agora aplicada até ao fim.
--
-- O QUE NÃO MUDA: o portão do sinal (sem sinal pago, contrato e proposta
-- não existem deste lado), condicoes_lidas_em, a guarda de versão, os
-- duplicados, o caminho do PAPEL (assinar à mão + fotografia confirmada
-- pela casa) e o próprio mecanismo do código — as RPCs de pedir/emitir/
-- verificar ficam de pé, sem chamador obrigatório.
--
-- COMO: quatro peças — as duas projecções da 083 (Parte C) reescritas
-- INTEIRAS com os deltas mínimos (o véu morre; precisa_codigo passa a
-- false; a prova do acto ganha o terceiro nome, 'ligacao'), o CHECK da
-- prova forte morre (peça 3), e dlm_portal_acto reescrita da 083 com UM
-- delta: o bloco que exigia sessão ao 'assinou' desaparece (peça 4).
--
-- Correr DEPOIS da 083 (a 084/085 não tocam nestas funções). Idempotente.
-- Primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · A projecção do documento — o véu morre ─────────────────────────────
--
-- Cópia fiel da 083 (C1), com UMA edição: o ramo `if p_tipo = 'contrato'`
-- que velava sem sessão desapareceu. `velado` fica na resposta, sempre
-- false — a folha do portal obedece a esta chave, e os ramos velados do
-- cliente passam a código adormecido, como os do orçamento desde a 083.
-- p_verificacao mantém-se na assinatura da função: a folha continua a
-- mandá-lo (é inócuo aqui, e a prova da assinatura vive na dlm_portal_acto).

create or replace function public.dlm_portal_ver_documento(
  p_token       text,
  p_tipo        text,
  p_verificacao uuid default null,
  p_versao      integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  public.portal_acessos%rowtype;
  v_pub     public.portal_publicacoes%rowtype;
  v_acto    record;
  v_velado  boolean := false;
  v_dados   jsonb;
  -- 078 · o carimbo da leitura das condições, por evento.
  v_condicoes timestamptz;
  -- 078 · o portão do sinal: sem ele, contrato e proposta não existem.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA, cedo: sem o sinal pago, o contrato e a
  -- proposta NÃO existem deste lado do portão — 'nada', indistinguível
  -- de nunca publicados, como a casa já responde aos tokens mortos. A
  -- inferência é a MESMA da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  if p_tipo in ('contrato', 'proposta') then
    select s.fase into v_fase
      from public.submissions s
     where s.id = v_acesso.submission_id;
    v_sinal_feito :=
         v_fase in ('contrato','cliente','projecto')
      or exists (select 1 from public.pagamentos p
                  where p.submission_id = v_acesso.submission_id
                    and p.origem = 'sinal');
    if not coalesce(v_sinal_feito, false) then
      return jsonb_build_object('estado', 'nada');
    end if;
  end if;

  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_acesso.submission_id and tipo = p_tipo
     and (p_versao is null or versao = p_versao)
   order by versao desc
   limit 1;
  if not found then
    return jsonb_build_object('estado', 'nada');
  end if;

  v_dados := v_pub.instantaneo;
  -- 086 · o véu morreu: o contrato sai inteiro pela ligação privada,
  -- como o orçamento desde a 083. A posse da ligação é a prova — o
  -- código ficou só onde prova alguma coisa: na assinatura.

  -- 074/086 · a NATUREZA da prova, agora com três nomes: 'papel' é a
  -- confirmação humana com fotografia (confirmado_por), 'codigo' é a
  -- sessão verificada de antes da 086, e 'ligacao' é a prova nova — a
  -- posse da ligação privada. A ordem importa: o papel tem sempre
  -- confirmado_por, e é ele que o distingue de um acto sem código.
  select acto, criado_em, nome_escrito,
         case when confirmado_por is not null then 'papel'
              when verificacao_id is not null then 'codigo'
              else 'ligacao' end
           as prova
    into v_acto
    from public.portal_actos
   where publicacao_id = v_pub.id
   order by criado_em desc
   limit 1;

  -- 078 · a leitura das condições, por EVENTO e nunca por versão. O
  -- pórtico continua a vir ANTES de tudo — o orçamento já não tem estado
  -- velado (083), mas a folha precisa na mesma de saber se foi passado.
  if p_tipo = 'orcamento' then
    select max(l.criado_em) into v_condicoes
      from public.portal_condicoes_lidas l
      join public.portal_publicacoes pp on pp.id = l.publicacao_id
     where pp.submission_id = v_acesso.submission_id
       and pp.tipo = 'orcamento';
  end if;

  return jsonb_build_object(
    'estado',       'ok',
    'tipo',         v_pub.tipo,
    'versao',       v_pub.versao,
    'publicado_em', v_pub.publicado_em,
    'velado',       v_velado,
    'instantaneo',  v_dados,
    'acto',         case when v_acto.acto is null then null
                         else jsonb_build_object(
                                'acto',   v_acto.acto,
                                'quando', v_acto.criado_em,
                                'nome',   v_acto.nome_escrito,
                                'prova',  v_acto.prova) end,
    -- 078 · null enquanto não confirmar — e aí o pórtico fecha a porta.
    'condicoes_lidas_em', v_condicoes,
    -- 074 · a assinatura da casa, para a folha mostrar os dois lados.
    'assinatura_casa', (
      select case when d.assinado_casa_em is null then null
                  else jsonb_build_object(
                         'nome',   d.assinado_casa_por,
                         'quando', d.assinado_casa_em) end
        from public.documentos d
       where d.id = v_pub.documento_id));
end
$$;
revoke all     on function public.dlm_portal_ver_documento(text, text, uuid, integer) from public;
grant  execute on function public.dlm_portal_ver_documento(text, text, uuid, integer) to anon, authenticated;


-- ─── 2 · A lista dos documentos — ninguém pede código para ler ──────────────
--
-- Cópia fiel da 083 (C2), com UMA edição: precisa_codigo passa a false
-- para todos os tipos — ler nunca pede código. O bloco `verificacao`
-- FICA: serve os ecrãs do código da ASSINATURA (o FluxoCodigo entra pelo
-- precisa_codigo da dlm_portal_acto, não por esta chave). O portão do
-- sinal fica exactamente como estava.

-- A lista dos documentos publicados: só o estado, nunca o conteúdo.
create or replace function public.dlm_portal_documentos(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.portal_acessos%rowtype;
  v_docs   jsonb;
  -- 078 · o portão do sinal, com a inferência da etapa 3 da jornada.
  v_fase        text;
  v_sinal_feito boolean;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;

  -- 078 · A REGRA DA NÁDIA: «o acompanhamento compra-se com o sinal».
  -- A MESMA inferência da etapa 3 da jornada (077); aqui não há
  -- v_sinal_em calculado, e o braço do carimbo está CONTIDO no exists —
  -- qualquer pagamento de origem 'sinal' — por isso a forma curta é a
  -- mesma regra, não uma regra parecida.
  select s.fase into v_fase
    from public.submissions s
   where s.id = v_acesso.submission_id;
  v_sinal_feito :=
       v_fase in ('contrato','cliente','projecto')
    or exists (select 1 from public.pagamentos p
                where p.submission_id = v_acesso.submission_id
                  and p.origem = 'sinal');

  select jsonb_agg(
           jsonb_build_object(
             'tipo',          u.tipo,
             'versao',        u.versao,
             'publicado_em',  u.publicado_em,
             'n_versoes',     u.n_versoes,
             -- 086 · ler nunca pede código — o código ficou só na
             -- assinatura (dlm_portal_acto). A chave fica, sempre false,
             -- para a folha não mudar de contrato.
             'precisa_codigo', false,
             'acto',          u.acto,
             'acto_em',       u.acto_em,
             'acto_nome',     u.acto_nome,
             -- O acto da VERSÃO ANTERIOR, quando a corrente ainda não tem
             -- resposta: é o que deixa dizer «a sua aceitação de 12 de
             -- Agosto fica onde está — esta versão pede uma resposta nova».
             'acto_anterior', case when u.acto is null and aa.acto is not null
               then jsonb_build_object('versao', aa.versao, 'acto', aa.acto,
                                       'acto_em', aa.criado_em)
               end
           ) order by array_position(
                       array['orcamento','proposta','contrato'], u.tipo))
    into v_docs
    from (
      select distinct on (p.tipo)
             p.tipo, p.versao, p.publicado_em, p.id,
             count(*) over (partition by p.tipo) as n_versoes,
             a.acto, a.criado_em as acto_em, a.nome_escrito as acto_nome
        from public.portal_publicacoes p
        left join lateral (
          -- o acto que conta é o último DESTA versão — versão nova, actos a zero
          select acto, criado_em, nome_escrito
            from public.portal_actos
           where publicacao_id = p.id
           order by criado_em desc
           limit 1
        ) a on true
       where p.submission_id = v_acesso.submission_id
         -- 078 · sem sinal, só o orçamento saiu da casa — os outros
         -- documentos comportam-se como se nunca publicados.
         and (v_sinal_feito or p.tipo = 'orcamento')
       order by p.tipo, p.versao desc
    ) u
    left join lateral (
      select pa.acto, pa.criado_em, pp.versao
        from public.portal_actos pa
        join public.portal_publicacoes pp on pp.id = pa.publicacao_id
       where pp.submission_id = v_acesso.submission_id
         and pp.tipo = u.tipo and pp.versao < u.versao
         and pa.acto in ('aceitou', 'assinou')
       order by pa.criado_em desc
       limit 1
    ) aa on true;

  -- O estado do código, para os ecrãs da espera e do regresso — da
  -- ASSINATURA, agora: ler já não o pede. SEM o código, claro — só o
  -- que a cliente pode saber.
  return jsonb_build_object(
    'estado', 'activo',
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'verificacao', (
      select jsonb_build_object(
               'estado', case
                 when v.usado_em is not null
                      and v.usado_em > now() - interval '60 minutes'
                   then 'sessao'
                 when v.codigo is not null and v.usado_em is null
                      and v.expira_em > now()
                   then 'emitido'
                 when v.emitido_em is null
                      and v.pedido_em > now() - interval '24 hours'
                   then 'pedido'
                 else 'nenhum'
               end,
               'pedido_em', v.pedido_em)
        from public.portal_verificacoes v
       where v.acesso_id = v_acesso.id
       order by v.pedido_em desc
       limit 1));
end
$$;

revoke all     on function public.dlm_portal_documentos(text) from public;
grant  execute on function public.dlm_portal_documentos(text) to anon, authenticated;


-- ─── 3 · O CHECK da prova forte morre ───────────────────────────────────────
--
-- A 059 exigia a cada acto uma prova forte — sessão verificada (digital)
-- ou confirmação humana com ficheiro (papel) — e a 083 abriu a excepção
-- para aceitar/pedir alteração. Com o 'assinou' também servido pela
-- ligação (086), a excepção passaria a cobrir os três actos e o CHECK
-- ficava vazio de sentido: morre por inteiro, dito às claras, em vez de
-- ficar a fingir que guarda alguma coisa. As provas que existirem —
-- sessão, papel — continuam a registar-se nas colunas de sempre.

alter table public.portal_actos
  drop constraint if exists portal_actos_tem_prova;


-- ─── 4 · dlm_portal_acto — assinar serve-se da ligação privada ──────────────
--
-- Cópia fiel da 083 (peça 2), com UMA edição: o bloco que devolvia
-- 'precisa_codigo' ao 'assinou' (sessão em falta ou código de outro
-- documento) desapareceu. A sessão — quando existir — regista-se na
-- mesma (verificacao_id no acto, a prova mais forte fica se a houver);
-- sem ela, o acto grava-se com a prova da ligação: nome escrito, IP,
-- user-agent, data e hora. Guarda de versão, duplicados, nome
-- obrigatório, carimbos em `documentos`, notificações e avanço do
-- funil: byte a byte como na 083.

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

  -- 086 · A ÚNICA alteração desta migração à função (o resto é cópia
  -- fiel da 083). Os TRÊS actos servem-se da ligação privada: a posse
  -- da ligação é a prova, e a sessão — quando existir — regista-se na
  -- mesma. O bloco que exigia código ao 'assinou' morreu com o véu.
  v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);

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

  -- 086 · Sem sessão, v_sessao.id é NULL e o acto regista-se assim — o
  -- CHECK morreu na peça 3; a prova é a da ligação, com IP e user-agent.
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

  -- 072 · TODOS os actos tocam na Caixa de Entrada. Antes só o pedido
  -- de alteração avisava; aceitar, aprovar e assinar eram silêncio — e
  -- eram precisamente os momentos em que ela quer agir na hora.
  select * into v_ev from public.submissions where id = v_acesso.submission_id;
  select c.nome into v_nome_cl from public.clientes c where c.id = v_ev.cliente_id;

  if p_acto = 'pediu_alteracao' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('pedido_alteracao',
       coalesce(v_nome_cl, 'A cliente') || ' pediu uma alteração',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'mensagem', btrim(p_mensagem)));
  elsif p_acto = 'aceitou' and p_tipo = 'orcamento' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('orcamento_aceite',
       coalesce(v_nome_cl, 'A cliente') || ' aceitou o orçamento',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'aceitou' and p_tipo = 'proposta' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('projecto_aprovado',
       coalesce(v_nome_cl, 'A cliente') || ' aprovou o projecto',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  elsif p_acto = 'assinou' then
    insert into public.notificacoes
      (tipo, titulo, submission_id, cliente_id, event_type_id, dados)
    values
      ('contrato_assinado',
       coalesce(v_nome_cl, 'A cliente') || ' assinou o contrato',
       v_ev.id, v_ev.cliente_id, v_ev.event_type_id,
       jsonb_build_object('tipo_documento', p_tipo, 'versao', v_pub.versao,
                          'nome_escrito', btrim(p_nome)));
  end if;

  -- 077 · o facto move o funil, pela ordem nova: aceite → fase sinal
  -- (50% por pagar); assinatura → fase cliente (fechado por inteiro).
  -- Nunca recua, nunca toca em perdidos, e falhar o avanço nunca falha
  -- o acto (o registo é o que importa).
  begin
    if p_acto = 'aceitou' and p_tipo = 'orcamento' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'sinal');
    elsif p_acto = 'assinou' then
      perform public.dlm_fase_avancar_ate(v_acesso.submission_id, 'cliente');
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('estado', 'ok', 'acto', p_acto, 'quando', now());
end
$$;

revoke all     on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) from public;
grant  execute on function public.dlm_portal_acto(text, text, uuid, text, text, text, integer) to anon, authenticated;


-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · O contrato sai inteiro SEM sessão nenhuma (usar um token vivo de um
--     evento com sinal pago e contrato publicado):
--       select (public.dlm_portal_ver_documento('<token>', 'contrato'))
--              ->> 'velado';                                   -- 'false'
--       select (public.dlm_portal_ver_documento('<token>', 'contrato'))
--              -> 'instantaneo' ? 'contraentes';               -- true (se o doc os tiver)
-- 2 · A lista não pede código a ninguém:
--       select jsonb_path_query_array(
--                public.dlm_portal_documentos('<token>') -> 'documentos',
--                '$[*].precisa_codigo');                       -- só false
-- 3 · ASSINAR serve-se da ligação — sem sessão nenhuma (CUIDADO: grava o
--     acto a sério e TRANCA o contrato; só em TESTE, num evento de teste):
--       select public.dlm_portal_acto('<token>', 'contrato', null,
--                                     'assinou', 'Nome De Teste')
--              ->> 'estado';                                   -- 'ok'
--     e a prova do acto diz a ligação:
--       select (public.dlm_portal_ver_documento('<token>', 'contrato'))
--              -> 'acto' ->> 'prova';                          -- 'ligacao'
-- 4 · O portão do sinal continua de pé (token de evento SEM sinal):
--       select public.dlm_portal_ver_documento('<token-sem-sinal>',
--                                              'contrato') ->> 'estado'; -- 'nada'
-- 5 · O papel continua a distinguir-se (evento com papel confirmado):
--       ... -> 'acto' ->> 'prova';                             -- 'papel'
