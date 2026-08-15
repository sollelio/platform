-- ============================================================================
-- 103b · A porta principal do portal
--
-- A 103 fechou treze funções pelo helper, mais a folha e a campanha. Ficou
-- de fora a maior: o `dlm_portal_ver` lê `portal_acessos` directamente e
-- verifica revogação e prazo à mão — nunca passou pelo helper.
--
-- O efeito era um portal meio aberto: com a casa suspensa, o noivo via a
-- página do acompanhamento (datas, jornada, estado do sinal) mas os
-- documentos, o questionário e o sinal fechavam. Feio, e a contradizer-se.
--
-- ── PORQUÊ UM INVÓLUCRO, e não a condição dentro da função ───────────────
--
-- O corpo tem 696 linhas: a regra do sinal, a jornada, o portão da Nádia, a
-- promessa quebrada, o cálculo do total a partir do instantâneo. Copiá-lo
-- inteiro para acrescentar cinco linhas de guarda é arriscar um erro numa
-- lógica que funciona, para corrigir outro. O mesmo raciocínio da 096.
--
-- O invólucro deixa o corpo por tocar e põe a guarda onde se vê. E quando
-- um dia a lógica do portal mudar, mexe-se no `_interno` sem pensar nisto.
-- ============================================================================

alter function public.dlm_portal_ver(text) rename to dlm_portal_ver_interno;

revoke all on function public.dlm_portal_ver_interno(text) from public, anon, authenticated;

comment on function public.dlm_portal_ver_interno(text) is
  'O corpo da projecção do portal — 696 linhas, intocadas desde a 082. Não se chama de fora: a porta é dlm_portal_ver, que verifica primeiro se a casa está activa.';

create or replace function public.dlm_portal_ver(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.casa_do_token_activa(p_token)
    then public.dlm_portal_ver_interno(p_token)
    -- Uma casa suspensa é indistinguível de um acesso terminado. O motivo
    -- da suspensão é entre a casa e a Sollelio; a cliente não tem nada com
    -- isso, e dizer-lho seria expor o que não lhe pertence saber.
    else jsonb_build_object('estado', 'terminado')
  end;
$$;

revoke all     on function public.dlm_portal_ver(text) from public, anon;
grant  execute on function public.dlm_portal_ver(text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · Com a casa activa, a projecção completa continua a sair:
--   select public.dlm_portal_ver((select token from portal_acessos
--            where revogado_em is null limit 1)) ->> 'estado';
--   -- Esperado: activo
--
-- 2 · Suspender e repetir (⚠ SÓ EM STAGING):
--   update tenants set estado = 'suspenso' where slug = 'doluxoamesa';
--   select public.dlm_portal_ver((select token from portal_acessos limit 1)) ->> 'estado';
--   -- Esperado: terminado
--   update tenants set estado = 'activo' where slug = 'doluxoamesa';   -- ⚠ REPOR
--
-- 3 · O interno já não responde de fora:
--   select has_function_privilege('anon','public.dlm_portal_ver_interno(text)','execute');
--   -- Esperado: false
--
-- 4 · A APP: o portal de um noivo, por inteiro — jornada, documentos,
--   questionário, sinal. Nada deve ter mudado com a casa activa.
-- ============================================================================