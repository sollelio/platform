-- ============================================================================
-- 056 · Storage — fecha a listagem anónima dos baldes
--
-- O ACHADO (verificado ao vivo em TESTE, 31/07/2026): um POST anónimo a
-- /storage/v1/object/list/{balde} devolve a lista de ficheiros dos TRÊS
-- baldes — referencias, propostas e materiais. Qualquer pessoa com a chave
-- pública (que está no JavaScript do site) enumera as imagens de todas as
-- clientes.
--
-- O que NÃO é problema e fica como está:
--   · os baldes continuam públicos — o GET directo de um objecto por URL
--     não passa pelas políticas, e o portal serve as imagens tal e qual;
--   · os nomes dos ficheiros são `ref_{timestamp}_{aleatório}.jpg`, sem id
--     de evento — inadivinháveis SE a lista estiver fechada. É a lista que
--     transforma «inadivinhável» em «basta pedir».
--
-- O QUE ESTA MIGRAÇÃO FAZ: a listagem exige uma política SELECT em
-- storage.objects — o GET público não. Portanto, para cada política SELECT
-- desses baldes que abranja o papel `anon`:
--   · se era só do anon → cai;
--   · se abrangia mais papéis → é recriada igual, só para `authenticated`.
-- Dinâmico porque os nomes das políticas foram criados no painel e não os
-- conhecemos; assim não depende de adivinhar nomes.
--
-- O que NÃO se toca: INSERT (a captação pública faz upload anónimo das
-- imagens de referência — tem de continuar), UPDATE e DELETE.
--
-- A app não usa .list()/.download() em lado nenhum (verificado por grep),
-- por isso nenhum ecrã perde nada.
--
-- Idempotente (segunda passagem não encontra nada para mudar).
-- Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 0 · Ver o que existe, antes (read-only) ────────────────────────────────
select policyname, cmd, roles, qual
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by cmd, policyname;


-- ─── 1 · A correcção ────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select policyname, roles, qual
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and cmd = 'SELECT'
       -- abrange anon: ou nomeia-o, ou é para `public` (todos os papéis)
       and (roles::text[] && array['anon', 'public'])
       -- e diz respeito a um dos três baldes
       and (qual ilike '%referencias%'
            or qual ilike '%propostas%'
            or qual ilike '%materiais%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);

    -- Se a política servia mais do que o anon, preserva-a para quem fica.
    if r.roles::text[] && array['authenticated', 'public'] then
      execute format(
        'create policy %I on storage.objects for select to authenticated using (%s)',
        r.policyname, r.qual);
      raise notice '056: % — recriada só para authenticated.', r.policyname;
    else
      raise notice '056: % — removida (era só do anon).', r.policyname;
    end if;
  end loop;
end
$$;


-- ─── 2 · Verificação ────────────────────────────────────────────────────────

-- 2.1 · Já não há SELECT com anon nestes baldes:
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd = 'SELECT'
   and (roles::text[] && array['anon', 'public']);
-- Esperado: zero linhas (ou linhas de baldes que não os três).

-- 2.2 · O INSERT anónimo da captação sobreviveu:
select policyname, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd = 'INSERT';
-- Esperado: as políticas de INSERT tal como estavam na secção 0.

-- 2.3 · Do lado de fora (eu corro isto depois de correres em TESTE):
--   · o POST /storage/v1/object/list/referencias com a chave anon
--     tem de passar a devolver [] ;
--   · o GET público de uma imagem já conhecida tem de continuar a abrir.
