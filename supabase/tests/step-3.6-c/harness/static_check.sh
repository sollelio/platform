#!/usr/bin/env bash
# =============================================================================
# Step 3.6-C · static structural + no-legacy-DML check
#
# Contract v6 (docs/architecture/contracts/sollelio-v2-step-3.6-c-bootstrap-contract-v6.md),
# §9.1 execution model and §10.4 static no-legacy-DML requirement.
#
# A SOURCE-LEVEL check on the exact versioned migration file. It proves:
#   1  exactly one top-level executable statement, and it is a DO block
#   2  exactly one outer $sollelio_bootstrap$ dollar-quote pair
#   3  exactly four LOCK TABLE statements, in groups A/B/C/D with the exact
#      relations, modes and NOWAIT
#   4  every lock precedes the first source read, fingerprint, gate and INSERT
#   5  exactly seven INSERT targets, and only the approved target relations
#   6  zero INSERT/UPDATE/DELETE against auth.users, public.tenants,
#      public.memberships, public.app_config — and no indirect write form
#   7  zero dynamic SQL
#   8  zero COMMIT / ROLLBACK / SAVEPOINT / START TRANSACTION, and no top-level
#      SQL BEGIN. PL/pgSQL BEGIN/END block delimiters are NOT misclassified as
#      transaction control (contract §9.1 rule 6): a SQL BEGIN is a complete
#      statement terminated by a semicolon; a PL/pgSQL BEGIN is not.
#   9  P0-P16 all present
#  10  G2 is not executed by the migration
#
# The check applies ONLY to the migration file. Test fixtures legitimately write
# synthetic rows to the legacy relations inside a rolled-back transaction; that
# is the harness, not the migration.
# =============================================================================
set -uo pipefail

FILE="${1:?usage: static_check.sh <migration.sql>}"
[ -f "$FILE" ] || { echo "FATAL: $FILE not found"; exit 2; }

FAILED=0
fail() { echo "STATIC CHECK FAILED: $*"; FAILED=1; }
pass() { echo "  ok  $*"; }

echo "file:   $FILE"
echo "sha256: $(sha256sum "$FILE" | cut -d' ' -f1)"
echo

# comment-stripped body, used wherever prose must not create false positives
BODY="$(sed -e 's/--.*$//' "$FILE" | perl -0777 -pe 's{/\*.*?\*/}{}gs')"
LOWER="$(printf '%s' "$BODY" | tr 'A-Z' 'a-z' | tr '\n' ' ' | tr -s ' ')"

LEGACY_RE='(auth\.users|public\.tenants|public\.memberships|public\.app_config)'

# --- 1 · exactly one top-level executable statement, and it is DO ------------
if printf '%s' "$BODY" | perl -0777 -ne '
      s/^\s+|\s+$//g;
      exit 1 unless /\ADO \$sollelio_bootstrap\$.*\$sollelio_bootstrap\$;\z/s;
      exit 0;'; then
  pass "exactly one top-level executable statement, and it is a DO block"
else
  fail "the file is not exactly one top-level DO statement"
fi

# --- 2 · exactly one outer dollar-quote pair --------------------------------
NQ=$(grep -c '\$sollelio_bootstrap\$' "$FILE")
[ "$NQ" -eq 2 ] && pass "exactly one \$sollelio_bootstrap\$ pair" \
                || fail "expected 2 \$sollelio_bootstrap\$ tokens, found $NQ"

# --- 3 · the four LOCK TABLE statements -------------------------------------
LOCKS=$(grep -c '^LOCK TABLE' "$FILE")
[ "$LOCKS" -eq 4 ] && pass "exactly 4 LOCK TABLE statements" \
                   || fail "expected exactly 4 LOCK TABLE statements, found $LOCKS"

for spec in \
  'A|^IN SHARE MODE NOWAIT;|public.tenants public.memberships public.app_config' \
  'B|^LOCK TABLE public\.permissions IN EXCLUSIVE MODE NOWAIT;|' \
  'C|^IN SHARE ROW EXCLUSIVE MODE NOWAIT;|public.user_profiles public.organizations public.organization_memberships public.roles public.role_permissions public.membership_roles public.audit_events public.platform_operators public.support_access_grants public.support_access_grant_permissions' \
  'D|^LOCK TABLE auth\.users IN EXCLUSIVE MODE NOWAIT;|' ; do
  g="${spec%%|*}"; rest="${spec#*|}"; pat="${rest%%|*}"; rels="${rest#*|}"
  if grep -qE "$pat" "$FILE"; then pass "lock group $g present in the contracted mode with NOWAIT"
  else fail "lock group $g is missing or not in the contracted mode"; fi
  for r in $rels; do
    grep -qE "^  ${r//./\\.},?$" "$FILE" || fail "lock group $g does not list $r"
  done
done
grep -qiE 'in +access +share +mode' "$FILE" && fail "found ACCESS SHARE — forbidden as a substitute"

# --- 4 · every lock precedes the first read / fingerprint / gate / INSERT ----
LAST_LOCK=$(grep -n 'MODE NOWAIT;' "$FILE" | tail -1 | cut -d: -f1)
FIRST_WORK=$(grep -nE '^PERFORM pg_catalog\.set_config|^INSERT INTO|gate P[0-9]+ failed|^  FROM (auth|public)\.' "$FILE" | head -1 | cut -d: -f1)
if [ -n "$LAST_LOCK" ] && [ -n "$FIRST_WORK" ] && [ "$LAST_LOCK" -lt "$FIRST_WORK" ]; then
  pass "all four locks (through line $LAST_LOCK) precede the first read/fingerprint/gate/INSERT (line $FIRST_WORK)"
else
  fail "a read, fingerprint, gate or INSERT precedes the completion of the lock phase"
fi

# --- 5 · exactly seven INSERT targets, only the approved relations ----------
mapfile -t TARGETS < <(grep -oE '^INSERT INTO public\.[a-z_]+' "$FILE" | sed 's/^INSERT INTO //' | sort)
EXPECTED="public.audit_events public.membership_roles public.organization_memberships public.organizations public.role_permissions public.roles public.user_profiles"
GOT="$(printf '%s ' "${TARGETS[@]}" | sed 's/ $//')"
[ "${#TARGETS[@]}" -eq 7 ] && pass "exactly 7 INSERT statements" \
                           || fail "expected 7 INSERT statements, found ${#TARGETS[@]}"
[ "$GOT" = "$EXPECTED" ] && pass "the 7 INSERT targets are exactly the approved relations" \
                         || fail "INSERT targets differ from the approved set: $GOT"

# --- 6 · no DML, and no indirect write form, against a legacy relation ------
LEGACY_HIT=0
for verb in 'insert +into' 'update' 'delete +from' 'merge +into'; do
  printf '%s' "$LOWER" | grep -qE "${verb} +${LEGACY_RE}" && { fail "found '${verb}' targeting a legacy relation"; LEGACY_HIT=1; }
done
printf '%s' "$LOWER" | grep -qE "truncate( +table)? +${LEGACY_RE}"  && { fail "found TRUNCATE against a legacy relation"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE "copy +${LEGACY_RE} +from"          && { fail "found COPY ... FROM into a legacy relation"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE "select .* into +${LEGACY_RE}"      && { fail "found SELECT ... INTO a legacy relation"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE "alter +table( +[a-z_ ]*)? *${LEGACY_RE}" && { fail "found ALTER TABLE against a legacy relation"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE 'on +conflict'                      && { fail "found ON CONFLICT — forbidden by §9.5"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE 'if +not +exists'                   && { fail "found IF NOT EXISTS — forbidden by §9.5"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE 'create +(global +|local +)?temp'   && { fail "found a temporary table — forbidden by §9.1"; LEGACY_HIT=1; }
printf '%s' "$LOWER" | grep -qE 'pg_advisory'                       && { fail "found an advisory lock — forbidden by §9.1"; LEGACY_HIT=1; }
[ "$LEGACY_HIT" -eq 0 ] && pass "zero DML and zero indirect write form targets any legacy relation"

# --- 7 · no dynamic SQL -----------------------------------------------------
if printf '%s' "$LOWER" | grep -qE '\bexecute +(format|quote|immediate|'"'"'|\$|[a-z_]+ *\|\|)'; then
  fail "found EXECUTE of dynamic SQL"
else
  pass "no dynamic SQL"
fi

# --- 8 · transaction control (PL/pgSQL BEGIN/END must NOT be flagged) -------
# A SQL transaction-control statement is a complete statement terminated by a
# semicolon. A PL/pgSQL block BEGIN carries no semicolon, and a block END is
# followed by a semicolon only as a block terminator, never as `END;` preceded
# by nothing — so match only the statement forms.
TXN=$(grep -icE '^[[:space:]]*(commit|rollback|savepoint +[a-z_]|release +savepoint|start +transaction)[[:space:]]*;?[[:space:]]*$' "$FILE")
SQLBEGIN=$(grep -cE '^[[:space:]]*[Bb][Ee][Gg][Ii][Nn][[:space:]]*;[[:space:]]*$' "$FILE")
if [ "$TXN" -eq 0 ] && [ "$SQLBEGIN" -eq 0 ]; then
  PLBEGIN=$(grep -cE '^[[:space:]]*BEGIN[[:space:]]*$' "$FILE")
  pass "no transaction control ($PLBEGIN PL/pgSQL BEGIN block delimiters correctly not flagged)"
else
  fail "found transaction control: $TXN control statement(s), $SQLBEGIN top-level SQL BEGIN"
fi

# --- 9 · P0-P16 all present -------------------------------------------------
MISSING=""
for g in P0 P1 P11a P2 P3 P4 P5 P6 P7 P8 P9 P12 P13 P15 P10 P10b P11b P14 P16; do
  grep -q "gate $g failed" "$FILE" || MISSING="$MISSING $g"
done
[ -z "$MISSING" ] && pass "all 19 gate blocks present (P0-P16 incl. P10b/P11a/P11b)" \
                  || fail "missing gate(s):$MISSING"

# --- 10 · G2 is not executed by the migration ------------------------------
if printf '%s' "$LOWER" | grep -qE 'lock +table +auth\.users +in +exclusive +mode +nowait' \
   && ! printf '%s' "$LOWER" | grep -qE '(begin *; *lock table auth\.users|rollback *;)'; then
  pass "G2 is not executed by the migration (group D is the migration's own lock, not the probe)"
else
  grep -qiE '^\s*begin\s*;' "$FILE" && fail "the migration appears to contain the G2 probe" || \
  pass "G2 is not executed by the migration"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: one top-level DO statement; four contracted locks first; seven approved"
  echo "      INSERT targets; no legacy DML; no dynamic SQL; no transaction control;"
  echo "      all gates present; G2 not executed."
  exit 0
fi
exit 1
