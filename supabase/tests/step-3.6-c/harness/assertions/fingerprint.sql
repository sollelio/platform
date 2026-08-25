-- Step 3.6-C · Layer B — the four §10.2 legacy fingerprints.
-- Output is exactly: relation identifier, row count, digest. Never a source
-- value, never PII (§10.3 requirements 2, 3, 4). SELECT-only.
SET DateStyle = 'ISO, YMD';
SET TimeZone = 'UTC';
SET extra_float_digits = 3;
SET bytea_output = 'hex';
SET lc_numeric = 'C';
SELECT f.relation || '=' || f.row_count || ':' || f.digest AS fingerprint
FROM (
  SELECT 'auth.users' AS relation, count(*) AS row_count,
         md5(coalesce(string_agg(quote_nullable(u.id::text) || '|' ||
              quote_nullable(u.raw_user_meta_data::text) || '|' ||
              quote_nullable(u.created_at::text), E'\n' ORDER BY u.id), '')) AS digest
    FROM auth.users u
  UNION ALL
  SELECT 'public.tenants', count(*),
         md5(coalesce(string_agg(
              quote_nullable(t.id::text) || '|' || quote_nullable(t.slug) || '|' ||
              quote_nullable(t.nome) || '|' || quote_nullable(t.prefixo) || '|' ||
              quote_nullable(t.locale) || '|' || quote_nullable(t.moeda) || '|' ||
              quote_nullable(t.estado) || '|' || quote_nullable(t.criado_em::text) || '|' ||
              quote_nullable(t.titular) || '|' || quote_nullable(t.morada) || '|' ||
              quote_nullable(t.nif) || '|' || quote_nullable(t.iban) || '|' ||
              quote_nullable(t.mbway) || '|' || quote_nullable(t.foro) || '|' ||
              quote_nullable(t.dominio) || '|' || quote_nullable(t.whatsapp) || '|' ||
              quote_nullable(t.logo_url) || '|' || quote_nullable(t.linha_actividade) || '|' ||
              quote_nullable(t.linha_by) || '|' || quote_nullable(t.slogan),
              E'\n' ORDER BY t.id), ''))
    FROM public.tenants t
  UNION ALL
  SELECT 'public.memberships', count(*),
         md5(coalesce(string_agg(
              quote_nullable(m.user_id::text) || '|' || quote_nullable(m.tenant_id::text) || '|' ||
              quote_nullable(m.papel) || '|' || quote_nullable(m.criado_em::text),
              E'\n' ORDER BY m.user_id, m.tenant_id), ''))
    FROM public.memberships m
  UNION ALL
  SELECT 'public.app_config', count(*),
         md5(coalesce(string_agg(
              quote_nullable(c.tenant_id::text) || '|' || quote_nullable(c.chave) || '|' ||
              quote_nullable(c.valor) || '|' || quote_nullable(c.descricao) || '|' ||
              quote_nullable(c.updated_at::text) || '|' || quote_nullable(c.criado_por::text),
              E'\n' ORDER BY c.tenant_id, c.chave), ''))
    FROM public.app_config c
) f
ORDER BY f.relation;
