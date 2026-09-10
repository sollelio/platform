-- ============================================================
-- 109 · A procura não se apaga
--
-- O Atlas da Casa (Revisão 2, aprovada a 10/09/2026) precisa de uma
-- coisa que a base ainda não sabe contar: a PROCURA — incluindo a que
-- não conseguimos servir. Hoje a fase sobrescreve-se sem rasto, um
-- perdido não tem data nem motivo, e um contacto repetido na captação
-- evapora no dedupe sem deixar sinal. Esta migração fecha os três
-- buracos com o mínimo de peças:
--
--   1 · `perdido_em` + `motivo_perda` (+ detalhe) em submissions —
--       carimbados no GESTO manual de dar por perdido (o juízo
--       continua humano, como a 075 decidiu). As outras fases já têm
--       carimbo nas tabelas de facto (portal_publicacoes,
--       portal_actos, pagamentos) — não se duplica trilho com uma
--       tabela de histórico; só o perdido estava mudo.
--
--   2 · `captacao_submeter` passa a deixar RASTO do contacto repetido:
--       quando o dedupe encontra o mesmo telefone + a mesma data num
--       evento vivo, continua a NÃO criar nada (identidade deduplica-
--       -se) — mas escreve uma nota interna no evento existente.
--       Insistência é sinal de procura, não ruído.
--
--       Nota de desenho (a pergunta do Hélio, 10/09): a mesma pessoa
--       com uma DATA DIFERENTE já cria submissão nova (clienteReuti-
--       lizado) — duas ocorrências de procura, uma pessoa. Esse
--       caminho está certo e não se toca. O único caso absorvido era
--       mesmo-telefone+mesma-data, e agora fica contado na nota.
--
--   3 · Nada de novo para apagar vs perder: a distinção é de UI
--       (RemoverEventoModal passa a propor «perder» primeiro nos
--       pré-contrato). Apagar continua reservado a registos que nunca
--       deviam ter existido — erro de introdução, teste, duplicado
--       técnico — e continua bloqueado por pagamentos/actos (FKs).
--
-- Como sempre: corre em TEST primeiro, PROD depois. O código novo do
-- funil (motivo no «Sim, perdido») assume esta migração corrida.
-- ============================================================

-- ── 1 · O carimbo e o motivo da perda ───────────────────────────────

alter table public.submissions
  add column if not exists perdido_em timestamptz,
  add column if not exists motivo_perda text,
  add column if not exists motivo_perda_detalhe text;

-- O vocabulário é curto de propósito (as 3 primeiras perdas reais
-- validam as categorias — decisão da Revisão 2); 'outro' + detalhe
-- apanha o resto sem inventar taxonomia antes do tempo.
alter table public.submissions
  drop constraint if exists submissions_motivo_perda_check;
alter table public.submissions
  add constraint submissions_motivo_perda_check
  check (
    motivo_perda is null
    or motivo_perda in ('distancia', 'preco', 'data_ocupada', 'sem_resposta', 'outro')
  );

comment on column public.submissions.perdido_em is
  '109 · Quando o evento foi dado por perdido (gesto manual). Limpa-se ao recuperar.';
comment on column public.submissions.motivo_perda is
  '109 · Porquê: distancia | preco | data_ocupada | sem_resposta | outro. O Atlas lê isto para a procura recusada por zona.';
comment on column public.submissions.motivo_perda_detalhe is
  '109 · Nota livre opcional da Nádia sobre a perda.';

-- ── 2 · O contacto repetido deixa rasto ─────────────────────────────
-- Recria a captacao_submeter da 108 com UMA adição: a nota interna no
-- evento existente quando o dedupe responde «duplicado». O resto é
-- letra por letra o corpo da 108 — quem comparar deve ver só o bloco
-- marcado «109».

create or replace function public.captacao_submeter(
  p_payload jsonb,
  p_tenant_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome     text := dlm_txt(p_payload, 'nome');
  v_contacto text := dlm_txt(p_payload, 'contacto');
  v_whatsapp text := dlm_txt(p_payload, 'whatsapp');
  v_data     date := dlm_safe_date(dlm_txt(p_payload, 'dataEvento'));
  v_tenant   uuid;
  v_numeros  text[];
  v_numero   text;
  v_hit_cliente uuid;
  v_hit_evento  uuid;
  v_cliente_id  uuid;
  v_reutilizado boolean := false;
  v_sub_id   uuid;
  v_tipo_ok  uuid;
begin
  if p_tenant_slug is null then
    v_tenant := public.tenant_actual();
  elsif auth.uid() is null then
    -- o pedido público: não há membership para confirmar
    v_tenant := public.tenant_por_slug(p_tenant_slug);
  else
    -- 108 · com sessão, o slug tem de ser de uma casa de quem pede. Sem
    -- isto, escrever à mão o slug de outra casa criava lá um interessado.
    v_tenant := public.tenant_do_pedido(p_tenant_slug);
    if v_tenant is null then
      raise exception 'CASA_ERRADA'
        using hint = 'Este endereço não pertence a nenhuma das suas casas.';
    end if;
  end if;

  if v_tenant is null then
    raise exception 'CASA_DESCONHECIDA';
  end if;
  if v_nome is null then
    raise exception 'NOME_OBRIGATORIO';
  end if;

  select et.id into v_tipo_ok
    from public.event_types et
   where et.id = dlm_safe_uuid(dlm_txt(p_payload, 'eventTypeId'))
     and et.tenant_id = v_tenant;

  select coalesce(array_agg(distinct n), '{}'::text[]) into v_numeros
    from unnest(array[v_whatsapp, v_contacto]) n
   where n is not null;

  foreach v_numero in array v_numeros loop
    v_hit_cliente := null;
    v_hit_evento  := null;
    begin
      select cliente_id, evento_id into v_hit_cliente, v_hit_evento
        from public.captacao_dedupe(v_numero, v_data, v_tenant) limit 1;
    exception when others then
      v_hit_cliente := null; v_hit_evento := null;
    end;
    if v_hit_evento is not null then
      -- 109 · O contacto repetido deixa rasto: insistência é procura.
      -- A identidade deduplica-se (nada é criado), mas a ocorrência
      -- fica contada numa nota interna do evento existente. Best-
      -- -effort de propósito: falhar a nota NUNCA falha a captação —
      -- a regra da casa é «falhar nunca falha o acto».
      begin
        insert into public.notas_evento (submission_id, tipo, corpo, autor)
        values (
          v_hit_evento,
          'interna',
          'Contacto repetido na captação ('
            || case when auth.uid() is null then 'porta pública' else 'porta interna' end
            || ') — mesmo telefone e mesma data do evento. Não foi criado pedido novo.',
          'sistema'
        );
      exception when others then
        null;
      end;
      return jsonb_build_object('id', v_hit_evento, 'duplicado', true);
    end if;
    if v_hit_cliente is not null then
      v_cliente_id := v_hit_cliente; v_reutilizado := true; exit;
    end if;
  end loop;

  if v_cliente_id is null then
    insert into public.clientes (nome, contacto, tenant_id)
    values (v_nome, v_contacto, v_tenant)
    returning id into v_cliente_id;
  end if;

  insert into public.submissions
    (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas, tenant_id)
  values (
    v_cliente_id, 'interessado', v_tipo_ok, v_data,
    dlm_safe_int(dlm_txt(p_payload, 'numeroConvidados')),
    coalesce(p_payload -> 'respostas', '{}'::jsonb), v_tenant)
  returning id into v_sub_id;

  return jsonb_build_object(
    'id', v_sub_id, 'duplicado', false, 'clienteReutilizado', v_reutilizado);
end
$$;

revoke all     on function public.captacao_submeter(jsonb, text) from public, anon;
grant  execute on function public.captacao_submeter(jsonb, text) to anon, authenticated;
