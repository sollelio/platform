-- Step 3.6-C · Layer B driver — negative case 01_second_execution
-- Seeds a valid source, runs the exact migration once (succeeds), then runs it
-- a second time in the SAME transaction. The second pass re-requests locks this
-- transaction already holds, which never conflict with themselves, so NOWAIT
-- does not fire and execution reaches P1 — where it must abort, before writing.
begin;
\ir ../fixtures/valid.sql
\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql
\ir ../../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql
rollback;
