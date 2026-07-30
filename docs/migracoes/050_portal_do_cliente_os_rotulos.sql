-- ============================================================================
-- 050 · Portal do Cliente — os rótulos saem do servidor
--
-- A 049 devolvia `rotulo` em cada etapa da Jornada ('Interessada',
-- 'Orçamento', 'O grande dia'…). Foi um erro: passou a ser preciso uma
-- migração para mudar uma palavra que uma pessoa lê.
--
-- O GLOSSARIO.md tem regra de ouro contra isto:
--   «os nomes que as pessoas leem podem mudar; os nomes que a máquina usa
--    ficam quietos.»
--
-- A partir daqui o RPC devolve só `etapa` — a chave estável. O mapa
-- etapa → rótulo vive no front end, onde mudar uma palavra é mudar uma
-- string.
--
-- ÚNICA alteração face à 049: o `rotulo` sai do jsonb_build_object. A lógica
-- dos estados fica byte a byte igual, de propósito — para o diff ser
-- revisível de relance.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================

create or replace function public.dlm_portal_ver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso      public.portal_acessos%rowtype;
  v_ev          public.submissions%rowtype;
  v_modelo      text;
  v_titulo      text;

  v_pedido_em    timestamptz;
  v_orcamento_em timestamptz;
  v_sinal_em     timestamptz;
  v_projecto_em  timestamptz;
  v_contrato_em  timestamptz;

  v_tem_orcamento boolean;
  v_tem_projecto  boolean;
  v_tem_contrato  boolean;

  v_marcos jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_acesso
    from public.portal_acessos
   where token = p_token;

  if not found
     or v_acesso.revogado_em is not null
     or (v_acesso.expira_em is not null and v_acesso.expira_em < now())
  then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select * into v_ev
    from public.submissions
   where id = v_acesso.submission_id;

  if not found then
    return jsonb_build_object('estado', 'terminado');
  end if;

  select nome into v_modelo
    from public.event_types
   where id = v_ev.event_type_id;

  v_titulo := nullif(
    concat_ws(' & ',
      nullif(btrim(coalesce(v_ev.nome_noivo, '')), ''),
      nullif(btrim(coalesce(v_ev.nome_noiva, '')), '')
    ), '');

  if v_titulo is null then
    select c.nome into v_titulo
      from public.clientes c
     where c.id = v_ev.cliente_id;
  end if;

  -- ── Artefactos ────────────────────────────────────────────────────────

  select min(n.created_at) into v_pedido_em
    from public.notificacoes n
   where n.submission_id = v_ev.id and n.tipo = 'captacao';

  select min(d.created_at), count(*) > 0
    into v_orcamento_em, v_tem_orcamento
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'orcamento';

  select min(d.created_at), count(*) > 0
    into v_projecto_em, v_tem_projecto
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'proposta';

  select min(d.assinado_em), count(*) > 0
    into v_contrato_em, v_tem_contrato
    from public.documentos d
   where d.submission_id = v_ev.id and d.tipo = 'contrato';

  select min(p.data)::timestamptz into v_sinal_em
    from public.pagamentos p
   where p.submission_id = v_ev.id
     and p.origem        = 'sinal'
     and p.reconstituido = false;

  -- ── A Jornada — só chaves, sem rótulos ────────────────────────────────

  select jsonb_agg(
           jsonb_build_object(
             'etapa',  m.etapa,
             'estado', case
                         when not m.feito       then 'por_acontecer'
                         when m.quando is null  then 'feito_sem_data'
                         else                        'feito_datado'
                       end,
             'quando', m.quando
           ) order by m.ord
         )
    into v_marcos
    from (values
      (1, 'interessada',
          true,
          coalesce(v_pedido_em, v_ev.created_at)),

      (2, 'orcamento',
          v_tem_orcamento
            or v_ev.fase in ('orcamento','sinal','cliente','projecto','contrato'),
          v_orcamento_em),

      (3, 'sinal',
          v_sinal_em is not null
            or v_ev.fase in ('cliente','projecto','contrato')
            or exists (select 1 from public.pagamentos p
                        where p.submission_id = v_ev.id and p.origem = 'sinal'),
          v_sinal_em),

      (4, 'projecto',
          v_tem_projecto or v_ev.fase in ('projecto','contrato'),
          v_projecto_em),

      (5, 'contrato',
          v_contrato_em is not null or v_ev.fase = 'contrato',
          v_contrato_em),

      (6, 'preparacao',
          v_ev.status in ('Em Preparação','Confirmado','Concluído'),
          null::timestamptz),

      (7, 'grande_dia',
          v_ev.data_evento is not null and v_ev.data_evento < current_date,
          case when v_ev.data_evento is not null
               then v_ev.data_evento::timestamptz end)
    ) as m(ord, etapa, feito, quando);

  update public.portal_acessos
     set ultimo_acesso_em = now(),
         n_acessos        = n_acessos + 1
   where id = v_acesso.id;

  return jsonb_build_object(
    'estado', 'activo',
    'evento', jsonb_build_object(
      'titulo',     v_titulo,
      'modelo',     v_modelo,
      'data',       v_ev.data_evento,
      'local',      v_ev.local_evento,
      'convidados', v_ev.numero_convidados,
      'dias_para',  case when v_ev.data_evento is not null
                         then v_ev.data_evento - current_date end,
      'principio',  v_ev.fase in ('interessado','orcamento')
    ),
    'jornada', coalesce(v_marcos, '[]'::jsonb)
  );
end;
$$;

comment on function public.dlm_portal_ver(text) is
  'Leitura pública do portal do cliente. Projecção explícita — submissions.id '
  'nunca sai, e os rótulos são do front end (ver 050). Inexistente, revogado '
  'e expirado devolvem a mesma resposta.';

revoke all     on function public.dlm_portal_ver(text) from public;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;


-- ─── Verificação ────────────────────────────────────────────────────────────

-- Nenhuma etapa pode trazer rótulo, e o id continua sem sair:
--   with p as (select public.dlm_portal_ver('<TOKEN>') as j)
--   select (j -> 'jornada' -> 0) ? 'rotulo'  as tem_rotulo,   -- tem de dar FALSE
--          j::text like '%<EVENTO_ID>%'      as id_vazou      -- tem de dar FALSE
--     from p;