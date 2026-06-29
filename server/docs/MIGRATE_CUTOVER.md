# Cutover: `db push` → `migrate deploy`

The server currently deploys with `prisma db push --accept-data-loss`. That
auto-applies any schema change — including destructive ones — without
review. This document is the safe path to switching to `prisma migrate deploy`
on Railway.

The migrations under `prisma/migrations/` are all consistent with
`schema.prisma`. They've never been "applied" through the Prisma migration
system on prod, though, because `db push` doesn't write to the
`_prisma_migrations` bookkeeping table. The cutover is therefore:

1. Baseline prod (one-time).
2. Flip the Railway start command.
3. Verify the next deploy applies cleanly.

---

## 1. Baseline production

This step tells Prisma "every migration currently in the repo has already
been applied to this database." It's safe — we're declaring reality, not
changing it.

From the Railway shell (`railway run bash` or the in-dashboard shell):

```bash
cd server
npm run db:baseline
```

This runs `prisma migrate resolve --applied <name>` for every migration in
`prisma/migrations/`. It's idempotent — re-running is a no-op.

Verify with:

```bash
npx prisma migrate status
```

You should see `Database schema is up to date!` and no pending migrations.

---

## 2. Flip the Railway start command

In `package.json`, change the production `start` script:

```diff
- "start": "prisma db push --skip-generate --accept-data-loss && node dist/index.js",
+ "start": "prisma migrate deploy && node dist/index.js",
```

(Or set Railway's "Start Command" in the dashboard to
`npm run start:migrate`, which already exists in `package.json`.)

Commit and push. Railway will redeploy. On startup, `migrate deploy` should
find no pending migrations and pass through to `node dist/index.js`.

---

## 3. From here on

When you change `schema.prisma`:

```bash
cd server
npm run db:migrate -- --name describe_the_change
```

This creates `prisma/migrations/<timestamp>_describe_the_change/migration.sql`,
applies it locally, and updates the client. Commit the migration directory
alongside the schema change. On next prod deploy, `migrate deploy` picks it up.

Don't use `db push` in production anymore. It's still fine for fast local
iteration (`npm run db:push`), but anything that lands in `main` should have
a migration file.
