-- =============================================================================
-- Sollelio v2 — Step 3.6-C · legacy → v2 Organization/RBAC bootstrap
-- Migration: 20260825103955_v2_legacy_organization_rbac_bootstrap.sql
--
-- Implements, exactly and only, the Step 3.6-C canonical implementation
-- contract, version 6
-- (docs/architecture/contracts/sollelio-v2-step-3.6-c-bootstrap-contract-v6.md,
-- SHA256 83c988cf465aac6b302b2d17f0d1ab44e6e7daa0e4bff5f1938b1b8977e52d01).
--
-- The first and only legacy-data bootstrap. It populates exactly seven
-- relations — user_profiles, organizations, organization_memberships, roles,
-- role_permissions, membership_roles, audit_events — from exactly three legacy
-- sources — auth.users, public.tenants, public.memberships. It creates no
-- platform operator and no support access, writes nothing to any legacy
-- relation, moves no storage object, and defers public.app_config entirely.
--
-- EXECUTION MODEL (contract v6 §9.1) — this file contains exactly ONE
-- top-level executable statement: the single DO block below. Supabase CLI
-- 2.115.0 does NOT wrap a migration file in a transaction; atomicity therefore
-- comes from PostgreSQL, which executes one statement inside its own implicit
-- statement transaction. Locks, rendering configuration, fingerprints, every
-- gate and every insert live inside that one statement, so they either all
-- take effect or none does.
--
-- The BEGIN and END tokens below — the outer pair and those of the nested gate
-- blocks — are PL/pgSQL procedural block delimiters, NOT transaction control.
-- This file contains no COMMIT, ROLLBACK, SAVEPOINT, START TRANSACTION or
-- top-level SQL BEGIN, no dynamic SQL, no EXECUTE, no ON CONFLICT, no
-- IF NOT EXISTS, no temporary table and no advisory lock.
--
-- The CLI's write to supabase_migrations.schema_migrations is NOT assumed
-- atomic with this body. After every apply, verify both the data and the
-- history row; if the body succeeded and the row is absent, stop and diagnose
-- (contract §9.1 rules 8-9).
--
-- Body structure, in the normative order of contract §9.4:
--   §9.1  lock phase, A → B → C → D, every lock NOWAIT
--   §10.3 pinned rendering configuration for the fingerprints
--   §10.2 pre-insert legacy fingerprints (P16, first half)
--   §9.4  preconditions  P0, P1, P11a, P2–P9, P12, P13, P15
--   §9.5  inserts, in foreign-key order
--   §9.4  postconditions P10, P10b, P11b, P14, P16
--
-- Every gate raises a stable, greppable error naming itself:
--   'SOLLELIO 3.6-C gate <NAME> failed: ...'
-- No error message, and no value written by this migration, contains PII.
-- =============================================================================

DO $sollelio_bootstrap$
BEGIN

-- =============================================================================
-- §9.1 · Lock phase — fixed order A → B → C → D, before every gate, count,
-- fingerprint and insert. Every lock is NOWAIT: a lock that cannot be granted
-- immediately raises lock_not_available (55P03) and aborts the transaction
-- having written nothing. There is no wait and no retry.
-- =============================================================================

-- A · legacy public relations: the two sources, plus the deferred app_config
--     whose byte-identity P16 proves.
LOCK TABLE
  public.tenants,
  public.memberships,
  public.app_config
IN SHARE MODE NOWAIT;

-- B · permission catalogue — a foreign-key parent holding pre-existing rows,
--     so EXCLUSIVE: it excludes ROW SHARE, and therefore the FOR UPDATE row
--     lock that would block role_permissions' FK check.
LOCK TABLE public.permissions IN EXCLUSIVE MODE NOWAIT;

-- C · the ten A2 scoped and excluded relations: seven written, three asserted
--     empty. SHARE ROW EXCLUSIVE is self-conflicting, so a second concurrent
--     execution aborts here rather than racing P1.
LOCK TABLE
  public.user_profiles,
  public.organizations,
  public.organization_memberships,
  public.roles,
  public.role_permissions,
  public.membership_roles,
  public.audit_events,
  public.platform_operators,
  public.support_access_grants,
  public.support_access_grant_permissions
IN SHARE ROW EXCLUSIVE MODE NOWAIT;

-- D · auth.users — a foreign-key parent holding pre-existing rows, so
--     EXCLUSIVE, for the same reason as group B. Subject to the separately
--     authorised staging capability gate G2 before any staging apply.
LOCK TABLE auth.users IN EXCLUSIVE MODE NOWAIT;


-- =============================================================================
-- §10.3 requirement 7 · Pinned rendering. A digest over text renderings is only
-- as stable as the rendering, so the before and after computations must run
-- with identical settings, set explicitly rather than inherited.
-- =============================================================================

PERFORM pg_catalog.set_config('DateStyle',         'ISO, YMD', true);
PERFORM pg_catalog.set_config('TimeZone',          'UTC',      true);
PERFORM pg_catalog.set_config('extra_float_digits','3',        true);
PERFORM pg_catalog.set_config('bytea_output',      'hex',      true);
PERFORM pg_catalog.set_config('lc_numeric',        'C',        true);


-- =============================================================================
-- §10.2 / P16 first half · Pre-insert legacy fingerprints.
--
-- Computed after the complete lock phase, so every fingerprinted relation is
-- already write-blocked when its first digest is taken. Output is the relation
-- identifier, the row count and the digest — never a source value (§10.3
-- requirements 2, 3, 4). NULL is distinguished from the empty string by
-- quote_nullable (requirement 8); ordering is total and inside the aggregate,
-- taken from each relation's primary key (requirement 1).
--
-- The result is carried to P16 in a TRANSACTION-LOCAL GUC, not a temporary
-- table. That choice is load-bearing: contract §11.2 requires negative fixture
-- 1 to execute this exact file TWICE inside one transaction and to abort at the
-- named P1 gate. A `CREATE TEMPORARY TABLE` would raise duplicate_table (42P07)
-- on the second pass, before P1 is ever reached, and the fixture would pass for
-- the wrong reason. `set_config(..., is_local := true)` is idempotent across
-- passes and is reverted at transaction end.
--
-- The stored value is a digest summary only — relation, row count, digest. It
-- carries no source value and no PII (§10.3 requirements 2, 3, 4).
-- =============================================================================

PERFORM pg_catalog.set_config(
    'sollelio.c1_fingerprint_before',
    (SELECT coalesce(string_agg(f.relation || '=' || f.row_count || ':' || f.digest,
                                E'\n' ORDER BY f.relation), '')
       FROM (
        SELECT 'auth.users' AS relation, count(*) AS row_count,
               md5(coalesce(string_agg(
                      quote_nullable(u.id::text)                 || '|' ||
                      quote_nullable(u.raw_user_meta_data::text) || '|' ||
                      quote_nullable(u.created_at::text),
                      E'\n' ORDER BY u.id), '')) AS digest
          FROM auth.users u
        UNION ALL
        SELECT 'public.tenants', count(*),
               md5(coalesce(string_agg(
                      quote_nullable(t.id::text)         || '|' ||
                      quote_nullable(t.slug)             || '|' ||
                      quote_nullable(t.nome)             || '|' ||
                      quote_nullable(t.prefixo)          || '|' ||
                      quote_nullable(t.locale)           || '|' ||
                      quote_nullable(t.moeda)            || '|' ||
                      quote_nullable(t.estado)           || '|' ||
                      quote_nullable(t.criado_em::text)  || '|' ||
                      quote_nullable(t.titular)          || '|' ||
                      quote_nullable(t.morada)           || '|' ||
                      quote_nullable(t.nif)              || '|' ||
                      quote_nullable(t.iban)             || '|' ||
                      quote_nullable(t.mbway)            || '|' ||
                      quote_nullable(t.foro)             || '|' ||
                      quote_nullable(t.dominio)          || '|' ||
                      quote_nullable(t.whatsapp)         || '|' ||
                      quote_nullable(t.logo_url)         || '|' ||
                      quote_nullable(t.linha_actividade) || '|' ||
                      quote_nullable(t.linha_by)         || '|' ||
                      quote_nullable(t.slogan),
                      E'\n' ORDER BY t.id), ''))
          FROM public.tenants t
        UNION ALL
        SELECT 'public.memberships', count(*),
               md5(coalesce(string_agg(
                      quote_nullable(m.user_id::text)   || '|' ||
                      quote_nullable(m.tenant_id::text) || '|' ||
                      quote_nullable(m.papel)           || '|' ||
                      quote_nullable(m.criado_em::text),
                      E'\n' ORDER BY m.user_id, m.tenant_id), ''))
          FROM public.memberships m
        UNION ALL
        SELECT 'public.app_config', count(*),
               md5(coalesce(string_agg(
                      quote_nullable(c.tenant_id::text)  || '|' ||
                      quote_nullable(c.chave)            || '|' ||
                      quote_nullable(c.valor)            || '|' ||
                      quote_nullable(c.descricao)        || '|' ||
                      quote_nullable(c.updated_at::text) || '|' ||
                      quote_nullable(c.criado_por::text),
                      E'\n' ORDER BY c.tenant_id, c.chave), ''))
          FROM public.app_config c
       ) AS f),
    true);


-- =============================================================================
-- §9.4 · Preconditions. Evaluated after the lock phase and the pre-insert
-- fingerprints, and before the first INSERT. None is guarded by a branch: each
-- runs on every execution, and each is vacuously true on an empty source.
-- =============================================================================

-- P0 · source-state gate (all-or-nothing).
DECLARE
    v_tenants     bigint := (SELECT count(*) FROM public.tenants);
    v_memberships bigint := (SELECT count(*) FROM public.memberships);
    v_users       bigint := (SELECT count(*) FROM auth.users);
BEGIN
    IF NOT (
        (v_tenants = 0 AND v_memberships = 0 AND v_users = 0)
        OR
        (v_tenants > 0 AND v_memberships > 0 AND v_users > 0)
    ) THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P0 failed: partial legacy source state — tenants=%, memberships=%, auth_users=%. Exactly two shapes are admitted: all three zero, or all three non-zero.',
            v_tenants, v_memberships, v_users;
    END IF;
END;

-- P1 · target emptiness, asserted unconditionally, before the first INSERT.
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT 'user_profiles' AS t, count(*) AS n FROM public.user_profiles
        UNION ALL SELECT 'organizations', count(*) FROM public.organizations
        UNION ALL SELECT 'organization_memberships', count(*) FROM public.organization_memberships
        UNION ALL SELECT 'roles', count(*) FROM public.roles
        UNION ALL SELECT 'role_permissions', count(*) FROM public.role_permissions
        UNION ALL SELECT 'membership_roles', count(*) FROM public.membership_roles
        UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events
    LOOP
        IF r.n <> 0 THEN
            RAISE EXCEPTION
                'SOLLELIO 3.6-C gate P1 failed: target public.% is not empty (% rows). This bootstrap runs once; a second execution after a populated bootstrap aborts before writing.',
                r.t, r.n;
        END IF;
    END LOOP;
END;

-- P11a · excluded Platform/support relations empty, before any insert.
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT 'platform_operators' AS t, count(*) AS n FROM public.platform_operators
        UNION ALL SELECT 'support_access_grants', count(*) FROM public.support_access_grants
        UNION ALL SELECT 'support_access_grant_permissions', count(*) FROM public.support_access_grant_permissions
    LOOP
        IF r.n <> 0 THEN
            RAISE EXCEPTION
                'SOLLELIO 3.6-C gate P11a failed: excluded relation public.% is not empty (% rows). This bootstrap creates no platform operator and no support access.',
                r.t, r.n;
        END IF;
    END LOOP;
END;

-- P2 · closed status map: every tenants.estado in ('activo','suspenso').
DECLARE
    v_bad bigint := (SELECT count(*) FROM public.tenants
                      WHERE estado NOT IN ('activo', 'suspenso'));
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P2 failed: % tenant row(s) carry an estado outside the closed map (activo, suspenso). ''encerrado'' is deliberately unmapped: the target requires a non-null closed_at and legacy records no closure instant.',
            v_bad;
    END IF;
END;

-- P3 · closed papel map: every memberships.papel in ('dono','gestor').
DECLARE
    v_bad bigint := (SELECT count(*) FROM public.memberships
                      WHERE papel NOT IN ('dono', 'gestor'));
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P3 failed: % membership row(s) carry a papel outside the closed map (dono, gestor). ''equipa'' has no v2 role and no defined permission set.',
            v_bad;
    END IF;
END;

-- P4 · bijection (D9): every auth user has exactly one membership, and every
--      membership resolves to an existing auth user.
DECLARE
    v_users_without bigint := (
        SELECT count(*) FROM auth.users u
         WHERE (SELECT count(*) FROM public.memberships m WHERE m.user_id = u.id) <> 1);
    v_memberships_orphan bigint := (
        SELECT count(*) FROM public.memberships m
         WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id));
BEGIN
    IF v_users_without <> 0 OR v_memberships_orphan <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P4 failed: the auth.users <-> memberships bijection does not hold — % auth user(s) without exactly one membership, % membership(s) with no auth user.',
            v_users_without, v_memberships_orphan;
    END IF;
END;

-- P5 · every migrated user yields a non-blank display_name through the §2.1
--      chain. Never fall back to an e-mail fragment (D11).
DECLARE
    v_bad bigint := (
        SELECT count(*) FROM auth.users u
         WHERE coalesce(
                   nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
                   nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
               ) IS NULL);
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P5 failed: % auth user(s) resolve to a blank display_name through the approved metadata chain (nome -> full_name). The e-mail fragment of the legacy chain is deliberately not reproduced.',
            v_bad;
    END IF;
END;

-- P6 · no user holds memberships in two tenants.
DECLARE
    v_bad bigint := (
        SELECT count(*) FROM (
            SELECT m.user_id FROM public.memberships m
             GROUP BY m.user_id HAVING count(DISTINCT m.tenant_id) > 1) s);
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P6 failed: % user(s) hold memberships in more than one tenant. The A2 UNIQUE (organization_id, user_id) only prevents duplicates within one organization.',
            v_bad;
    END IF;
END;

-- P7 · every tenants.moeda has char_length = 3 (target column is char(3)).
DECLARE
    v_bad bigint := (SELECT count(*) FROM public.tenants
                      WHERE char_length(moeda) <> 3);
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P7 failed: % tenant row(s) carry a moeda whose char_length is not 3.',
            v_bad;
    END IF;
END;

-- P8 · the four core permission keys are present. A catalogue-presence
--      assertion about the B1 seed; depends on no source row.
DECLARE
    v_found bigint := (
        SELECT count(*) FROM public.permissions
         WHERE key IN ('organization.read', 'organization.manage',
                       'members.manage', 'audit.read'));
BEGIN
    IF v_found <> 4 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P8 failed: public.permissions holds % of the 4 core Platform/IAM keys. The B1 catalogue migration must have been applied first.',
            v_found;
    END IF;
END;

-- P9 · slug and prefixo match the target regexes.
DECLARE
    v_slug   bigint := (SELECT count(*) FROM public.tenants
                         WHERE slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
    v_prefix bigint := (SELECT count(*) FROM public.tenants
                         WHERE prefixo !~ '^[A-Z]{2,6}$');
BEGIN
    IF v_slug <> 0 OR v_prefix <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P9 failed: % tenant slug(s) and % tenant prefixo(s) do not match the target format constraints.',
            v_slug, v_prefix;
    END IF;
END;

-- P12 · every tenant has at least one membership with papel = 'dono' (D12).
DECLARE
    v_bad bigint := (
        SELECT count(*) FROM public.tenants t
         WHERE NOT EXISTS (SELECT 1 FROM public.memberships m
                            WHERE m.tenant_id = t.id AND m.papel = 'dono'));
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P12 failed: % tenant(s) have no membership with papel = ''dono''. Migrating them would create an organization in which nobody holds the owner role.',
            v_bad;
    END IF;
END;

-- P13 · every tenants.id appears in the explicit time-zone mapping of §4.2.
--       A literal, closed lookup keyed by the legacy tenant UUID: never a
--       COALESCE, a default, a fallback or an else branch.
DECLARE
    v_bad bigint := (
        SELECT count(*) FROM public.tenants t
         WHERE t.id NOT IN (
             SELECT tz.tenant_id FROM (VALUES
                 ('cb563908-7939-494e-bbe4-1e83af4d693a'::uuid, 'Europe/Lisbon'),
                 ('7d0d3cb9-4395-47fd-a81c-6b4622685b82'::uuid, 'Europe/Lisbon')
             ) AS tz(tenant_id, time_zone)));
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P13 failed: % tenant(s) are absent from the explicit time-zone mapping. organizations.time_zone is NOT NULL and legacy tenants has no time-zone column, so an unmapped tenant aborts rather than receiving a fabricated default.',
            v_bad;
    END IF;
END;

-- P15 · every auth.users row being migrated has a non-null created_at.
--       Evaluated before the user_profiles insert, so the operator sees this
--       named violation rather than a NOT NULL constraint error, and so the
--       defaulted target column can never quietly substitute now().
DECLARE
    v_bad bigint := (SELECT count(*) FROM auth.users WHERE created_at IS NULL);
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P15 failed: % auth.users row(s) have a NULL created_at. user_profiles.created_at is exactly auth.users.created_at; a missing authentication instant aborts rather than being replaced by the transaction timestamp.',
            v_bad;
    END IF;
END;


-- =============================================================================
-- §9.5 · Inserts, in the order the A2 foreign keys dictate:
--   user_profiles and organizations, then organization_memberships and roles,
--   then role_permissions and membership_roles, then audit_events.
-- Plain INSERT ... SELECT throughout: no ON CONFLICT, no dynamic SQL,
-- no IF NOT EXISTS. On an empty source every statement selects zero rows.
-- =============================================================================

-- §2.1 · auth.users -> public.user_profiles.
-- created_at is listed explicitly and assigned exactly u.created_at: omitting
-- it, or writing DEFAULT, would silently substitute now() (D6, P15).
INSERT INTO public.user_profiles (
    user_id, full_name, display_name, locale, time_zone, created_at, updated_at)
SELECT
    u.id,
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')),
    NULL,                       -- locale  · D10, never copied from the organization
    NULL,                       -- time_zone · D10
    u.created_at,               -- D6, guarded by P15 — no fallback
    NULL                        -- updated_at · no source
FROM auth.users u;

-- §2.2 · public.tenants -> public.organizations.
-- id preserved (§3). status and time_zone resolve through closed VALUES maps,
-- never a COALESCE or an else branch; P2 and P13 have already proved both maps
-- total over the source, so neither join can silently drop a tenant.
INSERT INTO public.organizations (
    id, slug, name, status, access_code_prefix, locale, currency, time_zone,
    legal_owner_name, legal_address, tax_id, iban, mbway_number, jurisdiction,
    website_domain, whatsapp_number, logo_path, tagline_line_1, tagline_line_2,
    slogan, created_at, updated_at, closed_at)
SELECT
    t.id,                       -- preserved (§3)
    t.slug,
    t.nome,
    sm.status,                  -- closed map, §4.1 / D4
    t.prefixo,
    t.locale,
    t.moeda::char(3),           -- P7 proved char_length = 3
    tz.time_zone,               -- explicit closed mapping, §4.2 / D1
    t.titular,
    t.morada,
    t.nif,
    t.iban,
    t.mbway,
    t.foro,
    t.dominio,
    t.whatsapp,
    NULL,                       -- logo_path · D5, tenants.logo_url is not read
    t.linha_actividade,
    t.linha_by,
    t.slogan,
    t.criado_em,                -- D6
    NULL,                       -- updated_at · no source
    NULL                        -- closed_at · no migrated organization is closed
FROM public.tenants t
JOIN (VALUES
        ('activo',   'active'),
        ('suspenso', 'suspended')
     ) AS sm(estado, status) ON sm.estado = t.estado
JOIN (VALUES
        ('cb563908-7939-494e-bbe4-1e83af4d693a'::uuid, 'Europe/Lisbon'),
        ('7d0d3cb9-4395-47fd-a81c-6b4622685b82'::uuid, 'Europe/Lisbon')
     ) AS tz(tenant_id, time_zone) ON tz.tenant_id = t.id;

-- §2.3 · public.memberships -> public.organization_memberships.
-- id is generated: legacy has no membership identifier, its PK being the
-- composite (user_id, tenant_id). Continuity is carried by the target's
-- UNIQUE (organization_id, user_id).
INSERT INTO public.organization_memberships (
    organization_id, user_id, status, joined_at, revoked_at, created_by)
SELECT
    m.tenant_id,                -- = organizations.id, preserved transitively
    m.user_id,
    'active',                   -- legacy revoked by deletion; every row is live
    m.criado_em,                -- D6
    NULL,                       -- revoked_at · pairs with 'active'
    NULL                        -- created_by · no legacy actor column (D6)
FROM public.memberships m;

-- §2.4 · roles — one owner/manager pair per migrated organization.
-- Ids generated (D8); later references resolve through UNIQUE (organization_id, key).
INSERT INTO public.roles (
    organization_id, key, name, description, is_system, created_at, archived_at)
SELECT
    t.id,
    r.key,
    r.name,
    r.description,
    true,                       -- is_system · D2
    transaction_timestamp(),    -- D6 · roles are new v2 constructs
    NULL
FROM public.tenants t
CROSS JOIN (VALUES
    ('owner',   'Owner',
     'Owns the organization: full control of identity, settings, members, roles, and audit history.'),
    ('manager', 'Manager',
     'Runs the organization day to day, with the same effective access the legacy model gave every member.')
) AS r(key, name, description);

-- §2.4b · role_permissions — the cross product of the two roles with the FOUR
-- LITERAL core keys. Never a join against public.permissions: that form would
-- silently widen owner and manager the moment any later migration seeds a new
-- key, and would do so retroactively for this bootstrap's own replay (§6.2).
INSERT INTO public.role_permissions (role_id, permission_key, granted_at)
SELECT
    r.id,
    p.key,
    transaction_timestamp()     -- D6 · a new v2 construct
FROM public.roles r
CROSS JOIN (VALUES
    ('organization.read'),
    ('organization.manage'),
    ('members.manage'),
    ('audit.read')
) AS p(key);

-- §2.4 · membership_roles — papel resolved through the closed map.
-- granted_at is the membership's own instant: the papel is as old as the
-- membership (D6). granted_by is NULL: no authoritative legacy actor.
INSERT INTO public.membership_roles (
    membership_id, role_id, organization_id, granted_at, granted_by)
SELECT
    om.id,
    r.id,
    om.organization_id,
    m.criado_em,
    NULL
FROM public.memberships m
JOIN (VALUES
        ('dono',   'owner'),
        ('gestor', 'manager')
     ) AS pm(papel, role_key) ON pm.papel = m.papel
JOIN public.organization_memberships om
       ON om.organization_id = m.tenant_id
      AND om.user_id = m.user_id
JOIN public.roles r
       ON r.organization_id = m.tenant_id
      AND r.key = pm.role_key;

-- §8 · audit_events — one append-only row per migrated organization.
-- actor_kind = 'migration' requires every actor correlation column NULL, which
-- the A2 audit_events_actor_correlation check enforces independently.
-- change carries only technical metadata: the migration version, whole-migration
-- source and target counts, and boolean/enumeration flags. No names, e-mails,
-- addresses, tax IDs, bank data, telephone numbers, slugs, logo URLs, any other
-- business value — and no fingerprint digest, which is verification output and
-- never persisted audit data.
INSERT INTO public.audit_events (
    occurred_at, organization_id, actor_kind, actor_label, action,
    root_type, root_id, entity_type, entity_id, change)
SELECT
    transaction_timestamp(),
    o.id,
    'migration',
    '20260825103955_v2_legacy_organization_rbac_bootstrap',
    'platform.legacy_bootstrap',
    'organization', o.id,
    'organization', o.id,
    jsonb_build_object(
        'migration_version', '20260825103955_v2_legacy_organization_rbac_bootstrap',
        'source', jsonb_build_object(
            'tenants',     (SELECT count(*) FROM public.tenants),
            'memberships', (SELECT count(*) FROM public.memberships),
            'auth_users',  (SELECT count(*) FROM auth.users),
            'papel', jsonb_build_object(
                'dono',   (SELECT count(*) FROM public.memberships WHERE papel = 'dono'),
                'gestor', (SELECT count(*) FROM public.memberships WHERE papel = 'gestor')),
            'estado', jsonb_build_object(
                'activo',   (SELECT count(*) FROM public.tenants WHERE estado = 'activo'),
                'suspenso', (SELECT count(*) FROM public.tenants WHERE estado = 'suspenso'))),
        'created', jsonb_build_object(
            'user_profiles',            (SELECT count(*) FROM public.user_profiles),
            'organizations',            (SELECT count(*) FROM public.organizations),
            'organization_memberships', (SELECT count(*) FROM public.organization_memberships),
            'roles',                    (SELECT count(*) FROM public.roles),
            'role_permissions',         (SELECT count(*) FROM public.role_permissions),
            'membership_roles',         (SELECT count(*) FROM public.membership_roles)),
        'identity', jsonb_build_object(
            'organization_id_preserved', true,
            'user_ids_preserved',        true),
        'deferred', jsonb_build_object(
            'logo_path',  'storage_branding_migration',
            'app_config', 'event_product_settings'))
FROM public.organizations o;


-- =============================================================================
-- §9.4 · Postconditions. Evaluated after the inserts, inside the same
-- transaction. On an empty source every equality holds as 0 = 0.
-- =============================================================================

-- P10 · completeness by cardinality.
DECLARE
    v_tenants     bigint := (SELECT count(*) FROM public.tenants);
    v_memberships bigint := (SELECT count(*) FROM public.memberships);
    v_users       bigint := (SELECT count(*) FROM auth.users);
    v_org         bigint := (SELECT count(*) FROM public.organizations);
    v_om          bigint := (SELECT count(*) FROM public.organization_memberships);
    v_up          bigint := (SELECT count(*) FROM public.user_profiles);
    v_mr          bigint := (SELECT count(*) FROM public.membership_roles);
    v_roles       bigint := (SELECT count(*) FROM public.roles);
    v_rp          bigint := (SELECT count(*) FROM public.role_permissions);
    v_audit       bigint := (SELECT count(*) FROM public.audit_events);
BEGIN
    IF v_org <> v_tenants
       OR v_om <> v_memberships
       OR v_up <> v_users
       OR v_mr <> v_memberships
       OR v_roles <> 2 * v_tenants
       OR v_rp <> 4 * v_roles
       OR v_audit <> v_tenants
    THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P10 failed: migrated cardinalities do not match the source. organizations=%/tenants=%, organization_memberships=%/memberships=%, user_profiles=%/auth_users=%, membership_roles=%/memberships=%, roles=%/2x tenants=%, role_permissions=%/4x roles=%, audit_events=%/tenants=%.',
            v_org, v_tenants, v_om, v_memberships, v_up, v_users, v_mr,
            v_memberships, v_roles, 2 * v_tenants, v_rp, 4 * v_roles,
            v_audit, v_tenants;
    END IF;
END;

-- P10b · per-row completeness. Cardinality equality alone would still admit a
--        mis-distributed insert with matching totals, so assert directly.
DECLARE
    v_om_without_role bigint := (
        SELECT count(*) FROM public.organization_memberships om
         WHERE (SELECT count(*) FROM public.membership_roles mr
                 WHERE mr.membership_id = om.id) <> 1);
    v_org_without_roles bigint := (
        SELECT count(*) FROM public.organizations o
         WHERE (SELECT count(*) FROM public.roles r
                 WHERE r.organization_id = o.id
                   AND r.key IN ('owner', 'manager')) <> 2);
    v_role_without_perms bigint := (
        SELECT count(*) FROM public.roles r
         WHERE (SELECT count(*) FROM public.role_permissions rp
                 WHERE rp.role_id = r.id) <> 4);
    v_org_without_audit bigint := (
        SELECT count(*) FROM public.organizations o
         WHERE (SELECT count(*) FROM public.audit_events a
                 WHERE a.organization_id = o.id
                   AND a.action = 'platform.legacy_bootstrap') <> 1);
BEGIN
    IF v_om_without_role <> 0
       OR v_org_without_roles <> 0
       OR v_role_without_perms <> 0
       OR v_org_without_audit <> 0
    THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P10b failed: per-row completeness does not hold — % membership(s) without exactly one role grant, % organization(s) without exactly the owner and manager roles, % role(s) without exactly four permissions, % organization(s) without exactly one migration audit row.',
            v_om_without_role, v_org_without_roles, v_role_without_perms,
            v_org_without_audit;
    END IF;
END;

-- P11b · excluded Platform/support relations still empty, after the inserts.
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT 'platform_operators' AS t, count(*) AS n FROM public.platform_operators
        UNION ALL SELECT 'support_access_grants', count(*) FROM public.support_access_grants
        UNION ALL SELECT 'support_access_grant_permissions', count(*) FROM public.support_access_grant_permissions
    LOOP
        IF r.n <> 0 THEN
            RAISE EXCEPTION
                'SOLLELIO 3.6-C gate P11b failed: excluded relation public.% is not empty after the inserts (% rows). This bootstrap creates no platform operator and no support access.',
                r.t, r.n;
        END IF;
    END LOOP;
END;

-- P14 · the logo boundary was respected (D5).
DECLARE
    v_bad bigint := (SELECT count(*) FROM public.organizations
                      WHERE logo_path IS NOT NULL);
BEGIN
    IF v_bad <> 0 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P14 failed: % organization(s) carry a non-null logo_path. tenants.logo_url is a public URL, the target column is a bucket-relative path, and deriving one from the other belongs to the controlled storage migration.',
            v_bad;
    END IF;
END;

-- P16 · legacy integrity. The four §10.2 fingerprints recomputed before the
--       transaction ends must equal the pre-insert values exactly, on both the
--       row count and the digest. Same pinned rendering, same locks, same
--       transaction. Any difference aborts.
DECLARE
    v_before text := current_setting('sollelio.c1_fingerprint_before', true);
    v_after  text := (
        SELECT coalesce(string_agg(f.relation || '=' || f.row_count || ':' || f.digest,
                                   E'\n' ORDER BY f.relation), '')
          FROM (
                SELECT 'auth.users' AS relation, count(*) AS row_count,
                       md5(coalesce(string_agg(
                              quote_nullable(u.id::text)                 || '|' ||
                              quote_nullable(u.raw_user_meta_data::text) || '|' ||
                              quote_nullable(u.created_at::text),
                              E'\n' ORDER BY u.id), '')) AS digest
                  FROM auth.users u
                UNION ALL
                SELECT 'public.tenants', count(*),
                       md5(coalesce(string_agg(
                              quote_nullable(t.id::text)         || '|' ||
                              quote_nullable(t.slug)             || '|' ||
                              quote_nullable(t.nome)             || '|' ||
                              quote_nullable(t.prefixo)          || '|' ||
                              quote_nullable(t.locale)           || '|' ||
                              quote_nullable(t.moeda)            || '|' ||
                              quote_nullable(t.estado)           || '|' ||
                              quote_nullable(t.criado_em::text)  || '|' ||
                              quote_nullable(t.titular)          || '|' ||
                              quote_nullable(t.morada)           || '|' ||
                              quote_nullable(t.nif)              || '|' ||
                              quote_nullable(t.iban)             || '|' ||
                              quote_nullable(t.mbway)            || '|' ||
                              quote_nullable(t.foro)             || '|' ||
                              quote_nullable(t.dominio)          || '|' ||
                              quote_nullable(t.whatsapp)         || '|' ||
                              quote_nullable(t.logo_url)         || '|' ||
                              quote_nullable(t.linha_actividade) || '|' ||
                              quote_nullable(t.linha_by)         || '|' ||
                              quote_nullable(t.slogan),
                              E'\n' ORDER BY t.id), ''))
                  FROM public.tenants t
                UNION ALL
                SELECT 'public.memberships', count(*),
                       md5(coalesce(string_agg(
                              quote_nullable(m.user_id::text)   || '|' ||
                              quote_nullable(m.tenant_id::text) || '|' ||
                              quote_nullable(m.papel)           || '|' ||
                              quote_nullable(m.criado_em::text),
                              E'\n' ORDER BY m.user_id, m.tenant_id), ''))
                  FROM public.memberships m
                UNION ALL
                SELECT 'public.app_config', count(*),
                       md5(coalesce(string_agg(
                              quote_nullable(c.tenant_id::text)  || '|' ||
                              quote_nullable(c.chave)            || '|' ||
                              quote_nullable(c.valor)            || '|' ||
                              quote_nullable(c.descricao)        || '|' ||
                              quote_nullable(c.updated_at::text) || '|' ||
                              quote_nullable(c.criado_por::text),
                              E'\n' ORDER BY c.tenant_id, c.chave), ''))
                  FROM public.app_config c
          ) AS f);
BEGIN
    IF v_before IS NULL THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P16 failed: the pre-insert legacy fingerprint was never computed. It must be taken after the complete lock phase and before every gate, count and insert.';
    END IF;

    IF v_before <> v_after THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P16 failed: one or more legacy relations changed during this migration. The legacy schema is a read-only source; every legacy row must remain byte-identical. Before/after fingerprint summaries differ (digests only, no source values are reported).';
    END IF;

    IF array_length(string_to_array(v_after, E'\n'), 1) <> 4 THEN
        RAISE EXCEPTION
            'SOLLELIO 3.6-C gate P16 failed: expected fingerprints for exactly 4 legacy relations, found %.',
            array_length(string_to_array(v_after, E'\n'), 1);
    END IF;
END;

END
$sollelio_bootstrap$;

-- =============================================================================
-- End of the Step 3.6-C bootstrap. The seven target relations are populated,
-- the three excluded relations remain empty, and every legacy relation is
-- byte-identical to how this transaction found it.
-- =============================================================================
