# Environments & feature flags

## Feature flags

Lightweight, no experimentation platform (`src/config/featureFlags.ts`). Flags
gate significant features for staged rollout and honest degradation:

| Flag | Default | Meaning |
|------|---------|---------|
| `aiSummaries` | on | AI-worded summaries offered (still requires per-user consent) |
| `partnerSharing` | on | Partner share links available |
| `clinicianLinks` | on | Clinician share links available |
| `subscriptions` | on | Plus tier active; off → all conveniences free |
| `healthKit` | **off** | iOS HealthKit — only real in a native wrapper |
| `healthConnect` | **off** | Android Health Connect — native only |
| `cloudSync` | on | Backup/sync flows enabled (local mock backend in this build) |

Native flags are off by default because they are meaningless in the browser —
turning them on wouldn't make the capability real, so the app doesn't pretend.
`hasCapability` consults flags first, so a disabled flag hides a capability for
everyone regardless of tier.

## Environments (production)

Three environments, each a separate backend project + config, none sharing data:

- **dev** — local development, seed/demo data, verbose logging (never of health
  content).
- **staging** — production-like, EU region, test store sandbox for billing,
  synthetic accounts only.
- **prod** — EU region, real auth/billing, minimal logging, backups.

Config is injected at build/runtime as **non-secret** values (API base URL,
public anon key, environment name). **Service-role keys, billing secrets, and
signing keys live server-side only and never enter the client bundle**
(`docs/SECURITY.md`). The web build here has no backend configured and ships no
secrets.

## Demo vs real

Independent of environment, the app has a demo mode with a fully separate storage
namespace (`elowa:v1:demo:` vs `elowa:v1:real:`). Demo seeds a deterministic
fictional user (including appointments and passive health) and can never mix with
real data. See `docs/ARCHITECTURE.md`.

## Release gating

A capability can be shipped dark (flag off), enabled in staging, then enabled in
prod — without a code change — by flipping its flag. Because capabilities are
checked, not hard-coded, this is safe and reversible.
