-- Step 3.6-C · Layer B — expectations for the POSITIVE case.
-- Runs inside the same transaction, immediately after the exact migration.
-- Any violation raises, which under ON_ERROR_STOP=1 fails the case.
-- Synthetic values only; nothing here prints a source value.
DO $chk$
DECLARE
    v_org uuid := (SELECT id FROM public.organizations);
    n bigint;
    t text;
BEGIN
    -- cardinalities: 2 / 1 / 2 / 2 / 8 / 2 and one audit row
    IF (SELECT count(*) FROM public.user_profiles) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: expected 2 user_profiles'; END IF;
    IF (SELECT count(*) FROM public.organizations) <> 1 THEN
        RAISE EXCEPTION 'HARNESS: expected 1 organization'; END IF;
    IF (SELECT count(*) FROM public.organization_memberships) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: expected 2 organization_memberships'; END IF;
    IF (SELECT count(*) FROM public.roles) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: expected 2 roles'; END IF;
    IF (SELECT count(*) FROM public.role_permissions) <> 8 THEN
        RAISE EXCEPTION 'HARNESS: expected 8 role_permissions'; END IF;
    IF (SELECT count(*) FROM public.membership_roles) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: expected 2 membership_roles'; END IF;
    IF (SELECT count(*) FROM public.audit_events) <> 1 THEN
        RAISE EXCEPTION 'HARNESS: expected 1 audit event'; END IF;

    -- identity preservation
    IF v_org IS DISTINCT FROM (SELECT id FROM public.tenants) THEN
        RAISE EXCEPTION 'HARNESS: organizations.id is not the preserved tenants.id'; END IF;
    IF (SELECT count(*) FROM public.user_profiles up
         JOIN auth.users u ON u.id = up.user_id) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: user_profiles.user_id is not the preserved auth.users.id'; END IF;
    IF (SELECT count(*) FROM public.organization_memberships om
         WHERE om.id IN (SELECT id FROM public.tenants)
            OR om.id IN (SELECT id FROM auth.users)) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: organization_memberships.id is not a fresh UUID'; END IF;

    -- §2.2 mapping and the D1/D4/D5 decisions
    IF (SELECT status FROM public.organizations) <> 'active' THEN
        RAISE EXCEPTION 'HARNESS: activo did not map to active'; END IF;
    IF (SELECT time_zone FROM public.organizations) <> 'Europe/Lisbon' THEN
        RAISE EXCEPTION 'HARNESS: time_zone did not come from the explicit closed mapping'; END IF;
    IF (SELECT count(*) FROM public.organizations WHERE logo_path IS NOT NULL) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: D5/P14 violated — a logo_path was set'; END IF;
    IF (SELECT count(*) FROM public.organizations WHERE closed_at IS NOT NULL) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: closed_at is not NULL'; END IF;
    IF (SELECT count(*) FROM public.organizations o JOIN public.tenants t ON t.id = o.id
         WHERE o.slug = t.slug AND o.name = t.nome AND o.access_code_prefix = t.prefixo
           AND o.locale = t.locale AND o.currency::text = t.moeda
           AND o.created_at = t.criado_em) <> 1 THEN
        RAISE EXCEPTION 'HARNESS: an organizations column does not equal its source expression'; END IF;

    -- §2.1 mapping and the D6/P15 created_at rule
    IF (SELECT count(*) FROM public.user_profiles up JOIN auth.users u ON u.id = up.user_id
         WHERE up.created_at = u.created_at) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: user_profiles.created_at is not exactly auth.users.created_at'; END IF;
    IF (SELECT count(*) FROM public.user_profiles
         WHERE created_at >= timestamptz '2026-01-01 00:00:00+00') <> 0 THEN
        RAISE EXCEPTION 'HARNESS: a created_at was fabricated from the transaction timestamp'; END IF;
    IF (SELECT count(*) FROM public.user_profiles
         WHERE locale IS NOT NULL OR time_zone IS NOT NULL) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: D10 violated — a per-user locale or time_zone was set'; END IF;
    IF (SELECT count(*) FROM public.user_profiles WHERE display_name IS NULL) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: a migrated user has no display_name'; END IF;

    -- §2.3 lifecycle
    IF (SELECT count(*) FROM public.organization_memberships
         WHERE status <> 'active' OR revoked_at IS NOT NULL OR created_by IS NOT NULL) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: a membership lifecycle column is wrong'; END IF;

    -- §2.4 roles, §6.1 permissions, D3 papel map
    IF (SELECT count(*) FROM public.roles WHERE key IN ('owner','manager') AND is_system) <> 2 THEN
        RAISE EXCEPTION 'HARNESS: the owner/manager system roles were not created'; END IF;
    FOR t IN SELECT key FROM public.roles LOOP
        IF (SELECT count(*) FROM public.role_permissions rp
             JOIN public.roles r ON r.id = rp.role_id
            WHERE r.key = t
              AND rp.permission_key IN ('organization.read','organization.manage',
                                        'members.manage','audit.read')) <> 4 THEN
            RAISE EXCEPTION 'HARNESS: role % does not hold exactly the four core permissions', t;
        END IF;
    END LOOP;
    IF (SELECT r.key FROM public.membership_roles mr
         JOIN public.roles r ON r.id = mr.role_id
         JOIN public.organization_memberships om ON om.id = mr.membership_id
        WHERE om.user_id = 'c0000000-0000-4000-8000-0000000000d1') <> 'owner' THEN
        RAISE EXCEPTION 'HARNESS: dono did not map to owner'; END IF;
    IF (SELECT r.key FROM public.membership_roles mr
         JOIN public.roles r ON r.id = mr.role_id
         JOIN public.organization_memberships om ON om.id = mr.membership_id
        WHERE om.user_id = 'c0000000-0000-4000-8000-0000000000d2') <> 'manager' THEN
        RAISE EXCEPTION 'HARNESS: gestor did not map to manager'; END IF;

    -- P11 · the excluded relations
    IF (SELECT count(*) FROM public.platform_operators)
     + (SELECT count(*) FROM public.support_access_grants)
     + (SELECT count(*) FROM public.support_access_grant_permissions) <> 0 THEN
        RAISE EXCEPTION 'HARNESS: P11 violated — an excluded Platform/support relation is populated'; END IF;

    -- §8 · audit shape and PII safety
    IF (SELECT count(*) FROM public.audit_events
         WHERE actor_kind = 'migration' AND action = 'platform.legacy_bootstrap'
           AND root_type = 'organization' AND entity_type = 'organization'
           AND root_id = v_org AND entity_id = v_org
           AND actor_user_id IS NULL AND actor_membership_id IS NULL
           AND actor_support_grant_id IS NULL AND actor_portal_access_id IS NULL
           AND actor_integration_key IS NULL AND actor_automation_key IS NULL
           AND request_id IS NULL AND ip IS NULL AND user_agent IS NULL) <> 1 THEN
        RAISE EXCEPTION 'HARNESS: the audit row does not have the contracted shape'; END IF;
    IF (SELECT count(*) FROM public.audit_events
         WHERE change::text ~* '(Sintetico|Titular|Morada|NIF-|IBAN-|MBWAY-|WA-|sintetico\.example|storage\.example|casa-sintetica|Slogan)') <> 0 THEN
        RAISE EXCEPTION 'HARNESS: the audit change payload leaked a business value'; END IF;
    IF (SELECT count(*) FROM public.audit_events WHERE change::text ~ '\m[0-9a-f]{32}\M') <> 0 THEN
        RAISE EXCEPTION 'HARNESS: the audit change payload contains a fingerprint digest'; END IF;
    SELECT count(*) INTO n FROM (
        SELECT jsonb_object_keys(change) k FROM public.audit_events) s
      WHERE s.k NOT IN ('migration_version','source','created','identity','deferred');
    IF n <> 0 THEN
        RAISE EXCEPTION 'HARNESS: the audit change payload has an unexpected top-level key'; END IF;

    RAISE NOTICE 'HARNESS: positive expectations all passed';
END;
$chk$;
