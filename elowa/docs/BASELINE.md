# Baseline methodology

elowa's core idea is that it learns **what's usual for _you_**, then helps you notice when things
change. The baseline engine (`src/domain/analysis/baseline.ts`) is fully deterministic — no AI, no
model, no randomness — and every threshold is a documented constant in
`src/domain/analysis/thresholds.ts`.

## 1. Resolving observations to a number

Every symptom observation is resolved onto a **0–4 scale anchored at "usual"**:

| Input | Resolved value |
| --- | --- |
| Explicit severity `None…Severe` | `0…4` directly |
| Relative status `better` | `NEUTRAL_REF − 1 = 0` |
| Relative status `about usual` (and every symptom on a plain **normal** day) | `NEUTRAL_REF = 1` |
| Relative status `a little worse` | `NEUTRAL_REF + 1 = 2` |
| Relative status `much worse` | `NEUTRAL_REF + 2 = 3` |

`NEUTRAL_REF = 1` (Mild) is the anchor for "usual". This means a run of normal days sits at `1`,
and worse-than-usual days sit above it — so the baseline learns each symptom's typical level and
variability rather than an absolute clinical score. Explicit severities always win over the
relative status when both are given.

A **normal** check-in contributes an "about usual" sample for every pinned symptom. On a
**detailed** check-in, pinned symptoms the user didn't mention are also treated as "about usual"
(they came to flag what changed); non-pinned symptoms only contribute on days they were observed.

Storage keeps the **raw** user input (status and/or severity); the numeric series is always
_derived_, so editing history stays consistent and everything is recomputable.

## 2. Learning the usual range

For each symptom we compute rolling statistics over the most recent `ROLLING_WINDOW = 21` values:

- `mean`, `sd` (population standard deviation)
- the **usual range band** `low = mean − sd`, `high = mean + sd` (clamped 0–4)
- `recentMean` over the last `RECAL_WINDOW = 7` values

All values are rounded to one decimal place to avoid presenting false precision.

## 3. Baseline states

Per symptom (and, from distinct logged days, overall):

| State | Condition |
| --- | --- |
| `insufficient` | fewer than `MIN_DAYS = 5` logged days |
| `learning` | `5 … 13` logged days |
| `established` | `≥ LEARNING_TARGET_DAYS = 14` logged days |
| `recalibrating` | established, but the recent 7-day mean sits `≥ RECAL_DEVIATION = 1.0` above the baseline mean |

The learning period is deliberately **not** required to be consecutive — it counts distinct logged
days. The Today screen shows a "Learning your baseline — N of 14 days" progress state until a
symptom/overall baseline is established.

## 4. "Worse than usual"

A day is flagged **worse** when its value sits above the usual-range upper band
(`value ≥ max(high, mean + 0.5)`) and is at least mildly present (`value ≥ 1`). This is what the
coral markers on the calendar and the frequency dots represent, and what drives change/frequency
insights.

## Why this is honest

- It compares you with **yourself**, never a population average.
- It centres on **change from usual**, not absolute scores.
- It never fabricates precision — small numbers of days yield an explicit "insufficient / learning"
  state rather than a confident-looking statistic.
