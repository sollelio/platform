-- Step 3.6-C · Layer B driver — POSITIVE case
-- One valid synthetic execution of the exact migration must succeed, produce
-- every contracted mapping and cardinality, and be rolled back afterwards.
begin;
\ir ../fixtures/valid.sql
\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql
\ir ../assertions/valid_expectations.sql
rollback;
