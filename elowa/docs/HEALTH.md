# Passive health data

## Provider abstraction

elowa's domain layer never talks to a health platform directly. It depends on the
`HealthDataProvider` interface (`src/domain/health/types.ts`), which exposes capabilities,
permission requests and daily-sample reads. Every read returns an explicit `MetricStatus`:
`unavailable | unsupported | permission_denied | no_data | partial_data | valid` — so the UI can
distinguish these states and **never claims data is connected when it is not**.

Providers (`src/domain/health/providers.ts`):

- **`UnsupportedHealthProvider`** — the honest web default. `connectable: false`; reads return
  `unsupported`. This is what a normal browser build uses.
- **`MockHealthProvider`** — deterministic, used **only in demo mode** to demonstrate passive-data
  features. Reads from demo-seeded samples in the health repository and honours a stored permission
  grant.

`getHealthProvider()` (`src/domain/health/index.ts`) selects by runtime capability: a native
wrapper may `registerNativeHealthProvider(...)`; demo mode uses the mock; otherwise unsupported.

## Native integration requirement (deferred)

Apple **HealthKit** and Android **Health Connect** require native OS APIs that a web/PWA runtime
cannot access. Implementing them is a Phase 2.x/native task: build a thin app wrapper that
implements `HealthDataProvider` against the platform SDK and calls
`registerNativeHealthProvider()` at startup. The interface, permission UX (`/health`), mock
provider and analysis integration are all already in place — only the native provider is missing.

## Metrics & analysis

Supported metric kinds: sleep duration/consistency, steps, active minutes, workouts, resting heart
rate, HRV, weight. In Phase 2 the analysis uses the robust ones — **sleep duration** and
**activity (steps)** — via the measure abstraction (`measures.ts`), which normalises them into the
same per-day shape as symptoms. Subjective sleep (better/about/worse) and objective sleep coexist:
the objective value drives the passive measure, while the subjective status remains a symptom.

## Privacy

Passive samples are stored on-device in the (namespaced) health repository, included in the JSON
export, cleared by delete-all, and never uploaded. Grant only the metrics you choose; disconnect at
any time.
