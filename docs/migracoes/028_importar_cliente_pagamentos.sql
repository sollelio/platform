-- ============================================================
-- 028 — A importação de clientes antigos (separador "Importar
-- clientes", JSON colado/carregado) passa também a criar os
-- `pagamentos_previstos` e a reconstituir `pagamentos`, exactamente
-- com a MESMA regra da reconciliação retroactiva (027) — só que
-- aplicada no momento da importação, ao evento que acabou de nascer,
-- em vez de a eventos já existentes.
--
-- Porquê sem data (data = null, reconstituido = true) e não
-- created_at como a 027 fez: na 027, created_at já era a data REAL em
-- que a submissão tinha sido criada na app (um proxy fraco mas
-- verdadeiro). Aqui, created_at é sempre `now()` — o momento da
-- importação — e usá-lo diria "sinal recebido hoje" para um casamento
-- de há anos. Isso seria inventar um dado, não reconstituir um dado
-- ausente. Por isso os dois pagamentos reconstituídos por importação
-- ficam sempre com data = null.
--
-- Regra (mesma da 027):
--   previstos — sinal (50%) + remanescente (50%), sempre que o
--     evento importado tiver valor_acordado > 0, seja qual for a
--     fase. Remanescente com data_limite = data_evento − 2 dias
--     quando há data_evento.
--   pagamentos reconstituídos — sinal quando fase ∈
--     ('cliente','projecto','contrato'); remanescente quando
--     pagamento_final = true. Nunca os dois por defeitos diferentes —
--     tal como no resto do sistema, cada um só entra pelo sinal que
--     realmente o implica.
--
-- `metodo` fica 'Desconhecido (reconstituído)' — o JSON de importação
-- não tem (e não vale a pena ganhar) um campo para o método real de
-- pagamentos de clientes de antes do DLM-App.
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
    insert into submissions
    select * from jsonb_populate_record(
      null::submissions,
      public._ajustar_registo(
        'public.submissions'::regclass,
        jsonb_build_object(
          'id', gen_random_uuid(),
          'created_at', now(),
          'cliente_id', v_cliente_id
        ) || (v_evento->'registo')
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
    'pagamentos', n_pagamentos
  );
end;
$function$;
