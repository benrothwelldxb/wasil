# Deployment

Be a Good Egg is a static, mobile-first PWA that builds to `dist/`. It runs happily
with **no backend** (the local demo provider) or against a real **Supabase**
project. This guide covers shipping the frontend to Cloudflare Pages or Vercel, and
provisioning Supabase.

---

## 1. Build output

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 20+ |
| SPA routing | Serve `index.html` as the fallback for unknown paths |

`npm run build` runs `tsc -b` (type-checks the project references) and then
`vite build`. A type error fails the build — deploys are always type-clean.

---

## 2. Environment variables

Set these as **build-time** environment variables on your host. Only `VITE_*`
values reach the browser; choose them accordingly.

| Variable | Required when | Notes |
| --- | --- | --- |
| `VITE_DATA_PROVIDER` | always | `local` (demo, no backend) or `supabase` |
| `VITE_SUPABASE_URL` | provider = `supabase` | `https://<project>.supabase.co` — browser-safe |
| `VITE_SUPABASE_ANON_KEY` | provider = `supabase` | anon public key — browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **Never** a `VITE_*` var; set as a Supabase **function secret** (§5), never on the static host |

> A deploy of the pure demo needs only `VITE_DATA_PROVIDER=local`. Everything works
> with zero backend — ideal for review builds and previews.

---

## 3. Cloudflare Pages

1. **Create a project** → connect the repository.
2. **Build settings:**
   - Framework preset: _None / Vite_
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables:** add the `VITE_*` values from §2 (Production and
   Preview as needed).
4. **SPA fallback:** add a `public/_redirects` file so client routes resolve:

   ```
   /*    /index.html   200
   ```

5. **Deploy.** Cloudflare builds on push; preview deployments come per-branch.

---

## 4. Vercel

1. **Import the repository.** Vercel detects Vite automatically.
2. **Build settings:**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
3. **Environment variables:** add the `VITE_*` values from §2.
4. **SPA fallback:** add `vercel.json` at the repo root:

   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```

5. **Deploy.** Push to deploy; PRs get preview URLs.

One-liner for either host: **build `npm run build`, serve `dist` with an
SPA/`index.html` fallback.**

---

## 5. Provisioning Supabase

Needed only when `VITE_DATA_PROVIDER=supabase`.

1. **Create a project** in the Supabase dashboard; note the project ref, URL, anon
   key, and service-role key.

2. **Install & link the CLI:**

   ```bash
   npm install -g supabase   # or use npx
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

3. **Apply the schema and RLS policies** (from `supabase/migrations/`):

   ```bash
   supabase db push
   ```

4. **Deploy the privileged draw function:**

   ```bash
   supabase functions deploy run-draw
   ```

5. **Set the function secret** — the service-role key lives here, server-side only:

   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```

   Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into the
   function's environment. **Never** put the service-role key in a `VITE_*` variable
   or in the static host's build env.

6. **Point the frontend at it:** set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` on your static host (§2) and redeploy.

---

## 6. PWA notes

Be a Good Egg ships as an installable PWA via `vite-plugin-pwa`:

- `registerType: 'autoUpdate'` — new versions activate automatically; users get the
  latest on next launch.
- Manifest: standalone display, portrait orientation, theme colour `#F7C948`,
  background `#F7F3E9`, with 192/512 icons plus maskable variants in
  `public/icons/`.
- **Serve over HTTPS** (Cloudflare and Vercel do by default) — service workers
  require it.
- After a deploy, verify the manifest and service worker load, and that "Add to
  Home Screen" produces a standalone, correctly-iconed app.
- The dev build writes to `dev-dist/` (git-ignored); don't deploy that.

---

## 7. Custom domain

1. Add the domain in Cloudflare Pages / Vercel and follow the DNS instructions
   (CNAME/apex as directed). TLS is provisioned automatically.
2. If you use Supabase Auth with redirects, add the custom domain to the project's
   allowed redirect URLs.
3. `joinUrl` uses `window.location.origin`, so join links automatically use whatever
   domain the app is served from — no code change needed.

---

## 8. Smoke-test checklist

After every production deploy:

- [ ] App loads over HTTPS; no console errors.
- [ ] Correct backend: with `local`, the demo works offline and you can sign in as
      **"Ben"**; with `supabase`, network calls hit your project URL.
- [ ] Create a group → a join code/link/QR is generated.
- [ ] Join the group from the code on a second session/device.
- [ ] Complete a buddy profile; it saves and marks `profile_complete`.
- [ ] Run the draw (Supabase: confirm it executes in `run-draw`, not the browser).
- [ ] Each participant sees **only their own** buddy — never anyone else's, and no
      organiser view of the mapping.
- [ ] "Get an idea" returns tailored ideas incl. a free one; "Another idea" rotates.
- [ ] Ask an anonymous question; the recipient sees the question but **not** the
      asker.
- [ ] PWA installs (Add to Home Screen), launches standalone, shows correct icon
      and theme colour.
- [ ] Deep-link a client route directly (e.g. `/group/:id/buddy`) — SPA fallback
      resolves it, no 404.
- [ ] `VITE_*` env is correct in the built bundle; the service-role key is **absent**
      from client assets.
