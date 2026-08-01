-- ============================================================================
-- 060 · Portal — correcções ao caminho do papel (revisão da 059)
--
-- Uma revisão às cegas à 059 encontrou três coisas. Nenhuma se via a testar:
-- todas precisam de duas fotografias, ou de uma versão nova publicada no
-- meio, ou de duas mãos ao mesmo tempo.
--
-- 1 · O ACTO GRAVAVA-SE CONTRA A VERSÃO MAIS ALTA. A 059 escolhia a
--     publicação com `order by versao desc limit 1` — a mais recente AGORA.
--     Se a Nádia publicou o contrato v3 depois de a cliente ter descarregado
--     e assinado o v2, ficava registado que ela assinou um texto que nunca
--     viu. É exactamente a regressão que a 058 §3 tinha corrigido no caminho
--     digital, a reaparecer pela porta do papel.
--
-- 2 · O CAMINHO DA FOTOGRAFIA VINHA DO CLIENTE. A função aceitava um
--     `p_caminho` qualquer e confirmava-o desde que existisse no balde.
--     Agora recebe o ID DO AVISO e vai buscar lá tudo — o caminho, o evento,
--     e o momento. O momento é o que resolve o ponto 1.
--
-- 3 · A SEGUNDA FOTOGRAFIA NÃO CHEGAVA. A 058 suprime avisos repetidos na
--     mesma hora (para a Caixa de Entrada não encher). Efeito não previsto:
--     a cliente carrega uma fotografia tremida, carrega logo a boa, e a
--     Nádia confirma contra a tremida — o aviso continuava a apontar para a
--     primeira. Agora o aviso ACTUALIZA-SE para a última, e volta a ficar
--     por ler, porque é informação nova.
--
-- E uma tranca a sério: um índice único a impedir dois «assinou» na mesma
-- publicação. O `if exists` da 059 é verificar-e-depois-inserir — entre a
-- verificação e o insert cabe outra transacção.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · Um «assinou» por publicação, garantido pelo índice ─────────────────
--
-- Se isto falhar, é porque já há duplicados. Ver com:
--   select publicacao_id, count(*) from portal_actos
--    where acto = 'assinou' group by 1 having count(*) > 1;

create unique index if not exists portal_actos_um_assinou_por_publicacao
  on public.portal_actos (publicacao_id)
  where acto = 'assinou';

comment on index public.portal_actos_um_assinou_por_publicacao is
  'Uma assinatura por versão, ao nível da base. O IF EXISTS das funções é '
  'cortesia; a tranca é esta.';


-- ─── 2 · O aviso do papel aponta sempre para a ÚLTIMA fotografia ────────────

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
  v_antigo public.notificacoes%rowtype;
begin
  v_acesso := public.dlm_portal_acesso_por_token(p_token);
  if v_acesso.id is null then
    return jsonb_build_object('estado', 'terminado');
  end if;
  if coalesce(btrim(p_caminho), '') = '' then
    return jsonb_build_object('estado', 'caminho_em_falta');
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'contratos-assinados'
       and o.name = btrim(p_caminho)
       and o.created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('estado', 'ficheiro_nao_encontrado');
  end if;

  -- Já havia aviso desta hora? Então não se cria outro — ACTUALIZA-SE, para
  -- apontar à fotografia mais recente. Voltar a pô-lo por ler é de propósito:
  -- chegou coisa nova, e a Nádia tem de a ver antes de confirmar.
  select * into v_antigo
    from public.notificacoes
   where tipo = 'contrato_papel'
     and submission_id = v_acesso.submission_id
     and created_at > now() - interval '1 hour'
   order by created_at desc
   limit 1;

  if found then
    update public.notificacoes
       set dados   = coalesce(dados, '{}'::jsonb)
                     || jsonb_build_object('caminho', btrim(p_caminho)),
           lida_em = null
     where id = v_antigo.id;
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


-- ─── 3 · Confirmar pelo AVISO, não por um caminho solto ─────────────────────

drop function if exists public.dlm_portal_confirmar_papel(uuid, text, text);

create or replace function public.dlm_portal_confirmar_papel(
  p_notificacao_id uuid,
  p_nome           text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_not     public.notificacoes%rowtype;
  v_caminho text;
  v_pub     public.portal_publicacoes%rowtype;
begin
  if length(btrim(coalesce(p_nome, ''))) < 3 then
    raise exception 'NOME_EM_FALTA: escreva o nome tal como está no papel.';
  end if;

  select * into v_not
    from public.notificacoes
   where id = p_notificacao_id and tipo = 'contrato_papel';
  if not found then
    raise exception 'AVISO_NAO_ENCONTRADO';
  end if;

  v_caminho := btrim(coalesce(v_not.dados->>'caminho', ''));
  if v_caminho = '' then
    raise exception 'FICHEIRO_NAO_ENCONTRADO';
  end if;
  if not exists (
    select 1 from storage.objects
     where bucket_id = 'contratos-assinados' and name = v_caminho
  ) then
    raise exception 'FICHEIRO_NAO_ENCONTRADO';
  end if;

  -- A VERSÃO CERTA: a que estava em vigor quando ela carregou a fotografia,
  -- não a mais alta de hoje. Se a Nádia publicou outra entretanto, o acto
  -- fica preso à que a cliente teve mesmo na mão.
  select * into v_pub
    from public.portal_publicacoes
   where submission_id = v_not.submission_id
     and tipo = 'contrato'
     and publicado_em <= v_not.created_at
   order by versao desc
   limit 1;

  if not found then
    -- Carregou antes de haver publicação registada (dados antigos): fica a
    -- primeira, que é a mais próxima da verdade que se consegue afirmar.
    select * into v_pub
      from public.portal_publicacoes
     where submission_id = v_not.submission_id and tipo = 'contrato'
     order by versao asc
     limit 1;
  end if;
  if not found then
    raise exception 'SEM_CONTRATO_PUBLICADO';
  end if;

  if exists (
    select 1 from public.portal_actos
     where publicacao_id = v_pub.id and acto = 'assinou'
  ) then
    -- Já assinado: o aviso sai da Caixa de Entrada na mesma, senão ficava
    -- lá para sempre a pedir uma coisa que já está feita.
    update public.notificacoes set lida_em = coalesce(lida_em, now())
     where id = v_not.id;
    return jsonb_build_object('estado', 'ja_assinado', 'versao', v_pub.versao);
  end if;

  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, confirmado_por, ficheiro)
  values
    (v_pub.id, null, 'assinou', btrim(p_nome), auth.uid(), v_caminho);

  update public.documentos
     set assinado_em = coalesce(assinado_em, now()),
         trancado_em = now()
   where id = v_pub.documento_id;

  update public.notificacoes
     set lida_em = coalesce(lida_em, now())
   where tipo = 'contrato_papel'
     and submission_id = v_not.submission_id
     and lida_em is null;

  return jsonb_build_object('estado', 'ok', 'versao', v_pub.versao);
end
$$;

revoke all     on function public.dlm_portal_confirmar_papel(uuid, text) from public, anon;
grant  execute on function public.dlm_portal_confirmar_papel(uuid, text) to authenticated;


-- ============================================================================
-- 4 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 4.1 · A versão certa quando saiu contrato novo pelo meio.
--   Publique o contrato (v1). Carregue a fotografia pelo portal. DEPOIS
--   publique o contrato outra vez (v2). Só então confirme:
--     select public.dlm_portal_confirmar_papel('<AVISO_ID>'::uuid, 'Sofia Ramalho');
--   -- Esperado: {'estado':'ok','versao':1}  ← NÃO 2.

-- 4.2 · A segunda fotografia substitui a primeira no aviso.
--   Carregue duas fotografias seguidas pelo portal (menos de uma hora).
--     select id, dados->>'caminho', lida_em from notificacoes
--      where tipo='contrato_papel' and submission_id='<EVENTO>'::uuid;
--   -- Esperado: UMA linha, com o caminho da SEGUNDA, e lida_em a NULL.

-- 4.3 · A tranca do índice.
--   insert into portal_actos (publicacao_id, verificacao_id, acto, nome_escrito,
--                             confirmado_por, ficheiro)
--   values ('<PUB_JA_ASSINADA>'::uuid, null, 'assinou', 'Outro', auth.uid(), 'x');
--   -- Esperado: ERRO de índice único (23505).

-- 4.4 · A assinatura por um caminho solto já não é possível:
--   select public.dlm_portal_confirmar_papel('<AVISO_ID>'::uuid, 'Ab');
--   -- Esperado: ERRO «NOME_EM_FALTA» (e não um acto gravado).
