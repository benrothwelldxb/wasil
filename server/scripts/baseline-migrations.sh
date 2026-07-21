#!/usr/bin/env bash
#
# One-time baseline for a database that was built with `db push` (so its schema
# already matches prisma/schema.prisma but Prisma has no migration record).
#
# The migration history has been squashed to a single `00000000000000_init`
# baseline generated from the schema, so `migrate deploy` now builds a fresh
# database from scratch (CI, new environments). For an EXISTING db-push database
# you don't want to re-run that DDL — this script marks the baseline as already
# applied so future `migrate deploy` runs are clean no-ops until the next new
# migration.
#
# If this database previously recorded the OLD (pre-squash) migrations, first
# clear the record so only the baseline remains:
#   psql "$DATABASE_URL" -c 'DELETE FROM "_prisma_migrations";'
# (On a disposable dev database, `npx prisma migrate reset` is simpler.)
#
# Usage (from the Railway shell, with DATABASE_URL set):
#   bash server/scripts/baseline-migrations.sh
#
# Idempotent: re-running is safe; `prisma migrate resolve --applied` is a
# no-op for migrations already recorded as applied.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

echo "Baselining migrations against $(echo "$DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:***@#')"
echo

for migration_dir in prisma/migrations/*/; do
  name="$(basename "$migration_dir")"
  if [ "$name" = "migration_lock.toml" ]; then continue; fi
  echo "→ resolving $name"
  npx prisma migrate resolve --applied "$name"
done

echo
echo "Baseline complete. Switch the start script to use migrate deploy:"
echo "  start: prisma migrate deploy && node dist/index.js"
