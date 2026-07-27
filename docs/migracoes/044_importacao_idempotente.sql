-- ============================================================
-- 044 — importar_cliente idempotente (reimportar deixa de duplicar)
--
-- O bug (diagnóstico Fase 1, família importar_cliente-nao-idempotente,
-- confirmado pelo próprio cabeçalho do executar.js: «NÃO é idempotente:
-- reimportar o mesmo ficheiro duplica dados»): a única proteção contra
-- uma reimportação era o ecrã bloquear o botão — estado React que
-- morre num refresh. Reimportar duplicava eventos, documentos,
-- convites e pagamentos reconstituídos de uma carteira inteira.
--
-- A correção, DENTRO da transação da RPC:
--   • IDEMPOTÊNCIA por evento: um evento do payload cujo trio
--     (cliente, data_evento, event_type) já exista na BD é SALTADO por
--     inteiro — com os seus documentos, convite e pagamentos — e
--     contado no relatório ('eventos_saltados'). Reimportar o mesmo
--     ficheiro passa a ser um no-op visível, não uma duplicação.
--     (Dois eventos LEGÍTIMOS do mesmo cliente, mesma data e mesmo
--     tipo no MESMO ficheiro: o segundo também é saltado — o relatório
--     di-lo, e ajusta-se a data no ficheiro se for mesmo outro evento.)
--   • BLINDAGEM fase/status (nota da revisão do 2A): o jsonb base do
--     evento ganha o par neutro válido ('interessado'/'Recebido') —
--     o registo do app sobrepõe-no sempre; um chamador direto que
--     omita os campos deixa de rebentar no NOT NULL da 040 com um
--     23502 por traduzir.
--
-- ⚠ ORDEM: correr a 044 ANTES ou JUNTO do deploy — o código novo lê
-- 'eventos_saltados' (sem a 044 mostra 0 e a reimportação continua a
-- duplicar). BD nova + código antigo é segura (a chave extra é
-- ignorada e a guarda fica ativa na mesma).
--
-- ENDURECIMENTO de permissões, deliberado: a 028 não tinha grants —
-- a função ficou com o EXECUTE default a PUBLIC, ou seja, o ANON podia
-- chamar importar_cliente. Passa a só authenticated (o separador
-- Importar vive atrás de login real).
--
-- Idempotente (a migração, além da função): CREATE OR REPLACE, mesma
-- assinatura. Correr em TEST 2×; produção decide o Hélio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.importar_cliente(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_cliente_id uuid;
  v_evento jsonb;
  v_doc jsonb;
  v_submission_id uuid;
  v_valor numeric;
  v_fase text;
  v_pagamento_final boolean;
  v_data_evento date;
  v_previsto_sinal_id uuid;
  v_previsto_remanescente_id uuid;
  n_eventos int := 0;
  n_docs int := 0;
  n_forms int := 0;
  n_pagamentos int := 0;
  n_saltados int := 0;
begin
  if nullif(payload->>'cliente_existente_id', '') is not null then
    v_cliente_id := (payload->>'cliente_existente_id')::uuid;
  else
    insert into clientes
    select * from jsonb_populate_record(
      null::clientes,
      public._ajustar_registo(
        'public.clientes'::regclass,
        jsonb_build_object('id', gen_random_uuid(), 'created_at', now())
          || (payload->'cliente')
      )
    )
    returning id into v_cliente_id;
  end if;

  for v_evento in
    select value from jsonb_array_elements(coalesce(payload->'eventos', '[]'::jsonb))
  loop
    -- IDEMPOTÊNCIA (044): o mesmo trio cliente+data+tipo não entra
    -- duas vezes — salta o evento INTEIRO (documentos, convite e
    -- pagamentos incluídos) e conta-o para o relatório.
    -- SÓ com data preenchida: sem data não há chave natural confiável,
    -- e o IS NOT DISTINCT FROM em (null, null) saltaria um segundo
    -- evento LEGÍTIMO sem data do mesmo cliente (o prompt de migração
    -- manda deixar null o que os documentos não dizem).
    if nullif(v_evento->'registo'->>'data_evento', '') is not null
       and exists (
      select 1 from submissions s
       where s.cliente_id = v_cliente_id
         and s.data_evento =
             nullif(v_evento->'registo'->>'data_evento', '')::date
         and s.event_type_id is not distinct from
             nullif(v_evento->'registo'->>'event_type_id', '')::uuid
    ) then
      n_saltados := n_saltados + 1;
      continue;
    end if;

    insert into submissions
    select * from jsonb_populate_record(
      null::submissions,
      public._ajustar_registo(
        'public.submissions'::regclass,
        jsonb_build_object(
          'id', gen_random_uuid(),
          'created_at', now(),
          'cliente_id', v_cliente_id,
          -- Blindagem (2A/040): par neutro VÁLIDO por baixo — o
          -- registo do app sobrepõe sempre; um chamador que omita os
          -- campos já não insere NULL contra o NOT NULL.
          'fase', 'interessado',
          'status', 'Recebido'
          -- strip_nulls: um "fase": null EXPLÍCITO no registo
          -- sobreporia o default do base e ressuscitava o 23502; para
          -- colunas nullable, chave ausente e null dão o mesmo — e no
          -- respostas, null lê-se igual a ausente (a regra da casa).
        ) || jsonb_strip_nulls(v_evento->'registo')
      )
    )
    returning id, valor_acordado, fase, pagamento_final, data_evento
      into v_submission_id, v_valor, v_fase, v_pagamento_final, v_data_evento;
    n_eventos := n_eventos + 1;

    -- Plano + dinheiro reconstituído (mesma regra da 027, sem data —
    -- ver nota acima)
    if v_valor > 0 then
      insert into pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
      values (v_submission_id, 'Sinal (50%)', round(v_valor / 2, 2), null, 1)
      returning id into v_previsto_sinal_id;

      insert into pagamentos_previstos (submission_id, descricao, valor, data_limite, ordem)
      values (
        v_submission_id,
        'Remanescente (50%)',
        round(v_valor / 2, 2),
        case when v_data_evento is not null then v_data_evento - interval '2 days' else null end,
        2
      )
      returning id into v_previsto_remanescente_id;

      if v_fase in ('cliente', 'projecto', 'contrato') then
        insert into pagamentos (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
        values (
          v_submission_id, v_previsto_sinal_id, round(v_valor / 2, 2),
          null, 'Desconhecido (reconstituído)', 'sinal', true
        );
        n_pagamentos := n_pagamentos + 1;
      end if;

      if v_pagamento_final then
        insert into pagamentos (submission_id, previsto_id, valor, data, metodo, origem, reconstituido)
        values (
          v_submission_id, v_previsto_remanescente_id, round(v_valor / 2, 2),
          null, 'Desconhecido (reconstituído)', 'remanescente', true
        );
        n_pagamentos := n_pagamentos + 1;
      end if;
    end if;

    if coalesce((v_evento->>'formulario_preenchido')::boolean, false)
       and nullif(v_evento->'registo'->>'event_type_id', '') is not null then
      insert into invites (code, event_type_id, data_evento, respostas, status, submission_id)
      values (
        v_evento->>'code',
        (v_evento->'registo'->>'event_type_id')::uuid,
        nullif(v_evento->'registo'->>'data_evento', '')::date,
        '{}'::jsonb,
        'Preenchido',
        v_submission_id
      );
      n_forms := n_forms + 1;
    end if;

    for v_doc in
      select value from jsonb_array_elements(coalesce(v_evento->'documentos', '[]'::jsonb))
    loop
      insert into documentos (tipo, submission_id, dados)
      values (
        v_doc->>'tipo',
        v_submission_id,
        coalesce(v_doc->'dados', '{}'::jsonb)
      );
      n_docs := n_docs + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'eventos', n_eventos,
    'documentos', n_docs,
    'formularios', n_forms,
    'pagamentos', n_pagamentos,
    'eventos_saltados', n_saltados
  );
end;
$function$;

revoke all on function public.importar_cliente(jsonb) from public, anon;
grant execute on function public.importar_cliente(jsonb) to authenticated;
