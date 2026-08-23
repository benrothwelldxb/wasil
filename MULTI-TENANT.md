# Multi-tenant (branded per-school login)

Connect serves multiple schools from **one** parent-app service, each with its own
branded sign-in on its own subdomain (`vhpscoa.wasilconnect.com`). This doc is the
roadmap + runbook. **Status: Phase 0–1 shipped and live. Phases 2–4 are banked below.**

## Architecture

- **One** `@wasil/parent` Railway service serves every school. The tenant is resolved
  from the hostname at runtime — **never** a container/service per school.
- **One** `wasil` API service. CORS allows any `https://*.wasilconnect.com` origin.
- The app already themes per-school **after** login from `user.school.*` (`ThemeContext`).
  Multi-tenant fills the gap **before** login (no tenant in the URL → default branding).
- Adding a school = **a DB row + one Cloudflare CNAME + one Railway custom domain**. No code.

## Shipped

### Phase 0 — foundation (commit `ecc18387`)
- `School.slug` (unique, nullable). VHPS backfilled `vhpscoa`.
- `GET /api/public/tenant/:slug` — public, unauth, cosmetic branding only
  (name/city/brandColor/accentColor/logo/tagline); 404s unknown + archived identically.
- Files: `server/prisma/schema.prisma`, `server/src/routes/publicTenant.ts`.

### Phase 1 — branded login
- **CORS** widened to `*.wasilconnect.com` (commit `138bca6d`, `server/src/index.ts`).
- **Step B — branded login** (commit `de479ab2`):
  - `packages/shared/src/services/tenant.ts` → `resolveTenantSlug()` (hostname→slug; `?tenant=` override; reserved: app/admin/api/provider/www).
  - `packages/shared/src/contexts/TenantContext.tsx` → `TenantProvider`/`useTenant` fetch branding pre-login.
  - `ThemeContext` brands the login from the tenant when not authenticated.
  - `GET /api/public/tenants` — list of active slugged schools (for the picker).
- **Step C — root picker + auto-redirect** (commit `92522fe7`):
  - `apps/parent/src/components/RootLanding.tsx`. On the root host (no slug): 1 school →
    `window.location.replace` to its subdomain; 2+ → the "Connect by Wasil" picker.
    `?picker` forces the chooser. Search built but hidden until 5+ schools.
  - Logo: `apps/parent/public/connect-by-wasil.png`.
- **Live:** `app.wasilconnect.com` → auto-forwards to `vhpscoa.wasilconnect.com` (branded VHPS login).

## Runbook — add a school today (manual, until Phase 2)

1. **DB:** insert/prepare a `School` row (or via admin), set `slug`, `brandColor`,
   `accentColor`, `logoUrl`, `tagline`, `hubSchoolId`.
2. **Cloudflare:** DNS → CNAME `<slug>` → the Railway target (`dok16r3c.up.railway.app`).
   Add the Railway `_railway-verify.<slug>` **TXT** record too (Railway custom domains need
   both). Proxy can be grey (DNS-only) to pass validation, then flipped to orange.
3. **Railway:** `@wasil/parent` → Settings → Networking → **Custom Domain** → `<slug>.wasilconnect.com`.
   Wait for **active** (TLS issues automatically).
4. Done — `<slug>.wasilconnect.com` serves the branded login; the root shows the picker once 2+ exist.

## Locked decisions

- **Subdomain per school** (not path-based, not per-container).
- **Root** (`app.wasilconnect.com`): auto-redirect while 1 school; picker at 2+.
- **Branding:** product is **"Connect by Wasil"**; neutral platform accent **plum `#6B4A57`**;
  each school card carries its own colour. Search hidden until 5+ schools.
- On Cloudflare's plan, a **proxied wildcard isn't available** — per-subdomain records for now;
  true wildcard is a later option (Enterprise/ACM) or DNS-only.

## Banked — remaining phases

### Phase 2 — self-serve provisioning
Guided "Add a school" flow for super-admin so onboarding doesn't touch the DB:
create `School` (slug + colours + logo upload), set `hubSchoolId`, invite the first admin,
kick off the initial Hub sync. Reuse `PATCH /api/schools/:id/branding`. The DNS/Railway custom-domain
step stays manual unless a Railway API integration is added. Consider enforcing `slug` NOT NULL once all schools have one.

### Phase 3 — per-school installable app + isolation
- **Per-host PWA manifest** (dynamic by `Host`): name, icons, `theme_color`, `start_url`, so each
  school installs as e.g. "JESS Connect" with its own icon/splash. Today the manifest is static ("Wasil").
- **Tighten the refresh cookie to host-only** (drop `Domain=.wasilconnect.com`) so a session can't
  ride between tenant subdomains. See `session-durability-cookie` context + `server/src/services/refreshCookie.ts`.

### Phase 4 — white-label everything
- School branding in **emails/push** (name, logo, sender/reply-to). Resend domain is verified
  (`wasilconnect.com`); per-school sender identity is the new work.
- **Custom domains** (`app.jessdubai.com`) via automated certs — the subdomain design extends to this.
- **Multi-school parent** model (one person, two schools → account switcher). Today `User.schoolId` is singular.
- **Cross-tenant isolation tests** as a standing guardrail (a JESS token can never read VHPS data).

## Key reference

- Public branding: `GET /api/public/tenant/:slug`, `GET /api/public/tenants` (`server/src/routes/publicTenant.ts`).
- Tenant resolution: `packages/shared/src/services/tenant.ts`, `contexts/TenantContext.tsx`.
- Theming: `packages/shared/src/contexts/ThemeContext.tsx`.
- Root router: `apps/parent/src/components/RootLanding.tsx`.
- CORS: `server/src/index.ts` (`CORS_WASILCONNECT` regex).
