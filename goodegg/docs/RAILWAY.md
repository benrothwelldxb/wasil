# Deploying to Railway (self-hosted, no Supabase)

Be a Good Egg runs happily on [Railway](https://railway.app) as **one service plus
a Postgres database**. The service builds the React SPA and runs the Hono API
(`/server`) that both serves the SPA and exposes the JSON API — so the frontend
and API share an origin and the session cookie "just works".

```
                    ┌──────────────────────────────────────────┐
   browser  ──────▶ │  Railway service (Node)                  │
   (PWA)            │   • serves the built SPA (dist/)          │
                    │   • Hono API under /api                   │──▶ Postgres
                    │   • 6-digit email-code auth (JWT cookie)  │    (Railway plugin)
                    │   • runs the draw with computeDraw        │
                    └──────────────────────────────────────────┘
```

Everything the Supabase path did with RLS is enforced here in the API layer
(`server/repo.ts`): `assignments` is never returned to a client, "my buddy" is
resolved server-side from your own assignment, received questions omit the
asker, and the draw is organiser-only, idempotent and transactional.

---

## 1. Push the repo to GitHub

This project is self-contained. Push it to a repo (e.g. `goodegg`).

## 2. Create the Railway project

1. **New Project → Deploy from GitHub repo** and pick the repo.
2. Railway detects Node (Nixpacks) and reads `railway.json`:
   build `npm run build`, start `npm run start`. (A `Dockerfile` is included too
   if you prefer the Dockerfile builder or another host.)

## 3. Add Postgres

**New → Database → PostgreSQL.** Railway provisions it and exposes
`DATABASE_URL` on the database service. The schema is created automatically on
every boot (`create table if not exists …`), so there is no separate migration
step.

## 4. Set the service variables

On the **app service → Variables**:

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_DATA_PROVIDER` | `api` | **Build-time** — baked into the bundle. Must be set before the build. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference the Postgres service. |
| `JWT_SECRET` | _(64 hex chars)_ | `openssl rand -hex 32`. Required. |
| `NODE_ENV` | `production` | Enables secure cookies + strict secret check. |
| `DATABASE_SSL` | `true` | Only if your Postgres needs TLS. Railway's **private** URL does not; a public URL does. |
| `SEED_DEMO` | `true` | Optional. Seeds "The Good Eggs 2026" on first boot. |
| `RESEND_API_KEY` | _(key)_ | Optional. Without it, sign-in codes print to the deploy logs (dev only). |
| `EMAIL_FROM` | `Be a Good Egg <hi@yourdomain.com>` | Optional, used with Resend. |

`PORT` is provided by Railway automatically — don't set it.

> **Important:** `VITE_DATA_PROVIDER` is read at **build time**. If you add or
> change it later, trigger a fresh deploy so the bundle is rebuilt.

## 5. Deploy & get a URL

Deploy, then **Settings → Networking → Generate Domain**. Open it — you should
see the landing screen.

## 6. Sign in

- With `SEED_DEMO=true`: sign in as **`ben@work.example`**. Grab the 6-digit code
  from the **Deploy logs** (or your inbox if Resend is configured) and you land on
  Ben's home with Sarah as his secret buddy.
- Otherwise: **Create a group**, share the QR/link, and colleagues join and sign
  in with their own email codes.

---

## Email delivery

The 6-digit code is sent via [Resend](https://resend.com) when `RESEND_API_KEY`
is set. Until then the code is written to the server log so you can still test.
**Configure Resend before inviting real people.** Any SMTP/API email provider
can be swapped in by editing `server/email.ts`.

## Local development against the API

No Postgres required — the server can run on an in-process database (PGlite):

```bash
# terminal 1 — API on :8080 with an in-process DB + demo data
USE_PGLITE=true SEED_DEMO=true npm run server:dev

# terminal 2 — frontend on :5173, proxying /api → :8080 (cookies stay same-origin)
VITE_DATA_PROVIDER=api npm run dev
```

Open http://localhost:5173 and sign in as `ben@work.example` (code in terminal 1).

## Other hosts (Fly.io, Render, a VPS)

Use the `Dockerfile` (defaults `VITE_DATA_PROVIDER=api`). Provide a Postgres
`DATABASE_URL`, a `JWT_SECRET`, and optionally `RESEND_API_KEY`. The container
serves everything on `$PORT` (default 8080).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App loads but stays on "local" demo | `VITE_DATA_PROVIDER=api` wasn't set at build time. Redeploy. |
| Can't stay signed in | Ensure the app is served over HTTPS (Railway domains are) and `NODE_ENV=production` so the cookie is `Secure`. |
| `DATABASE_URL is required` in logs | Reference the Postgres service variable, or set `USE_PGLITE=true` for a throwaway DB. |
| SSL/connection errors to Postgres | Set `DATABASE_SSL=true` (public URL) or use the private `${{Postgres.DATABASE_URL}}`. |
| Never receive a code | Set `RESEND_API_KEY`; until then read the code from the deploy logs. |
