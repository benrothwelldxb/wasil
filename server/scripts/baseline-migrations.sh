#!/usr/bin/env bash
#
# One-time prod baseline: mark every existing migration as already-applied.
# Run this on production ONCE before cutting over the start script to
# `prisma migrate deploy`. After baselining, Prisma's `_prisma_migrations`
# table believes every migration in prisma/migrations is up-to-date with the
# current DB state — which is true, because `db push` has kept them in sync.
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
