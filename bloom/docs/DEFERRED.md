# Deliberately deferred functionality

Phase 0 builds the **product shell only**. The following are intentionally **not** implemented,
and the codebase is structured so they can be added later without restructuring.

## Explicitly out of scope for Phase 0

- Authentication / accounts
- Database / persistence
- Backend API
- AI / LLM calls / AI interpretation of data
- Medical diagnosis, treatment recommendations, or red-flag logic
- Real trend/insight calculations (all insights are mock examples)
- Real appointment PDF generation
- Real data export / sharing (buttons are present but static)
- Notifications / reminders delivery
- Apple Health integration
- Health Connect integration
- Clinician accounts
- Partner accounts
- Subscriptions / payments
- Analytics or advertising SDKs
- Real voice recording (the mic button is a disabled placeholder)
- Cloud storage

## Deferred but scaffolded

These have models, UI slots or seams already in place:

| Area | What exists now | What Phase 1+ adds |
| --- | --- | --- |
| Check-in submission | Interactive draft in `checkInDraftStore`; "Save" resets & returns | A mutation that persists a `DailyCheckIn` and invalidates the query |
| Insights | `Insight` model + `InsightCard` + mock examples | On-device trend computation feeding the same model |
| Appointment export/share | Static buttons + one-page layout | PDF/one-page render + share sheet |
| Learn provenance | `reviewedBy`/`reviewedAt`/`sources` fields displayed | Real reviewed content |
| Health integrations | "Coming soon" rows in Profile | Apple Health / Health Connect readers |
| Data export & deletion | Menu rows + privacy positioning | Real export bundle + delete flow |
| Onboarding | Local selections in `onboardingStore` | Persisted pinned symptoms + first-run gating |
| Reminders | Toggle + time preference | Scheduled local notifications |

## Known Phase 0 limitations

- **No persistence:** check-in edits, onboarding choices and the reminder toggle reset on reload.
  This is intentional — there is no storage layer yet.
- **Mock data is deterministic, not simulated:** ~12 weeks of history are generated from a fixed
  seed with hand-tuned patterns; it is not a physiological model.
- **Insights are illustrative:** every card is flagged as an example and uses cautious language;
  none are computed from the data.
- **Fonts load from Google Fonts** with a system-font fallback; there is no offline font bundle.
- **`en-GB` locale** is assumed for date formatting; i18n is not addressed.
