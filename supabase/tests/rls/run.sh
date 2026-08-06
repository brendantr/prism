#!/usr/bin/env bash
#
# Re-runnable RLS isolation test: applies both migrations plus the auth
# emulation and assertion suite in supabase/tests/rls/ against a Postgres
# instance, then reports pass/fail.
#
# Requires a running, empty (or disposable) Postgres database reachable via
# standard libpq environment variables (PGHOST, PGPORT, PGUSER, PGDATABASE,
# etc.) or a single PSQL_URI. Does not start Postgres itself -- CI or a local
# developer is expected to provide one (a `postgres:` service container in
# GitHub Actions, `supabase start`, or any other disposable instance).
#
# USAGE
#   PSQL_URI=postgresql://postgres@localhost:5432/prism_rls_test \
#     supabase/tests/rls/run.sh
#
#   # or via discrete PG* env vars (PGHOST/PGPORT/PGUSER/PGDATABASE/...):
#   PGHOST=localhost PGPORT=55432 PGUSER=postgres PGDATABASE=prism_rls_test \
#     supabase/tests/rls/run.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_DIR="$ROOT/supabase/tests/rls"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

TARGET="${PSQL_URI:-}"

run_sql() {
  echo "--- running: $1 ---"
  if [[ -n "$TARGET" ]]; then
    psql "$TARGET" -v ON_ERROR_STOP=1 -f "$1"
  else
    psql -v ON_ERROR_STOP=1 -f "$1"
  fi
}

run_sql "$TEST_DIR/00_setup_auth_emulation.sql"
run_sql "$MIGRATIONS_DIR/0001_init.sql"
run_sql "$MIGRATIONS_DIR/0002_security_hardening.sql"
run_sql "$MIGRATIONS_DIR/0003_workout_write_integrity.sql"
run_sql "$MIGRATIONS_DIR/0004_partial_check_ins.sql"
run_sql "$TEST_DIR/01_seed_test_data.sql"
run_sql "$TEST_DIR/02_run_isolation_tests.sql"
run_sql "$TEST_DIR/03_run_write_integrity_tests.sql"
run_sql "$TEST_DIR/04_run_check_in_tests.sql"

echo "=== RLS isolation + write-integrity + check-in suites passed ==="
