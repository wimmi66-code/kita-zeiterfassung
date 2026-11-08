#!/usr/bin/env bash
# Spielt Stub, Migrationen und Tests in eine frische lokale PostgreSQL-Datenbank ein.
# Aufruf: PGHOST=… PGPORT=… ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=kita_test_$$
createdb "$DB"
trap 'dropdb "$DB"' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/10_rls_test.sql
