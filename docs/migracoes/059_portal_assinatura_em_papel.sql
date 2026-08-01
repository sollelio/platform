-- ============================================================================
-- 059 · Portal — a assinatura em papel fecha o círculo
--
-- O PROBLEMA: a cliente descarrega o contrato, assina à mão, fotografa e
-- carrega. A página diz-lhe «Confirmamos e avisamos aqui» — e não havia
-- ninguém a ver. O ficheiro caía num balde privado, a notificação caía na
-- Caixa de Entrada sem ecrã que a pintasse, e o contrato ficava por assinar
-- para sempre. Era a única promessa do portal que não se cumpria.
--
-- A DECISÃO (Hélio, 01/08/2026): o papel deixa acto A SÉRIO no trilho — não
-- só carimbos. Quem assinou (o nome que está no papel), quem confirmou (a
-- Nádia), quando, e a fotografia. O portal mostra o mesmo repouso do
-- digital: «Assinado por Sofia Ramalho, a 2 de Setembro».
--
-- O QUE ISSO EXIGE: `portal_actos.verificacao_id` era NOT NULL, porque no
-- caminho digital a sessão verificada É a prova. No papel a prova é outra —
-- a folha assinada e o olho da Nádia. Passa a haver DUAS provas possíveis, e
-- um CHECK a garantir que há sempre uma.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 1 · O trilho aceita a segunda prova ────────────────────────────────────

alter table public.portal_actos
  alter column verificacao_id drop not null;

alter table public.portal_actos
  add column if not exists confirmado_por uuid,
  add column if not exists ficheiro       text;

comment on column public.portal_actos.confirmado_por is
  'Quem confirmou uma assinatura EM PAPEL (auth.uid da Nádia). No caminho '
  'digital fica NULL — lá a prova é a sessão verificada.';
comment on column public.portal_actos.ficheiro is
  'O caminho da fotografia do contrato assinado, no balde privado '
  'contratos-assinados. Só no caminho do papel.';

-- Um acto tem SEMPRE uma prova: ou a sessão verificada (digital), ou a
-- confirmação humana com o ficheiro (papel). Nunca nenhuma.
alter table public.portal_actos
  drop constraint if exists portal_actos_tem_prova;
alter table public.portal_actos
  add constraint portal_actos_tem_prova check (
    verificacao_id is not null
    or (confirmado_por is not null and ficheiro is not null)
  );


-- ─── 2 · Confirmar o papel (só a Nádia) ─────────────────────────────────────
--
-- Faz de uma vez o que o caminho digital faz: grava o acto, carimba o
-- assinado_em e TRANCA. A partir daqui o contrato não muda mais — nem no
-- backoffice, por causa do gatilho da 057.

create or replace function public.dlm_portal_confirmar_papel(
  p_submission_id uuid,
  p_nome          text,
  p_caminho       text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pub public.portal_publicacoes%rowtype;
begin
  if length(btrim(coalesce(p_nome, ''))) < 3 then
    raise exception 'NOME_EM_FALTA: escreve o nome tal como está no papel.';
  end if;

  if not exists (
    select 1 from storage.objects
     where bucket_id = 'contratos-assinados' and name = btrim(p_caminho)
  ) then
    raise exception 'FICHEIRO_NAO_ENCONTRADO';
  end if;

  -- A versão em vigor: é a que ela descarregou e assinou.
  select * into v_pub
    from public.portal_publicacoes
   where submission_id = p_submission_id and tipo = 'contrato'
   order by versao desc
   limit 1;
  if not found then
    raise exception 'SEM_CONTRATO_PUBLICADO';
  end if;

  if exists (
    select 1 from public.portal_actos
     where publicacao_id = v_pub.id and acto = 'assinou'
  ) then
    return jsonb_build_object('estado', 'ja_assinado');
  end if;

  insert into public.portal_actos
    (publicacao_id, verificacao_id, acto, nome_escrito, confirmado_por, ficheiro)
  values
    (v_pub.id, null, 'assinou', btrim(p_nome), auth.uid(), btrim(p_caminho));

  update public.documentos
     set assinado_em = coalesce(assinado_em, now()),
         trancado_em = now()
   where id = v_pub.documento_id;

  -- O aviso já foi lido: sai da Caixa de Entrada.
  update public.notificacoes
     set lida_em = coalesce(lida_em, now())
   where tipo = 'contrato_papel'
     and submission_id = p_submission_id
     and lida_em is null;

  return jsonb_build_object('estado', 'ok', 'versao', v_pub.versao);
end
$$;

revoke all     on function public.dlm_portal_confirmar_papel(uuid, text, text) from public, anon;
grant  execute on function public.dlm_portal_confirmar_papel(uuid, text, text) to authenticated;


-- ============================================================================
-- 3 · VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================

-- 3.1 · O CHECK recusa um acto sem prova nenhuma:
--   insert into portal_actos (publicacao_id, acto, nome_escrito)
--   values ('<PUB_ID>'::uuid, 'assinou', 'Teste');
--   -- Esperado: ERRO «portal_actos_tem_prova».

-- 3.2 · O caminho do papel, de ponta a ponta:
--   (a cliente carrega no portal; depois, como authenticated:)
--   select public.dlm_portal_confirmar_papel(
--            '<EVENTO_ID>'::uuid, 'Sofia Isabel Ramalho', 'papel_....jpg');
--   -- → {'estado':'ok','versao':N}
--   select acto, nome_escrito, verificacao_id, confirmado_por, ficheiro
--     from portal_actos order by criado_em desc limit 1;
--   -- verificacao_id NULL, confirmado_por preenchido, ficheiro preenchido.

-- 3.3 · E o contrato ficou trancado:
--   update documentos set dados = dados || '{"x":1}'::jsonb
--    where tipo='contrato' and submission_id='<EVENTO_ID>'::uuid;
--   -- Esperado: ERRO «DOCUMENTO_TRANCADO».

-- 3.4 · O digital continua a exigir a sua prova (a 058 não regrediu):
--   select public.dlm_portal_acto('<TOKEN>','contrato',null,'assinou','X Y');
--   -- → {'estado':'precisa_codigo'} — sem sessão não assina.
