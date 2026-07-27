-- ============================================================
-- 036 — formulario_submeter deixa de criar clientes às cegas
--
-- O bug (diagnóstico Fase 1, família convite-sem-alvo): um convite
-- criado sem submission_alvo_id caía no ramo "else", que inseria
-- SEMPRE cliente novo + evento novo, sem olhar a quem já existe.
-- Qualquer cliente já registado que preenchesse um convite órfão
-- ficava DUPLICADO (segundo cartão de cliente + segundo evento), com
-- as respostas no duplicado em vez do evento verdadeiro.
--
-- A escolha aqui é DEDUPE, não erro explícito, porque o convite sem
-- alvo é o caminho LEGÍTIMO do onboarding: clientes novos (o fluxo
-- principal da app) e clientes recorrentes com um evento novo. Um erro
-- explícito partia esse fluxo e inutilizava todos os convites
-- pendentes legítimos que já circulam.
--
--   1. Convite nascido de RESERVA sem alvo: o vínculo autoritativo é
--      reservas.submission_id — se a reserva já tem evento ligado, é
--      ESSE o alvo, nunca um palpite por telefone.
--   2. Telefone (contactoPrincipal; senão numeroWhatsapp) encontra um
--      cliente existente → REUTILIZA o cliente (não nasce segundo
--      cartão); o evento novo nasce ligado a ele (recorrência).
--   3. Sem telefone utilizável (<9 dígitos) ou sem correspondência,
--      segue como dantes: cliente novo + evento novo.
--
-- Deliberadamente NÃO se reutiliza um EVENTO encontrado por telefone
-- (ao contrário da captação): o convite é de uso único e o
-- CONVITE_JA_USADO já trava o duplo envio, por isso o merge implícito
-- só acrescentava o risco de, com um telefone partilhado (mãe,
-- organizadora), escrever as respostas de um casal por cima do evento
-- de OUTRO. Merge de evento, só com alvo explícito.
--
-- O dedupe nunca pode impedir uma submissão: qualquer erro dentro dele
-- é engolido e o fluxo continua pelo caminho antigo (o mesmo
-- compromisso do captacao_submeter).
--
-- Idempotente: CREATE OR REPLACE (preserva grants) + GRANT repetível.
-- Correr no SQL editor do projeto de TEST; correr DUAS vezes para
-- provar a idempotência. Produção só com autorização do Hélio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.formulario_submeter(
  p_codigo text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_invite invites%rowtype;
  v_resp jsonb := coalesce(p_payload -> 'respostas', '{}'::jsonb);
  v_atual jsonb;
  v_submission_id uuid;
  v_cliente_id uuid;
  v_noivo text;
  v_noiva text;
  v_nome text;
  -- O alvo efetivo da submissão: o do convite ou, para convites de
  -- reserva, o evento que a própria reserva já tem ligado.
  v_alvo uuid;
  v_tel text;
  v_hit_cliente uuid;
  v_cliente_reutilizado boolean := false;
begin
  select * into v_invite
    from invites
   where code = upper(btrim(p_codigo))
   for update;
  if not found then
    raise exception 'CONVITE_INVALIDO';
  end if;
  if v_invite.status = 'Preenchido' then
    raise exception 'CONVITE_JA_USADO';
  end if;

  v_alvo := v_invite.submission_alvo_id;

  -- Convite de reserva que perdeu (ou nunca teve) o alvo: a reserva é
  -- o vínculo autoritativo — se já tem evento ligado, é esse o alvo.
  if v_alvo is null and v_invite.reserva_id is not null then
    select r.submission_id into v_alvo
      from reservas r
     where r.id = v_invite.reserva_id;
  end if;

  if v_alvo is null then
    -- Convite sem alvo: ANTES de criar o que quer que seja, procura a
    -- PESSOA pelo telefone — o mesmo padrão do captacao_submeter.
    -- Só o cliente: o evento nunca se escolhe por palpite (ver
    -- cabeçalho), por isso o p_data vai a null.
    begin
      v_tel := dlm_txt(v_resp, 'contactoPrincipal');
      if v_tel is not null then
        select d.cliente_id
          into v_hit_cliente
          from captacao_dedupe(v_tel, null) d;
      end if;
      if v_hit_cliente is null then
        v_tel := dlm_txt(v_resp, 'numeroWhatsapp');
        if v_tel is not null then
          select d.cliente_id
            into v_hit_cliente
            from captacao_dedupe(v_tel, null) d;
        end if;
      end if;
    exception when others then
      -- O dedupe nunca trava uma submissão de cliente.
      v_hit_cliente := null;
    end;
  end if;

  if v_alvo is not null then
    -- Onboarding apontado a um evento existente: merge nas respostas
    -- (nada do que já lá vive se perde) + escrita nas colunas antigas
    -- equivalentes (dupla fonte, o mesmo padrão do drawer). Cada campo
    -- só é tocado se veio nas respostas novas; vazio grava null.
    select respostas into v_atual
      from submissions
     where id = v_alvo
     for update;
    if not found then
      raise exception 'EVENTO_ALVO_EM_FALTA';
    end if;

    update submissions set
      respostas = coalesce(v_atual, '{}'::jsonb) || v_resp,
      event_type_id = coalesce(
        dlm_safe_uuid(dlm_txt(p_payload, 'event_type_id')), event_type_id),
      data_evento = coalesce(
        dlm_safe_date(dlm_txt(p_payload, 'data_evento')), data_evento),
      -- fase NÃO é tocada (é a Nádia que a gere no funil)

      numero_convidados = case when v_resp ? 'numeroConvidados'
        then dlm_safe_int(dlm_txt(v_resp, 'numeroConvidados'))
        else numero_convidados end,

      -- texto
      nome_noivo = case when v_resp ? 'nomeNoivo' then dlm_txt(v_resp, 'nomeNoivo') else nome_noivo end,
      nome_noiva = case when v_resp ? 'nomeNoiva' then dlm_txt(v_resp, 'nomeNoiva') else nome_noiva end,
      contacto_principal = case when v_resp ? 'contactoPrincipal' then dlm_txt(v_resp, 'contactoPrincipal') else contacto_principal end,
      email = case when v_resp ? 'email' then dlm_txt(v_resp, 'email') else email end,
      morada = case when v_resp ? 'morada' then dlm_txt(v_resp, 'morada') else morada end,
      local_evento = case when v_resp ? 'localEvento' then dlm_txt(v_resp, 'localEvento') else local_evento end,
      recolha_dia_seguinte = case when v_resp ? 'recolhaDiaSeguinte' then dlm_txt(v_resp, 'recolhaDiaSeguinte') else recolha_dia_seguinte end,
      nome_responsavel = case when v_resp ? 'nomeResponsavel' then dlm_txt(v_resp, 'nomeResponsavel') else nome_responsavel end,
      contacto_responsavel = case when v_resp ? 'contactoResponsavel' then dlm_txt(v_resp, 'contactoResponsavel') else contacto_responsavel end,
      relacao_responsavel = case when v_resp ? 'relacaoResponsavel' then dlm_txt(v_resp, 'relacaoResponsavel') else relacao_responsavel end,
      estilo_outro = case when v_resp ? 'estiloOutro' then dlm_txt(v_resp, 'estiloOutro') else estilo_outro end,
      paleta_observacoes = case when v_resp ? 'paletaObservacoes' then dlm_txt(v_resp, 'paletaObservacoes') else paleta_observacoes end,
      cartoes_pratos = case when v_resp ? 'cartoesPratos' then dlm_txt(v_resp, 'cartoesPratos') else cartoes_pratos end,
      observacoes_cartoes = case when v_resp ? 'observacoesCartoes' then dlm_txt(v_resp, 'observacoesCartoes') else observacoes_cartoes end,
      descricao_mesa_noivos = case when v_resp ? 'descricaoMesaNoivos' then dlm_txt(v_resp, 'descricaoMesaNoivos') else descricao_mesa_noivos end,
      descricao_cenario = case when v_resp ? 'descricaoCenario' then dlm_txt(v_resp, 'descricaoCenario') else descricao_cenario end,
      medidas_espaco = case when v_resp ? 'medidasEspaco' then dlm_txt(v_resp, 'medidasEspaco') else medidas_espaco end,
      formato_mesas = case when v_resp ? 'formatoMesas' then dlm_txt(v_resp, 'formatoMesas') else formato_mesas end,
      observacoes_mesas = case when v_resp ? 'observacoesMesas' then dlm_txt(v_resp, 'observacoesMesas') else observacoes_mesas end,
      texto_principal_placa = case when v_resp ? 'textoPrincipalPlaca' then dlm_txt(v_resp, 'textoPrincipalPlaca') else texto_principal_placa end,
      texto_secundario_placa = case when v_resp ? 'textoSecundarioPlaca' then dlm_txt(v_resp, 'textoSecundarioPlaca') else texto_secundario_placa end,
      notas_placa = case when v_resp ? 'notasPlaca' then dlm_txt(v_resp, 'notasPlaca') else notas_placa end,
      morada_exacta = case when v_resp ? 'moradaExacta' then dlm_txt(v_resp, 'moradaExacta') else morada_exacta end,
      pessoa_abre_espaco = case when v_resp ? 'pessoaAbreEspaco' then dlm_txt(v_resp, 'pessoaAbreEspaco') else pessoa_abre_espaco end,
      contacto_pessoa_abre = case when v_resp ? 'contactoPessoaAbre' then dlm_txt(v_resp, 'contactoPessoaAbre') else contacto_pessoa_abre end,
      notas_acesso = case when v_resp ? 'notasAcesso' then dlm_txt(v_resp, 'notasAcesso') else notas_acesso end,
      observacoes_gerais = case when v_resp ? 'observacoesGerais' then dlm_txt(v_resp, 'observacoesGerais') else observacoes_gerais end,

      -- horas (time)
      hora_inicio = case when v_resp ? 'horaInicio' then dlm_safe_time(dlm_txt(v_resp, 'horaInicio')) else hora_inicio end,
      hora_termino = case when v_resp ? 'horaTermino' then dlm_safe_time(dlm_txt(v_resp, 'horaTermino')) else hora_termino end,
      hora_montagem = case when v_resp ? 'horaMontagem' then dlm_safe_time(dlm_txt(v_resp, 'horaMontagem')) else hora_montagem end,
      hora_limite_montagem = case when v_resp ? 'horaLimiteMontagem' then dlm_safe_time(dlm_txt(v_resp, 'horaLimiteMontagem')) else hora_limite_montagem end,
      hora_recolha = case when v_resp ? 'horaRecolha' then dlm_safe_time(dlm_txt(v_resp, 'horaRecolha')) else hora_recolha end,

      -- números (integer)
      numero_mesas = case when v_resp ? 'numeroMesas' then dlm_safe_int(dlm_txt(v_resp, 'numeroMesas')) else numero_mesas end,
      lugares_por_mesa = case when v_resp ? 'lugaresporMesa' then dlm_safe_int(dlm_txt(v_resp, 'lugaresporMesa')) else lugares_por_mesa end,

      -- checkboxes (text[])
      estilo_evento = case when v_resp ? 'estiloEvento' then dlm_txt_array(v_resp, 'estiloEvento') else estilo_evento end,
      paleta_cores = case when v_resp ? 'paletaCores' then dlm_txt_array(v_resp, 'paletaCores') else paleta_cores end,
      mesa_noivos = case when v_resp ? 'mesaNoivos' then dlm_txt_array(v_resp, 'mesaNoivos') else mesa_noivos end,
      cenario_palco = case when v_resp ? 'cenarioPalco' then dlm_txt_array(v_resp, 'cenarioPalco') else cenario_palco end,
      centros_mesa = case when v_resp ? 'centrosMesa' then dlm_txt_array(v_resp, 'centrosMesa') else centros_mesa end,
      tipo_flores = case when v_resp ? 'tipoFlores' then dlm_txt_array(v_resp, 'tipoFlores') else tipo_flores end,
      estilo_placa = case when v_resp ? 'estiloPlaca' then dlm_txt_array(v_resp, 'estiloPlaca') else estilo_placa end,
      acesso_local = case when v_resp ? 'acessoLocal' then dlm_txt_array(v_resp, 'acessoLocal') else acesso_local end
    where id = v_alvo;

    v_submission_id := v_alvo;

  else
    -- Sem alvo e sem evento correspondente: cliente (reutilizado ou
    -- novo) + EVENTO novo ligado (fase "cliente").
    -- Extração do nome com a prioridade da migração 011.
    v_noivo := dlm_txt(v_resp, 'nomeNoivo');
    v_noiva := dlm_txt(v_resp, 'nomeNoiva');
    v_nome := coalesce(
      nullif(concat_ws(' & ', v_noivo, v_noiva), ''),
      dlm_txt(v_resp, 'nomeDoCliente'),
      dlm_txt(v_resp, 'nomeResponsavel'),
      'Cliente sem nome');

    if v_hit_cliente is not null then
      -- O telefone encontrou a pessoa: reutiliza o cartão em vez de
      -- criar um segundo. A ficha dela não é reescrita — só o evento
      -- novo é que nasce.
      v_cliente_id := v_hit_cliente;
      v_cliente_reutilizado := true;
    else
      insert into clientes (nome, contacto, email, morada)
      values (
        v_nome,
        dlm_txt(v_resp, 'contactoPrincipal'),
        dlm_txt(v_resp, 'email'),
        dlm_txt(v_resp, 'morada'))
      returning id into v_cliente_id;
    end if;

    insert into submissions
      (cliente_id, fase, event_type_id, data_evento, numero_convidados, respostas)
    values (
      v_cliente_id,
      'cliente',
      dlm_safe_uuid(dlm_txt(p_payload, 'event_type_id')),
      dlm_safe_date(dlm_txt(p_payload, 'data_evento')),
      dlm_safe_int(dlm_txt(p_payload, 'numero_convidados')),
      v_resp)
    returning id into v_submission_id;
  end if;

  -- Marca o convite e converte a reserva de origem — na MESMA transação.
  update invites
     set status = 'Preenchido', submission_id = v_submission_id
   where id = v_invite.id;

  if v_invite.reserva_id is not null then
    update reservas
       set estado = 'Convertida', submission_id = v_submission_id
     where id = v_invite.reserva_id;
  end if;

  -- A bandeira extra é inofensiva para quem só lê o id, e deixa a UI
  -- (no futuro) dizer "reutilizei a ficha da Maria".
  return jsonb_build_object(
    'id', v_submission_id,
    'cliente_reutilizado', v_cliente_reutilizado);
end
$function$;

-- CREATE OR REPLACE preserva os grants existentes; repetir o grant é
-- inofensivo e deixa o ficheiro completo por si só.
grant execute on function public.formulario_submeter(text, jsonb) to anon, authenticated;
