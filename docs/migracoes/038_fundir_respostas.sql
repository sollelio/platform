-- ============================================================
-- 038 — merge cirúrgico do respostas + colunas antigas, num só UPDATE
--
-- O bug (diagnóstico Fase 1, família respostas-overwrite-snapshot):
-- dois pontos do backoffice — a data do evento no drawer e o guardar
-- do briefing na Visão Geral — reescreviam o JSONB `respostas` INTEIRO
-- a partir da cópia em memória do browser. Com a página aberta há
-- horas e a cliente a submeter o formulário entretanto, a edição
-- seguinte gravava a cópia velha por cima: respostas do formulário
-- apagadas, sem erro, sem rasto, sem volta.
--
-- A correção: só as chaves ALTERADAS viajam. O merge do respostas
-- (`respostas || p_patch`) e a escrita das colunas antigas equivalentes
-- (dupla fonte) acontecem no MESMO UPDATE, atómico debaixo do lock da
-- linha — as duas fontes nunca divergem por uma falha a meio. Uma
-- submissão de formulário concorrente (que também faz merge, ver
-- formulario_submeter) só colide com a edição se tocarem a MESMA
-- chave, e aí ganha a última — a semântica certa campo a campo.
--
-- p_colunas usa o padrão da 036: cada coluna só é tocada se a chave
-- vier no jsonb (com o cast seguro do seu tipo); ausente = fica como
-- está. A lista é o FIELD_MAP do submissionFields.js + data_evento.
--
-- SECURITY INVOKER (por omissão): ferramenta do backoffice — corre com
-- os privilégios de quem chama, debaixo das RLS da 021. O revoke tira
-- o EXECUTE que os default privileges dão ao anon (a convenção da 034).
--
-- Idempotente: DROP IF EXISTS da assinatura antiga + CREATE OR REPLACE
-- + revoke/grant repetíveis. Correr no SQL editor de TEST, DUAS vezes.
-- Produção decide o Hélio.
-- ============================================================

-- A primeira versão deste ficheiro tinha a assinatura (uuid, jsonb);
-- sai antes de entrar a definitiva, para não ficarem dois overloads
-- (o PostgREST não saberia qual chamar).
DROP FUNCTION IF EXISTS public.submissao_fundir_respostas(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.submissao_fundir_respostas(
  p_id uuid,
  p_patch jsonb,
  p_colunas jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_linha submissions;
begin
  update submissions set
    respostas = coalesce(respostas, '{}'::jsonb)
                || coalesce(p_patch, '{}'::jsonb),

    -- data do evento (date)
    data_evento = case when p_colunas ? 'data_evento' then dlm_safe_date(dlm_txt(p_colunas, 'data_evento')) else data_evento end,

    -- texto
    nome_noivo = case when p_colunas ? 'nome_noivo' then dlm_txt(p_colunas, 'nome_noivo') else nome_noivo end,
    nome_noiva = case when p_colunas ? 'nome_noiva' then dlm_txt(p_colunas, 'nome_noiva') else nome_noiva end,
    contacto_principal = case when p_colunas ? 'contacto_principal' then dlm_txt(p_colunas, 'contacto_principal') else contacto_principal end,
    email = case when p_colunas ? 'email' then dlm_txt(p_colunas, 'email') else email end,
    morada = case when p_colunas ? 'morada' then dlm_txt(p_colunas, 'morada') else morada end,
    local_evento = case when p_colunas ? 'local_evento' then dlm_txt(p_colunas, 'local_evento') else local_evento end,
    recolha_dia_seguinte = case when p_colunas ? 'recolha_dia_seguinte' then dlm_txt(p_colunas, 'recolha_dia_seguinte') else recolha_dia_seguinte end,
    nome_responsavel = case when p_colunas ? 'nome_responsavel' then dlm_txt(p_colunas, 'nome_responsavel') else nome_responsavel end,
    contacto_responsavel = case when p_colunas ? 'contacto_responsavel' then dlm_txt(p_colunas, 'contacto_responsavel') else contacto_responsavel end,
    relacao_responsavel = case when p_colunas ? 'relacao_responsavel' then dlm_txt(p_colunas, 'relacao_responsavel') else relacao_responsavel end,
    estilo_outro = case when p_colunas ? 'estilo_outro' then dlm_txt(p_colunas, 'estilo_outro') else estilo_outro end,
    paleta_observacoes = case when p_colunas ? 'paleta_observacoes' then dlm_txt(p_colunas, 'paleta_observacoes') else paleta_observacoes end,
    cartoes_pratos = case when p_colunas ? 'cartoes_pratos' then dlm_txt(p_colunas, 'cartoes_pratos') else cartoes_pratos end,
    observacoes_cartoes = case when p_colunas ? 'observacoes_cartoes' then dlm_txt(p_colunas, 'observacoes_cartoes') else observacoes_cartoes end,
    descricao_mesa_noivos = case when p_colunas ? 'descricao_mesa_noivos' then dlm_txt(p_colunas, 'descricao_mesa_noivos') else descricao_mesa_noivos end,
    descricao_cenario = case when p_colunas ? 'descricao_cenario' then dlm_txt(p_colunas, 'descricao_cenario') else descricao_cenario end,
    medidas_espaco = case when p_colunas ? 'medidas_espaco' then dlm_txt(p_colunas, 'medidas_espaco') else medidas_espaco end,
    formato_mesas = case when p_colunas ? 'formato_mesas' then dlm_txt(p_colunas, 'formato_mesas') else formato_mesas end,
    observacoes_mesas = case when p_colunas ? 'observacoes_mesas' then dlm_txt(p_colunas, 'observacoes_mesas') else observacoes_mesas end,
    texto_principal_placa = case when p_colunas ? 'texto_principal_placa' then dlm_txt(p_colunas, 'texto_principal_placa') else texto_principal_placa end,
    texto_secundario_placa = case when p_colunas ? 'texto_secundario_placa' then dlm_txt(p_colunas, 'texto_secundario_placa') else texto_secundario_placa end,
    notas_placa = case when p_colunas ? 'notas_placa' then dlm_txt(p_colunas, 'notas_placa') else notas_placa end,
    morada_exacta = case when p_colunas ? 'morada_exacta' then dlm_txt(p_colunas, 'morada_exacta') else morada_exacta end,
    pessoa_abre_espaco = case when p_colunas ? 'pessoa_abre_espaco' then dlm_txt(p_colunas, 'pessoa_abre_espaco') else pessoa_abre_espaco end,
    contacto_pessoa_abre = case when p_colunas ? 'contacto_pessoa_abre' then dlm_txt(p_colunas, 'contacto_pessoa_abre') else contacto_pessoa_abre end,
    notas_acesso = case when p_colunas ? 'notas_acesso' then dlm_txt(p_colunas, 'notas_acesso') else notas_acesso end,
    observacoes_gerais = case when p_colunas ? 'observacoes_gerais' then dlm_txt(p_colunas, 'observacoes_gerais') else observacoes_gerais end,

    -- horas (time)
    hora_inicio = case when p_colunas ? 'hora_inicio' then dlm_safe_time(dlm_txt(p_colunas, 'hora_inicio')) else hora_inicio end,
    hora_termino = case when p_colunas ? 'hora_termino' then dlm_safe_time(dlm_txt(p_colunas, 'hora_termino')) else hora_termino end,
    hora_montagem = case when p_colunas ? 'hora_montagem' then dlm_safe_time(dlm_txt(p_colunas, 'hora_montagem')) else hora_montagem end,
    hora_limite_montagem = case when p_colunas ? 'hora_limite_montagem' then dlm_safe_time(dlm_txt(p_colunas, 'hora_limite_montagem')) else hora_limite_montagem end,
    hora_recolha = case when p_colunas ? 'hora_recolha' then dlm_safe_time(dlm_txt(p_colunas, 'hora_recolha')) else hora_recolha end,

    -- números (integer)
    numero_convidados = case when p_colunas ? 'numero_convidados' then dlm_safe_int(dlm_txt(p_colunas, 'numero_convidados')) else numero_convidados end,
    numero_mesas = case when p_colunas ? 'numero_mesas' then dlm_safe_int(dlm_txt(p_colunas, 'numero_mesas')) else numero_mesas end,
    lugares_por_mesa = case when p_colunas ? 'lugares_por_mesa' then dlm_safe_int(dlm_txt(p_colunas, 'lugares_por_mesa')) else lugares_por_mesa end,

    -- checkboxes (text[])
    estilo_evento = case when p_colunas ? 'estilo_evento' then dlm_txt_array(p_colunas, 'estilo_evento') else estilo_evento end,
    paleta_cores = case when p_colunas ? 'paleta_cores' then dlm_txt_array(p_colunas, 'paleta_cores') else paleta_cores end,
    mesa_noivos = case when p_colunas ? 'mesa_noivos' then dlm_txt_array(p_colunas, 'mesa_noivos') else mesa_noivos end,
    cenario_palco = case when p_colunas ? 'cenario_palco' then dlm_txt_array(p_colunas, 'cenario_palco') else cenario_palco end,
    centros_mesa = case when p_colunas ? 'centros_mesa' then dlm_txt_array(p_colunas, 'centros_mesa') else centros_mesa end,
    tipo_flores = case when p_colunas ? 'tipo_flores' then dlm_txt_array(p_colunas, 'tipo_flores') else tipo_flores end,
    estilo_placa = case when p_colunas ? 'estilo_placa' then dlm_txt_array(p_colunas, 'estilo_placa') else estilo_placa end,
    acesso_local = case when p_colunas ? 'acesso_local' then dlm_txt_array(p_colunas, 'acesso_local') else acesso_local end
  where id = p_id
  returning * into v_linha;

  if not found then
    raise exception 'EVENTO_EM_FALTA';
  end if;

  return to_jsonb(v_linha);
end
$function$;

-- Os default privileges do Supabase dão EXECUTE ao anon em funções
-- novas — tira-se (a convenção da 034) e dá-se só ao backoffice.
revoke all on function public.submissao_fundir_respostas(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.submissao_fundir_respostas(uuid, jsonb, jsonb) to authenticated;
