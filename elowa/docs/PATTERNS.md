# Pattern Engine v2 & Baseline v2

Deterministic, local, tested. Thresholds live in `src/domain/analysis/thresholds.ts`.

## Baseline v2

`baseline.ts` + `measures.ts` unify **manual symptoms** and **passive metrics** (sleep, activity)
into one measure shape. Symptoms resolve to the 0–4 "usual"-anchored scale (see `BASELINE.md`);
passive metrics keep their own units and are given an **unclamped** baseline band (the 0–4 clamp is
symptom-only). Each measure marks days `high` / `low` relative to the user's usual range. States:
`insufficient → learning → established → recalibrating`. Users see plain language — "within your
usual range", "slightly outside", "noticeably different", "a sustained change" (`changePoint.ts`
`MAGNITUDE_TEXT`) — never z-scores.

## Change-point detection (`changePoint.ts`)

Compares a recent 7-day window mean against the baseline. Requires ≥10 logged days and ≥5 in the
window. A change is **sustained** only when the deviation ≥ `SUSTAINED_DELTA` **and** ≥ half the
window agrees in direction — so a single unusual day never triggers a change. Unit-tested against
flat series, sustained change, and single-spike rejection.

## Pattern types

- **Change / improvement** — sustained change-point on a measure.
- **Frequency** — worse-than-usual on ≥5 of the last 7 days.
- **Same-day associations** — symptom↔symptom (both worse), sleep↔symptom (short sleep + worse),
  activity↔mood (more movement + better mood).
- **Lagged associations** — poor sleep → next-day symptom; night sweats → next-day symptom; context
  tag (alcohol/stress/caffeine/late meal) → shorter sleep that night.
- **Intervention (before/after)** — worse-day rate before vs after a treatment date, using a fixed
  "notable" level so a regime split can't hide the change.
- **Cycle** — recorded cycle-length history.

Manual and passive sleep are treated as one family to avoid self-association / duplicate cards.

## Quality scoring & strength

Each insight gets an internal `score` (0–1) from evidence count, effect size and recency — never
shown as a percentage. It maps to a user-facing **strength**: `early` / `recurring` / `strong`
(evidence ≥ 5 → recurring, ≥ 8 → strong).

## Ranking & prioritisation

Insights are ranked by score (adjusted by local feedback — helpful boosts, not-useful/wrong demote),
de-duplicated per measure family, and capped. **Today shows one** privacy-respecting primary
insight; the Insights screen shows the ranked list. Home insights exclude measures the user marked
"ignore" or hid.

## Explainability

Every card has "Why am I seeing this?" (evidence) **and** "What this means" (reusable cautious
interpretation). Association findings always carry the explicit "elowa cannot determine whether one
leads to the other" note.
