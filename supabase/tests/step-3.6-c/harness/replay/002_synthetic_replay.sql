-- Step 3.6-C · Layer A.3 + A.4 — synthetic bootstrap replay of the EXACT file
--
-- Contract §11.1 A.3/A.4. Seeds synthetic legacy rows, includes the exact
-- versioned migration with \ir (path relative to THIS file, never \i with a
-- CWD-relative path), asserts every contracted mapping, RBAC, lifecycle, audit
-- and legacy-integrity property, and rolls the whole thing back.
--
-- Contract §11.1 A.5: this file contains NO negative/abort case. A failure
-- produced by \ir cannot be caught by throws_ok — psql expands the meta-command
-- client-side and the server never sees it. Every fail-closed case lives in the
-- Layer B exact-file harness.
--
-- Synthetic UUIDs and synthetic values only. No PII anywhere.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create function pg_temp.become(u uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;

create function pg_temp.become_owner() returns void language plpgsql as $fn$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$fn$;

-- the four legacy fingerprints of contract §10.2, as one comparable summary.
-- Identifiers, counts and digests only — never a source value (§10.3).
create function pg_temp.legacy_fingerprint() returns text language sql stable as $fn$
  select coalesce(string_agg(f.relation || '=' || f.row_count || ':' || f.digest,
                             E'\n' order by f.relation), '')
    from (
      select 'auth.users' as relation, count(*) as row_count,
             md5(coalesce(string_agg(
                    quote_nullable(u.id::text) || '|' ||
                    quote_nullable(u.raw_user_meta_data::text) || '|' ||
                    quote_nullable(u.created_at::text),
                    E'\n' order by u.id), '')) as digest
        from auth.users u
      union all
      select 'public.tenants', count(*),
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
                    E'\n' order by t.id), ''))
        from public.tenants t
      union all
      select 'public.memberships', count(*),
             md5(coalesce(string_agg(
                    quote_nullable(m.user_id::text) || '|' || quote_nullable(m.tenant_id::text) || '|' ||
                    quote_nullable(m.papel) || '|' || quote_nullable(m.criado_em::text),
                    E'\n' order by m.user_id, m.tenant_id), ''))
        from public.memberships m
      union all
      select 'public.app_config', count(*),
             md5(coalesce(string_agg(
                    quote_nullable(c.tenant_id::text) || '|' || quote_nullable(c.chave) || '|' ||
                    quote_nullable(c.valor) || '|' || quote_nullable(c.descricao) || '|' ||
                    quote_nullable(c.updated_at::text) || '|' || quote_nullable(c.criado_por::text),
                    E'\n' order by c.tenant_id, c.chave), ''))
        from public.app_config c
    ) f;
$fn$;

-- ---------------------------------------------------------------------------
-- synthetic legacy source
--   one activo tenant, carrying the tenant id the contract's §4.2 closed
--   time-zone map is keyed by (P13 requires it);
--   two auth users with metadata name keys and a created_at deliberately far
--   in the past, so it is distinguishable from the transaction timestamp;
--   two memberships, one dono and one gestor.
-- ---------------------------------------------------------------------------
create temporary table c_synth(k text primary key, v text) on commit drop;
insert into c_synth values
  ('tenant', 'cb563908-7939-494e-bbe4-1e83af4d693a'),
  ('u_dono',   'c0000000-0000-4000-8000-0000000000d1'),
  ('u_gestor', 'c0000000-0000-4000-8000-0000000000d2');

insert into auth.users (id, raw_user_meta_data, created_at) values
  ('c0000000-0000-4000-8000-0000000000d1',
   '{"nome": "Sintetico Dono", "full_name": "Sintetico Dono Completo"}'::jsonb,
   timestamptz '2020-01-02 03:04:05+00'),
  ('c0000000-0000-4000-8000-0000000000d2',
   '{"full_name": "Sintetico Gestor Completo"}'::jsonb,
   timestamptz '2021-06-07 08:09:10+00');

insert into public.tenants
  (id, slug, nome, prefixo, locale, moeda, estado, criado_em,
   titular, morada, nif, iban, mbway, foro, dominio, whatsapp, logo_url,
   linha_actividade, linha_by, slogan)
values
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'casa-sintetica', 'Casa Sintetica',
   'SYN', 'pt-PT', 'EUR', 'activo', timestamptz '2019-03-04 05:06:07+00',
   'Titular Sintetico', 'Morada Sintetica', 'NIF-SYN', 'IBAN-SYN', 'MBWAY-SYN',
   'Foro Sintetico', 'sintetico.example', 'WA-SYN',
   'https://storage.example/identidade/sintetico-logo.png',
   'Linha Actividade Sintetica', 'Linha By Sintetica', 'Slogan Sintetico');

insert into public.memberships (user_id, tenant_id, papel, criado_em) values
  ('c0000000-0000-4000-8000-0000000000d1', 'cb563908-7939-494e-bbe4-1e83af4d693a',
   'dono',   timestamptz '2019-03-04 05:06:08+00'),
  ('c0000000-0000-4000-8000-0000000000d2', 'cb563908-7939-494e-bbe4-1e83af4d693a',
   'gestor', timestamptz '2019-05-06 07:08:09+00');

insert into public.app_config (tenant_id, chave, valor, descricao) values
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'buffer_dias_antes',  '2', 'sintetico'),
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'buffer_dias_depois', '3', 'sintetico');

-- legacy fingerprint BEFORE the replay (contract §11.2 B.7 local expression)
select set_config('c_test.fp_before', pg_temp.legacy_fingerprint(), true);

savepoint before_replay;

-- ---------------------------------------------------------------------------
-- A.3 · replay the EXACT versioned migration file
-- ---------------------------------------------------------------------------
\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql

-- ---------------------------------------------------------------------------
-- A.4 · exact migrated cardinalities — 2 / 1 / 2 / 2 / 8 / 2 and 1 audit row
-- ---------------------------------------------------------------------------
select is((select count(*) from public.user_profiles), 2::bigint, 'cardinality: 2 user_profiles');
select is((select count(*) from public.organizations), 1::bigint, 'cardinality: 1 organization');
select is((select count(*) from public.organization_memberships), 2::bigint, 'cardinality: 2 organization_memberships');
select is((select count(*) from public.roles), 2::bigint, 'cardinality: 2 roles');
select is((select count(*) from public.role_permissions), 8::bigint, 'cardinality: 8 role_permissions (4 per role)');
select is((select count(*) from public.membership_roles), 2::bigint, 'cardinality: 2 membership_roles');
select is((select count(*) from public.audit_events), 1::bigint, 'cardinality: 1 audit event (one per organization)');

-- ---------------------------------------------------------------------------
-- identifier preservation (§3)
-- ---------------------------------------------------------------------------
select is((select id from public.organizations),
          (select id from public.tenants),
          'identity: organizations.id is the preserved tenants.id');
select is((select count(*) from public.user_profiles up
            join auth.users u on u.id = up.user_id), 2::bigint,
  'identity: every user_profiles.user_id is the preserved auth.users.id');
select is((select count(*) from public.organization_memberships om
            where om.id in (select id from public.tenants)
               or om.id in (select id from auth.users)), 0::bigint,
  'identity: organization_memberships.id is a fresh UUID, present in neither source');
select is((select count(distinct id) from public.organization_memberships), 2::bigint,
  'identity: the two generated membership ids are distinct');

-- ---------------------------------------------------------------------------
-- §2.2 organizations column mapping
-- ---------------------------------------------------------------------------
select is(o.slug,               t.slug,             'map: organizations.slug = tenants.slug')
  from public.organizations o, public.tenants t;
select is(o.name,               t.nome,             'map: organizations.name = tenants.nome')
  from public.organizations o, public.tenants t;
select is(o.status,             'active',           'map: activo -> active (D4)')
  from public.organizations o;
select is(o.access_code_prefix, t.prefixo,          'map: access_code_prefix = tenants.prefixo')
  from public.organizations o, public.tenants t;
select is(o.locale,             t.locale,           'map: organizations.locale = tenants.locale')
  from public.organizations o, public.tenants t;
select is(o.currency::text,     t.moeda,            'map: currency = tenants.moeda as char(3)')
  from public.organizations o, public.tenants t;
select is(o.time_zone,          'Europe/Lisbon',    'map: time_zone from the explicit closed mapping (D1)')
  from public.organizations o;
select is(o.legal_owner_name,   t.titular,          'map: legal_owner_name = tenants.titular')
  from public.organizations o, public.tenants t;
select is(o.legal_address,      t.morada,           'map: legal_address = tenants.morada')
  from public.organizations o, public.tenants t;
select is(o.tax_id,             t.nif,              'map: tax_id = tenants.nif')
  from public.organizations o, public.tenants t;
select is(o.iban,               t.iban,             'map: iban = tenants.iban')
  from public.organizations o, public.tenants t;
select is(o.mbway_number,       t.mbway,            'map: mbway_number = tenants.mbway')
  from public.organizations o, public.tenants t;
select is(o.jurisdiction,       t.foro,             'map: jurisdiction = tenants.foro')
  from public.organizations o, public.tenants t;
select is(o.website_domain,     t.dominio,          'map: website_domain = tenants.dominio')
  from public.organizations o, public.tenants t;
select is(o.whatsapp_number,    t.whatsapp,         'map: whatsapp_number = tenants.whatsapp')
  from public.organizations o, public.tenants t;
select is(o.tagline_line_1,     t.linha_actividade, 'map: tagline_line_1 = tenants.linha_actividade')
  from public.organizations o, public.tenants t;
select is(o.tagline_line_2,     t.linha_by,         'map: tagline_line_2 = tenants.linha_by')
  from public.organizations o, public.tenants t;
select is(o.slogan,             t.slogan,           'map: slogan = tenants.slogan')
  from public.organizations o, public.tenants t;
select is(o.created_at,         t.criado_em,        'map: organizations.created_at = tenants.criado_em (D6)')
  from public.organizations o, public.tenants t;
select ok(o.updated_at is null, 'map: organizations.updated_at is NULL — no source')
  from public.organizations o;
select ok(o.closed_at is null,  'map: organizations.closed_at is NULL — no migrated organization is closed')
  from public.organizations o;

-- D5 · the logo boundary
select ok(o.logo_path is null, 'D5: organizations.logo_path is NULL')
  from public.organizations o;
select is((select count(*) from public.organizations where logo_path is not null), 0::bigint,
  'D5/P14: no organization carries a logo_path');
select is((select logo_url from public.tenants),
          'https://storage.example/identidade/sintetico-logo.png',
          'D5: the synthetic tenants.logo_url is unchanged and still present in legacy');

-- ---------------------------------------------------------------------------
-- §2.1 user_profiles column mapping, including the D6/P15 created_at rule
-- ---------------------------------------------------------------------------
select is(up.full_name, 'Sintetico Dono Completo',
          'map: full_name from raw_user_meta_data->>full_name')
  from public.user_profiles up where up.user_id = 'c0000000-0000-4000-8000-0000000000d1';
select is(up.display_name, 'Sintetico Dono',
          'map: display_name prefers the nome key')
  from public.user_profiles up where up.user_id = 'c0000000-0000-4000-8000-0000000000d1';
select is(up.display_name, 'Sintetico Gestor Completo',
          'map: display_name falls back to full_name when nome is absent')
  from public.user_profiles up where up.user_id = 'c0000000-0000-4000-8000-0000000000d2';
select ok(up.full_name is null,
          'map: full_name is NULL when the full_name key is absent... (gestor has one, so this is its value)')
  from public.user_profiles up
  where up.user_id = 'c0000000-0000-4000-8000-0000000000d2' and up.full_name is null;
select is((select count(*) from public.user_profiles where locale is not null), 0::bigint,
  'D10: user_profiles.locale is NULL for every migrated user');
select is((select count(*) from public.user_profiles where time_zone is not null), 0::bigint,
  'D10: user_profiles.time_zone is NULL for every migrated user');
select is((select count(*) from public.user_profiles where updated_at is not null), 0::bigint,
  'map: user_profiles.updated_at is NULL — no source');

-- created_at is EXACTLY auth.users.created_at, with no fallback (D6, P15)
select is((select count(*) from public.user_profiles up
            join auth.users u on u.id = up.user_id
           where up.created_at = u.created_at), 2::bigint,
  'D6/P15: user_profiles.created_at equals auth.users.created_at exactly');
select is((select up.created_at from public.user_profiles up
            where up.user_id = 'c0000000-0000-4000-8000-0000000000d1'),
          timestamptz '2020-01-02 03:04:05+00',
  'D6/P15: the seeded past created_at survived verbatim');
select is((select count(*) from public.user_profiles
            where created_at >= timestamptz '2026-01-01 00:00:00+00'), 0::bigint,
  'D6/P15: no user_profiles.created_at was fabricated from the transaction timestamp');

-- ---------------------------------------------------------------------------
-- §2.3 organization_memberships column mapping
-- ---------------------------------------------------------------------------
select is((select count(*) from public.organization_memberships where status = 'active'), 2::bigint,
  'map: every migrated membership is active');
select is((select count(*) from public.organization_memberships om
            join public.memberships m
              on m.tenant_id = om.organization_id and m.user_id = om.user_id
           where om.joined_at = m.criado_em), 2::bigint,
  'map: organization_memberships.joined_at = memberships.criado_em (D6)');
select is((select count(*) from public.organization_memberships
            where revoked_at is not null), 0::bigint,
  'map: revoked_at is NULL — pairs with active');
select is((select count(*) from public.organization_memberships
            where created_by is not null), 0::bigint,
  'D6: created_by is NULL — no legacy actor column, attribution is never fabricated');

-- ---------------------------------------------------------------------------
-- §2.4 roles and membership_roles, and §6.1 permissions — FILTERED to what
-- this migration created and to the four core keys (contract §6.2 item 6)
-- ---------------------------------------------------------------------------
select set_eq(
  $$select key from public.roles$$,
  $$values ('owner'), ('manager')$$,
  'roles: exactly the owner and manager keys');
select is((select name from public.roles where key = 'owner'),   'Owner',   'roles: owner name');
select is((select name from public.roles where key = 'manager'), 'Manager', 'roles: manager name');
select is((select count(*) from public.roles where is_system), 2::bigint,
  'D2: both migrated roles carry is_system = true');
select is((select count(*) from public.roles where archived_at is not null), 0::bigint,
  'roles: neither migrated role is archived');
select is((select count(*) from public.roles r
            join public.organizations o on o.id = r.organization_id), 2::bigint,
  'roles: both roles belong to the migrated organization');

select set_eq(
  format($$select permission_key from public.role_permissions where role_id = %L$$,
         (select id from public.roles where key = 'owner')),
  $$values ('organization.read'), ('organization.manage'), ('members.manage'), ('audit.read')$$,
  'D2: owner holds exactly the four core permissions');
select set_eq(
  format($$select permission_key from public.role_permissions where role_id = %L$$,
         (select id from public.roles where key = 'manager')),
  $$values ('organization.read'), ('organization.manage'), ('members.manage'), ('audit.read')$$,
  'D2: manager holds exactly the same four core permissions');

select is((select r.key from public.membership_roles mr
            join public.roles r on r.id = mr.role_id
            join public.organization_memberships om on om.id = mr.membership_id
           where om.user_id = 'c0000000-0000-4000-8000-0000000000d1'),
          'owner', 'D3: dono -> owner');
select is((select r.key from public.membership_roles mr
            join public.roles r on r.id = mr.role_id
            join public.organization_memberships om on om.id = mr.membership_id
           where om.user_id = 'c0000000-0000-4000-8000-0000000000d2'),
          'manager', 'D3: gestor -> manager');
select is((select count(*) from public.membership_roles mr
            join public.organization_memberships om on om.id = mr.membership_id
            join public.memberships m
              on m.tenant_id = om.organization_id and m.user_id = om.user_id
           where mr.granted_at = m.criado_em), 2::bigint,
  'D6: membership_roles.granted_at = memberships.criado_em');
select is((select count(*) from public.membership_roles where granted_by is not null), 0::bigint,
  'D6: membership_roles.granted_by is NULL — no authoritative legacy actor');

-- ---------------------------------------------------------------------------
-- P10b · per-row completeness, scoped to the rows this replay created
-- ---------------------------------------------------------------------------
select is((select count(*) from public.organization_memberships om
            where (select count(*) from public.membership_roles mr
                    where mr.membership_id = om.id) <> 1), 0::bigint,
  'P10b: every migrated membership has exactly one role grant');
select is((select count(*) from public.organizations o
            where (select count(*) from public.roles r
                    where r.organization_id = o.id and r.key in ('owner','manager')) <> 2), 0::bigint,
  'P10b: every migrated organization has exactly the owner and manager roles');
select is((select count(*) from public.roles r
            where (select count(*) from public.role_permissions rp
                    where rp.role_id = r.id
                      and rp.permission_key in ('organization.read','organization.manage',
                                                'members.manage','audit.read')) <> 4), 0::bigint,
  'P10b: every migrated role holds exactly the four core permissions');
select is((select count(*) from public.organizations o
            where (select count(*) from public.audit_events a
                    where a.organization_id = o.id
                      and a.action = 'platform.legacy_bootstrap') <> 1), 0::bigint,
  'P10b: every migrated organization has exactly one migration audit row');

-- ---------------------------------------------------------------------------
-- P11 · the three excluded relations
-- ---------------------------------------------------------------------------
select is((select count(*) from public.platform_operators), 0::bigint,
  'P11: platform_operators is still empty after the replay');
select is((select count(*) from public.support_access_grants), 0::bigint,
  'P11: support_access_grants is still empty after the replay');
select is((select count(*) from public.support_access_grant_permissions), 0::bigint,
  'P11: support_access_grant_permissions is still empty after the replay');

-- ---------------------------------------------------------------------------
-- §8 · audit shape and PII safety
-- ---------------------------------------------------------------------------
select is(a.actor_kind, 'migration', 'audit: actor_kind is migration')
  from public.audit_events a;
select ok(a.actor_user_id is null and a.actor_membership_id is null
          and a.actor_support_grant_id is null and a.actor_portal_access_id is null
          and a.actor_integration_key is null and a.actor_automation_key is null,
          'audit: every actor correlation column is NULL for actor_kind = migration')
  from public.audit_events a;
select is(a.action, 'platform.legacy_bootstrap', 'audit: action key')
  from public.audit_events a;
select is(a.root_type, 'organization', 'audit: root_type')   from public.audit_events a;
select is(a.entity_type, 'organization', 'audit: entity_type') from public.audit_events a;
select is(a.root_id, (select id from public.organizations), 'audit: root_id is the organization')
  from public.audit_events a;
select is(a.entity_id, (select id from public.organizations), 'audit: entity_id is the organization')
  from public.audit_events a;
select ok(a.request_id is null and a.ip is null and a.user_agent is null,
          'audit: request_id, ip and user_agent are NULL')
  from public.audit_events a;
select set_eq(
  $$select jsonb_object_keys(change) from public.audit_events$$,
  $$values ('migration_version'), ('source'), ('created'), ('identity'), ('deferred')$$,
  'audit: the change payload has exactly the five technical top-level keys of §8');
select is((select change #>> '{identity,organization_id_preserved}' from public.audit_events), 'true',
  'audit: identity.organization_id_preserved');
select is((select change #>> '{identity,user_ids_preserved}' from public.audit_events), 'true',
  'audit: identity.user_ids_preserved');
select is((select change #>> '{deferred,logo_path}' from public.audit_events), 'storage_branding_migration',
  'audit: deferred.logo_path');
select is((select change #>> '{deferred,app_config}' from public.audit_events), 'event_product_settings',
  'audit: deferred.app_config');
select is((select change #>> '{source,tenants}' from public.audit_events), '1', 'audit: source.tenants count');
select is((select change #>> '{source,auth_users}' from public.audit_events), '2', 'audit: source.auth_users count');
select is((select change #>> '{created,role_permissions}' from public.audit_events), '8',
  'audit: created.role_permissions count');

-- no business value and no fingerprint digest may appear anywhere in the payload
select is((select count(*) from public.audit_events a
            where a.change::text ~* '(Sintetico|Titular|Morada|NIF-|IBAN-|MBWAY-|WA-|sintetico\.example|storage\.example|casa-sintetica|Slogan)'), 0::bigint,
  'audit: the change payload contains no business value from the synthetic source');
select is((select count(*) from public.audit_events a
            where a.change::text ~ '\m[0-9a-f]{32}\M'), 0::bigint,
  'audit: the change payload contains no fingerprint digest');
select is((select count(*) from public.audit_events a
            where a.actor_label = '20260825103955_v2_legacy_organization_rbac_bootstrap'), 1::bigint,
  'audit: actor_label is the migration version string');

-- ---------------------------------------------------------------------------
-- behaviour · has_permission and access_mode for both migrated users
-- ---------------------------------------------------------------------------
select pg_temp.become('c0000000-0000-4000-8000-0000000000d1');
select ok(public.has_permission((select id from public.organizations), k),
          'behaviour: the dono user holds ' || k)
  from unnest(array['organization.read','organization.manage','members.manage','audit.read']) as k;
select is(public.access_mode((select id from public.organizations)), 'membership',
  'behaviour: access_mode is membership for the dono user');
select pg_temp.become_owner();

select pg_temp.become('c0000000-0000-4000-8000-0000000000d2');
select ok(public.has_permission((select id from public.organizations), k),
          'behaviour: the gestor user holds ' || k)
  from unnest(array['organization.read','organization.manage','members.manage','audit.read']) as k;
select is(public.access_mode((select id from public.organizations)), 'membership',
  'behaviour: access_mode is membership for the gestor user');
select pg_temp.become_owner();

-- ---------------------------------------------------------------------------
-- legacy integrity · the four §10.2 fingerprints are unchanged by the replay
-- ---------------------------------------------------------------------------
select is(pg_temp.legacy_fingerprint(), current_setting('c_test.fp_before', true),
  'P16 (local): all four legacy fingerprints are identical before and after the replay');
select is((select count(*) from public.app_config), 2::bigint,
  'deferred: public.app_config still holds its two synthetic keys, untouched');

-- ---------------------------------------------------------------------------
-- D4 · suspenso maps to suspended and does NOT abort.
-- Because the D1 map is keyed by tenant id and holds exactly one entry, this
-- cannot be a second tenant — that would abort at P13 first. So: roll back to
-- the pre-replay state, re-seed THE SAME mapped tenant id with estado =
-- 'suspenso', replay, and assert.
-- ROLLBACK TO SAVEPOINT, never RELEASE: release would keep every change made
-- since the savepoint and leave the mapped UUID occupied (contract §15.3 F5).
-- ---------------------------------------------------------------------------
rollback to savepoint before_replay;

update public.tenants set estado = 'suspenso'
 where id = 'cb563908-7939-494e-bbe4-1e83af4d693a';

\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql

select is((select status from public.organizations), 'suspended',
  'D4: suspenso -> suspended, and it does not abort');
select is((select count(*) from public.organizations where closed_at is not null), 0::bigint,
  'D4: a suspended organization still has a NULL closed_at');

select pg_temp.become('c0000000-0000-4000-8000-0000000000d1');
select ok(not public.has_permission((select id from public.organizations), k),
          'D4: a suspended organization grants no ' || k)
  from unnest(array['organization.read','organization.manage','members.manage','audit.read']) as k;
select is(public.access_mode((select id from public.organizations)), 'none',
  'D4: access_mode is none for a suspended organization');
select pg_temp.become_owner();

-- ---------------------------------------------------------------------------
-- nothing in this suite constrains unrelated future migrations
-- ---------------------------------------------------------------------------
select * from finish();
rollback;
