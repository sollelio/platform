# Sollelio v2 — Step 3.6-C: legacy → v2 Organization/RBAC bootstrap contract

Status: **Canonical implementation contract v6**
Step: **3.6-C**
Date: 2026-08-25

Supersedes v5, SHA256
`f371924f6c39cb90f3d5cd27a65c9c37b8c6c1c9368a6b4530e461d0222bd894`
(160,423 bytes / 2,384 lines), which this document replaces in full for the
migration in scope. v5 superseded v4, SHA256
`004b71800e09d72962f953de50b48100f061bb43daf49d480249aee32963fc6a`
(151,396 bytes / 2,251 lines); v4 superseded v3, SHA256
`f964393056ad67c21f22e3a1f592bfe3f7c46f3d1b839e27c3c2aa98361c4fc3`
(135,587 bytes / 2,020 lines); v3 superseded v2, SHA256
`e7bb721cf33679725e5fbe8f3dab2fba3f71ebb92586e6ee02a201e9240b79bf`
(120,006 bytes / 1,817 lines); v2 superseded v1, SHA256
`e07ef899337ecfbe3df618e74358d1525efbc75807832c00e1338b9272dcf002`
(42,421 bytes / 678 lines).

Lineage:

| Version | SHA256 | Date | Role |
|---|---|---|---|
| Step 3.6-C0 draft | `d0da74c2ef927bc20f9e6126d867116572936a679d13a1f18b10b31dbcde04eb` | 2026-08-23 | first draft, superseded by v1 |
| Canonical implementation contract **v1** | `e07ef899337ecfbe3df618e74358d1525efbc75807832c00e1338b9272dcf002` | 2026-08-24 | approved architectural input; source of every D1–D12 mapping carried forward here |
| Canonical implementation contract **v2** | `e7bb721cf33679725e5fbe8f3dab2fba3f71ebb92586e6ee02a201e9240b79bf` | 2026-08-25 | v1 plus the ten corrections of §16; no approved mapping changed except D6. Raised two contradictions (X1, X2) and left them explicitly unresolved for review |
| Canonical implementation contract **v3** | `f964393056ad67c21f22e3a1f592bfe3f7c46f3d1b839e27c3c2aa98361c4fc3` | 2026-08-25 | v2 plus the approved resolutions of §17: X1 and X2 closed, `NOWAIT` on every migration lock, P16 approved as normative. Locked `permissions` and `auth.users` in `SHARE`, and overclaimed that `NOWAIT` made the whole migration incapable of waiting or deadlocking |
| Canonical implementation contract **v4** | `004b71800e09d72962f953de50b48100f061bb43daf49d480249aee32963fc6a` | 2026-08-25 | v3 with the lock/deadlock overclaim narrowed to the guarantee actually provided, and groups B and D (the two foreign-key parents holding pre-existing rows) strengthened `SHARE` → `EXCLUSIVE`, with G2 rehearsing the final group-D statement. Nothing else changed (§18). Its *explanation* of the row-lock conflict was imprecise — corrected in v5 |
| Canonical implementation contract **v5** | `f371924f6c39cb90f3d5cd27a65c9c37b8c6c1c9368a6b4530e461d0222bd894` | 2026-08-25 | v4 with one **factual erratum** in the row-lock explanation of §9.1 and §18, and the foreign-key inventory reworded. Explanatory accuracy only. Its **CLI-supplied-transaction premise was false**, proven by local execution and corrected in v6 |
| Canonical implementation contract **v6** | *(this document)* | 2026-08-25 | v5 with the **execution model** corrected: the migration is **one top-level `DO` statement**, atomic under PostgreSQL's implicit statement transaction, because Supabase CLI 2.115.0 does **not** wrap a migration file in a transaction. Every functional decision of v5 is preserved unchanged (§20) |

Prepared against: HEAD `de48f2550225fe75e753e9119cc26b6eb62d803a` (develop).

**What v6 changes, and only this** (§20): the **execution model**. Local
execution proved that Supabase CLI 2.115.0 does **not** supply a transaction
around a migration file — both `supabase db reset --local --no-seed` and
`supabase db push --local` failed at statement 0 with SQLSTATE `25P01`,
*"LOCK TABLE can only be used in transaction blocks"*. v5's
CLI-supplied-transaction premise was therefore false.

v6 obtains atomicity from PostgreSQL instead of from the CLI: the migration
file contains **exactly one top-level executable statement — a single `DO`
anonymous PL/pgSQL block** — which PostgreSQL executes inside its own implicit
statement transaction. Locks, rendering configuration, fingerprints, every gate
and every insert live inside that one statement, so they either all take effect
or none does.

**No functional decision changes.** Every mapping, D1–D12, P0–P16, cardinality,
insert, fingerprint, lock group, mode, `NOWAIT`, the A → B → C → D order, G2,
the seven negative fixtures and the positive fixture are exactly as v5 approved
them.

**What v5 changed** (§19), carried forward unaltered: a **factual erratum** in
how §9.1 and §18 explained the row-lock conflict. v4 implied that any of
`SELECT … FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE` or `FOR KEY SHARE`
would hold a row lock blocking the bootstrap's foreign-key check. Only
**`FOR UPDATE`** does. v5 also rewords the foreign-key inventory to describe
the checks this bootstrap actually performs with non-null values. **No lock
mode, no gate and no runtime behaviour changes** — the four lock groups and G2
are byte-for-byte what v4 approved.

**What v4 changed** (§18), carried forward unaltered: it corrected v3's
conclusion that `NOWAIT` on the explicit table locks made the **whole
migration** incapable of waiting or deadlocking. That is false. `NOWAIT`
governs only the explicit `LOCK TABLE` acquisition; row-level waits remain
possible, because `SHARE` and `SHARE ROW EXCLUSIVE` are both compatible with
`ROW SHARE`, and foreign-key validation on `INSERT` checks the referenced row
with `SELECT … FOR KEY SHARE`, which an existing `FOR UPDATE` on that row
blocks (§9.1).

v4 therefore:

1. strengthens lock group **B** — `public.permissions` — from `SHARE` to
   **`EXCLUSIVE`**;
2. strengthens lock group **D** — `auth.users` — from `SHARE` to
   **`EXCLUSIVE`**;
3. updates the **G2** probe to rehearse the final group-D statement,
   `lock table auth.users in exclusive mode nowait`;
4. **narrows the universal deadlock/no-wait claim** to the guarantee actually
   provided.

Groups A and C are unchanged, all four groups keep `NOWAIT`, and no mapping,
decision, precondition, postcondition, fingerprint, cardinality or fixture
changes.

Everything else is carried forward from v3, which carried it from v2
unchanged. In particular, relative to v3: **X1 and X2 remain resolved** (§17,
§15.3), P16 remains normative, and there are **no unresolved contradictions**.
Relative to v1: v2 changed **one** approved D1–D12 mapping — **D6**, whose
`user_profiles.created_at` fallback correction 3 removed (§2.1, §7, P15) — and
every other D1–D12 mapping, every source-to-target mapping, every role
permission, every cardinality and every lifecycle decision is exactly as
approved. v2's other corrections (transaction and lock handling, fail-closed
empty-source behaviour, the local testing architecture, legacy-integrity
verification, the future permission boundary) and its **eight factual
corrections** — six inherited from v1, two introduced in v2 drafting, all
citation/evidence/mechanism only — stand as approved (§15.3, §16).

## Implemented migration scope

One new migration, later than `20260824004513`, which performs the **first and
only** legacy-data bootstrap into the Step 3.6-A2 Platform/IAM/RBAC/Audit
tables. It populates exactly seven relations — `user_profiles`,
`organizations`, `organization_memberships`, `roles`, `role_permissions`,
`membership_roles`, `audit_events` — from exactly three legacy sources —
`auth.users`, `public.tenants`, `public.memberships`. It creates no platform
operator and no support access, writes nothing to any legacy table, moves no
storage object, and defers `public.app_config` entirely.

## 0. Sources inspected and their authority

| # | Source | Role |
|---|---|---|
| 1 | `docs/architecture/contracts/sollelio-v2-step-3.6-a2-canonical-contract-v1.md` | frozen v2 target semantics |
| 2 | `supabase/migrations/20260821024034_legacy_production_baseline.sql` | exact **legacy `public`** schema — the only authority on which legacy `public` columns exist |
| 3 | `supabase/migrations/20260822112333_v2_platform_iam_rbac_audit_foundation.sql` | exact v2 DDL as applied to staging |
| 4 | `supabase/migrations/20260824004513_v2_core_permission_catalogue.sql` | the four core permission keys |
| 5 | `supabase/tests/step-3.6-a2/**`, `supabase/tests/step-3.6-b/**` | behavioural contract already enforced locally |
| 6 | Application code: `src/lib/stock.js`, `src/lib/identidadeCasa.js`, `src/App.jsx`, `src/components/PortaDaCasa.jsx`, `src/lib/captacao.js`, plus repo-wide greps for `papel` / `dono` / `gestor` / `memberships` / `app_config` / user-metadata keys | how legacy data is actually interpreted at runtime |
| 7 | `docs/migracoes/090_o_primeiro_tenant.sql`, `docs/glossario.md` | recorded intent of the legacy model |
| 8 | Step 3.5 preflight artifacts under `/tmp/sollelio-audit/preflight/` (`q/p01`–`p04` and their audited results) | staging cardinalities and invariants |

### 0.1 Authority note — `auth.users` is *not* defined by the canonical baseline

**Normative.** `auth.users` belongs to the **Supabase-managed `auth` schema**.
It is owned and evolved by the Supabase Auth service, not by this repository.
The canonical legacy baseline
(`20260821024034_legacy_production_baseline.sql`) contains **no**
`CREATE TABLE auth.users`, no `CREATE SCHEMA auth` and no `auth`-schema DDL at
all. It touches `auth.users` only *from* `public`, as an **external** relation,
in seventeen places:

* two `FROM auth.users u` reads inside legacy SQL function bodies — baseline
  **4137** (`public.nome_do_autor`) and **4157**
  (`public.nome_do_utilizador`);
* fifteen schema-quoted `REFERENCES "auth"."users"("id")` foreign-key clauses —
  baseline 5661, 5669, 5693, 5713, 5721, 5733, 5741, 5765, 5789, **5801**,
  5805, 5813, 5829, 5889, 5917. (These are written schema-quoted, so a naive
  `grep 'auth.users'` misses all fifteen. Baseline 5801 is
  `memberships_user_id_fkey`, which §2.3 cites.)

Referencing a relation is not defining it: **not one** of the seventeen is DDL
for `auth.users`.

Consequences that this contract enforces throughout:

* the baseline **must never be cited as the DDL authority** for
  `auth.users` — its columns, nullability, defaults, privileges or ownership;
* the authority for `auth.users` is the deployed Supabase `auth` schema of the
  environment in question, and it may differ between local and hosted staging;
* **ownership and privileges differ by schema.** All 34 legacy `public`
  tables carry an **explicit** ownership statement — `ALTER TABLE
  "public"."tenants" OWNER TO "postgres"` (baseline 5248), `ALTER TABLE
  "public"."app_config" OWNER TO "postgres"` (baseline 4464), and one for each
  of the other 32, with no non-`postgres` owner anywhere in the file. The A2
  and B1 migrations contain **zero** `OWNER TO` statements, so the eleven A2
  relations are owned **implicitly, by the role that applied the migration** —
  which under `supabase db push` is the same role that will run this
  bootstrap. Both groups therefore end up owned by the migration role.
  `auth.users` does not: it is owned by the Supabase Auth service role. Any
  capability proven for `public` relations therefore proves **nothing** about
  `auth.users` (§9.2). Since v4 the mode this migration needs on `auth.users`
  is **`EXCLUSIVE`** rather than `SHARE` (§9.1 group D). That does not change
  the capability argument: `EXCLUSIVE` and `SHARE` sit in the **same privilege
  bucket** — `UPDATE`, `DELETE`, `TRUNCATE` (or `MAINTAIN`), or ownership — so
  the same ownership asymmetry decides both, and G2 remains the only way to
  settle it (§9.2);
* **local capability is not staging capability.** A local PostgreSQL instance
  in which the `postgres` role has `rolsuper = false` and nonetheless holds
  DML access to `auth.users` demonstrates only that local grant
  configuration. It is not evidence about hosted staging (§9.2).

Database-derived content was treated as untrusted data throughout. Outside the
single technical UUID that decision D1 requires for a deterministic mapping,
this document contains only column names, aggregate counts and catalogue
values. No names, e-mails, addresses, tax IDs, bank details or telephone
numbers are reproduced.

Staging facts (audited in Steps 3.5-A, 3.6-B3, 3.6-B4): 1 legacy tenant
(`estado='activo'`); 2 auth users; 2 memberships (1 `dono`, 1 `gestor`);
users ↔ memberships form a bijection; no multi-tenant users; `app_config`
holds exactly the two buffer keys; all A2 tables empty except `permissions`,
which holds exactly the four core keys.

---

## 1. Scope

### Tables this bootstrap populates

| Table | Populated | Expected rows (staging) |
|---|---|---|
| `user_profiles` | yes | 2 |
| `organizations` | yes | 1 |
| `organization_memberships` | yes | 2 |
| `roles` | yes | 2 (`owner` + `manager`, per organization) |
| `role_permissions` | yes | 8 (4 per role — D2) |
| `membership_roles` | yes | 2 |
| `audit_events` | yes | 1 (D7) |

### Tables this bootstrap must leave empty

| Table | Why |
|---|---|
| `platform_operators` | No legacy platform-operator concept exists; «a Sollelio não é um tenant» (090:44). A2: first-admin bootstrap is a later service-role operation. |
| `support_access_grants` | No legacy support-access concept; grants are append-only operational acts, never migrated data. |
| `support_access_grant_permissions` | Follows its parent. |

The migration must assert all three hold zero rows **both before any insert
and after the inserts** (P11, §9.4) — unconditionally, including on a wholly
empty source.

### Coverage of the eleven A2 relations

Every one of the eleven relations created by the A2 foundation has a defined
pre-state assertion in this contract, so none is left unchecked:

| Relation group | Count | Pre-state assertion |
|---|---|---|
| the seven populated targets | 7 | **P1** — zero rows, asserted unconditionally |
| `platform_operators`, `support_access_grants`, `support_access_grant_permissions` | 3 | **P11** — zero rows before and after, asserted unconditionally |
| `permissions` | 1 | **P8** — the four core keys present, asserted unconditionally |

7 + 3 + 1 = 11. There is no A2 relation whose pre-state this migration ignores.

---

## 2. Source-to-target mapping

Legend: *preserved* = source UUID copied verbatim; *generated* = target default
`gen_random_uuid()`.

### 2.1 `auth.users` → `public.user_profiles`

One profile per `auth.users` row, admitted only under the bijection of D9/P4.

| Target column | Source expression | Transformation | Null/default | UUID | Evidence |
|---|---|---|---|---|---|
| `user_id` | `u.id` | none | NOT NULL (PK) | **preserved** | A2 DDL: `user_profiles.user_id` is PK and FK to `auth.users(id)` |
| `full_name` | `nullif(btrim(u.raw_user_meta_data->>'full_name'), '')` | trim; blank → NULL | NULL allowed | — | `full_name` is the second key of the legacy resolution chain in `public.nome_do_autor()` (the `full_name` key is baseline 4135; the function spans 4129–4143). Taken alone it is the closest legacy analogue of a full legal/display name. No application code reads it directly (D11). |
| `display_name` | `coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), ''))` | per-key trim, first non-blank wins; **no e-mail fallback** | NULL allowed by the target, but P5 requires non-NULL for every migrated user | — | The legacy display-name chain is defined by **two** baseline SQL functions with **character-identical resolution chains** (a `diff` of baseline 4133–4136 against 4153–4156 is empty; the surrounding `WHERE` clauses differ, and the bodies as a whole are therefore *not* identical): `public.nome_do_autor(uuid)` (baseline 4129–4143; chain 4133–4136), keyed on a parameter and restricted to users sharing a tenant with the caller, and `public.nome_do_utilizador()` (baseline 4149–4159; chain 4153–4156), keyed on `auth.uid()` and documented at baseline 4165 as «O nome de quem tem sessão — para a saudação do admin». Both resolve `nome → full_name → split_part(email,'@',1)`. This mapping reproduces the first two links and deliberately drops the third (D11). |
| `locale` | — | none | **NULL** (D10) | — | no per-user locale exists in legacy; copying the organization locale would fabricate a personal preference |
| `time_zone` | — | none | **NULL** (D10) | — | same reasoning |
| `created_at` | `u.created_at` | **none** | **exactly `u.created_at`; no fallback, no `coalesce`, no `now()`, no `transaction_timestamp()`, no reliance on the column default** | — | **D6, corrected in v2.** Guarded by **P15** (§9.4). |
| `updated_at` | — | none | NULL | — | no source |

**Evidence limits (D11).** The inspected authority for these metadata keys is
the pair of legacy SQL functions named above; there is no third definition and
no conflicting one. The front end does **not** read `raw_user_meta_data`,
`user_metadata`, `full_name` or `display_name` directly — a repo-wide grep over
`src/` returns no such reader, which is why §2.1's `full_name` row says "no
application code reads it directly". It does, however, **consume the chain
through the database**: `src/lib/autoria.js` calls both functions by RPC
(`pedirNome("nome_do_utilizador", {})` at `src/lib/autoria.js:81` and
`pedirNome("nome_do_autor", { p_user: uuid })` at `src/lib/autoria.js:89`), and
its header comment states the division of labour — «`nome_do_utilizador()` diz
quem TEM a sessão, `nome_do_autor(uuid)` diz quem escreveu aquilo». So the
chain is not a dormant database curiosity: it is the live source of every
display name the application shows. *(v1 stated that no application reader was
found and therefore declined to claim front-end corroboration. That was too
weak — the corroboration exists, by RPC. See §15.3, F2.)*

Step 3.5-A `p03` audited `without_display_name = 0` using a **stricter**
expression (`nullif(btrim(coalesce(nome, full_name, '')), '')` — coalesce
first, trim once, which flags a whitespace-only `nome` even when `full_name`
is valid). Because that predicate is strictly stricter on the relevant cases,
its zero result entails that the per-key chain above resolves for every
audited user; **P5 re-asserts it at migration time regardless.**

**`created_at` — no fabricated authentication timestamp (v2 correction).**
v1 permitted a fallback from `auth.users.created_at` to the migration
transaction timestamp when the source was NULL. That fallback is **removed**.
The mapping is exactly:

```
user_profiles.created_at = auth.users.created_at
```

A user's account-creation instant is an authoritative fact owned by the
Supabase Auth service. If it is absent, the correct outcome is to stop and
investigate the auth record, never to invent a creation date that would then
be indistinguishable from a real one for the rest of the platform's life.

Because `public.user_profiles.created_at` is declared
`timestamptz not null default now()` (A2 migration §1.1; A2 contract §4.1),
two implementation
requirements follow and are **normative**:

* the migration's `INSERT` **must list `created_at` explicitly** and assign it
  `u.created_at`. Omitting the column, or writing `default`, would silently
  substitute `now()` and reintroduce exactly the fabrication this correction
  removes;
* **P15** must be evaluated **before** the insert, so the failure the operator
  sees is the named contract violation and not an opaque
  `null value in column "created_at" violates not-null constraint`.

### 2.2 `public.tenants` → `public.organizations`

| Target column | Source expression | Transformation | Null/default | UUID | Evidence |
|---|---|---|---|---|---|
| `id` | `t.id` | none | NOT NULL (PK) | **preserved** (§3) | baseline: `CREATE TABLE tenants` at 5221, `id uuid` at 5222, `tenants_pkey` at 5466 |
| `slug` | `t.slug` | none | NOT NULL | — | `tenants_slug_formato` ≡ `organizations_slug_format` (`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`); legacy `tenants_slug_key UNIQUE` ≡ target UNIQUE |
| `name` | `t.nome` | none | NOT NULL | — | direct semantic equivalent |
| `status` | `t.estado` via the closed map of §4 | `activo→active`, `suspenso→suspended`; anything else **aborts** | NOT NULL | — | §4, D4 |
| `access_code_prefix` | `t.prefixo` | none | NOT NULL | — | `^[A-Z]{2,6}$` on both sides; legacy `tenants_prefixo_key UNIQUE` ≡ target UNIQUE |
| `locale` | `t.locale` | none | NOT NULL (legacy NOT NULL) | — | direct |
| `currency` | `t.moeda` | `text → char(3)`; P7 asserts `char_length = 3` | NOT NULL | — | legacy default `'EUR'`; p01 audited `moeda = EUR` |
| `time_zone` | **explicit closed mapping keyed by `t.id`** (§4.2) | lookup; unmapped tenant **aborts** | NOT NULL (A2 + IANA trigger) | — | **D1** — never a COALESCE, default or fallback |
| `legal_owner_name` | `t.titular` | none | NULL allowed | — | direct |
| `legal_address` | `t.morada` | none | NULL allowed | — | direct |
| `tax_id` | `t.nif` | none | NULL allowed | — | direct |
| `iban` | `t.iban` | none | NULL allowed | — | direct |
| `mbway_number` | `t.mbway` | none | NULL allowed | — | direct |
| `jurisdiction` | `t.foro` | none | NULL allowed | — | direct (competent forum) |
| `website_domain` | `t.dominio` | none | NULL allowed | — | direct |
| `whatsapp_number` | `t.whatsapp` | none | NULL allowed | — | direct |
| `logo_path` | — (**deliberately not sourced**) | none | **NULL** | — | **D5** — see §4.3. `tenants.logo_url` is *not* read and *not* copied. |
| `tagline_line_1` | `t.linha_actividade` | none | NULL allowed | — | two-line brand tagline of the legacy identity (097/098) |
| `tagline_line_2` | `t.linha_by` | none | NULL allowed | — | idem |
| `slogan` | `t.slogan` | none | NULL allowed | — | direct |
| `created_at` | `t.criado_em` | none | NOT NULL (legacy NOT NULL) | — | D6 |
| `updated_at` | — | none | NULL | — | no source |
| `closed_at` | — | none | **NULL** | — | `encerrado` is unmapped (D4), so no migrated organization is ever `closed`; the check `(status='closed') = (closed_at is not null)` therefore holds for both `active` and `suspended` |

Every legacy `tenants` column is consumed exactly once, except `estado`
(mapped via §4) and `logo_url` (**deliberately unconsumed**, D5).

### 2.3 `public.memberships` → `public.organization_memberships`

Legacy PK is the composite `(user_id, tenant_id)` (baseline 5386) — **there is
no legacy membership id**. The target `id` is generated; continuity is carried
by `UNIQUE (organization_id, user_id)`, which maps 1:1 onto the legacy PK.

| Target column | Source expression | Transformation | Null/default | UUID | Evidence |
|---|---|---|---|---|---|
| `id` | — | none | NOT NULL | **generated** | no compatible legacy identifier exists |
| `organization_id` | `m.tenant_id` | none | NOT NULL | preserved transitively (= `organizations.id`) | legacy FK `memberships_tenant_id_fkey` (baseline 5797); target FK → `public.organizations(id)` |
| `user_id` | `m.user_id` | none | NOT NULL | preserved transitively | legacy FK `memberships_user_id_fkey → auth.users` (baseline 5801). **The target FK references `public.user_profiles(user_id)`**, not `auth.users` — hence the insert order of §9.5 |
| `status` | constant `'active'` | — | NOT NULL | — | legacy has no revocation concept (rows were deleted, never flagged); every existing row is live. Membership status is independent of organization status: a `suspended` organization may hold `active` memberships, and v2 gates access on the organization status inside `has_permission`/`access_mode` — mirroring the legacy `t.estado = 'activo'` filter in `tenants_do_utilizador()` (§2.4), so suspension keeps cutting access without deleting data |
| `joined_at` | `m.criado_em` | none | NOT NULL (legacy NOT NULL; the target has no default — exact fit) | — | D6 |
| `revoked_at` | — | none | NULL | — | pairs with `status='active'` under the A2 check |
| `created_by` | — | none | **NULL** | — | `memberships` has no actor column; attribution must not be fabricated (D6) |

### 2.4 legacy `memberships.papel` → `public.roles` + `public.membership_roles`

Legacy semantics — the decisive evidence:

* `docs/migracoes/090_o_primeiro_tenant.sql:56`: «O papel entra com um valor
  por omissão e **SEM uso**» — papel was introduced deliberately unused.
* The baseline contains **zero** RLS policies and **zero** functions that read
  `memberships.papel`. Authorization is tenant isolation via
  `tenants_do_utilizador()` (baseline 4422–4431 — v1 cited 4423–4431, off by
  one at the CREATE line; see §15.3, F6 — used by the policies at e.g.
  5979, 6030, 6059), which selects `m.tenant_id … where m.user_id = auth.uid()
  and t.estado = 'activo'`. Two consequences, both relevant here: (a) within an
  **active** tenant, every membership row grants the same full access,
  irrespective of `papel`; and (b) legacy already **gates on tenant status** —
  its own comment reads «Uma casa suspensa não devolve nada — suspender corta o
  acesso sem apagar dados» — a gate present **from the start**, introduced
  together with the function and that comment by
  `docs/migracoes/090_o_primeiro_tenant.sql:199–217`. *(v1 attributed this gate
  to `103_a_casa_suspensa_fecha_as_portas.sql`. That is wrong: 103 contains
  zero occurrences of `tenants_do_utilizador` — the `estado='activo'` gates it
  added are on other helpers, notably the portal-token path. See §15.3, F3.)*
  Point (a) is what
  justifies D2/D3; point (b) is what makes the v2 organization-status gate
  (§2.3) a faithful continuation rather than a new restriction.
* `as_minhas_casas()` returns `(slug, nome, estado)` — no papel (baseline 105).
* No application code reads membership papel. A repo-wide grep for
  `memberships` co-occurring with `papel` in `src/` returns **zero** hits. The
  273 bare `papel` occurrences in `src/` belong to unrelated vocabularies —
  chiefly the `.papel` print-surface CSS class and its commentary, the
  `comunicados` block-role vocabulary (`papel: "imagem"` and siblings), and
  form-field/paper-contract flows. *(v1 characterised these as "a form-field
  role or a paper-contract flow"; that enumeration was incomplete, though the
  load-bearing claim it supported is exact. See §15.3, F4.)*

Conclusion: `dono` and `gestor` have **identical effective authorization** in
legacy.

Approved v2 roles, one pair per organization (`roles.organization_id` is NOT
NULL — roles are organization-owned in A2):

| `roles` column | `owner` | `manager` |
|---|---|---|
| `id` | generated (D8) | generated (D8) |
| `organization_id` | the migrated organization | idem |
| `key` | `owner` | `manager` |
| `name` | `Owner` | `Manager` |
| `description` | `Owns the organization: full control of identity, settings, members, roles, and audit history.` | `Runs the organization day to day, with the same effective access the legacy model gave every member.` |
| `is_system` | `true` (D2) | `true` (D2) |
| `created_at` | migration transaction timestamp (D6) | idem |
| `archived_at` | NULL | NULL |

Key validation: both satisfy `roles_key_format` (`^[a-z][a-z0-9_]*$`) and
`roles_key_not_platform` (`key not in ('support','admin')`).

**Closed `papel` map (D3)** — anything else aborts:

| legacy `papel` | v2 role key |
|---|---|
| `dono` | `owner` |
| `gestor` | `manager` |
| `equipa` | **no mapping — abort** (0 rows on staging; P3) |

No source membership may be skipped: P10 asserts
`count(membership_roles) = count(memberships)`.

`membership_roles`:

| Target column | Source | Notes |
|---|---|---|
| `membership_id` | the generated id of the migrated membership | resolved via `(organization_id, user_id)` |
| `role_id` | the role whose `key` maps from `m.papel`, within `m.tenant_id`'s organization | resolved via `UNIQUE (organization_id, key)` |
| `organization_id` | `m.tenant_id` | the A2 composite FKs prove membership and role share the organization |
| `granted_at` | `m.criado_em` | the papel is as old as the membership (D6) |
| `granted_by` | **NULL** | no authoritative legacy actor (D6) |

### 2.4b `role_permissions` — derived, not sourced

`role_permissions` has no legacy source: it is the v2 expression of decision
D2. Its three target columns are therefore covered here for completeness.

| Target column | Source expression | Transformation | Null/default | Evidence |
|---|---|---|---|---|
| `role_id` | the id of each role created in §2.4, resolved via `UNIQUE (organization_id, key)` | none | NOT NULL | D8 — never a hard-coded UUID |
| `permission_key` | each of the four literal keys of §6.1 | none | NOT NULL; FK → `public.permissions(key)`, which P8 asserts is populated | D2 |
| `granted_at` | migration transaction timestamp | none | NOT NULL | D6 — a new v2 construct |

The insert is the cross product of the two roles with the four keys: 4 rows
per role, 8 per organization, asserted by P10. §6.2 governs what happens to
this set when future permission keys are introduced.

### 2.5 `public.app_config` → deferred

`app_config` holds exactly two keys: `buffer_dias_antes` and
`buffer_dias_depois`. Meaning, from `src/lib/stock.js:17-39` — «Config
(app_config) — buffer de ocupação»: the days before/after an event during
which materials count as occupied. This is an **Events-product operational
setting**, not organization identity.

A2 removed `organization_settings` permanently and `organizations` has no
buffer columns. The frozen target inventory reserves `event_product_settings`
for exactly this class of setting, and the A2 contract defers it explicitly.

**Decision: defer.** This bootstrap does not read, move, alter or delete
`app_config`. The two buffer keys migrate to `event_product_settings` in the
Events-product migration that creates that table. `public.app_config` remains
byte-identical, proved by the fingerprint of §10.

**Structure of `app_config` (baseline).** Columns: `chave`, `valor`,
`descricao`, `updated_at`, `tenant_id`, `criado_por` (baseline 4454–4461).
Its primary key is the **composite** `app_config_pkey PRIMARY KEY
("tenant_id", "chave")` (baseline 5301–5302).

> **v2 correction.** `app_config` has **no single "key column"**. Any
> deterministic ordering of this table — in a fingerprint, a verification
> query or a future migration — must order by the composite primary key
> `(tenant_id, chave)`. Ordering by `chave` alone is not a total order across
> tenants and must never be used (§10.3).

---

## 3. Identity preservation

| Question | Decision | Grounds |
|---|---|---|
| `organizations.id` ← `tenants.id` | **PRESERVE** | `tenants_pkey (id)` is `uuid` (baseline 5221–5222, 5466). **13** of the 34 legacy tables carry `tenant_id` directly (`submissions`, `clientes`, `event_types`, `invites`, `materiais`, `app_config`, `avaliacao_eixos`, `comunicados`, `comunicado_modelos`, `mensagens_tipo`, `questionario_grupos`, `form_errors`, and `memberships` itself); of the remaining 21, `tenants` is the tenant root itself and the other 20 scope through `submission_id` or another parent (e.g. `avaliacoes`, `documentos` and `pagamentos` resolve tenant via `submissions.tenant_id`, visible in their RLS policies at baseline 6036, 6075 and 6125 respectively). Preserving the id makes `tenant_id → organization_id` the identity function for those 13 and leaves every transitive resolution unchanged. |
| `organization_memberships.id` ← legacy id | **GENERATE** | No legacy id exists: the PK is composite `(user_id, tenant_id)` (baseline 5386). Continuity is carried by `UNIQUE (organization_id, user_id)`. |
| `user_profiles.user_id` ← `auth.users.id` | **PRESERVED by construction** | A2 defines the column as PK + FK to `auth.users(id)`. |
| System-role ids | **GENERATED** (D8) | All later references resolve through `UNIQUE (organization_id, key)` — stable, readable, environment-independent. Role UUIDs are never derived from legacy text, and no literal role UUID is hard-coded. |

## 4. Organization status, time zone and logo boundary

### 4.1 Status mapping (D4)

Legacy domain (`tenants_estado_valido`, baseline 5242): `activo`, `suspenso`,
`encerrado`. Target domain (A2 `organizations_status_check`): `active`,
`suspended`, `closed`.

| legacy `estado` | v2 `status` | Behaviour |
|---|---|---|
| `activo` | `active` | mapped |
| `suspenso` | `suspended` | mapped |
| `encerrado` | — | **abort** |

`encerrado` is deliberately unmapped. The A2 check
`(status = 'closed') = (closed_at IS NOT NULL)` makes `closed_at` mandatory
for a closed organization, and legacy records **no closure instant** — there
is no `encerrado_em` column anywhere in `tenants`. Mapping it would force this
bootstrap to invent a business timestamp. The migration therefore aborts, and
closure is handled by a later migration that first establishes an
authoritative closure instant.

Because no migrated organization can be `closed`, `closed_at` is always NULL
and the A2 check holds for both admitted statuses.

### 4.2 Time zone (D1) — explicit closed mapping, never a fallback

`organizations.time_zone` is NOT NULL in A2 and is validated against
`pg_timezone_names` by the `organizations_time_zone_valid` trigger. Legacy
`tenants` has **no** time-zone column, so there is nothing to map from.

This contract approves **one** time zone, for the **two** existing tenants — one
in staging, one in production — as an explicit keyed mapping, not a default, not
a COALESCE, not a fallback:

| legacy `tenants.id` | environment | `organizations.time_zone` |
|---|---|---|
| `cb563908-7939-494e-bbe4-1e83af4d693a` | staging | `Europe/Lisbon` |
| `7d0d3cb9-4395-47fd-a81c-6b4622685b82` | production | `Europe/Lisbon` |

The production entry was added on 2026-08-28, when the production preflight's
P13 audit found the live tenant absent from the map. Adding a *known* tenant
does not weaken the gate: the lookup stays literal and closed, and any tenant
outside these two still aborts.

Requirements on the eventual migration:

* the mapping is a literal, closed lookup keyed by the legacy tenant UUID;
* **any** source tenant whose id is absent from the mapping **aborts** the
  migration (P13) — there is no generic branch, no `coalesce(..., 'Europe/Lisbon')`
  and no `else` clause;
* the value must be a name present in `pg_timezone_names` (the A2 trigger
  enforces this independently);
* **future organizations do not use this table.** They obtain `time_zone`
  through the normal v2 organization-creation workflow, which collects it as
  input. This mapping exists solely to carry one pre-existing tenant across a
  schema boundary that did not previously store the attribute.

Supporting evidence for the chosen value (not a substitute for the explicit
approval): the tenant's `locale` is `pt-PT`, its `moeda` is `EUR`, its
identity fields are Portuguese, and the application renders dates in `pt-PT`
while deliberately treating date-only values as UTC
(`src/lib/submissionFields.js:110`, `src/components/admin/AlertasTab.jsx`).
Nothing in the codebase implies any other zone.

### 4.3 Logo boundary (D5)

`organizations.logo_path` is set to **NULL** by this bootstrap.
`tenants.logo_url` is **not read, not copied, not normalised and not
modified** — it remains preserved in the legacy table, and §10 fingerprints
`tenants` including `logo_url` to prove it.

Rationale: the legacy column holds a public **URL** of an object in the
`identidade` storage bucket, while the target column is named and specified as
a **path**. Copying a URL into a path column would store a value whose shape
contradicts its own contract, and deriving a bucket-relative path requires
locating and validating the object — work that belongs to a controlled
storage migration, not to an RBAC bootstrap.

Explicitly deferred to the **Storage / organization-branding migration**:

* locating and validating the storage object behind `tenants.logo_url`;
* deriving a canonical bucket-relative path;
* copying or normalising the asset itself;
* setting `organizations.logo_path`.

Until that migration succeeds, the authoritative logo reference **remains**
`tenants.logo_url` in the legacy table, untouched and available. No branding
information is lost by this bootstrap; it is simply not yet carried across.

## 5. `app_config` boundary

Covered in §2.5. The two buffer keys belong to the future
`event_product_settings` (Events product). This bootstrap defers them and
leaves `public.app_config` untouched. No organization column receives them,
and no precondition or postcondition of this migration reads that table for
mapping purposes.

`app_config` is nonetheless **locked in `SHARE` and fingerprinted** before and
after (§9.1 group A, §10, P16), because "untouched" is a claim that must be
proved rather than asserted — and a fingerprint pair taken without a
write-blocking lock proves less than it appears to. Locking costs nothing here:
the migration never writes `app_config`, and `SHARE` permits every concurrent
reader. Its deterministic ordering is the composite primary key
**`(tenant_id, chave)`**.

## 6. Roles and permissions (D2)

### 6.1 Approved assignment

Effective legacy authorization of `dono` and `gestor` is **identical**: see
the §2.4 evidence — no RLS policy, no database function and no application
code path distinguishes them; tenant isolation is the entire model, and
migration 090 recorded papel as introduced «SEM uso».

Approved assignment:

| Permission | `owner` | `manager` | Effect vs legacy |
|---|---|---|---|
| `organization.read` | ✓ | ✓ | preserves |
| `organization.manage` | ✓ | ✓ | preserves |
| `members.manage` | ✓ | ✓ | preserves |
| `audit.read` | ✓ | ✓ | preserves — audit is new surface, but a legacy `gestor` could read everything in the tenant, so parity means granting it |

→ `role_permissions`: 4 rows per role, **8** per organization.
`granted_at` = migration transaction timestamp (D6). Both roles carry
`is_system = true`.

This **preserves effective legacy access**: because `memberships.papel` was
not used by legacy authorization, the two legacy labels conferred the same
capabilities, and granting both roles the same four permissions moves that
fact across unchanged. A data migration moves facts; it does not make policy.

**Future narrowing of `manager` is a separate, audited product decision.**
Splitting the labels into two real roles now makes that future change a
one-line migration (`delete from role_permissions where role_id = … and
permission_key = …`), executed when the product owner decides, with its own
review and its own audit trail. This bootstrap does not pre-empt it.

No platform `admin`/`support` roles are created; A2 forbids them as
organization roles and `roles_key_not_platform` enforces it.

### 6.2 Future Product / Shared Engine permission boundary — normative

This clarification is **normative** and binds migrations written after this
bootstrap. It is new in v2.

1. **This bootstrap assigns exactly the four current core permissions** listed
   in §6.1 — `organization.read`, `organization.manage`, `members.manage`,
   `audit.read` — and nothing else. Its contracted cardinality is **4 per
   role, 8 per organization** (§13), and it must not be written in a way that
   would grow with the catalogue.
2. **It does not automatically grant future permissions.** The insert is an
   explicit cross product with **four literal keys**. It must **never** be
   written as `insert into role_permissions select r.id, p.key from roles r
   cross join permissions p` or any other form that enumerates the catalogue,
   because such a form would silently widen `owner` and `manager` the moment
   any later migration seeds a new key — and would do so retroactively for
   this bootstrap's own replay.
3. **Every Product or Shared Engine migration that introduces a new permission
   key must explicitly decide, in that same migration and under its own
   review, whether each new key is assigned to the existing `owner` and
   `manager` system roles.** The decision must be recorded in the migration —
   including a deliberate decision *not* to assign it.
4. **There is no wildcard and no implicit inheritance.** `owner` holds no
   implied superset of `manager`; `is_system = true` confers no permission by
   itself; no role receives a permission by virtue of the permission existing.
   Authorization is exactly the rows in `role_permissions`.
5. **Scope of the phrase "preserves legacy access".** Wherever this contract
   says the assignment "preserves legacy access", that claim is bounded to the
   **currently implemented core Platform surface** — the four keys of §6.1 as
   enforced by the A2 policies. It is **not** a forward-looking promise about
   any Events, Forms, Documents, Ledger, Notifications or other product or
   engine surface that does not yet exist. Those surfaces have no legacy
   equivalent, so no parity argument can be made about them, and none is made
   here.
6. **Test consequence.** The Step 3.6-C pgTAP suite asserts the 4-per-role set
   **filtered to the four core keys and to the roles this migration creates**.
   It must not assert a global "every role has exactly four permissions"
   invariant, which a legitimate later product migration would break. This is
   the same extension-tolerance rule the Step 3.6-B1 suite already applies to
   `public.permissions`. The `= 4 × count(roles)` equality of **P10** is a
   postcondition **evaluated inside this migration's own transaction**, not a
   permanent global invariant.

## 7. Lifecycle and attribution (D6)

| Field | Value | Grounds |
|---|---|---|
| `organization_memberships.status` | `'active'` | all legacy memberships are live; deletion was the legacy revocation mechanism |
| `organization_memberships.joined_at` | `memberships.criado_em` | authoritative, NOT NULL in source |
| `organization_memberships.revoked_at` | NULL | pairs with `active` |
| `organization_memberships.created_by` | **NULL** | no legacy actor column on `memberships`; never fabricated |
| `roles.created_at` | migration transaction timestamp | roles are new v2 constructs |
| `role_permissions.granted_at` | migration transaction timestamp | idem |
| `membership_roles.granted_at` | `memberships.criado_em` | the papel is as old as the membership |
| `membership_roles.granted_by` | **NULL** | same non-fabrication rule |
| `user_profiles.created_at` | **exactly `auth.users.created_at` — no fallback** (v2 correction; P15 aborts on NULL) | migrated entity; the authentication service owns this instant and it is never invented |
| `organizations.created_at` | `tenants.criado_em` | migrated entity |
| `audit_events.occurred_at` | migration transaction timestamp | new construct |

Principle: **migrated entities preserve their authoritative legacy
timestamps; new v2 constructs use the migration transaction timestamp; no
actor and no timestamp is fabricated where the target allows NULL — and where
the target does *not* allow NULL, a missing authoritative source aborts the
migration rather than being replaced by a substitute.** All "transaction
timestamp" values come from a single consistent instant within the atomic
migration.

The second half of that principle is new in v2 and is exactly what P15
enforces: `user_profiles.created_at` is NOT NULL **with a default**, so the
absence of a hard gate would have converted a missing fact into a plausible
fiction.

## 8. Audit (D7)

One append-only audit row **per migrated organization** (staging: exactly 1),
inserted by the migration itself — A2 gives `authenticated` no INSERT on
`audit_events`.

| Column | Value |
|---|---|
| `id` | **generated** (`gen_random_uuid()` default) — audit rows are new v2 constructs and carry no legacy identifier |
| `actor_kind` | `'migration'` — the A2 correlation check requires every actor UUID and both integration/automation keys NULL for this kind ✓ |
| `actor_user_id`, `actor_membership_id`, `actor_support_grant_id`, `actor_portal_access_id`, `actor_integration_key`, `actor_automation_key` | all **NULL** |
| `actor_label` | the migration version string (immutable display snapshot; no PII) |
| `organization_id` | the migrated organization's id |
| `action` | `'platform.legacy_bootstrap'` — satisfies `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` |
| `root_type` / `root_id` | `'organization'` / the organization id |
| `entity_type` / `entity_id` | `'organization'` / the organization id |
| `occurred_at` | migration transaction timestamp |
| `request_id`, `ip`, `user_agent` | NULL |

`change` (jsonb) contains **only** technical migration metadata: the migration
version, source and target counts, and boolean/enumeration flags recording
which identities were preserved and which concerns were deferred. Counts are
whole-migration totals, so on a database with more than one organization every
audit row carries the same totals alongside its own `organization_id`:

```json
{
  "migration_version": "<version>",
  "source": { "tenants": 1, "memberships": 2, "auth_users": 2,
              "papel": { "dono": 1, "gestor": 1 },
              "estado": { "activo": 1 } },
  "created": { "user_profiles": 2, "organizations": 1,
               "organization_memberships": 2, "roles": 2,
               "role_permissions": 8, "membership_roles": 2 },
  "identity": { "organization_id_preserved": true,
                "user_ids_preserved": true },
  "deferred": { "logo_path": "storage_branding_migration",
                "app_config": "event_product_settings" }
}
```

No names, e-mails, addresses, tax IDs, bank data, telephone numbers, slugs,
logo URLs or any other business value appears in the payload — counts, version
and boolean/enumeration flags only. **No fingerprint digest is written into
the payload either**: digests are verification output (§10), reported by the
operator's session, never persisted into audit data.

---

## 9. Transaction, locks and fail-closed migration behaviour

### 9.1 One statement, one lock phase, fixed order

#### The execution model — normative, corrected in v6

**The migration file contains exactly ONE top-level executable SQL statement:
one `DO` anonymous PL/pgSQL block.**

1. **One statement.** The file's only executable top-level statement is a
   single `DO $sollelio_bootstrap$ … $sollelio_bootstrap$;`.
2. **Comments only outside it.** SQL comments may appear before and after that
   statement. **No other executable top-level statement may exist** — not a
   `SET`, not a `SELECT`, not a `LOCK`, not a second `DO`.
3. **Atomicity comes from PostgreSQL, not from the CLI.** PostgreSQL executes
   that one `DO` statement inside its own implicit statement transaction. The
   complete bootstrap body is therefore atomic: the lock phase, the pinned
   rendering configuration, the pre-insert fingerprints, P0–P15, the seven
   `INSERT`s and P10/P10b/P11b/P14/P16 either all take effect or none does. A
   gate that raises aborts the whole statement, leaving nothing written.
4. **Locks are held for the whole statement.** Every lock acquired in the lock
   phase is held until that `DO` statement succeeds or aborts.
5. **No SQL transaction-control statement may be added.** No `COMMIT`, no
   `ROLLBACK`, no `SAVEPOINT`, no `START TRANSACTION`, and no top-level SQL
   `BEGIN`.
6. **PL/pgSQL `BEGIN … END` is not transaction control.** The `BEGIN` and `END`
   tokens inside the `DO` body — including those of nested blocks — are
   **procedural block delimiters**. They open and close a lexical scope, not a
   transaction. Any static check must distinguish them from the SQL statements
   forbidden by rule 5; the discriminator is that a SQL `BEGIN` is a complete
   statement terminated by a semicolon, whereas a PL/pgSQL `BEGIN` is not.
7. **Do not claim the CLI wraps the file.** This contract makes **no** claim
   that Supabase CLI wraps a whole migration file in one transaction. It does
   not. See §20 for the evidence.
8. **Do not assume history is atomic with the body.** This contract makes no
   claim that the CLI's write to `supabase_migrations.schema_migrations` is
   atomic with the `DO` body. After **every** real apply, verify **both** the
   resulting catalogue/data **and** the history row.
9. **If the body succeeded but the history row is absent, STOP.** Never
   blindly re-run: a second run would abort at P1 having already been applied,
   or worse, would succeed against a half-known state. Diagnose first. Any
   history repair requires a **separate explicit authorisation**, granted only
   after proving the body completed exactly once and in full.
10. **The harness may still open its own transaction.** The exact-file harness
    of §11.2 executes the `DO` inside its own disposable explicit transaction;
    that is a property of the harness, not of the migration. Fixture 1 must
    still execute the exact migration **twice in the same transaction** and
    abort specifically at **P1**.

Do **not** split the bootstrap across statements and do **not** add
intermediate `COMMIT` statements: partial visibility of a half-built RBAC graph
is exactly the failure mode this contract exists to prevent.

One consequence, normative: because the whole body is one statement, the file
is includable — unchanged and byte-identical — by the exact-file harness of
§11.2, and by any replay that runs it inside an enclosing transaction.

**Locks are acquired first.** The migration must acquire every lock below
**before any gate, any count, any fingerprint and any insert**. No
precondition is evaluated, and no digest is computed, on unlocked data —
otherwise a concurrent writer could invalidate a gate between its evaluation
and the insert it guards.

The order is **fixed** and must be reproduced verbatim, in the sequence
**A → B → C → D**.

**These four blocks are the only normative statement of the lock phase.** No
other section restates them; every other mention is a reference to §9.1. A lock
mode that appears anywhere else in this document is a description, not a
definition.

**Every lock uses `NOWAIT`.** The explicit table-lock phase never waits: if any
lock in any group cannot be granted immediately, the statement raises
`lock_not_available` (SQLSTATE `55P03`) and the whole transaction aborts,
having written nothing.

This is a guarantee about **the lock phase**, not about the whole migration.
`NOWAIT` governs only the explicit `LOCK TABLE` acquisition; it says nothing
about row-level locks taken later, during the inserts. §9.1's
"What the lock phase does and does not guarantee" states the exact boundary,
and it is why groups B and D take `EXCLUSIVE` rather than `SHARE`.

**A. Legacy `public` relations** — the two sources plus the deferred,
fingerprinted `app_config`

```sql
LOCK TABLE
  public.tenants,
  public.memberships,
  public.app_config
IN SHARE MODE NOWAIT;
```

**B. Permission catalogue** — a foreign-key parent holding pre-existing rows

```sql
LOCK TABLE public.permissions IN EXCLUSIVE MODE NOWAIT;
```

**C. Scoped and excluded A2 targets**

```sql
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
```

**D. `auth.users`** — a foreign-key parent holding pre-existing rows; see §9.2

```sql
LOCK TABLE auth.users IN EXCLUSIVE MODE NOWAIT;
```

Group D is additionally subject to the hard staging capability gate **G2**
before the migration may be applied to staging.

Groups A + B + C cover all eleven A2 relations and all three legacy `public`
relations this migration reads or fingerprints: the three legacy relations in
`SHARE` (`tenants` and `memberships` as sources, `app_config` as a deferred
relation whose byte-identity P16 proves), `permissions` in **`EXCLUSIVE`**
(read-only to this migration, it must not change under P8, and it is a
foreign-key parent — see below), and the ten remaining A2 relations in
`SHARE ROW EXCLUSIVE` (seven written, three asserted-empty).

#### `public.app_config` is locked because it is fingerprinted

`app_config` is **not** a source of this bootstrap — it is deferred in full
(§2.5, §5) and no mapping reads it. It is nevertheless in group A because
**P16 fingerprints it before and after** (§10.2). A fingerprint pair taken
without a write-blocking lock proves only that the two computations agreed; it
cannot rule out a concurrent write between them, or a write-and-revert across
them. Locking it in `SHARE` closes that gap at zero cost: the migration never
writes `app_config` (§10.4 forbids it statically), and `SHARE` still permits
every concurrent reader. Its fingerprint ordering is unchanged — the composite
primary key **`(tenant_id, chave)`** (§10.2, §2.5).

#### Why `permissions` and `auth.users` take `EXCLUSIVE`

**Normative, and new in v4.** These two are the only foreign-key parents this
migration inserts against whose referenced rows **already exist**.

The table below enumerates the **foreign-key checks this bootstrap actually
performs with non-null values** — not every foreign key declared on the seven
populated relations. The distinction matters: a foreign-key column assigned
`NULL` performs **no referenced-row lookup at all**, so it takes no row lock
and can contribute no wait.

| Foreign-key check performed (non-null) | Parent | Do the referenced parent rows pre-exist? |
|---|---|---|
| `user_profiles.user_id` | **`auth.users(id)`** | **yes** — the auth rows are the source |
| `role_permissions.permission_key` | **`permissions(key)`** | **yes** — seeded by B1 |
| `organization_memberships.organization_id`, `.user_id` | `organizations`, `user_profiles` | no — inserted by this migration, in this transaction |
| `roles.organization_id` | `organizations` | no — idem |
| `role_permissions.role_id` | `roles` | no — idem |
| `membership_roles.(membership_id, organization_id)`, `.(role_id, organization_id)` | `organization_memberships`, `roles` | no — idem |
| `audit_events` | *(no foreign keys at all)* | — |

**Declared but never checked here**, because the approved mapping assigns them
`NULL` (D6, §7): `organization_memberships.created_by` → `user_profiles` and
`membership_roles.granted_by` → `user_profiles`. Both are nullable foreign
keys; a `NULL` value performs no referenced-row lookup, so neither takes a row
lock. *(This is a description of the existing mapping. Neither mapping
changes — both remain `NULL`, for the non-fabrication reason given in §7.)*

For every parent in the lower group, P1 has already asserted the relation
empty and this transaction creates the referenced row itself, so no other
transaction can be holding a row lock on it. Those parents need no mode
stronger than group C's `SHARE ROW EXCLUSIVE`.

For `auth.users` and `permissions` the situation is different, and this is
exactly what v3 got wrong:

* foreign-key validation on `INSERT` checks the referenced row with
  **`SELECT … FOR KEY SHARE`**, which takes a **row-level** lock;
* all four `SELECT` locking variants — `FOR UPDATE`, `FOR NO KEY UPDATE`,
  `FOR SHARE`, `FOR KEY SHARE` — take **`ROW SHARE`** at table level;
* **but at row level they are not equivalent.** Against the FK check's
  `FOR KEY SHARE` request, **only an existing `FOR UPDATE` conflicts**.
  `FOR NO KEY UPDATE`, `FOR SHARE` and `FOR KEY SHARE` are all **compatible**
  with it and block nothing:

  | Row lock already held on the referenced row | Blocks the FK check's `FOR KEY SHARE`? |
  |---|---|
  | `FOR UPDATE` | **yes** |
  | `FOR NO KEY UPDATE` | no |
  | `FOR SHARE` | no |
  | `FOR KEY SHARE` | no |

  So the problematic case is precisely a concurrent `SELECT … FOR UPDATE` on
  the referenced row. (A concurrent `UPDATE` or `DELETE` is a different matter
  and was never the gap: those take `ROW EXCLUSIVE` at table level, which
  `SHARE` already excluded.)
* **`SHARE` and `SHARE ROW EXCLUSIVE` are both compatible with `ROW SHARE`.**
  So under v3's modes a transaction holding `FOR UPDATE` on the very
  `auth.users` or `permissions` row this migration is about to reference would
  have been admitted — the table lock granted immediately, `NOWAIT` not firing
  — and the **FK check would then have waited on that row**;
* **`EXCLUSIVE` conflicts with `ROW SHARE`** while still permitting ordinary
  `ACCESS SHARE` readers. Taking it with `NOWAIT` means: if any `ROW SHARE`
  holder exists, the lock phase aborts at once with `55P03`; and once the lock
  is held, no new one can start. The known FK-parent row-lock path is closed.

**The exclusion is deliberately conservative, and that is a design choice, not
an oversight.** PostgreSQL's table-level lock state records only that a
transaction holds `ROW SHARE`; it **cannot distinguish which row-lock subtype**
that transaction took, nor which rows it locked. There is therefore no lock
mode that excludes `FOR UPDATE` alone. `EXCLUSIVE` excludes **every**
`ROW SHARE` holder in order to guarantee exclusion of the one problematic case.

The consequence is accepted and should be expected in operation: a harmless
row locker — a `SELECT … FOR SHARE` or `FOR KEY SHARE` on some unrelated
`auth.users` row, which would never have blocked the FK check — is enough to
produce a **clean `55P03`** in the lock phase. That abort costs nothing: it
happens before any gate, count, fingerprint or insert, so nothing is written
(§9.1). The required response is unchanged — stop, do not retry, re-run in a
quiet window.

`EXCLUSIVE` is in the **same privilege bucket** as `SHARE` —
`UPDATE`/`DELETE`/`TRUNCATE` (or `MAINTAIN`), or ownership — so this change
does not alter the capability argument of §9.2 or the privilege table below.
It does make G2 rehearse a stricter mode, which is why G2's statement changed
with it.

#### The five normative properties of the lock phase

1. **Fixed order** — A → B → C → D, verbatim.
2. **First** — before every gate, every count, every fingerprint and every
   insert.
3. **Held to the end** — released only when the migration transaction commits
   or rolls back.
4. **`NOWAIT`** — a lock that cannot be granted immediately aborts the
   migration with `lock_not_available` (`55P03`). **The explicit table-lock
   phase never waits.** This is a statement about the lock phase only; it is
   not a claim that the migration as a whole can never wait.
5. **No automatic retry** — neither the migration nor the deployment tooling
   may loop, back off, or re-run on `55P03`. A contention abort is a signal to
   stop and choose a quiet window, not a transient to be swallowed.

#### Why these modes

| Mode | Conflicts with | Why it is the right choice here |
|---|---|---|
| `SHARE` on the three legacy relations (group A) | `ROW EXCLUSIVE` (INSERT/UPDATE/DELETE), `SHARE UPDATE EXCLUSIVE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE`, `ACCESS EXCLUSIVE` | It **blocks all writers** while permitting concurrent readers and other `SHARE` holders. That is precisely the guarantee the gates need: between P0/P2–P9/P12/P13/P15 and the inserts they guard, and between the pre- and post-insert fingerprints of §10, neither a source nor `app_config` can change. None of these three is a foreign-key parent of anything this migration inserts, so `SHARE`'s compatibility with `ROW SHARE` costs nothing here. |
| **`EXCLUSIVE` on `permissions` (group B) and `auth.users` (group D)** | everything `SHARE` conflicts with, **plus `ROW SHARE`** — i.e. everything except `ACCESS SHARE` | These are the two foreign-key parents whose referenced rows pre-exist. `EXCLUSIVE` additionally excludes `ROW SHARE`, and therefore excludes the one row lock that would block this migration's `SELECT … FOR KEY SHARE` foreign-key check: an existing **`FOR UPDATE`** on the referenced row. Because table-level lock state cannot reveal which row-lock subtype a `ROW SHARE` holder took, the exclusion is necessarily broader than the problem — `FOR NO KEY UPDATE`, `FOR SHARE` and `FOR KEY SHARE` are compatible with the FK check and are excluded anyway. That is intentional (see below). Ordinary `ACCESS SHARE` readers are still permitted, so plain `SELECT`s against `auth.users` and `permissions` continue to run. |
| `SHARE ROW EXCLUSIVE` on the ten A2 relations | everything `SHARE` conflicts with, **plus `SHARE` and itself** | It blocks writers *and* is **self-conflicting**. `SHARE` alone would not be: two transactions can hold `SHARE` simultaneously, both observe empty targets under P1, and then both insert. Self-conflict is the property that makes P1 a real gate rather than a race — with `NOWAIT`, a second concurrent execution does not even queue: it aborts immediately with `55P03`, loudly and before writing. A transaction's own locks never conflict with each other, so holding `SHARE ROW EXCLUSIVE` does not obstruct this migration's own `INSERT`s (which take `ROW EXCLUSIVE`). |

**`ACCESS SHARE` is never an acceptable substitute for any lock above.**
`ACCESS SHARE` conflicts only with `ACCESS EXCLUSIVE`. It therefore does
**not** block `INSERT`, `UPDATE` or `DELETE`. A concurrent write admitted
under `ACCESS SHARE` could break the D9 bijection, the P10 count equalities or
the §10 fingerprint equality *after* those gates had already passed. Taking
`ACCESS SHARE` and calling the source "locked" would be strictly worse than
taking no lock at all, because it would look like protection while providing
none.

#### Locks are held to the end of the statement

PostgreSQL releases table-level locks only at transaction end, and the `DO`
statement runs in a transaction — its own implicit one when applied by the CLI,
or the harness's explicit one under §11.2. Either way every lock acquired in
the lock phase is held across every gate, every fingerprint, every insert and
every postcondition, and is released — atomically with the work — when that
statement's transaction ends. `NOWAIT` governs only *acquisition*; it has no
effect on how long a granted lock is held. **No statement may release a lock early**; there is no supported way
to do so for these modes, and no construct that attempts it (a nested
transaction wrapper, a `COMMIT`, a dblink/`pg_background` side session, an
autonomous-transaction emulation) may appear in this migration.

#### `LOCK TABLE` is not a read-only privilege

**Normative, and central to §9.2.** In PostgreSQL, `LOCK TABLE` privilege
requirements are per mode, and they are **not** monotonic in lock strength:

| Mode | Privilege required |
|---|---|
| `ACCESS SHARE` | `SELECT` |
| `ROW EXCLUSIVE` | `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` |
| **every other mode** — `ROW SHARE`, `SHARE UPDATE EXCLUSIVE`, **`SHARE`**, **`SHARE ROW EXCLUSIVE`**, `EXCLUSIVE`, `ACCESS EXCLUSIVE` | **`UPDATE`, `DELETE` or `TRUNCATE`** (or `MAINTAIN`), **or ownership** |

These are the three cases PostgreSQL actually defines, and they are **not**
ordered by lock strength: `ACCESS SHARE` takes `SELECT`, `ROW EXCLUSIVE` takes
any write privilege, and **everything else** — including the comparatively weak
`ROW SHARE` — takes `UPDATE`/`DELETE`/`TRUNCATE` or ownership. Do not
generalise from "stronger lock ⇒ stronger privilege"; the mapping is a
three-way case split, not a ladder.

Both modes this contract uses — **`SHARE`** and **`SHARE ROW EXCLUSIVE`** —
fall in the third case. `SELECT` is therefore not sufficient for either, and
`INSERT` is not either. (`MAINTAIN` exists only from **PostgreSQL 17**; on
PostgreSQL 16 and earlier the qualifying set is `UPDATE`, `DELETE`, `TRUNCATE`
or ownership. Do not rely on `MAINTAIN` without first confirming the server
major version of the environment in question — which is one more reason G2 is
an empirical probe rather than an inference.)

So the ability to *read* `auth.users` does not imply the ability to
`LOCK TABLE auth.users IN EXCLUSIVE MODE NOWAIT`. For groups A, B and C the requirement
is satisfied by **ownership**: the 34 legacy `public` tables are explicitly
`OWNER TO "postgres"` in the baseline, and the eleven A2 relations — whose
migrations contain no `OWNER TO` statement at all — are owned implicitly by
the role that applied them (§0.1). Under `supabase db push` that is the same
role that will run this bootstrap, so it owns every relation in groups A, B
and C. `auth.users` is **not** owned by that role — it
belongs to the Supabase-managed `auth` schema (§0.1). That asymmetry is the
entire reason group D needs a capability gate and groups A–C do not.

#### What the lock phase does and does not guarantee

**This subsection replaces a false claim made by v3** (§18, N4). v3 concluded
that `NOWAIT` made the migration as a whole incapable of waiting or
deadlocking. It does not. State the guarantee at exactly its real size.

**What is guaranteed:**

* **the explicit table-lock phase never waits** — every `LOCK TABLE` carries
  `NOWAIT`, so each is either granted immediately or raises `55P03`;
* **the A → B → C → D acquisition cannot enter a table-lock wait cycle** —
  no request in the phase ever blocks, so the phase cannot contribute an edge
  to a wait-for graph;
* **`EXCLUSIVE` on `permissions` and `auth.users` closes the known FK-parent
  row-lock path** — the one identified route by which this migration could
  have waited at row level after acquiring all its table locks.

**What is *not* guaranteed:**

* this is **not a universal proof** about every lock PostgreSQL might take.
  Implicit locks — row-level locks taken during the inserts, the catalogue
  and system-catalogue locks taken while planning and executing, locks taken
  by triggers, index maintenance and constraint validation — are outside
  `NOWAIT`'s scope entirely;
* `NOWAIT` applies **only** to the statement carrying it. The migration's own
  `INSERT`s do not carry it and cannot;
* PostgreSQL's deadlock detector will resolve a deadlock if one occurs, by
  aborting a participant. **That is a recovery mechanism, not a proof that no
  deadlock can occur** — and v3 conflated the two.

**Therefore, normatively:** any unexpected lock wait, any deadlock, and any
`55P03` **stops the operation and is reported**. There is **no automatic
retry**, no back-off and no re-run without a deliberate decision (property 5
above). The contract does not claim the situation cannot arise; it fixes what
happens when it does.

The fixed A → B → C → D order still earns its keep twice over: as a
conventional global ordering that any other transaction following it cannot
deadlock against, and as **determinism** — the same contention always fails at
the same point, so a `55P03` is diagnosable ("group C — something holds a
conflicting lock on an A2 relation") instead of arbitrary.

#### What `NOWAIT` costs, stated honestly

`NOWAIT` converts every wait **in the lock phase** into an immediate abort,
including waits that would have resolved in milliseconds. Routine background
activity is enough to trigger it: `autovacuum` and `ANALYZE` take
`SHARE UPDATE EXCLUSIVE`, which conflicts with `SHARE`, `SHARE ROW EXCLUSIVE`
and `EXCLUSIVE` alike. Ordinarily a blocking lock request causes autovacuum to
be cancelled and the requester proceeds; with `NOWAIT` there is no waiting, so
the *migration* aborts instead.

`EXCLUSIVE` on groups B and D widens this deliberately: because it also
conflicts with `ROW SHARE`, **any** concurrent `SELECT … FOR UPDATE /
FOR NO KEY UPDATE / FOR SHARE / FOR KEY SHARE` on `auth.users` or
`permissions` — a sign-in flow, a support query, an unrelated row entirely —
is now enough to abort the lock phase, where under v3's `SHARE` none of them
would have been. Only the `FOR UPDATE` case could actually have blocked the FK
check; the other three are excluded conservatively, because table-level lock
state cannot tell them apart (see above). That is the intended trade: **abort
in the lock phase, before anything is written, rather than wait on a row in the
middle of the inserts.** Plain `SELECT`s (`ACCESS SHARE`) are unaffected and
continue to run against both tables.

This is the accepted trade: a deployment that fails instantly and visibly is
better than one that queues behind an unknown transaction while holding locks
on eleven A2 relations and three legacy ones. The required response to `55P03`
is fixed and admits no discretion:

* **stop**;
* **do not retry**, automatically or by reflex — property 5 above;
* identify what held the conflicting lock;
* re-run in a **controlled quiet window**, exactly as §9.2 requires for a
  contention failure of the G2 probe.

Because the transaction aborts before any gate, count, fingerprint or insert,
a `55P03` abort is always a clean no-write outcome.

### 9.2 `auth.users` — group D and the hard staging capability gate (G2)

Group D's statement is defined once, in **§9.1 D**, and is not restated here:
the lock phase has exactly one normative source, so a mode can never drift
between two copies. In prose: `auth.users` is locked in `EXCLUSIVE` mode with
`NOWAIT`.

`EXCLUSIVE` rather than `SHARE` because `auth.users` is a **foreign-key parent
holding pre-existing rows** (§9.1): `SHARE` is compatible with `ROW SHARE`, so
under v3's mode a concurrent `SELECT … FOR UPDATE` could have held a row lock
that this migration's `SELECT … FOR KEY SHARE` foreign-key check would then
wait on. `EXCLUSIVE` conflicts with `ROW SHARE` and closes that path, while
still permitting ordinary `ACCESS SHARE` readers.

It is required for the same reason as group A: `auth.users` is a source of
this migration. P4 (bijection), P5 (display name), P15 (non-null
`created_at`), the `count(user_profiles) = count(auth.users)` equality of P10
and the `auth.users` fingerprint of §10 are all evaluated against it, and a
concurrent sign-up or account deletion between any of those and the insert
would silently invalidate them.

**However, local capability does not prove hosted staging capability.** A
local instance where the `postgres` role has `rolsuper = false` and
nonetheless holds DML access to `auth.users` proves only that *local grant
configuration*. Hosted staging is a different deployment with a different
grant graph, and — per the privilege rule of §9.1 — `EXCLUSIVE MODE` needs
`UPDATE`/`DELETE`/`TRUNCATE`/`MAINTAIN` or ownership, none of which follows
from `SELECT` access or from anything observable locally. (`EXCLUSIVE` and
`SHARE` are in the same privilege bucket, so v4's mode change does not alter
the capability question — only the contention the probe rehearses.) `NOWAIT`
does not change this either: it governs *waiting*, not *entitlement*, so a role
that lacks the privilege fails with `42501` whether or not `NOWAIT` is
present.

#### G2 — the gate

The contract therefore requires a **hard, separately authorised staging
deployment gate**, executed over **the same CLI connection path as
`db push`** — the identical connection string, role and network path that
`supabase db push` uses for that environment:

```sql
begin;
lock table auth.users in exclusive mode nowait;
rollback;
```

The probe rehearses **the exact final group-D statement** (§9.1 D). It must not
be run in a weaker mode: a `SHARE` probe that succeeded would prove nothing
about whether the migration's `EXCLUSIVE` would.

Requirements on the gate:

* **G2 must not be executed while producing or validating this contract**, and
  it was not. Local database access *was* permitted and *was* performed, to
  earn the local gate G1 (§15.1): the migration was applied to the **local**
  database through both real CLI paths, and the full local test battery was
  run against it. **Staging and production were not contacted at any point.**
  G2 is a separate, deployment-time act over the **staging** `db push`
  connection path, separately authorised by the operator, and remains outside
  the scope of contract production and of local validation;
* it must run over the `db push` connection path **as the `db push` role**. A
  probe run from the Supabase Studio SQL editor, from a superuser console, or
  from any session whose role differs from the one `db push` authenticates as,
  **does not satisfy G2** — it measures a different principal's privileges and
  therefore proves nothing about the migration;
* the gate is a probe and nothing else: `begin` / `lock … nowait` / `rollback`.
  It performs no DDL, no DML and no `GRANT`.

#### Required future behaviour

| Gate outcome | Required response |
|---|---|
| **Lock succeeds** | The migration **may** use `LOCK TABLE auth.users IN EXCLUSIVE MODE NOWAIT`. G2 is satisfied for that environment. |
| **Fails because of permissions** (expected SQLSTATE `42501`, `insufficient_privilege`) | **Stop.** Do not `GRANT`. Do not change the owner of `auth.users`. Do not change any role, role membership or `search_path`. Do not fall back to a weaker lock. Escalate the capability question as its own decision, with its own authorisation. |
| **Fails because of contention** (expected SQLSTATE `55P03`, `lock_not_available`) | **Stop.** Do not retry in a loop and do not downgrade the lock. Schedule a **controlled maintenance window** and re-run the gate there. |
| **`ACCESS SHARE` as a fallback** | **Forbidden.** It does not block writes (§9.1), so it does not provide the property the gate exists to establish. There is no fallback lock mode. |

**The eventual migration cannot be applied to staging until G2 passes.** G2 is
a hard gate, not advice (§15.1).

#### What G2 does and does not prove

* The **permission** outcome is durable: privileges do not change on their
  own, so a successful G2 authorises the deployment until the grant graph is
  deliberately changed.
* The **contention** outcome is a point-in-time observation only. `NOWAIT`
  answers "was the table free at this instant", not "will it be free during
  the migration". Since v3 the probe is an **exact rehearsal** of group D, and
  since v4 it rehearses the final mode: same mode (`EXCLUSIVE`), same
  `NOWAIT`, same role, same connection path. Because `EXCLUSIVE` also
  conflicts with `ROW SHARE`, the probe is now sensitive to concurrent row
  lockers on `auth.users` — which is the point: it rehearses precisely what
  the migration will meet. So a probe that
  succeeds tells you the migration's group D would have succeeded *at that
  instant*, and a probe that fails with `55P03` tells you the migration would
  have aborted. Neither is a promise about the next minute — the migration's
  own group D is the only thing that decides the real run, and it decides it
  by aborting rather than waiting. G2's contention branch exists to avoid
  discovering a busy `auth.users` for the first time in the middle of a
  deployment.

### 9.3 Empty-source semantics — fail-closed and branch-free

v1 permitted a "clean no-op" whenever the three source counts were all zero,
and worded P1 so that its force on an empty source was ambiguous. v2 corrects
this. **Target emptiness is asserted unconditionally.**

#### The no-op is allowed only when *all* of the following hold

| # | Condition |
|---|---|
| 1 | `count(public.tenants) = 0` |
| 2 | `count(public.memberships) = 0` |
| 3 | `count(auth.users) = 0` |
| 4 | all **seven** populated targets hold 0 rows — `user_profiles`, `organizations`, `organization_memberships`, `roles`, `role_permissions`, `membership_roles`, `audit_events` |
| 5 | `count(public.platform_operators) = 0` |
| 6 | `count(public.support_access_grants) = 0` |
| 7 | `count(public.support_access_grant_permissions) = 0` |

These seven conditions define **when a no-op is a legitimate outcome** — they
are not a precondition of every run. On a populated source, conditions 1–3 are
false by design and the migration proceeds to the full bootstrap; conditions
4–7 must still hold, and the run aborts if any of them does not. The rule is
therefore: **if conditions 1–3 hold, then 4–7 must hold too, and the outcome is
a no-op; if conditions 1–3 all fail, 4–7 must still hold, and the outcome is
the full bootstrap; any other combination aborts.** A no-op is a conclusion the
migration is allowed to reach, never a shortcut it is allowed to take.

#### Abort conditions, stated positively

The migration **aborts** when:

* **the source state is partial** — the three source counts are neither all
  zero nor all non-zero (P0);
* **the source is empty but any scoped or excluded target is non-empty** (P1,
  P11a) — an empty source is never a licence to skip the target checks;
* **the source is populated but any scoped or excluded target is non-empty**
  (P1, P11a) — this is the re-application case.

#### Re-execution semantics

| Situation | Outcome | Which gate |
|---|---|---|
| Second execution **after a populated bootstrap** | **Must fail, before writing anything.** | **P1** — the seven targets are non-empty. P1 is evaluated after the lock phase and before the first `INSERT`, so no partial write is possible. |
| Second execution with **completely empty sources and completely empty targets** | **May remain a harmless no-op.** | All gates pass; the `INSERT … SELECT` statements select zero rows; the postconditions hold as `0 = 0`. |

In practice `supabase_migrations.schema_migrations` prevents re-application
under `db push`; P1 is what makes the property true independently of the
migration runner, which is what the Layer B harness of §11.2 exercises
directly.

#### The no-branch rule

**Normative.** The migration contains **no conditional branch around any
gate**. Every precondition and every postcondition is evaluated
unconditionally, on every execution, including the empty-source shape:

* P0 is a shape assertion, not a branch — it raises on a partial source;
* P1, P8, P11a and P11b are unconditional and depend on no source row;
* P2–P7, P9, P12, P13 and P15 are universally quantified over source rows and
  are therefore **vacuously true** on an empty source — they need no guard;
* P10, P10b, P14 and P16 are postconditions whose equalities hold as `0 = 0`
  (or trivially) on an empty source.

Asserting the excluded tables twice — P11a before, P11b after — is not a
branch. Both assertions run on every execution; neither is guarded.

The empty-source no-op therefore emerges from `INSERT … SELECT` over empty
relations, **not** from an `IF count(*) = 0 THEN RETURN` construct. There is
no code path in this migration that skips a check. That is what "fail-closed"
means here, and it is what v1's phrasing did not guarantee.

#### Definition — "relevant `auth.users`"

**Normative.** For this canonical bootstrap, **"relevant `auth.users`" means
every row of `auth.users`, with no filter.** D9 migrates the entire table
under the bijection of P4; there is no subset, no predicate and no exclusion.
Wherever v1 used the word "relevant", read "every row of `auth.users`". This
applies to the source count of P0, the equality of P10, the scope of P15 and
the fingerprint scope of §10.2.

### 9.4 Preconditions and postconditions

Each violation raises an exception. Because the migration is a single
transaction (§9.1), nothing partial survives.

**Order of execution is normative:** the lock phase of §9.1 → the pre-insert
fingerprints of §10.2 → every precondition below (**including P11a**) → the
inserts in the order of §9.5 → every postcondition below (**including P11b**).

**P11 has two halves and appears in both lists.** Its pre-insert half (P11a) is
a gate; its post-insert half (P11b) is a proof. Listing it once would have
placed one of the two halves on the wrong side of the inserts.

#### Preconditions (evaluated before any insert)

* **P0** — **source-state gate (all-or-nothing).** Computed under the locks of
  §9.1: `count(public.tenants)`, `count(public.memberships)`,
  `count(auth.users)`. Exactly two shapes are admitted: **all three are zero**,
  or **all three are non-zero**. Any other combination is a partial source
  state and aborts — tenants without memberships, memberships without tenants,
  auth users present with no legacy tenant, and so on. Fail-closed means
  *abort on invalid data*, never *require data to exist*; but an empty result
  is acceptable only when the source is genuinely, wholly empty.
* **P1** — **target emptiness, asserted unconditionally.** All seven populated
  targets — `user_profiles`, `organizations`, `organization_memberships`,
  `roles`, `role_permissions`, `membership_roles`, `audit_events` — hold
  **0 rows**. This assertion is **not** conditional on the source shape: it is
  evaluated identically in the empty-source shape and in the populated shape.
  There is no branch in which target emptiness goes unchecked. P1 is evaluated
  after the lock phase and **before the first `INSERT`**, so a second
  execution after a populated bootstrap aborts **before writing**.
* **P11a** — **excluded Platform/support tables empty, before any insert.**
  `platform_operators`, `support_access_grants` and
  `support_access_grant_permissions` hold **0 rows**, asserted unconditionally
  alongside P1 — including on a wholly empty source. This is the half that
  makes a pre-existing platform-operator or support-grant row **abort** this
  bootstrap instead of being silently tolerated;
* **P2** every `tenants.estado ∈ ('activo','suspenso')` — closed status map
  (§4.1); `encerrado` or any other value aborts;
* **P3** every `memberships.papel ∈ ('dono','gestor')` — closed papel map
  (§2.4); `equipa` or any other value aborts;
* **P4** bijection (D9): no `auth.users` row without exactly one membership,
  and every membership resolves to an existing auth user;
* **P5** every membership user yields a non-blank `display_name` through the
  §2.1 chain (D11) — abort rather than fall back to an e-mail fragment;
* **P6** no user holds memberships in two tenants (A2's
  `UNIQUE (organization_id, user_id)` only prevents duplicates *within* one
  organization);
* **P7** every `tenants.moeda` has `char_length = 3`;
* **P8** `permissions` contains each of the four core keys exactly once (the
  PK gives "at most once"; assert presence of all four). Asserted
  unconditionally — it is a **catalogue-presence** assertion about the B1 seed
  (it reads `public.permissions`, **not**
  `supabase_migrations.schema_migrations`; the migration-chain assertions
  proper are §11.1 A.1) and depends on no source row, so it never wrongly
  aborts an empty-source run;
* **P9** `slug` and `prefixo` match the target regexes — redundant with the
  identical legacy constraints, asserted so this contract does not depend on
  legacy constraint history;
* **P12** every tenant has at least one membership with `papel = 'dono'`
  (D12) — prevents creating an organization in which nobody holds `owner`;
* **P13** every `tenants.id` appears in the explicit time-zone mapping of
  §4.2 (D1) — an unmapped tenant aborts;
* **P15** — **non-null authentication creation timestamp (new in v2).** Every
  `auth.users` row being migrated — which, per §9.3, means **every row of
  `auth.users`** — must have a **non-null `created_at`**. **Any NULL aborts
  the migration.** P15 is evaluated **before** the `user_profiles` insert, so
  the operator sees the named contract violation rather than a NOT NULL
  constraint error, and so the defaulted column (§2.1) can never quietly
  substitute `now()`. On an empty source P15 is vacuously true.

#### Postconditions (evaluated after the inserts, inside the same transaction)

* **P10** completeness: `count(organizations) = count(tenants)`,
  `count(organization_memberships) = count(memberships)`,
  `count(user_profiles) = count(auth.users)`,
  `count(membership_roles) = count(memberships)`,
  `count(roles) = 2 × count(tenants)`,
  `count(role_permissions) = 4 × count(roles)`,
  `count(audit_events) = count(tenants)`. These are postconditions of **this
  transaction**, not permanent global invariants (§6.2);
* **P10b** per-row completeness — cardinality equality alone would still admit
  a mis-distributed insert (two role grants on one membership, none on
  another, with matching totals), so assert directly: every
  `organization_memberships` row has **exactly one** `membership_roles` row;
  every `organizations` row has **exactly two** `roles` rows whose keys are
  `owner` and `manager`; every `roles` row has **exactly four**
  `role_permissions` rows; every `organizations` row has **exactly one**
  `audit_events` row from this migration. Together with P10 this is what makes
  "no source row silently skipped" a proved property rather than an arithmetic
  coincidence;
* **P11b** — **excluded Platform/support tables still empty, after the
  inserts.** `platform_operators`, `support_access_grants` and
  `support_access_grant_permissions` hold **0 rows** when re-asserted after the
  inserts. This is the half that proves this migration created none of them.
  Together, **P11a + P11b = P11**: all three excluded tables empty **before and
  after**, unconditionally, on every execution;
* **P14** `count(organizations where logo_path is not null) = 0` (D5) —
  proves the logo boundary was respected;
* **P16** — **legacy integrity. Normative** (introduced in v2, approved in
  v3). The migration computes deterministic in-transaction fingerprints of the
  four legacy relations of §10.2 — `auth.users`, `public.tenants`,
  `public.memberships`, `public.app_config` — **after the complete lock phase
  of §9.1** and before any gate, count or insert; it **recomputes them before
  the transaction ends**; and it requires **exact equality**. Any difference
  aborts.

  Requirements, all normative:

  * computed **after the complete lock phase**, so every fingerprinted
    relation is already write-blocked when its first digest is taken — since
    v3 this holds for **all four**, `app_config` included (§9.1);
  * **recomputed before the transaction ends**, after the last insert and
    alongside the other postconditions;
  * **exact equality** required, per relation, on both the row count and the
    digest;
  * the approved scopes of §10.2 exactly — no wider, no narrower;
  * **no PII and no source values** emitted, ever: output is the table
    identifier, the row count and the digest, and nothing else (§10.3).

  Because all four relations are locked in `SHARE` for the whole transaction,
  the P16 pair now both **prevents** concurrent modification and **proves**
  none occurred. It is the in-transaction proof that the migration wrote
  nothing to any legacy relation. It does not replace its two companions, and
  both are retained as defence in depth: the **static** check of §10.4 (source
  level, before anything runs) and the **external staging before/after data and
  catalogue fingerprints** of §12 (out-of-band, bracketing the whole deployment
  window).

### 9.5 Mechanics

* **atomic**: the migration file is **one top-level `DO` statement**, executed
  by PostgreSQL inside its implicit statement transaction (§9.1). No `COMMIT`,
  `ROLLBACK`, `SAVEPOINT`, `START TRANSACTION` or top-level SQL `BEGIN` appears
  in the file; the PL/pgSQL `BEGIN … END` tokens inside the `DO` body are block
  delimiters, not transaction control;
* **history is verified separately**: the CLI's write to
  `supabase_migrations.schema_migrations` is not assumed atomic with the body.
  After every apply, both the data and the history row are checked; if the body
  succeeded and the row is absent, stop and diagnose (§9.1 rules 8–9);
* **locks first**, in the fixed order A → B → C → D of §9.1, **every one with
  `NOWAIT`**, before any gate, count, fingerprint or insert. Modes: A `SHARE`,
  B `EXCLUSIVE`, C `SHARE ROW EXCLUSIVE`, D `EXCLUSIVE` — B and D stronger
  because they are the foreign-key parents holding pre-existing rows (§9.1). A
  lock that cannot be granted immediately aborts the migration with
  `lock_not_available` (`55P03`). **The lock phase never waits**; that is a
  guarantee about the lock phase, not about every lock the migration takes
  (§9.1). Any unexpected wait, deadlock or `55P03` stops the operation and is
  reported — **no automatic retry**;
* **insert order**, dictated by the A2 foreign keys: `user_profiles` and
  `organizations` first; then `organization_memberships` (FK →
  `user_profiles(user_id)`) and `roles`; then `role_permissions` and
  `membership_roles` (composite FKs to memberships and roles); then
  `audit_events`;
* plain `INSERT … SELECT` — **no `ON CONFLICT`**, no dynamic SQL, no
  `IF NOT EXISTS`;
* `role_permissions` is inserted as an explicit cross product with the **four
  literal keys** of §6.1 — never as a join against `public.permissions`
  (§6.2 item 2);
* `user_profiles.created_at` is listed explicitly and assigned exactly
  `u.created_at` — never omitted, never `default`, never `coalesce` (§2.1);
* **zero `INSERT`, zero `UPDATE` and zero `DELETE` on any legacy relation**;
  the legacy schema is a read-only source and every legacy row remains
  byte-identical, including `tenants.logo_url` and all of `app_config`.
  Enforced three ways: statically (§10.4), in-transaction (P16) and across the
  deployment window (§12);
* **no silent skipping**: every source row is either migrated or the migration
  aborts (P2, P3, P10, P10b);
* **no platform operator and no support bootstrap** (P11);
* **no branch around any gate** (§9.3);
* A2 enforcement triggers are compatible with every insert performed here: the
  membership revoke-only trigger fires only on UPDATE; the organizations
  time-zone trigger passes because the mapped value is a valid IANA name; RLS
  is bypassed by the migration owner role by design (A2 deliberately does not
  use FORCE ROW LEVEL SECURITY);
* post-insert assertions (P10, P10b, **P11b**, P14, P16) close the migration —
  P11's *pre*-insert half is **P11a**, which belongs to the gate phase above.

---

## 10. Legacy schema and data integrity

New in v2. "The legacy schema is untouched" is a claim; this section is how it
becomes a proved property. Two independent fingerprints are required, both
before and after.

### 10.1 A — legacy catalogue / schema fingerprint

A deterministic digest over the legacy **catalogue**: the relations, columns,
types, nullability, defaults, constraints, indexes, triggers, policies and
privileges of the legacy `public` objects, plus the `auth.users` column
signature. Computed **before** and **after** the apply and asserted identical.

This is the same class of check the Step 3.6-B4 staging verification already
performs, and it catches any accidental DDL — a dropped default, an added
column, a changed constraint — that a data fingerprint would not see.

Scope note: the `auth.users` portion of the catalogue fingerprint reads the
deployed `auth` schema, **not** the canonical legacy baseline (§0.1).

### 10.2 B — PII-safe server-side data fingerprints

Four relations, each fingerprinted before and after.

| Relation | Columns in scope | Deterministic ordering |
|---|---|---|
| `auth.users` | `id`, `raw_user_meta_data`, `created_at` — **and nothing else** | `ORDER BY id` |
| `public.tenants` | **every legacy column, including `logo_url`** — `id`, `slug`, `nome`, `prefixo`, `locale`, `moeda`, `estado`, `criado_em`, `titular`, `morada`, `nif`, `iban`, `mbway`, `foro`, `dominio`, `whatsapp`, `logo_url`, `linha_actividade`, `linha_by`, `slogan` | `ORDER BY id` (`tenants_pkey`) |
| `public.memberships` | **every column** — `user_id`, `tenant_id`, `papel`, `criado_em` | `ORDER BY user_id, tenant_id` (the composite PK, baseline 5386) |
| `public.app_config` | **every column** — `tenant_id`, `chave`, `valor`, `descricao`, `updated_at`, `criado_por` | `ORDER BY tenant_id, chave` — **the composite primary key** `app_config_pkey` (baseline 5301–5302). Never `ORDER BY chave` alone: that is not a total order across tenants. |

`auth.users` is fingerprinted over exactly three columns because those are the
only columns this bootstrap reads (`id` → `user_profiles.user_id`,
`raw_user_meta_data` → `full_name`/`display_name`, `created_at` →
`user_profiles.created_at`). A wider scope would make the fingerprint fail on
routine Auth-service activity — a refreshed token timestamp, a
`last_sign_in_at` update — that is none of this migration's business.

### 10.3 Fingerprint requirements

**Normative. Every requirement below is mandatory**, and every one applies to
**both** fingerprints — A (§10.1) and B (§10.2) — with exactly two
qualifications:

* **requirement 1** states the ordering rule for each fingerprint separately,
  because they have different keys: fingerprint B orders by the relation's
  primary key (§10.2), fingerprint A by the catalogue object's identifying
  tuple. Requirements **8** and **9** likewise govern both, but only
  fingerprint B has a column whose type raises the question (`jsonb`);
* **requirement 5** ("before and after must be identical") is enforced
  **in-transaction** for fingerprint B, by **P16**, and therefore aborts the
  *migration*. Fingerprint A is computed across the deployment window (§12) and
  therefore stops the *deployment*. Both are mandatory; they simply fail at
  different moments.

1. **Deterministic ordering.** Every fingerprint-B digest aggregates rows in an
   explicit, **total** order, taken from the relation's primary key as
   tabulated in §10.2. Ordering must be inside the aggregate
   (`string_agg(…, … ORDER BY …)` or an equivalent ordered construct), never
   left to the physical row order.
   Fingerprint A has no primary key to order by: it must aggregate catalogue
   rows in an explicit total order over their identifying tuple — for
   relations, `(schema_name, relation_name)`; for columns,
   `(schema_name, relation_name, column_name)`; for constraints, indexes,
   triggers, policies and privileges, `(schema_name, relation_name,
   object_name)` — never by `oid`, which is not stable across environments.
2. **Output shape.** Each fingerprint query returns exactly three things per
   relation: the **table identifier**, the **row count**, and the **digest**.
   Nothing else.
3. **Never output source values.** No column value, no fragment of one, and no
   sample row ever appears in the output — only the digest of the hashed
   concatenation.
4. **No PII, categorically.** No names, no metadata, no addresses, no tax IDs,
   no bank information, no telephone numbers, no logo URLs and no
   configuration values. This holds for the query text, the result set, the
   log output and any artifact written to disk.
5. **Before and after must be identical.** Any difference is a contract
   violation: it aborts the migration in-transaction (P16) and stops the
   deployment out-of-band (§12).
6. **SELECT-only.** Every fingerprint query is a pure `SELECT`. No temporary
   table that persists, no `CREATE`, no `INSERT`, no `SET` that outlives the
   session, no side effect of any kind on the legacy relations.
7. **Rendering must be pinned.** Because a digest over text renderings is only
   as stable as the rendering, the before and after computations must run with
   **identical** `DateStyle`, `TimeZone`, `extra_float_digits`, `bytea_output`
   and `lc_numeric` settings, set explicitly in the session (`SET LOCAL`)
   rather than inherited. Otherwise a session-level `TimeZone` difference
   between the two runs would render `timestamptz` values differently and
   produce a spurious mismatch — a false alarm that is as damaging to trust as
   a missed change.
8. **NULL must be unambiguous.** The per-row hash must distinguish `NULL` from
   the empty string. Use explicit `quote_nullable(col)` concatenation per
   column, or a whole-row cast whose rendering is known to distinguish them;
   do not use a plain `concat()`, which flattens `NULL` to `''`.
9. **`jsonb` is safe to hash.** `auth.users.raw_user_meta_data` is `jsonb`,
   whose text rendering is normalised by PostgreSQL (duplicate keys dropped,
   key order and whitespace canonicalised), so its digest is stable across
   runs and, usefully, insensitive to a semantically identical rewrite.
   (A `json` column would also digest deterministically — `json` stores and
   returns the input text verbatim — but it would be *byte*-sensitive rather
   than *value*-sensitive, so a semantically identical rewrite would read as a
   change. No `json` column is in scope here.)
10. **Same role, same path.** The before and after computations must be issued
    by the same role over the same connection path, so that a privilege
    difference cannot silently change what rows are visible.

### 10.4 Static no-legacy-DML requirement

**The migration must statically contain zero `INSERT`, `UPDATE` or `DELETE`
targeting:**

* `auth.users`
* `public.tenants`
* `public.memberships`
* `public.app_config`

This is a **source-level** check on the exact versioned migration file, not a
runtime observation. It runs:

* in the Layer B harness (§11.2) as a mandatory step;
* in the staging pre-apply gate (§12) against the same file, before the apply.

The check must also reject the indirect forms that a naive grep would miss:
`MERGE` into any of the four; `INSERT … ON CONFLICT` against any of them (also
forbidden outright by §9.5); `SELECT … INTO` a legacy relation; `COPY … FROM`;
`TRUNCATE`; `ALTER TABLE … ` on any of the four; and any `EXECUTE` of dynamic
SQL whatsoever — this migration contains no dynamic SQL at all (§9.5), which
is what makes a static check sound rather than best-effort.

The check applies **only** to the migration file. Test fixtures legitimately
write synthetic rows to these relations inside a rolled-back transaction
(§11.2); that is the harness, not the migration.

---

## 11. Local verification architecture

New in v2, replacing v1 §10's two "layers". Two corrections drive the rewrite:

* **v1 claimed pgTAP `throws_ok` could catch the failure of a `\i` replay.
  It cannot.** §11.1 explains why, and the claim is removed.
* **v1 offered a fallback that transferred missing local behavioural
  validation to staging. That fallback is removed.** Staging is not a place to
  discover that a fail-closed gate does not close.

Two layers are required. **Both** must pass before staging — that conjunction
is what gate **G1** (§15.1) certifies.

### 11.1 Layer A — versioned pgTAP suite

New directory `supabase/tests/step-3.6-c/`, run by the project's pgTAP runner.

**A.1 Migration-chain assertions.** The bootstrap version is present in
`supabase_migrations.schema_migrations`, together with the A2 foundation
(`20260822112333`) and the core permission catalogue (`20260824004513`) it
depends on.

**A.2 Empty-source no-op assertions.** Locally the legacy tables are empty
after `db reset`, so the applied bootstrap is a genuine no-op. Assert that the
seven in-scope tables are still empty and the three excluded tables are empty
— proving the empty-source no-op and that nothing was fabricated.

**A.3 Synthetic bootstrap replay — conditional on `\ir` loading the exact
file.** If, and only if, the exact versioned migration can be loaded inside
the pgTAP runner, Layer A also performs a **successful** replay inside
`BEGIN`/`ROLLBACK`:

* seed synthetic legacy rows — one `activo` tenant using the **mapped** UUID
  of §4.2, two auth users with metadata name keys and non-null `created_at`,
  two memberships (`dono` + `gestor`);
* include the exact migration file;
* assert mapping, RBAC, audit and legacy-integrity properties (A.4);
* `ROLLBACK`.

**Prefer `\ir` with a path relative to the test file**, not `\i` with a
repo-absolute or CWD-relative path. `\ir` resolves relative to the file
containing it, so the suite keeps working regardless of the runner's working
directory; `\i` resolves relative to the CWD and is therefore
runner-dependent.

**A.4 Assertions inside `BEGIN`/`ROLLBACK`:**

* exact migrated cardinalities: 2 / 1 / 2 / 2 / 8 / 2 and 1 audit row;
* field mapping: every §2 column equals its source expression (synthetic
  values only, no PII);
* **`user_profiles.created_at = auth.users.created_at` exactly**, for every
  migrated user — and, specifically, that it is **not** the transaction
  timestamp (seed the synthetic users with a `created_at` well in the past so
  the two are distinguishable);
* **`organizations.logo_path IS NULL`, and the synthetic `tenants.logo_url`
  is unchanged** (D5);
* identifier preservation: `organizations.id = tenants.id`,
  `user_profiles.user_id = auth.users.id`; membership resolved via
  `(organization_id, user_id)`; `organization_memberships.id` is a fresh UUID
  present in neither source;
* `user_profiles.locale IS NULL` and `time_zone IS NULL` (D10);
* `time_zone` equals the mapped value for a mapped tenant id;
* roles: keys, names, `is_system = true`, and the 4+4 permission sets of
  §6.1 — **filtered to the four core keys and to the roles this migration
  created** (§6.2 item 6);
* membership-role assignments match papel via the closed map;
* behaviour: for the `dono` user and for the `gestor` user,
  `has_permission(org, k)` is true for all four keys, and
  `access_mode(org) = 'membership'`;
* zero rows in `platform_operators`, `support_access_grants`,
  `support_access_grant_permissions`;
* per-row completeness (P10b), **scoped to the synthetic rows this replay
  created** — one `membership_roles` row per migrated membership, two roles per
  migrated organization with keys `owner`/`manager`, four `role_permissions`
  per *those* roles counting only the four core keys, one audit row per
  migrated organization. Never quantified over all of `public.roles` or all of
  `public.organizations`: the unfiltered form is exactly the global invariant
  §6.2 item 6 bans;
* audit shape: `actor_kind='migration'`, every actor correlation NULL, the
  action key, and a `change` payload whose keys are exactly the technical set
  of §8 (assert key presence and the absence of any business-value key, and
  the absence of any fingerprint digest);
* **legacy integrity**: the four §10.2 fingerprints over the synthetic rows
  are identical before and after the replay (the local expression of P16);
* **`estado='suspenso'` maps to `suspended`** and does **not** abort (D4).
  The D1 map now holds two entries, one per environment, so "a second tenant
  aborts at P13" is no longer what makes this safe — a second *mapped* tenant
  would pass. What keeps the case honest is that it re-seeds **the same** tenant
  id rather than introducing another one, which is what the savepoint below
  does. It is therefore asserted in its own savepoint: roll back to the pre-seed state,
  re-seed **the same mapped tenant UUID** with `estado='suspenso'`, replay,
  and assert `organizations.status = 'suspended'` plus
  `has_permission(org, k) = false` for all four keys and
  `access_mode(org) = 'none'` (both helpers require an active organization).
  The test then **rolls back to that savepoint** — `ROLLBACK TO SAVEPOINT`,
  never `RELEASE SAVEPOINT` — before the remaining assertions, so the mapped
  UUID is free again. *(`RELEASE SAVEPOINT` destroys the savepoint while
  **keeping** everything done since it was set, which would leave the
  suspended organization in place and poison every later assertion. v1 said
  "released". See §15.3, F5.)*;
* extension-tolerant throughout: filter to what this step owns, never
  constrain global row counts or column lists (the Step 3.6-B1.1 lesson,
  restated for permissions in §6.2 item 6);
* nothing in the suite constrains unrelated future migrations.

**A.5 What Layer A must NOT contain — the removed `throws_ok` claim.**

> **v2 correction.** Any claim that pgTAP `throws_ok` can catch a failure
> produced by a psql `\i` or `\ir` meta-command is **removed**. It is not
> merely unreliable; it is impossible.

The reasons, precisely:

1. `\i` and `\ir` are **psql client-side meta-commands**. psql intercepts and
   expands them locally; **the server never receives them**.
2. `throws_ok(sql text, …)` takes a **SQL string** and executes it
   **server-side** inside the test transaction. A meta-command cannot be
   embedded in that string: it would be transmitted verbatim and fail as a
   syntax error at the backslash — which is not the migration's abort, and
   proves nothing about the gate under test.
3. When the SQL inside an included file does raise, the error is delivered to
   **psql**, not to any enclosing SQL expression. With `ON_ERROR_STOP` the run
   terminates; without it psql continues while the transaction is in the
   aborted state, so every subsequent pgTAP call fails with `current
   transaction is aborted` and the suite's output is meaningless. In neither
   case does `throws_ok` observe or catch the failure.
4. A `SAVEPOINT` does not rescue this. The failure is delivered to the client,
   not to a server-side handler; there is nothing in-session to catch it.
5. Every route that *would* catch such an error server-side requires the
   migration's SQL to arrive as a **string the server can wrap** — re-embedded
   in a `DO` block or a function body, or shipped through `dblink` /
   `pg_background` to a second session. All of them stop executing *the exact
   versioned file* and start executing a transcription of it, so none proves
   anything about what `supabase db push` will run — which is the whole point
   of the exercise. Layer B does not transcribe: it executes the file.

**Therefore: Layer A contains no negative/abort case at all.** Every
fail-closed case belongs to Layer B.

### 11.2 Layer B — exact-file integration harness

**The exact versioned migration file must also be exercised through `psql`
with `ON_ERROR_STOP` enabled.** This is where every fail-closed gate is
proved.

**B.1 Invocation shape.** One `psql` process per fixture, driven by a **driver
file on disk** — never a heredoc on stdin — with `ON_ERROR_STOP=1` so that the
first server error terminates the run with a non-zero exit status (psql exits
`3` on a script error under this setting):

```
psql -v ON_ERROR_STOP=1 -d "$LOCAL_DB" \
  -f supabase/tests/step-3.6-c/harness/cases/<case>.sql
```

**The harness location is pinned**, because every `\ir` below is relative to
it: driver scripts live in `supabase/tests/step-3.6-c/harness/cases/` and
fixtures in `supabase/tests/step-3.6-c/harness/fixtures/`. With that layout,
`supabase/tests/step-3.6-c/harness/cases/<case>.sql` contains:

```
begin;
\ir ../fixtures/<case>.sql
\ir ../../../../migrations/<version>_<name>.sql
rollback;
```

(`../../../../` walks `cases → harness → step-3.6-c → tests → supabase`, so the
second include resolves to `supabase/migrations/`. If the harness is ever moved,
both relative paths must move with it — which is the price of `\ir`, and a
cheap one next to the CWD-dependence of `\i`.)

**The driver must be a file, not stdin.** `\ir` resolves relative to *the
script file containing it*; when psql reads from stdin there is no containing
file, so `\ir` silently degenerates to `\i` and resolves against the process's
current working directory instead. A heredoc therefore throws away exactly the
property §11.1 A.3 requires `\ir` for, and does it silently — the harness would
still appear to work from one directory and break from another.

**B.2 The explicit `begin` is mandatory, not stylistic** — for the harness,
never for the migration. Since v6 the migration is one `DO` statement (§9.1),
so PostgreSQL's implicit statement transaction alone is enough for its
`LOCK TABLE`s to be legal. The harness nevertheless opens an **explicit**
transaction, for two reasons that have nothing to do with the lock statement:

* **fixture 1 requires it.** That fixture must execute the exact migration
  **twice inside one transaction** so the second pass observes the first pass's
  writes and aborts at **P1**. Two separate implicit statement transactions
  would commit the first pass and leave rows behind;
* **every fixture must leave nothing behind.** The enclosing `begin` guarantees
  that a fixture's synthetic seed — which *is* several statements — is rolled
  back with the case, whether it fails or succeeds.

Do not rely on an implicit transaction block to cover a **multi-statement**
sequence: whether several statements share one implicit transaction depends on
how the client batches them, and psql's `-f` processing sends them separately.
The explicit `begin` makes the harness's guarantee independent of client
behaviour.

**B.3 Per invalid fixture, the required sequence:**

1. **begin a disposable transaction/session** (§B.2);
2. **seed the invalid synthetic legacy state** — synthetic values only, no
   PII;
3. **execute the exact migration file** — byte-identical to the versioned
   file, included with `\ir`, never a copy, an extract or a re-typed body;
4. **require a non-zero exit.** A zero exit is a test failure: it means the
   gate did not close. The assertion is on the process exit status, and the
   expected abort must additionally be matched against the *specific*
   contract violation (the raised message or `SQLSTATE`), so that a fixture
   cannot pass by aborting for an unrelated reason;
5. **let the failed transaction/session roll back** — the `rollback;` line is
   never reached; the session ends and the server rolls the open transaction
   back on disconnect;
6. **reconnect** — a fresh session, so that nothing is inferred from the dead
   one;
7. **prove every target remains empty and no partial target write survived** —
   all seven populated targets at 0 rows, all three excluded tables at 0 rows,
   and the four §10.2 fingerprints unchanged from before the fixture.

**B.4 Required negative cases.** All seven are mandatory:

| # | Fixture | Gate it must trip |
|---|---|---|
| 1 | **second execution after a populated bootstrap** — seed valid state, include the migration once (succeeds), include it a second time | **P1** — must abort **before writing** |
| 2 | **`papel='equipa'`** | **P3** |
| 3 | **`estado='encerrado'`** | **P2** |
| 4 | **tenant UUID absent from the time-zone map** | **P13** |
| 5 | **tenant without `dono`** | **P12** |
| 6 | **partial source** (e.g. tenant present, memberships absent) | **P0** |
| 7 | **`auth.users.created_at IS NULL`** | **P15** — and it must abort at the named P15 check, **not** at the NOT NULL constraint on `user_profiles.created_at` |

**`NOWAIT` and fixture 1 — why the second execution still reaches P1.**
Fixture 1 includes the migration file **twice inside one transaction**. The
second pass re-issues the whole lock phase, `NOWAIT` and all. Those requests
are for locks the transaction **already holds**, and a transaction's own locks
never conflict with each other, so every one is granted immediately and
`NOWAIT` does not fire. Execution therefore reaches **P1**, which is where the
fixture must abort.

This matters for how the assertion is written: fixture 1 must require the
**named P1 violation**, and must **fail** if the run aborts with
`lock_not_available` (`55P03`) instead. A `55P03` there would mean something
outside the test held a conflicting lock — an environment problem masquerading
as a passing fail-closed test. The same reasoning applies to the positive
fixture B.5, whose single pass acquires each lock exactly once.

The same rule covers waits the lock phase cannot prevent: **every fixture must
fail on an unexpected lock wait or deadlock**, not tolerate it. A fixture that
hangs, or that aborts with a deadlock error instead of its named gate, is a
failed fixture and a reportable condition (§9.1). Since v4, groups B and D take
`EXCLUSIVE`, so a concurrent row locker on `auth.users` or `permissions` surfaces
as a `55P03` in the lock phase rather than as a row-level wait during the
inserts — which is exactly the behaviour these assertions rely on.

**Fixture 7 is mandatory and must execute** (v3, resolving X2). The canonical
Supabase Auth schema declares:

```
auth.users.created_at   timestamptz NULL
```

The column is nullable, so the fixture is constructible: the harness seeds an
`auth.users` row with `created_at` explicitly `NULL` — synthetic values only,
inside the disposable transaction — includes the exact migration file, and
requires that

* the bootstrap **aborts at the named P15 check**, not at the `NOT NULL`
  constraint on `user_profiles.created_at`;
* it aborts **before inserting into `user_profiles`** — nothing partial exists
  even momentarily;
* the reconnect-and-verify step of B.3 proves **zero partial target writes**:
  all seven populated targets at 0 rows, all three excluded tables at 0 rows,
  and the four §10.2 fingerprints unchanged.

**Do not alter the `auth` schema to create the fixture.** The fixture writes a
row; it never changes a column definition, a constraint or a grant.

**At test-implementation time, first inspect the local column metadata** — a
single `information_schema.columns` lookup for
`table_schema='auth' AND table_name='users' AND column_name='created_at'` —
and record the result:

| Observed | Required behaviour |
|---|---|
| `is_nullable = 'YES'` (the canonical schema, and the expected case) | The negative fixture is **mandatory** and **must execute**. |
| `is_nullable = 'NO'` (a future Supabase schema version) | **Record the exact catalogue evidence** — the full `information_schema.columns` row, plus the deployed Auth version — and test **P15 as structurally enforced** by that `NOT NULL` constraint, citing the evidence. **Do not weaken P15** and **do not modify `auth.users`.** |

**No silent skip is allowed** in either case. A harness run that neither
executes the fixture nor records catalogue evidence does not satisfy G1.

**B.5 Required positive case.** Prove that **one valid synthetic execution of
the exact migration succeeds**:

```
begin;
\ir fixtures/valid.sql
\ir ../../migrations/<version>_<name>.sql
\ir assertions/valid_expectations.sql
rollback;
```

It must exit zero, produce **all contracted mappings and cardinalities** (the
A.4 list), and be **rolled back after verification**. A reconnect afterwards
must show every target empty again, proving the rollback was real.

**B.6 Static check.** The harness runs the §10.4 static no-legacy-DML check
against the exact migration file as a mandatory step.

**B.7 Fingerprints.** The local synthetic verification **must fingerprint all
three actual sources and `app_config` before and after** — `auth.users`,
`public.tenants`, `public.memberships`, `public.app_config` — under the rules
of §10.3, and assert equality. This is the local proof of P16 and of the
§9.5 read-only-source rule.

### 11.3 If `\ir` cannot execute inside `pg_prove`

The required response, in full:

* **retain pgTAP Layer A where applicable** — A.1 (chain) and A.2
  (empty-source no-op) do not depend on `\ir` and remain in the suite;
* **use the exact-file harness for both valid and invalid replay** — A.3/A.4's
  mapping, RBAC, audit and legacy-integrity assertions move into the Layer B
  positive fixture (§11.2 B.5), executed as `assertions/valid_expectations.sql`
  inside the same transaction;
* **report the limitation** — explicitly, in the Step 3.6-C implementation
  record, as a known property of the runner and not as a defect of the
  contract;
* **do not proceed to staging until the exact-file harness passes.**

There is **no** variant of this response that defers a missing local
behavioural check to staging.

---

## 12. Staging verification plan

Mirrors the Step 3.6-B4 pattern, extended by v2's gates.

1. **G2 — `auth.users` lock capability gate** (§9.2) — `begin; lock table
   auth.users in exclusive mode nowait; rollback;`, separately authorised, over
   the `db push` connection path and as the `db push` role. **If G2 has not
   passed, stop here.** A G2 result obtained in a weaker mode does not count
   (§9.2).
2. **G1 — local verification, both layers** (§11, as defined in §15.1) passed
   on this exact migration file — Layer A's chain and empty-source assertions
   **and** the Layer B exact-file harness. **If G1 has not passed, stop here.**
3. **History gate** — `supabase_migrations.schema_migrations` contains
   `20260822112333` and `20260824004513` and does **not** contain the
   bootstrap version.
4. **Static check** — §10.4, against the exact file about to be pushed.
5. **Pre-apply gates**, SELECT-only:
   * the seven populated targets and the three excluded tables are empty;
   * the four core permission keys are present;
   * **fingerprint A** (catalogue, §10.1) — recorded;
   * **fingerprint B** (data, §10.2) — recorded, under §10.3's pinned
     rendering settings.
6. **Dry run** showing **exactly one** pending migration.
7. **One apply** — `supabase db push`. No manual SQL, no retry, no partial
   remediation. The CLI supplies no transaction (§9.1): atomicity comes from
   the migration being one `DO` statement.
7b. **History verification, immediately after the apply.** Confirm that
   `supabase_migrations.schema_migrations` contains the bootstrap version
   **and** that the data landed. These are checked as two separate facts,
   because the CLI's history write is not assumed atomic with the body. If the
   body succeeded and the history row is absent, **stop and diagnose** — never
   re-run blindly; a history repair needs its own explicit authorisation
   (§9.1 rules 8–9).
8. **Post-apply verification**, SELECT-only: every cardinality and mapping of
   §2 and §13, reporting **aggregates and non-PII catalogue values only**;
   plus **fingerprint A** and **fingerprint B** recomputed and asserted
   **identical** to step 5.
9. **Any mismatch stops the deployment and is reported.** There is no
   in-place correction path: a failed bootstrap is investigated and the
   migration is fixed — and because a fixed migration is a **different file**,
   the whole sequence re-runs **from step 2**, so G1 is re-established against
   the file that will actually be pushed. Re-running from step 3 would carry
   forward a G1 result earned by a file that no longer exists.

**What the deployment-window fingerprint pair does and does not prove.** The
pair in steps 5 and 8 brackets the *entire window*, including time outside the
migration transaction, so it **detects** any third-party change to a legacy
relation during the deployment. It does not **prevent** one: prevention inside
the transaction is the job of the locks (§9.1), which since v3 cover **all
four** fingerprinted relations, and the in-transaction proof that *this
migration* changed nothing is P16. A difference between step 5 and
step 8 that P16 did not also catch means something other than this migration
wrote to legacy during the window — the correct response is to stop, report,
and re-run the window in a quiet period, never to re-baseline the fingerprint.

---

## 13. Source → target cardinalities (staging)

| Source | Rows | → Target | Rows |
|---|---|---|---|
| `auth.users` | 2 | `user_profiles` | 2 |
| `tenants` | 1 | `organizations` | 1 (id preserved) |
| `memberships` | 2 | `organization_memberships` | 2 (ids generated) |
| — | — | `roles` | 2 (per organization) |
| — | — | `role_permissions` | 8 (4 per role — and exactly 4, §6.2) |
| `memberships.papel` | 2 | `membership_roles` | 2 |
| — | — | `audit_events` | 1 (per organization) |
| — | — | `platform_operators`, `support_access_grants`, `support_access_grant_permissions` | **0** |
| `tenants.logo_url` | 1 | — (**deferred**, D5) | `logo_path` NULL |
| `app_config` | 2 keys | — (**deferred**, §2.5) | untouched; locked in `SHARE` and fingerprinted (§9.1 A, §10, P16) |

## 14. Approved decisions (D1–D12)

Unchanged from v1 except where a v2 correction is noted inline.

| # | Decision | Approved resolution |
|---|---|---|
| **D1** | Organization time zone | `Europe/Lisbon`, as an **explicit closed mapping keyed by the existing legacy tenant UUID** (§4.2). Never a COALESCE, default or fallback. Unmapped tenant ⇒ abort (P13). Future organizations obtain `time_zone` through the normal v2 organization-creation workflow. |
| **D2** | Role permissions | `owner` and `manager` each receive `organization.read`, `organization.manage`, `members.manage`, `audit.read`; both `is_system = true`. Preserves effective legacy access because `memberships.papel` was unused by legacy authorization. Future narrowing of `manager` is a separate audited product decision. **v2 adds §6.2**: this set does not grow implicitly, and "preserves legacy access" is bounded to the current core Platform surface. |
| **D3** | `papel = 'equipa'` | No v2 mapping. Closed map is `dono → owner`, `gestor → manager`; anything else aborts (P3). No source membership may be skipped. |
| **D4** | Organization status | `activo → active`, `suspenso → suspended`. `encerrado` is **not** mapped and aborts, because the target requires a reliable non-null `closed_at` and no authoritative legacy closure instant exists. |
| **D5** | Logo boundary | `organizations.logo_path = NULL`; `tenants.logo_url` untouched and preserved in legacy. Object location/validation, canonical path derivation, asset copying and setting `logo_path` are deferred to the controlled Storage / organization-branding migration (§4.3, P14). **v2 adds** the `tenants` fingerprint, which includes `logo_url` (§10.2). |
| **D6** | Timestamps | Migrated entities preserve authoritative legacy timestamps; new v2 constructs use the migration transaction timestamp; no actor or timestamp is fabricated where the target allows NULL. **v2 correction:** where the target does **not** allow NULL, a missing authoritative source **aborts** rather than being substituted — `user_profiles.created_at` is exactly `auth.users.created_at`, with **no** `now()`/`transaction_timestamp()` fallback, guarded by **P15** (§2.1, §7). |
| **D7** | Audit | One event per migrated organization: `actor_kind='migration'`, `action='platform.legacy_bootstrap'`, `root_type`/`entity_type='organization'` with the organization id in both id columns, `change` limited to the migration version, technical source/target counts and technical boolean/enumeration flags (§8). No PII. **v2 adds** one clause: no fingerprint digest ever enters the payload either — digests are verification output (§10), never persisted audit data. |
| **D8** | Role identifiers | Generated UUIDs. Future references resolve through `organization_id` + `key`. Role UUIDs are never derived from legacy text. |
| **D9** | Profile scope | One `user_profiles` row per `auth.users` row, admitted only under the bijection (every auth user has exactly one legacy membership; every membership resolves to an auth user). Abort otherwise (P4). **v2 clarifies:** "relevant `auth.users`" means **every row** of `auth.users` (§9.3). |
| **D10** | User locale / time zone | Both NULL. Organization locale and time zone are never copied into personal preferences. |
| **D11** | Display name | Never derived from an e-mail fragment. `full_name` and `display_name` have distinct source expressions (§2.1). A non-blank authoritative value is required from the approved metadata chain, or the migration aborts (P5). **v2 corrects v1's evidence statement** (§15.3 F1/F2): the chain is defined by **two** baseline functions whose resolution chains are character-identical (their `WHERE` clauses differ) — `nome_do_autor(uuid)` (4129–4143) and `nome_do_utilizador()` (4149–4159) — and the application **does** consume it, by RPC, at `src/lib/autoria.js:81` and `:89`. No `src/` file reads the metadata keys directly. The mapping itself is unchanged. |
| **D12** | Organization ownership | Every migrated organization must have at least one legacy `dono` mapped to an active membership holding the `owner` role. A tenant without a `dono` aborts (P12). |

## 15. Hard gates and remaining unresolved ambiguities

### 15.1 Hard gates — blocking

New in v2. These are **not** ambiguities with a defined fail-closed behaviour;
they are conditions that must be **satisfied** before the next step may occur.

| # | Gate | Blocks | Satisfied when |
|---|---|---|---|
| **G1** | **Local verification, both layers** (§11) — Layer A's chain and empty-source assertions pass (§11.1 A.1, A.2), **and** the Layer B exact-file harness (§11.2) passes: **all seven** negative fixtures abort at their **named** gate with a non-zero exit and leave every target empty, the positive fixture succeeds and rolls back, the static check passes, and the fingerprints match. | writing the migration off as verified; **any** staging apply | both layers pass on the **exact versioned file**. Fixture 7 (`auth.users.created_at IS NULL` → P15) is **mandatory and must execute** where `is_nullable = 'YES'`, which is the canonical schema; only a future schema reporting `is_nullable = 'NO'` substitutes recorded catalogue evidence plus a structural-enforcement test, never a skip (§11.2 B.4). If `\ir` cannot execute inside `pg_prove`, §11.3 applies — A.3/A.4's assertions move into Layer B and the harness still has to pass. A migration that is subsequently modified is a different file and must re-earn G1 (§12 step 9). **This is a hard local implementation gate. It is not a non-blocking ambiguity and it is not satisfiable by deferring to staging.** *(This supersedes v1's U7, which classified the question as a non-blocking ambiguity with a staging fallback. Both classifications were wrong.)* |
| **G2** | **Staging `auth.users` lock capability gate** (§9.2) — `begin; lock table auth.users in exclusive mode nowait; rollback;` over the `db push` connection path, as the `db push` role, separately authorised, **not** executed while producing this contract. The mode is `EXCLUSIVE` since v4, rehearsing the exact final group-D statement; a probe run in a weaker mode does not satisfy G2. | any staging apply of this migration | the lock is acquired. A permissions failure or a contention failure both **stop** the deployment under the rules of §9.2; neither may be worked around. |

### 15.2 Remaining unresolved ambiguities — non-blocking

Each has a defined fail-closed behaviour today and is recorded so a future
step resolves it deliberately.

| # | Ambiguity | Current behaviour | Resolution owner |
|---|---|---|---|
| **U1** | `encerrado → closed` needs an authoritative `closed_at`; legacy has no closure timestamp. | abort (P2) | a later lifecycle migration that first establishes the instant |
| **U2** | `papel = 'equipa'` has no v2 role and no defined permission set. | abort (P3) | a product decision defining a `team` role, if ever needed |
| **U3** | `organizations.logo_path` and the branding asset itself. | NULL; legacy `logo_url` preserved and fingerprinted | Storage / organization-branding migration (D5) |
| **U4** | `app_config` buffer keys. | untouched; fingerprinted by composite PK `(tenant_id, chave)` | Events-product migration creating `event_product_settings` |
| **U5** | Whether `manager` should eventually be narrower than `owner`. | identical permission sets (D2); §6.2 forbids implicit widening in the meantime | a separate audited product decision |
| **U6** | Time zone for organizations created after this bootstrap. | out of scope here | the v2 organization-creation workflow |
| **U7** | *Withdrawn.* v1's U7 (whether the pgTAP `\i` replay resolves inside `pg_prove`) is **reclassified as hard gate G1** (§15.1). It is not an ambiguity and has no staging fallback. | — | — |
| **U8** | Per-user `locale` / `time_zone` values. | NULL (D10) | a future user-preferences feature |
| **U9** | Whether a **future** Supabase Auth schema version might change `auth.users.created_at` from `NULL` to `NOT NULL`. The current canonical schema declares it `timestamptz NULL`, which is why fixture 7 is mandatory (§11.2 B.4) — this row is a forward-looking watch item, not an open question about today. | the harness inspects `information_schema.columns` at test-implementation time and records the result; `YES` ⇒ the fixture executes; `NO` ⇒ exact catalogue evidence is recorded and P15 is tested as structurally enforced. **Never a silent skip, never a weakened P15, never a change to `auth.users`.** | Step 3.6-C test implementation, re-checked whenever the deployed Supabase Auth version changes |

### 15.3 Contradictions raised in v2 and resolved in v3; factual corrections

v2 was verified against the canonical legacy baseline, the Step 3.6-A2 contract
v1, the A2 migration, the B1 migration, the current A2/B test suites, the
inspected legacy authorization code, D1–D12, and each correction of the Step
3.6-C0.2 recovery instruction. This section records what that verification
found. **Nothing was silently resolved**, and as of v3 **nothing remains
unresolved**: both contradictions v2 raised, X1 and X2, were referred for
decision and are closed below by the Step 3.6-C0.3 approvals.

#### X — contradictions raised in v2, **RESOLVED in v3**

Both entries below were raised by v2's adversarial verification and referred
for decision rather than resolved by the drafter. Both were decided in Step
3.6-C0.3 and are closed. **No entry in this catalogue is unresolved.**

**X1 — `public.app_config` was fingerprinted but never locked. → RESOLVED.**

*The contradiction as raised.* Correction 1 fixed the lock phase at four groups
and required locks "before any gate, count, fingerprint or insert", but
`public.app_config` appeared in none of them; correction 5 required
`public.app_config` to be fingerprinted before and after. The contract was thus
required to fingerprint a relation it was not permitted to lock, so for
`app_config` alone the P16 pair proved only that the two computations agreed —
it could not exclude a concurrent write between them, or a write-and-revert
across them.

*Resolution (approved, applied in v3).* `public.app_config` is added to lock
group A, which since v3 covers `public.tenants`, `public.memberships` and
`public.app_config` in `SHARE` mode with `NOWAIT`. The statement itself lives
in **§9.1 A** and is deliberately not duplicated here.

Grounds, as approved:

* `app_config` **is** fingerprinted before and after (§10.2, P16);
* without a write-blocking lock its fingerprint could change concurrently, so
  the pair proved less than it appeared to;
* it **remains read-only and is not migrated** — it is deferred in full to
  `event_product_settings` (§2.5, §5), no mapping reads it, and §10.4
  statically forbids any DML against it;
* its fingerprint ordering is **unchanged**: the composite primary key
  **`(tenant_id, chave)`**.

*Effect.* P16's guarantee is now uniform across all four fingerprinted
relations: each is write-blocked for the whole transaction, so the pair both
**prevents** concurrent modification and **proves** none occurred. The
`Scope limit` paragraph v2 carried at P16 is deleted, because the gap it
described no longer exists. See §17, N1.

**X2 — negative fixture 7 was thought environmentally unconstructible.
→ RESOLVED.**

*The contradiction as raised.* Correction 4 lists **seven** mandatory negative
fixtures, the seventh being `auth.users.created_at IS NULL` → P15. Writing a
NULL into that column is possible only if it is nullable, and `auth` is
Supabase-managed (§0.1) — so v2 treated the fixture's constructibility as an
open **environment fact** and allowed it to be recorded "inapplicable",
weakening G1 by one fixture.

*Resolution (approved, applied in v3).* The premise was too cautious. The
canonical Supabase Auth schema declares:

```
auth.users.created_at   timestamptz NULL
```

The column **is** nullable. Fixture 7 is therefore constructible, **mandatory,
and must execute**. v3 accordingly retains, with no weakening:

* **P15** — every migrated `auth.users` row must have a non-null `created_at`;
* the **exact-file negative fixture** seeding `auth.users.created_at`
  explicitly `NULL`;
* the requirement that the bootstrap **aborts before inserting
  `user_profiles`**, at the named P15 check rather than at the `NOT NULL`
  constraint;
* **reconnect-and-verify** proving **zero partial target writes**.

The `auth` schema is still never altered to construct the fixture: the harness
writes a row, never a definition.

*Forward-looking rule.* At test-implementation time the harness first inspects
the local column metadata (`information_schema.columns`). `is_nullable = 'YES'`
— the canonical case — makes the fixture mandatory and executed.
`is_nullable = 'NO'`, which only a future Supabase schema version could
produce, requires **exact catalogue evidence to be recorded** and P15 to be
tested as **structurally enforced** by that constraint; P15 is not weakened and
`auth.users` is not modified. **No silent skip is allowed in either case.**
Retained as the non-blocking watch item **U9** (§15.2), which is now a question
about future schema versions, not about today. See §11.2 B.4 and §17, N3.

#### F — factual errors inherited from v1 and corrected in v2

These were **not** among the ten requested corrections. Each is a correction to
**evidence, citation or mechanism wording only**: no mapping, no decision, no
precondition and no cardinality changes as a result. They are listed separately
so they can be approved or reverted deliberately.

| # | v1 statement | Finding | Corrected at |
|---|---|---|---|
| **F1** | `nome_do_autor()` is "the only legacy display-name authority" (v1 §2.1, D11) | **False.** The baseline defines **two** functions with character-identical `nome → full_name → split_part(email,'@',1)` resolution chains: `public.nome_do_autor(uuid)` (baseline 4129–4143, chain 4133–4136), keyed on a parameter and restricted to tenant-sharing callers, and `public.nome_do_utilizador()` (baseline 4149–4159, chain 4153–4156), keyed on `auth.uid()` and documented at baseline 4165 as the session holder's name for the admin greeting. Their `WHERE` clauses differ, so the *bodies* are not identical — only the chains are, which is what the mapping depends on. v1 cited only `nome_do_autor()` and never mentioned the second function. | §2.1, §14 D11 |
| **F2** | "no application reader was found" (v1 §2.1 evidence limits, D11) | **Misleading.** No `src/` file reads `raw_user_meta_data` / `user_metadata` / `full_name` / `display_name` directly — that grep really does return nothing, so §2.1's narrower "no application code reads it directly" is exact. But the application **does** consume the chain, through the database: `src/lib/autoria.js:81` calls `nome_do_utilizador` and `:89` calls `nome_do_autor` by RPC. The chain is the live source of every display name the product shows. This **strengthens** the evidence for the D11 mapping; it does not change it. | §2.1, §14 D11 |
| **F3** | the tenant-status gate was "introduced by `docs/migracoes/103_a_casa_suspensa_fecha_as_portas.sql`" (v1 §2.4) | **False.** `103` contains **zero** occurrences of `tenants_do_utilizador`. The function, its `t.estado = 'activo'` gate and the quoted comment were all created together by `docs/migracoes/090_o_primeiro_tenant.sql:199–217`. The `estado='activo'` gates that 103 *did* add are on other helpers, notably the portal-token path. The substance of the bullet — that legacy already gates on tenant status, and the quoted comment is verbatim — is unaffected; only the provenance was wrong. | §2.4 |
| **F4** | "every `papel` hit in `src/` is a form-field role or a paper-contract flow" (v1 §2.4) | **Incomplete enumeration.** There are 273 `papel` occurrences in `src/`, dominated by the `.papel` print-surface CSS class and its commentary and by the `comunicados` block-role vocabulary (`papel: "imagem"` and siblings), neither of which the v1 sentence covers. The load-bearing claim it supported — that no application code reads `memberships.papel`, a grep for the two co-occurring returning **zero** hits — is exact and survives intact. | §2.4 |
| **F5** | "The savepoint is released before the remaining assertions so the mapped UUID is free again" (v1 §10) | **False mechanism.** `RELEASE SAVEPOINT` destroys the savepoint while **keeping** every change made since it was established; only `ROLLBACK TO SAVEPOINT` reverts them. As written, the suspended organization would still occupy the mapped UUID and would poison every later assertion in the suite. | §11.1 A.4 |
| **F6** | `tenants_do_utilizador()` cited as "baseline 4423–4431" (v1 §2.4) | **Off by one at the start.** The `CREATE OR REPLACE FUNCTION` line is **4422**; 4423 is the `LANGUAGE "sql" STABLE SECURITY DEFINER` clause. `$$;` is 4431. Everywhere else v1 and v2 use the CREATE-line-to-`$$;` convention (e.g. `nome_do_autor()` as 4129–4143, where 4129 *is* the CREATE line). | §2.4 |

#### V — errors introduced in v2 drafting and caught before freeze

Recorded for transparency: these statements exist in **no** version of v1, and
were corrected in this document before it was issued.

| # | Draft statement | Finding | Corrected at |
|---|---|---|---|
| **V1** | the baseline's "only two mentions of `auth.users`" | **False.** Seventeen references: two `FROM auth.users u` function-body reads (4137, 4157) and fifteen schema-quoted `REFERENCES "auth"."users"("id")` foreign-key clauses — which a naive `grep 'auth.users'` misses entirely. v2's own §2.3 cites one of the fifteen (`memberships_user_id_fkey`, baseline 5801). The **normative conclusion was never in doubt**: none of the seventeen is DDL, so the baseline is still not the authority for `auth.users`. | §0.1 |
| **V2** | "every A2 table is `OWNER TO postgres` in this repository's migrations" | **False for A2.** The A2 and B1 migrations contain **zero** `OWNER TO` statements; only the legacy baseline sets ownership explicitly, and it does so for all 34 legacy tables. The eleven A2 relations are owned **implicitly by the role that applied the migration**. The argument this supported survives — and is now stated correctly, because implicit ownership by the applying role is exactly what makes the group A/B/C locks safe while `auth.users` needs G2. | §0.1 |

#### Verified correct — no finding

The verification positively confirmed, against the authorities: every other
baseline line citation in this document; the complete column inventories of
`tenants` (20), `memberships` (4) and `app_config` (6); the composite
`app_config_pkey (tenant_id, chave)` and the composite
`memberships_pkey (user_id, tenant_id)`; the absence of any `CREATE TABLE
auth.users`, any closure timestamp and any time-zone column; the "13 of 34
legacy tables carry `tenant_id`" claim and its named list; every target column,
type, nullability, default and named constraint of the seven populated and
three excluded A2 relations; `user_profiles.created_at timestamptz not null
default now()` and `organization_memberships.joined_at timestamptz not null`
with no default; the `audit_events` actor-correlation rule for
`actor_kind = 'migration'`; the insert order against the actual foreign keys;
RLS `ENABLE` and never `FORCE`; `has_permission` and `access_mode` gating on
`status = 'active'` and returning `'membership'` / `'none'`; the four core
permission keys and their spelling; the eleven-relation 7 + 3 + 1 partition;
zero RLS policies and zero functions reading `memberships.papel`; and the
recorded v1 SHA256, byte count and HEAD.

---

## 16. v1 → v2 change log

Every difference between v1 and this document. Nothing else changed.
Rows C1–C10 carry the ten requested corrections; because correction 1 and
correction 4 each produced two distinct changes, the C-numbers are **not** the
request's item numbers. The mapping is: **C1, C2** ← request item 1 (locks,
then the capability gate); **C3** ← item 2; **C4** ← item 3; **C5, C6** ← item
4 (the testing architecture, then U7's reclassification); **C7** ← item 5;
**C8** ← item 6; **C9** ← item 7; **C10** ← item 9. Items 8 and 10 are
guarantees rather than edits, and are discharged by the "Unchanged and
re-affirmed in full" list below and by §15.3 respectively. Wherever this
document says "correction *N*", *N* is the **request's** item number.

Row **C11** records the factual errors the §15.3 adversarial verification
found — **six** inherited from v1 (F1–F6) and **two** introduced in v2 drafting
(V1–V2) — which are corrected here but were **not** part of the request, and
therefore need explicit approval.

Row **C12** records the remaining structural additions v2 makes, so that the
completeness claim above is literally true.

| # | Change | v1 | v2 | Where |
|---|---|---|---|---|
| **C1** | **Stable transaction state and locks** | "atomic: one migration = one transaction" and nothing further; no lock statement anywhere. | One atomic transaction, plus a mandatory lock phase in the fixed order **A** (`tenants`, `memberships` — SHARE) → **B** (`permissions` — SHARE) → **C** (ten A2 relations — SHARE ROW EXCLUSIVE) → **D** (`auth.users` — SHARE, gated). Locks precede every gate, count, fingerprint and insert; held to transaction end; no intermediate `COMMIT`; no `BEGIN`/`COMMIT`/`SAVEPOINT` in the file; mode rationale, self-conflict argument, and the `LOCK TABLE` privilege rule. | §9.1 |
| **C2** | **`auth.users` capability gate** | absent. | Hard staging gate **G2**: `begin; lock table auth.users in share mode nowait; rollback;` over the `db push` connection path, separately authorised, **not run while producing this contract**. Permission failure ⇒ stop, no GRANT/owner/role change, no fallback. Contention ⇒ stop, controlled maintenance window. `ACCESS SHARE` explicitly forbidden as a substitute. Local capability explicitly not proof of staging capability. | §9.2, §15.1 |
| **C3** | **Truly fail-closed empty-source behaviour** | P0 admitted a "clean no-op" on three zero source counts; P1's force on an empty source was ambiguous ("on a wholly empty source a re-run is another harmless no-op"); P11 was post-insert only. | No-op allowed only when **all seven** conditions hold (3 source counts + 7 populated targets + 3 excluded tables). Target emptiness asserted **unconditionally**. P11 asserted **before and after**. Explicit abort list. Second execution after a populated bootstrap **must fail before writing**; second execution on wholly empty source and targets may remain a no-op. **No-branch rule** added. "Relevant `auth.users`" defined as **every row**. | §9.3, §9.4 (P0, P1, P11a, P11b), D9 |
| **C4** | **No fabricated auth creation timestamp** | `user_profiles.created_at` = `auth.users.created_at`, "fall back to the migration transaction timestamp if the source is NULL". | Mapping is **exactly** `user_profiles.created_at = auth.users.created_at`. Fallback removed from the §2.1 mapping table, the §7 lifecycle table, D6, the mechanics, the tests and the decision summary. **P15** added: every `auth.users` row being migrated must have a non-null `created_at`; any NULL aborts. Implementation requirement added: the column must be listed explicitly and never left to its `default now()`. | §2.1, §7, §9.4 (P15), §9.5, §11.1 A.4, §11.2 B.4, D6 |
| **C5** | **Correct local integration testing** | "fail-closed cases, each in its own savepoint with `throws_ok`: a second `\i` …"; and a fallback moving Layer 2's data assertions to staging if `\i` did not resolve. | The `throws_ok`-catches-`\i` claim is **removed with a five-point explanation of why it is impossible**. The staging fallback is **removed**. Two layers required: **A** versioned pgTAP (chain, empty-source no-op, conditional `\ir` replay, mapping/RBAC/audit/legacy-integrity assertions in `BEGIN`/`ROLLBACK`, prefer `\ir` relative to the test file, **no negative cases at all**) and **B** an exact-file harness under `ON_ERROR_STOP` with the seven required negative fixtures, the required positive fixture, mandatory `begin` (because `LOCK TABLE` needs a transaction block), non-zero-exit assertion matched to the specific violation, reconnect-and-verify, static check and fingerprints. §11.3 gives the exact response if `\ir` cannot run in `pg_prove`. | §11 |
| **C6** | **U7 reclassified** | U7 listed among "not blocking" ambiguities with a documented staging fallback. | **Withdrawn as an ambiguity and reclassified as hard local implementation gate G1.** Not a non-blocking ambiguity; not satisfiable by deferring to staging. | §15.1, §15.2 |
| **C7** | **Legacy schema and data integrity** | one clause: "plus a legacy catalogue-fingerprint equality check" in the staging plan; a "checksum over the synthetic legacy rows" locally. | Full §10: catalogue fingerprint **A**; PII-safe server-side data fingerprints **B** over `auth.users` (`id`, `raw_user_meta_data`, `created_at`), `public.tenants` (every column incl. `logo_url`), `public.memberships` (every column), `public.app_config` (every column, ordered by the composite PK `(tenant_id, chave)`); ten normative fingerprint requirements including pinned rendering GUCs and unambiguous NULL handling; §10.4 static zero-INSERT/UPDATE/DELETE requirement over the four legacy relations. Local synthetic verification must fingerprint all four before and after. New postcondition **P16** carries the in-transaction proof. | §10, §9.4 (P16), §11.2 B.7, §12 |
| **C8** | **Future Product/Engine permission boundary** | implicit; only "future narrowing of `manager` is a separate decision". | New normative §6.2: exactly four permissions now; no automatic grant of future permissions; every Product/Shared Engine migration introducing new keys must explicitly decide assignment to `owner`/`manager`; **no wildcard, no implicit inheritance**; "preserves legacy access" bounded to the current core Platform surface; cardinality stays 4+4 per organization; explicit ban on writing the insert as a join against `public.permissions`; extension-tolerance rule for the C test suite. | §6.2, §2.4b, §9.5, §13, D2 |
| **C9** | **Previously discovered factual corrections** | `app_config` ordering unspecified; `auth.users` authority implicitly bundled with the baseline; ownership asymmetry unstated; local-vs-staging capability unstated; no statement about `ACCESS SHARE`. | All five stated normatively: composite PK `(tenant_id, chave)` and an explicit ban on a single "key column"; `auth.users` authority is the Supabase-managed `auth` schema, and the baseline explicitly disclaimed as its DDL authority (with the line-number evidence); `public` legacy and A2 tables owned by `postgres` vs `auth.users` owned by the Auth service; local capability ≠ staging capability; `ACCESS SHARE` never a substitute for the write-blocking lock. | §0.1, §2.5, §9.1, §9.2, §10.2 |
| **C10** | **Metadata and lineage** | Status "Canonical implementation contract v1"; supersedes the C0 draft. | Status **Canonical implementation contract v2**; Step 3.6-C; Date 2026-08-25; supersedes v1 SHA `e07ef899…f002`; draft → v1 → v2 lineage table retained. | header |
| **C11** | **Factual corrections found by adversarial verification** (§15.3) — **not requested**, flagged for approval | v1 asserted: `nome_do_autor()` is "the only legacy display-name authority"; "no application reader was found"; the tenant-status gate was "introduced by 103…"; `tenants_do_utilizador()` spans "4423–4431"; the suspenso savepoint is "released"; every `papel` hit in `src/` is "a form-field role or a paper-contract flow". A v2 draft added: the baseline's "only two mentions of `auth.users`"; "every A2 table is `OWNER TO postgres`". | All eight statements corrected against the authorities, with the v1/v2 error noted inline at each site and catalogued as F1–F6 + V1–V2 in §15.3. **No mapping, decision or precondition changes as a result** — every correction is to evidence, citation or mechanism wording. | §0.1, §2.1, §2.4, §11.1 A.4, §14 D11, §15.3 |
| **C12** | **Remaining structural additions** — recorded so the completeness claim above is literally true | absent from v1 | Four additions that belong to no single correction: (a) §1's new "Coverage of the eleven A2 relations" subsection and its 7 + 3 + 1 = 11 partition table, which makes explicit that no A2 relation's pre-state is ignored; (b) the new non-blocking ambiguity **U9** (§15.2), recording that `auth.users.created_at` nullability is environment-dependent and governs whether negative fixture 7 is constructible; (c) §8's added clause that no fingerprint digest ever enters the audit payload; (d) §14 D7's matching clause. None changes a mapping, a decision or a precondition. | §1, §8, §14 D7, §15.2 |

**Unchanged and re-affirmed in full** — this is the "do not otherwise change"
list of the Step 3.6-C0.2 recovery instruction, item 8, reproduced here so the
guarantee is checkable without that instruction to hand: tenant UUID →
organization UUID preservation; auth user UUID → `user_profiles.user_id`
preservation; generated `organization_memberships` ids; generated role ids;
`dono → owner`; `gestor → manager`; `equipa` abort; `activo → active`;
`suspenso → suspended`; `encerrado` abort; the explicit tenant UUID →
`Europe/Lisbon` mapping; `logo_path` NULL and `logo_url` deferred; `app_config`
deferred to `event_product_settings`; `owner` and `manager` receiving the same
four core permissions; one migration audit event per organization; the PII
exclusions; and the atomic / fail-closed / no-`ON CONFLICT` / no-legacy-DML
behaviour.

---

## 17. v2 → v3 change log

*Historical record of the v2 → v3 step, preserved verbatim in substance. Two
statements it records were corrected in v4 — see §18 and the ⚠ marker on N2.*

Every difference between v2 and v3. **Nothing else changed in that step.** No
source-to-target mapping, no D1–D12 decision, no role permission, no
cardinality and no lifecycle decision is touched by any row below.

| # | Change | v2 | v3 | Where |
|---|---|---|---|---|
| **N1** | **X1 resolved — `public.app_config` joins lock group A** | `app_config` was fingerprinted before and after but appeared in no lock group, so its P16 pair proved only that two computations agreed. v2 stated the gap at P16 and referred it for decision as X1. | Group A is now `public.tenants, public.memberships, public.app_config IN SHARE MODE NOWAIT`. Grounds as approved: it is fingerprinted; without a write-blocking lock the fingerprint could change concurrently; it remains read-only and is not migrated; its ordering stays the composite PK `(tenant_id, chave)`. P16's `Scope limit` paragraph is **deleted** — the gap it described no longer exists. | §9.1 A, §5, §9.4 P16, §13, §15.3 X1 |
| **N2** | **`NOWAIT` on every migration lock** | Groups A–D took plain blocking `LOCK TABLE`. An operational note merely *permitted* a session `lock_timeout` and forbade retry loops. | **All four groups use `NOWAIT`**: A and B in `SHARE MODE NOWAIT`, C in `SHARE ROW EXCLUSIVE MODE NOWAIT`, D in `SHARE MODE NOWAIT`. Five normative properties are stated: fixed A → B → C → D order; before every gate/count/fingerprint/insert; held until the transaction ends; abort with `lock_not_available` (`55P03`) rather than wait; **no automatic retry**. Two consequences are documented: that the migration is **deadlock-free by construction**, and that `NOWAIT` **costs** sensitivity to routine background activity. The G2 probe rehearses group D in `SHARE`. ⚠ **This row records what v3 did, and v3 was wrong on two points**, both corrected in v4 (§18): groups B and D should be `EXCLUSIVE`, not `SHARE`, and the deadlock-free claim was an overclaim. The row is left as written because it is the historical record of v3. | §9.1, §9.2, §9.5 — **superseded by §18** |
| **N3** | **X2 resolved — negative fixture 7 is mandatory** | v2 treated `auth.users.created_at` nullability as an open environment fact and permitted fixture 7 to be recorded "inapplicable", weakening G1 by one fixture. | The canonical Supabase Auth schema declares `created_at timestamptz NULL`, so the fixture **is** constructible. Retained with no weakening: **P15**; the exact-file negative fixture with `auth.users.created_at` explicitly `NULL`; abort **before** inserting `user_profiles`, at the named P15 check; reconnect-and-verify proving **zero partial target writes**. The `auth` schema is never altered to build it. At test-implementation time the harness first inspects `information_schema.columns`: `is_nullable = 'YES'` ⇒ the fixture is mandatory and executes; `is_nullable = 'NO'` (only a future schema version) ⇒ record exact catalogue evidence and test P15 as **structurally enforced**, without weakening P15 or modifying `auth.users`. **No silent skip in either case.** G1 now requires **all seven** negative fixtures. | §11.2 B.4, §15.1 G1, §15.2 U9, §15.3 X2 |
| **N4** | **P16 approved as normative** | P16 was introduced by the drafter beyond the literal correction list and flagged for approval, carrying an `app_config` scope limit. | **P16 is normative.** Compute deterministic in-transaction fingerprints **after the complete lock phase**; **recompute before the transaction ends**; require **exact equality**; cover `auth.users`, `tenants`, `memberships` and `app_config` with the approved §10.2 scopes; emit **no PII and no source values**. The external staging before/after data fingerprints and the legacy catalogue fingerprint are **retained as defence in depth**, as is the §10.4 static check. | §9.4 P16, §10, §12 |
| **N5** | **F1–F6 and V1–V2 approved** | Catalogued in §15.3 and flagged as needing explicit approval. | **Retained as approved.** They correct citations, evidence and test mechanics only, and change no source-to-target mapping, no D1–D12 decision, no role permission, no cardinality and no lifecycle decision. | §15.3 F, §15.3 V |
| **N6** | **Contradiction catalogue closed** | §15.3 carried X1 and X2 as "contradictions requiring a decision (deliberately NOT resolved in v2)". | The X section is retitled "**contradictions raised in v2, RESOLVED in v3**" and both entries are rewritten as resolutions, each recording the contradiction as raised, the approved resolution and its effect. **No catalogue entry is marked unresolved.** | §15.3 |
| **N7** | **Metadata and lineage** | Status "Canonical implementation contract v2"; three-row lineage; supersedes v1. | Status **Canonical implementation contract v3**; Step 3.6-C; Date 2026-08-25; supersedes v2 SHA `e7bb721c…79bf`; four-row **draft → v1 → v2 → v3** lineage retained in full. | header |

### What v3 deliberately did *not* change

Every one of these is carried forward from v2 exactly, and was re-checked
statically before this document was issued:

* every source-to-target mapping in §2 — `auth.users` → `user_profiles`,
  `tenants` → `organizations`, `memberships` → `organization_memberships`,
  `papel` → `roles`/`membership_roles`, and the derived `role_permissions`;
* **D1–D12** in full, including D6 as corrected in v2 (no `created_at`
  fallback) and D11 as re-evidenced in v2;
* the role permission sets — `owner` and `manager` each holding
  `organization.read`, `organization.manage`, `members.manage`, `audit.read`,
  both `is_system = true`, **4 per role and 8 per organization**;
* every cardinality in §13;
* every lifecycle decision in §7, and the audit shape and payload of §8;
* **U7 remains withdrawn as an ambiguity and stands as hard local gate G1**;
* the **staging `auth.users` capability probe remains a hard deployment gate**
  (**G2**), separately authorised, `begin; lock table auth.users in share mode
  nowait; rollback;`, with privilege failure (`42501`) and contention failure
  (`55P03`) both stopping the process, no `GRANT`, no owner/role change, no
  fallback lock mode. ⚠ *The mode shown is the **v3** probe; v4 changed it to
  `exclusive mode nowait` (§18, Q3). The gate itself is unchanged.*;
* **`ACCESS SHARE` remains forbidden** as a substitute for any lock;
* **P0, P1, P11a, P11b, P15** unchanged, and the branch-free gate design of
  §9.3;
* exact-file **positive and negative** integration testing (§11.2), and **no
  staging fallback** for a missing local test (§11.3).

---

## 18. v3 → v4 change log

**v4 changes exactly four things, and nothing else.**

| # | Change | v3 | v4 |
|---|---|---|---|
| **Q1** | **Lock group B: `SHARE` → `EXCLUSIVE`** | `LOCK TABLE public.permissions IN SHARE MODE NOWAIT;` | `LOCK TABLE public.permissions IN EXCLUSIVE MODE NOWAIT;` — `permissions` is a foreign-key parent whose referenced rows pre-exist (seeded by B1), and `SHARE` is compatible with `ROW SHARE` (§9.1). |
| **Q2** | **Lock group D: `SHARE` → `EXCLUSIVE`** | `LOCK TABLE auth.users IN SHARE MODE NOWAIT;` | `LOCK TABLE auth.users IN EXCLUSIVE MODE NOWAIT;` — same reason: `auth.users` is a foreign-key parent whose referenced rows pre-exist. |
| **Q3** | **G2 probe: `SHARE` → `EXCLUSIVE`** | `begin; lock table auth.users in share mode nowait; rollback;` | `begin; lock table auth.users in exclusive mode nowait; rollback;` — the probe must rehearse the **exact final group-D statement**. Same `db push` role, connection and network path; permission failure (`42501`) or contention (`55P03`) still stops deployment; no `GRANT`, no ownership change, no weaker mode, no automatic retry. |
| **Q4** | **The universal deadlock/no-wait claim is narrowed to the guarantee actually provided** | §9.1 asserted that `NOWAIT` made the migration **deadlock-free** and that it **"never waits at all"**. | Replaced by "What the lock phase does and does not guarantee" (§9.1). |

### Why Q1–Q2 were necessary — the defect in v3

v3's reasoning failed on six PostgreSQL facts:

1. **`NOWAIT` governs only the explicit `LOCK TABLE` acquisition.** It does not
   attach to anything else the statement or the transaction later does.
2. **`SHARE` and `SHARE ROW EXCLUSIVE` are both compatible with `ROW SHARE`.**
   Neither excludes a row locker.
3. **`SELECT … FOR UPDATE / FOR NO KEY UPDATE / FOR SHARE / FOR KEY SHARE`
   takes `ROW SHARE` at table level** plus row-level locks on the selected
   rows.
4. **Foreign-key validation on `INSERT` checks the referenced row with
   `SELECT … FOR KEY SHARE`** — a row-level lock request.
5. **Therefore an existing `FOR UPDATE` row lock on `auth.users` or
   `permissions` could be perfectly compatible with v3's table locks** — the
   lock phase would succeed, `NOWAIT` would not fire — **and a later
   foreign-key check would wait on that row.** Row-level waits, and row-level
   deadlocks, remained possible.
   *(Erratum, v5: v4 wrote "an existing row lock", implying any of the four
   `SELECT` locking variants. Only `FOR UPDATE` conflicts with the FK check's
   `FOR KEY SHARE`; `FOR NO KEY UPDATE`, `FOR SHARE` and `FOR KEY SHARE` are
   compatible with it. The defect in v3 was real either way — see §19.)*
6. **PostgreSQL's deadlock detector resolves a deadlock**, by aborting a
   participant. That is recovery, **not** a proof that the migration never
   waits or cannot deadlock. v3 conflated the two.

`EXCLUSIVE` conflicts with `ROW SHARE` while still permitting ordinary
`ACCESS SHARE` readers, so it closes the known FK-parent row-lock path on
exactly the two relations where it was open. Because table-level lock state
cannot reveal which row-lock subtype a `ROW SHARE` holder took, that exclusion
is necessarily broader than the `FOR UPDATE` case it targets — intentionally so
(§9.1, §19). Groups A and C did not need it:
none of `tenants`, `memberships` or `app_config` is a foreign-key parent of
anything inserted here, and every group-C parent has its referenced rows
**created by this transaction** after P1 asserted the relation empty — so no
other transaction can hold a row lock on them (§9.1).

### The corrected guarantee, in full

* the **explicit table-lock phase never waits**;
* its **A → B → C → D acquisition cannot enter a table-lock wait cycle**;
* **`EXCLUSIVE` on `permissions` and `auth.users` closes the known FK-parent
  row-lock path**;
* this is **not a universal proof** concerning every implicit PostgreSQL or
  catalogue lock;
* **any unexpected lock wait, deadlock or `55P03` stops the operation and is
  reported; there is no automatic retry.**

### Not introduced by v4

Deliberately absent, and not to be added without a fresh decision:
`lock_timeout`, `statement_timeout`, retries or back-off of any kind, advisory
locks, and any additional lock group. v4 adds no lock group and removes none.

### Unchanged by v4, without exception

Every source-to-target mapping; **D1–D12**; every precondition and
postcondition **P0–P16** (including P11a/P11b and P15); the fingerprints and
their scopes; the role and permission assignments; every cardinality; every
lifecycle decision; the audit payload; the **seven** negative fixtures;
positive-fixture semantics; the exact-file harness paths; **`app_config` in
lock group A**; **`NOWAIT` on all four explicit groups**; the **no-retry**
policy; the **G1** architecture; and the staging/production boundaries.
**X1 and X2 remain resolved** (§15.3, §17); no contradiction is reopened.

### Historical integrity

§16 (v1 → v2) and §17 (v2 → v3) are preserved as written. v3 genuinely used
`SHARE` for groups B and D and genuinely made the overclaim; §17's N2 row
records that, and carries a ⚠ marker pointing here rather than being rewritten.
History is annotated, never silently corrected.

---

## 19. v4 → v5 factual erratum

**v5 changes explanatory accuracy only. It changes zero runtime behaviour.**

Not one lock mode, gate, precondition, postcondition, mapping, fingerprint,
cardinality, fixture, permission assignment, lifecycle decision or audit
decision differs from v4. A migration written against v4 and a migration
written against v5 would be **the same migration, statement for statement**.
What changes is what the contract *says* about why one of those statements is
what it is.

### The erratum

§9.1 and §18 of v4 explained the group B/D strengthening in a way that implied
**all four** `SELECT` locking variants would hold a row lock capable of
blocking this bootstrap's foreign-key check. That is not so.

| | v4 said (imprecise) | The PostgreSQL fact |
|---|---|---|
| Table level | `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE` all take `ROW SHARE` | **Correct, unchanged.** All four do. |
| Row level | implied that any of the four would block the FK check | **Only `FOR UPDATE` conflicts** with the FK check's `FOR KEY SHARE`. `FOR NO KEY UPDATE`, `FOR SHARE` and `FOR KEY SHARE` are **compatible** with it and block nothing. |
| Why `EXCLUSIVE` then? | implied the broad exclusion was exactly the problem's shape | PostgreSQL's table-level lock state **cannot distinguish which row-lock subtype** produced a `ROW SHARE` holder. No mode excludes `FOR UPDATE` alone. `EXCLUSIVE` therefore excludes **all** `ROW SHARE` holders **conservatively**, to guarantee exclusion of the one problematic case. |
| Operational consequence | not stated | The broader exclusion is **intentional** and **may produce a clean `55P03` for harmless row lockers** that would never have blocked the FK check. The abort precedes every gate, count, fingerprint and insert, so nothing is written. |

### Why the v4 decision still stands

The imprecision was in the *explanation*, not the *conclusion*. The gap v4
identified was real: under v3's `SHARE`, a concurrent `SELECT … FOR UPDATE` on
a referenced `auth.users` or `permissions` row would have been admitted, and
the foreign-key check would then have waited on that row. `EXCLUSIVE` remains
the correct and the only available remedy, because no finer-grained table lock
exists. **Groups A–D and G2 are therefore unchanged.**

### The foreign-key inventory, reworded

The §9.1 table is now described as **the foreign-key checks this bootstrap
performs with non-null values**, rather than as every foreign key declared on
the seven populated relations. Two declared foreign keys —
`organization_memberships.created_by` and `membership_roles.granted_by`, both
→ `public.user_profiles` — are assigned **`NULL`** by the approved mapping
(D6, §7). A `NULL` foreign-key value performs **no referenced-row lookup**, so
neither takes a row lock and neither can contribute a wait. They are now listed
explicitly as declared-but-never-checked.

**Neither mapping changes.** Both remain `NULL`, for the non-fabrication reason
D6 gives: `memberships` carries no actor column, and attribution is never
invented. v5 only makes the contract say out loud why those two columns are
irrelevant to the lock analysis.

### Scope of v5

| Changed | Unchanged |
|---|---|
| header, status, lineage (→ v5) | the four lock groups — A `SHARE`, B `EXCLUSIVE`, C `SHARE ROW EXCLUSIVE`, D `EXCLUSIVE`, all `NOWAIT` |
| §9.1 — the row-lock explanation, the mode-table cell, the `NOWAIT`-cost paragraph, the FK inventory wording | G2 — `begin; lock table auth.users in exclusive mode nowait; rollback;` |
| §18 — facts 3 and 5, and the closing paragraph, annotated with the erratum | every mapping; **D1–D12**; **P0–P16**; fingerprints and scopes; cardinalities; the seven negative fixtures and the positive fixture; permission assignments; lifecycle and audit decisions; G1; §15.3's F/V/X catalogue; §16 and §17 |
| this section (§19) | the staging/production boundaries |

### Historical integrity

§16, §17 and §18 remain as written. §18's fact 5 carries an inline *(Erratum,
v5)* note rather than being silently reworded, so the record of what v4 said —
and why it was imprecise — survives. History is annotated, never rewritten.

---

## 20. v5 → v6 execution-model correction

**v6 changes the execution model and nothing else.** Every mapping, decision,
gate, cardinality, fingerprint, lock and fixture of v5 is preserved verbatim.

### The premise v5 got wrong

v5 §9.1 asserted, as a fact about the tooling:

> "The bootstrap is a single migration file, executed by `supabase db push`
> inside one transaction… the surrounding transaction is supplied by the CLI."

**That is false for Supabase CLI 2.115.0.** It was disproved by local execution
against the local database, through both real apply paths:

| Command | Result |
|---|---|
| `supabase db reset --local --no-seed` | exit 1 — `LOCK TABLE can only be used in transaction blocks (SQLSTATE 25P01)`, at statement 0 (`LegacyMigrationApplyError`) |
| `supabase db push --local` | exit 1 — the identical error (`LegacyDbPushApplyError`) |

What those two runs prove, stated at exactly their real size: **in both
observed Supabase CLI 2.115.0 local apply paths, statement 0 did not execute
inside an enclosing transaction block.** SQLSTATE `25P01` —
*"LOCK TABLE can only be used in transaction blocks"* — is conclusive for those
paths, because that error is raised precisely when `IsTransactionBlock()` is
false. The failure was reproduced independently: the same `LOCK TABLE` fails
standalone and succeeds verbatim inside `begin; … rollback;`.

This contract makes **no** claim beyond that observation. It does not assert
how the CLI batches statements, which wire protocol it uses, whether it ever
emits a `BEGIN`, or how any other CLI version or apply path behaves. **It
deliberately does not depend on undocumented batching, parser or protocol
behaviour**, because a contract that rested on such internals would silently
rot the first time they changed.

v5 was therefore self-contradictory in practice: it **required** a lock phase
and simultaneously **forbade** the migration from opening a transaction, while
the CLI supplied none.

### The correction

Atomicity now comes from **PostgreSQL**, not from the CLI. The migration file is
**one top-level `DO` statement**, and PostgreSQL runs a single statement inside
its own implicit transaction. The full normative model is §9.1 rules 1–10.

| | v5 | v6 |
|---|---|---|
| File structure | many top-level statements: 4 `LOCK`, 5 `SET LOCAL`, 1 `SELECT set_config`, 19 `DO` gate blocks, 7 `INSERT` | **one** top-level `DO $sollelio_bootstrap$ … $sollelio_bootstrap$;` containing all of it |
| Source of atomicity | claimed to be a CLI-supplied transaction | PostgreSQL's implicit **statement** transaction |
| `SET LOCAL` | five top-level statements | `PERFORM pg_catalog.set_config(…, true)` inside the `DO` |
| `SELECT set_config(…)` | top-level `SELECT` | `PERFORM pg_catalog.set_config(…)` |
| Gate blocks | 19 separate top-level `DO` blocks | 19 **nested** PL/pgSQL blocks inside the one outer `DO`, keeping their locally scoped declarations and their exact named gate errors |
| Lock lifetime | "held to the end of the transaction" | held to the end of **the statement**, which is the same transaction |
| Migration history | implicitly assumed atomic with the body | **explicitly not assumed**; verified separately after every apply (§9.1 rules 8–9) |

### What did NOT change

All mappings (§2); **D1–D12**; **P0–P16** including P11a/P11b and their exact
named errors; every cardinality (§13); all seven target `INSERT`s; all four
fingerprints and their scopes (§10.2); the four lock groups, their modes, their
`NOWAIT` and the **A → B → C → D** order; **G2** and its probe; the seven
negative fixtures and the positive fixture; the no-legacy-write guarantee; and
every role, permission, lifecycle and audit decision.

### Prohibitions retained and added

No `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `START TRANSACTION` or top-level SQL
`BEGIN`. No dynamic SQL, no `EXECUTE`, no `ON CONFLICT`, no `IF NOT EXISTS`, no
temporary tables, no advisory locks, no `ACCESS SHARE`, no retry.

**PL/pgSQL `BEGIN … END` inside the `DO` body is a procedural block delimiter,
not transaction control** (§9.1 rule 6). A static check that greps for `BEGIN`
without distinguishing the two forms will produce a false positive on every
nested gate block; the discriminator is the terminating semicolon of a SQL
`BEGIN;`.

### Historical integrity

§16, §17, §18 and §19 are preserved as written. v5 genuinely asserted the
CLI-supplied-transaction premise; this section records that it was false and
how it was disproved, rather than editing the earlier text.

---

*End of canonical implementation contract v6. No unresolved contradiction
remains, and no claim in this document asserts more than it can support.*

*Implementation status at the freezing of this contract: the Step 3.6-C
migration and its two-layer verification suite **have been implemented**, and
the local gate **G1 was executed successfully against the local database** —
both CLI apply paths, the lint, the A2 and B suites, the Layer A suite, the
exact-file harness with all seven negative fixtures and the positive fixture,
and the relocated replay. **Staging and production were not contacted.** The
**G2** capability probe of §9.2 **was not executed** and remains deferred to a
separately authorised deployment step. **No commit and no push** occurred while
freezing this contract; the work is uncommitted.*
