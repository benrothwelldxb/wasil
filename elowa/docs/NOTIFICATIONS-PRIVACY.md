# Notifications, privacy & safety (Phase 2)

## Notifications

`src/domain/notifications/rules.ts` is a **pure decision layer** that computes which restrained
reminders are due from state + granular preferences (daily check-in, weekly reflection, monthly
summary, meaningful changes, appointment reminders). There is **no streak/guilt logic**. Actual OS
delivery is a native concern (deferred); in the web build, due reminders surface inside the app
(Today) and preferences are saved (`/notifications`). Unit-tested for each rule, including "no
reminder once checked in" and appointment-day-before only.

## Privacy review (Phase 2)

| Area | Mitigation |
| --- | --- |
| Passive health data | On-device only, namespaced storage, in export, cleared by delete-all, never uploaded. Honest "unsupported" state on web. |
| AI data transfer | Nothing leaves the device today (local providers). A real provider would send only short structured findings via a server proxy, with fresh consent. |
| Category privacy | Per-symptom controls (`/privacy`) exclude a symptom from home insights, AI summaries and/or the appointment report; "ignore" relevance drops it from home. Sensitive symptoms flagged in the model. |
| Analytics | Behavioural-only, **off by default**, abstracted behind one choke point (`services/analytics.ts`) that strips all but allow-listed non-health props. Never sends symptom values or notes. |
| URLs | No health values in routes (dates only for editing/anchors — not symptom content). |
| Logs / errors | No crash-reporting or error-monitoring SDK is included. |
| PDF / temp files | The report is rendered in-page and printed via the browser; no server round-trip, no temp files. CSV/JSON are generated in-memory and downloaded locally. |
| Export | JSON archive + CSV tracking data remain understandable without the app. |

## Health-language safety review (Phase 2)

- **Causation:** all associations use "tended to occur together / around the same time" and carry
  the explicit "cannot determine whether one leads to the other" note. No copy asserts cause.
- **Diagnosis:** no insight or summary infers a condition.
- **Treatment:** the treatments screen and treatment insights never recommend starting/stopping/
  changing medication or dose.
- **False reassurance:** patterns describe recorded data; nothing implies a symptom is harmless.
- **Precision:** internal scores are never shown as percentages; magnitudes are plain-language.
- **AI:** output validation (`ai/validation.ts`) rejects diagnosis/causation/dose-advice phrasing;
  AI can never override deterministic safety. The generated-copy safety is asserted in tests
  (`patterns.test.ts`, `language.test.ts`, `ai.test.ts`).
- **Fertility:** no fertile-window or next-period prediction exists anywhere.
