-- ============================================================================
-- 088 · O projecto publica-se com as imagens DO CLIENTE
--
-- As imagens que a Nádia põe nas secções do projecto são de TRABALHO —
-- saem no PDF que ela imprime para si, e mais nada. Para o cliente ela
-- escolhe OUTRAS: cada secção ganhou `imagemCliente` no JSONB
-- (documentos.dados.seccoes, pedido do Hélio de 10/08/2026).
--
-- O backoffice já faz a troca ao publicar (PortalDoClienteSheet envia
-- p_extra.seccoes com imagem ← imagemCliente), mas essa troca assenta
-- numa leitura DO CLIENTE, que pode estar dessincronizada dos dados que
-- a RPC congela (o rasgão apanhado na revisão adversarial). Esta
-- migração traz a troca para DENTRO do dlm_portal_publicar: as seccoes
-- do instantâneo derivam SEMPRE dos dados frescos que a própria RPC
-- lê, atomicamente — e sobrepõem o que quer que o p_extra traga.
--
-- A regra é ESTRITA, igual à do backoffice: secção sem imagemCliente
-- publica-se SEM imagem — a de trabalho nunca sai, nem por esquecimento
-- (e a chave imagemCliente é despida: o instantâneo contém exactamente
-- o que a cliente vê, nada escondido no JSON).
--
-- Redefine a RPC da 075 (que redefinira a da 057) com UM acrescento — o
-- bloco da proposta. Tudo o resto fica letra por letra.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================

create or replace function public.dlm_portal_publicar(
  p_submission_id uuid,
  p_tipo          text,
  p_extra         jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc         public.documentos%rowtype;
  v_versao      integer;
  v_instantaneo jsonb;
begin
  if p_tipo not in ('orcamento', 'proposta', 'contrato') then
    raise exception 'TIPO_INVALIDO';
  end if;

  select * into v_doc
    from public.documentos
   where tipo = p_tipo and submission_id = p_submission_id;
  if not found then
    raise exception 'SEM_DOCUMENTO: gera o documento primeiro.';
  end if;
  if v_doc.trancado_em is not null then
    raise exception 'CONTRATO_TRANCADO: está assinado; não há versões novas.';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.portal_publicacoes
   where submission_id = p_submission_id and tipo = p_tipo;

  -- O instantâneo leva os dados MAIS o texto fixo que o rodeia (cláusulas,
  -- condições), passado pelo backoffice em p_extra. Sem isto, mudar uma
  -- cláusula no código mudava um contrato já assinado — o congelamento
  -- tem de apanhar tudo o que se lê, não só o que se edita.
  v_instantaneo := coalesce(v_doc.dados, '{}'::jsonb)
                   || coalesce(p_extra, '{}'::jsonb);

  -- 088 · a proposta troca as imagens AQUI, sobre os dados frescos: cada
  -- secção sai com imagem = imagemCliente (ou vazia — regra estrita) e
  -- sem a chave imagemCliente. Deriva de v_doc.dados, nunca do p_extra:
  -- o que o backoffice enviou (o cinto de segurança pré-088) é sobreposto
  -- pela versão atómica. Seccoes em falta ou corrompidas publicam [].
  if p_tipo = 'proposta' then
    v_instantaneo := jsonb_set(
      v_instantaneo,
      '{seccoes}',
      coalesce(
        (select jsonb_agg(
                  (t.s - 'imagemCliente')
                  || jsonb_build_object(
                       'imagem', coalesce(t.s->>'imagemCliente', ''))
                )
           from jsonb_array_elements(
                  case when jsonb_typeof(v_doc.dados->'seccoes') = 'array'
                       then v_doc.dados->'seccoes'
                       else '[]'::jsonb
                  end
                ) as t(s)),
        '[]'::jsonb
      )
    );
  end if;

  insert into public.portal_publicacoes
    (submission_id, documento_id, tipo, versao, instantaneo, publicado_por)
  values
    (p_submission_id, v_doc.id, p_tipo, v_versao, v_instantaneo, auth.uid());

  -- O primeiro envio é este. Não se reescreve: enviado_em é «quando foi
  -- enviado pela primeira vez», e versões seguintes não mudam a história.
  update public.documentos
     set enviado_em = coalesce(enviado_em, now())
   where id = v_doc.id;

  -- 075 · publicar o orçamento é o facto que abre a fase comercial: o
  -- funil acompanha. Falhar aqui nunca falha a publicação.
  if p_tipo = 'orcamento' then
    begin
      perform public.dlm_fase_avancar_ate(p_submission_id, 'orcamento');
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('versao', v_versao, 'publicado_em', now());
end
$$;

revoke all     on function public.dlm_portal_publicar(uuid, text, jsonb) from public, anon;
grant  execute on function public.dlm_portal_publicar(uuid, text, jsonb) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 1 · Publicar uma proposta de teste e ver as seccoes do instantâneo:
--   select public.dlm_portal_publicar('<EVENTO_ID>'::uuid, 'proposta');
--   select versao,
--          jsonb_pretty(instantaneo->'seccoes') as seccoes
--     from public.portal_publicacoes
--    where submission_id = '<EVENTO_ID>'::uuid and tipo = 'proposta'
--    order by versao desc limit 1;
--   -- Esperado: cada secção SEM a chave "imagemCliente"; "imagem" com o
--   --           URL do cliente, ou "" nas secções em que ela não foi posta.
--   -- NUNCA pode aparecer um URL de imagem de trabalho.

-- 2 · Orçamento e contrato ficaram como estavam (a troca é só da proposta):
--   select public.dlm_portal_publicar('<EVENTO_ID>'::uuid, 'orcamento');
--   -- Esperado: instantâneo igual ao de sempre (dados || extra), e a fase
--   --           comercial avança como na 075.

-- 3 · Apagar as publicações de teste no fim.
