-- Step 3.6-C · Layer B — reconnect-and-verify.
-- Run on a FRESH connection after a negative case, so nothing is inferred from
-- the dead session. Proves zero surviving writes.
DO $chk$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT 'user_profiles' t, count(*) n FROM public.user_profiles
        UNION ALL SELECT 'organizations', count(*) FROM public.organizations
        UNION ALL SELECT 'organization_memberships', count(*) FROM public.organization_memberships
        UNION ALL SELECT 'roles', count(*) FROM public.roles
        UNION ALL SELECT 'role_permissions', count(*) FROM public.role_permissions
        UNION ALL SELECT 'membership_roles', count(*) FROM public.membership_roles
        UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events
        UNION ALL SELECT 'platform_operators', count(*) FROM public.platform_operators
        UNION ALL SELECT 'support_access_grants', count(*) FROM public.support_access_grants
        UNION ALL SELECT 'support_access_grant_permissions', count(*) FROM public.support_access_grant_permissions
        UNION ALL SELECT 'auth.users', count(*) FROM auth.users
        UNION ALL SELECT 'tenants', count(*) FROM public.tenants
        UNION ALL SELECT 'memberships', count(*) FROM public.memberships
        UNION ALL SELECT 'app_config', count(*) FROM public.app_config
    LOOP
        IF r.n <> 0 THEN
            RAISE EXCEPTION 'HARNESS: % survived the rolled-back case with % row(s)', r.t, r.n;
        END IF;
    END LOOP;
    RAISE NOTICE 'HARNESS: zero surviving writes; every target and every legacy relation is empty';
END;
$chk$;
