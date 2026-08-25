-- Step 3.6-C · Layer B driver — negative case 04_unmapped_tenant
-- The explicit BEGIN is mandatory, not stylistic: the migration issues
-- LOCK TABLE, which is an error outside a transaction block. Without it the run
-- would fail on the lock statement rather than on the gate under test.
-- The trailing ROLLBACK is never reached: under ON_ERROR_STOP=1 the gate's
-- exception ends psql and the server rolls the open transaction back.
begin;
\ir ../fixtures/04_unmapped_tenant.sql
\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql
rollback;
