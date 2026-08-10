# Deferred functionality

## Done in Phase 1

Local persistence (versioned, real/demo namespaces), functional onboarding, personal baseline
engine, "Today feels normal" / "Something feels different", change-based check-ins, context tags,
notes, cycle tracking, treatment/HRT timeline, editable/deletable history, deterministic insights
engine with confidence + "why am I seeing this?", live Today dashboard, baseline-band
visualisations, appointment summary v1 with print, JSON export, delete-all, privacy screen, demo
mode, and tests for the non-UI logic.

## Explicitly deferred to a later phase

- backend / API / cloud sync
- authentication / accounts
- LLM / generative AI / AI interpretation
- Apple Health / Health Connect / wearables
- push notifications / reminders delivery
- subscriptions / payments
- community / social / partner accounts
- clinician portal / messaging
- medical diagnosis / medication recommendations
- real PDF generation (Phase 1 uses `window.print()` of a clean HTML view)
- voice transcription / OCR
- fertile-window / next-period prediction (intentionally never)

## Known Phase 1 limitations

- **Device-local only:** data lives in this browser's `localStorage`. Clearing browser storage, or
  switching browser/device, means history isn't available there. No sync yet.
- **Baseline is a heuristic, not a clinical measure:** it anchors "usual" at Mild=1 and learns each
  symptom's range from that. It is deliberately cautious and never claims precision.
- **Insights are associations only:** deterministic, local, and gated by minimum-evidence
  thresholds; they never assert causation or diagnosis.
- **Reminders toggle is cosmetic:** no notifications are actually scheduled.
- **`en-GB` locale** assumed for dates; no i18n.
- **Custom symptom management** is available at onboarding; a dedicated post-onboarding editor for
  pinned/custom symptoms is a small follow-up.
