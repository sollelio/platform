#!/usr/bin/env bash
# =============================================================================
# Step 3.6-C · Layer B — exact-file integration harness
#
# Contract: docs/architecture/contracts/sollelio-v2-step-3.6-c-bootstrap-contract-v6.md
# (SHA256 83c988cf465aac6b302b2d17f0d1ab44e6e7daa0e4bff5f1938b1b8977e52d01), §11.2.
#
# Executes the EXACT versioned migration file through psql with ON_ERROR_STOP=1,
# driven by FILES on disk (never a heredoc on stdin: \ir resolves relative to
# the script file containing it, and on stdin it silently degenerates to \i
# against the process CWD).
#
# For every negative fixture:
#   1. begin a disposable transaction/session
#   2. seed the invalid synthetic legacy state
#   3. execute the exact migration file
#   4. require a non-zero exit AND the NAMED gate — not merely any failure, and
#      never 55P03 / deadlock / timeout as a substitute
#   5. let the failed transaction roll back (the session dies)
#   6. reconnect
#   7. prove zero surviving writes and unchanged fingerprints
#
# Local only. Connects to 127.0.0.1:54322, the Supabase local database.
# Synthetic values only: no PII is seeded, logged or reported.
# =============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${SOLLELIO_LOCAL_DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
MIGRATION="$HERE/../../../migrations/20260825103955_v2_legacy_organization_rbac_bootstrap.sql"
LOG_DIR="${SOLLELIO_LOG_DIR:-$HERE/.out}"
mkdir -p "$LOG_DIR"

PASS=0; FAIL=0
ok()   { printf '  ok   %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  FAIL %s\n' "$*"; FAIL=$((FAIL+1)); }
note() { printf '       %s\n' "$*"; }

psql_run() { psql "$DB" -v ON_ERROR_STOP=1 -X -q "$@" 2>&1; }

fingerprint() { psql "$DB" -X -q -tA -f "$HERE/assertions/fingerprint.sql" 2>&1; }

echo "== Step 3.6-C Layer B — exact-file integration harness =="
echo "migration: $(basename "$MIGRATION")"
echo

# -----------------------------------------------------------------------------
# 0 · preflight
# -----------------------------------------------------------------------------
if [ ! -f "$MIGRATION" ]; then
  echo "FATAL: migration file not found at $MIGRATION"; exit 2
fi
if ! psql "$DB" -X -q -tA -c 'select 1' >/dev/null 2>&1; then
  echo "FATAL: cannot reach the local database at 127.0.0.1:54322"; exit 2
fi

# -----------------------------------------------------------------------------
# 1 · §10.4 static no-legacy-DML check, against the exact file
# -----------------------------------------------------------------------------
echo "-- §10.4 static no-legacy-DML check --"
"$HERE/static_check.sh" "$MIGRATION" > "$LOG_DIR/static-check.log" 2>&1
if [ $? -eq 0 ]; then ok "static check: no DML/DDL targets any legacy relation, no dynamic SQL"
else bad "static check failed"; cat "$LOG_DIR/static-check.log"; fi
echo

# -----------------------------------------------------------------------------
# 2 · auth.users.created_at nullability (contract §11.2 B.4, U9)
# -----------------------------------------------------------------------------
echo "-- auth.users.created_at nullability --"
NULLABLE="$(psql "$DB" -X -q -tA -c \
  "select is_nullable from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'" 2>&1)"
NULLABLE="$(echo "$NULLABLE" | tr -d '[:space:]')"
psql "$DB" -X -q -c \
  "select table_schema, table_name, column_name, data_type, is_nullable
     from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='created_at'" \
  > "$LOG_DIR/auth-users-created-at-nullability.log" 2>&1
note "information_schema.columns.is_nullable = ${NULLABLE:-<unknown>}"
if [ "$NULLABLE" = "YES" ]; then
  ok "auth.users.created_at is nullable — negative fixture 7 is MANDATORY and will execute"
  RUN_F7=1
else
  bad "auth.users.created_at reports is_nullable=${NULLABLE:-<unknown>}; catalogue evidence recorded in $LOG_DIR/auth-users-created-at-nullability.log. P15 is NOT weakened and the auth schema is NOT modified. See contract §11.2 B.4."
  RUN_F7=0
fi
echo

# -----------------------------------------------------------------------------
# 3 · baseline fingerprint, before any fixture
# -----------------------------------------------------------------------------
FP_BASE="$(fingerprint)"
printf '%s\n' "$FP_BASE" > "$LOG_DIR/fingerprint-baseline.txt"
echo "-- baseline legacy fingerprints (identifier=count:digest) --"
printf '%s\n' "$FP_BASE" | sed 's/^/       /'
echo

# -----------------------------------------------------------------------------
# 4 · negative cases
#     run_negative <case-file-stem> <expected gate name>
# -----------------------------------------------------------------------------
run_negative() {
  local case="$1" gate="$2"
  local log="$LOG_DIR/case-$case.log" out rc
  out="$(psql_run -f "$HERE/cases/$case.sql")"; rc=$?
  printf '%s\n' "$out" > "$log"
  printf 'exit=%s\n' "$rc" >> "$log"

  echo "-- negative case $case (expects gate $gate) --"

  if [ "$rc" -eq 0 ]; then
    bad "$case: exit 0 — the gate did not close"; echo; return
  fi

  # the named gate, not merely any failure
  if ! printf '%s' "$out" | grep -qF "gate $gate failed"; then
    bad "$case: exited $rc but did not raise the named gate '$gate'"
    note "$(printf '%s' "$out" | grep -iE '^(psql:|ERROR|FATAL)' | head -3)"
    echo; return
  fi

  # a lock, deadlock or timeout is NEVER an acceptable substitute
  if printf '%s' "$out" | grep -qiE '55P03|lock_not_available|deadlock detected|40P01|canceling statement due to (statement|lock) timeout'; then
    bad "$case: aborted on a lock/deadlock/timeout rather than on gate $gate — environment problem, not a passing test"
    echo; return
  fi

  ok "$case: exit $rc, aborted at the named gate $gate"

  # reconnect and prove zero surviving writes
  local vout vrc
  vout="$(psql_run -f "$HERE/assertions/targets_empty.sql")"; vrc=$?
  printf '%s\n' "$vout" >> "$log"
  if [ "$vrc" -eq 0 ]; then ok "$case: reconnect proves zero surviving writes"
  else bad "$case: writes survived the rolled-back transaction"; note "$vout"; fi

  # fingerprints unchanged
  local fp; fp="$(fingerprint)"
  if [ "$fp" = "$FP_BASE" ]; then ok "$case: all four legacy fingerprints unchanged"
  else bad "$case: a legacy fingerprint changed"; fi
  echo
}

run_negative 01_second_execution   P1
run_negative 02_papel_equipa       P3
run_negative 03_estado_encerrado   P2
run_negative 04_unmapped_tenant    P13
run_negative 05_tenant_without_dono P12
run_negative 06_partial_source     P0
if [ "$RUN_F7" -eq 1 ]; then
  run_negative 07_created_at_null   P15
else
  echo "-- negative case 07_created_at_null --"
  bad "07_created_at_null: NOT executed — auth.users.created_at is not nullable in this environment. No silent skip: catalogue evidence is recorded."
  echo
fi

# -----------------------------------------------------------------------------
# 5 · positive case
# -----------------------------------------------------------------------------
echo "-- positive case 10_valid --"
POUT="$(psql_run -f "$HERE/cases/10_valid.sql")"; PRC=$?
printf '%s\nexit=%s\n' "$POUT" "$PRC" > "$LOG_DIR/case-10_valid.log"
if [ "$PRC" -eq 0 ]; then ok "10_valid: the exact migration succeeded on a valid synthetic source"
else bad "10_valid: exited $PRC"; note "$(printf '%s' "$POUT" | grep -iE '^(psql:|ERROR)' | head -5)"; fi
if printf '%s' "$POUT" | grep -qF 'positive expectations all passed'; then
  ok "10_valid: every contracted mapping and cardinality asserted"
else bad "10_valid: the expectations block did not report success"; fi

VOUT="$(psql_run -f "$HERE/assertions/targets_empty.sql")"; VRC=$?
printf '%s\n' "$VOUT" >> "$LOG_DIR/case-10_valid.log"
if [ "$VRC" -eq 0 ]; then ok "10_valid: the final ROLLBACK was real — every target is empty again"
else bad "10_valid: the positive case left rows behind"; note "$VOUT"; fi

FP_END="$(fingerprint)"
printf '%s\n' "$FP_END" > "$LOG_DIR/fingerprint-final.txt"
if [ "$FP_END" = "$FP_BASE" ]; then ok "10_valid: all four legacy fingerprints unchanged"
else bad "10_valid: a legacy fingerprint changed"; fi
echo

# -----------------------------------------------------------------------------
# 6 · relocated Layer A.3/A.4 synthetic replay (contract §11.3)
#
# pg_prove runs inside a container that does not mount supabase/migrations, so
# \ir cannot reach the exact migration file from a pgTAP test. Contract §11.3
# requires A.3/A.4's mapping, RBAC, audit and legacy-integrity assertions to
# move into the exact-file harness, which runs on the host where both files are
# visible. The limitation is reported, not worked around.
# -----------------------------------------------------------------------------
echo "-- relocated synthetic replay (Layer A.3/A.4 under §11.3) --"
ROUT="$(psql "$DB" -X -q -tA -f "$HERE/replay/002_synthetic_replay.sql" 2>&1)"; RRC=$?
printf '%s\nexit=%s\n' "$ROUT" "$RRC" > "$LOG_DIR/replay-002.log"
NOTOK="$(printf '%s' "$ROUT" | grep -c '^not ok' || true)"
TAPOK="$(printf '%s' "$ROUT" | grep -c '^ok ' || true)"
if [ "$RRC" -eq 0 ] && [ "$NOTOK" -eq 0 ] && [ "$TAPOK" -gt 0 ]; then
  ok "replay: $TAPOK pgTAP assertions passed, 0 failed"
else
  bad "replay: exit $RRC, $TAPOK passed, $NOTOK failed"
  note "$(printf '%s' "$ROUT" | grep -E '^not ok|^psql:.*(ERROR|error)' | head -5)"
fi
RFP="$(fingerprint)"
if [ "$RFP" = "$FP_BASE" ]; then ok "replay: all four legacy fingerprints unchanged"
else bad "replay: a legacy fingerprint changed"; fi
echo

# -----------------------------------------------------------------------------
echo "== Layer B: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
