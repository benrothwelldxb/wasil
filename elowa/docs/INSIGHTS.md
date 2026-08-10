# Insights methodology & thresholds

The insights engine (`src/domain/analysis/insights.ts`) generates candidate insight cards from the
user's **own local data only**. It is deterministic — no LLM, no external service. Every insight
carries a plain-text `explanation` (the evidence behind it) surfaced by the card's "Why am I seeing
this?" control, and every string is built from the safe-language templates in
`src/domain/safety/language.ts`.

## Insight types

| Kind | Fires when | Example copy |
| --- | --- | --- |
| `change` | recent mean − baseline mean `≥ 0.6` (severity units) | "Your sleep has been more disrupted than usual this week." |
| `improvement` | recent mean − baseline mean `≤ −0.6` | "Your sleep has been closer to your usual range over the past two weeks." |
| `frequency` | `≥ 5` worse-than-usual days in the recent 7 | "You've logged hot flushes on 5 of the past 7 days." |
| `cooccurrence` | two symptoms both worse on `≥ 4` shared days, overlapping `≥ 55%` of the rarer one's worse-days | "Worse-than-usual sleep and worse-than-usual anxiety have tended to appear on the same days." |
| `sequence` | symptom B worse the day after symptom A worse, `≥ 3` times | "Higher energy problems have often appeared the day after nights you marked as poor sleep." |
| `treatment` | worse-day rate (value ≥ 2) differs by `≥ 0.2` before vs after a treatment date, with `≥ 5` logged days each side | "Night sweats have been logged less often since your treatment change on 12 June." |
| `cycle` | `≥ 2` recorded cycle lengths | "Your last 2 recorded cycles were 26, 33 days." |

## Thresholds (all in `thresholds.ts`)

- `MIN_LOGGED_DAYS = 8` — symptom insights are suppressed entirely below this; the UI says
  **"Not enough data yet"** rather than manufacturing a pattern.
- `RECENT_WINDOW = 7`, `PREVIOUS_WINDOW = 7` — comparison windows.
- `CHANGE_MIN_DELTA = 0.6`, `IMPROVEMENT_MIN_DELTA = 0.6` — minimum change to report.
- `FREQUENCY_MIN_DAYS = 5` (of 7).
- `COOCCURRENCE_MIN_DAYS = 4`, `COOCCURRENCE_MIN_RATE = 0.55`.
- `SEQUENCE_MIN_OCCURRENCES = 3`.
- `TREATMENT_MIN_DAYS_EACH_SIDE = 5`, `TREATMENT_MIN_RATE_DELTA = 0.2`.

## Confidence

Each insight is labelled:

- **Early signal** — fewer than `RECURRING_MIN_EVIDENCE = 6` supporting occurrences.
- **Recurring pattern** — `≥ 6` supporting occurrences.

We never present statistical noise as meaningful: co-occurrence keeps only the single strongest
pair, at most two treatment observations are shown, and a symptom that qualifies for both a change
and a frequency insight is de-duplicated to the change.

## Explainability

Every card exposes **"Why am I seeing this?"**, revealing the concrete evidence, e.g.:

> You recorded sleep above your usual range on 6 of the last 8 check-ins, compared with 3 of the
> previous 8.

No black-box claims — the user can always see where an insight came from.

## Safety

All generated copy is built from `safeCopy.*` templates and validated by `findUnsafeLanguage`,
which is asserted in tests (`insights.test.ts`, `language.test.ts`) to reject causation, diagnosis,
treatment-advice and hormone-level phrasing. The treatment observation always carries an explicit
"this is an observed association … it does not establish that one led to the other" caveat.
