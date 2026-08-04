# Journey Score — algorithm design (Opus)

RouteCraft's proprietary, transparent, **user-weightable** score. Twelve factors,
each a 0–100 sub-score, combined by a normalised weighted mean. Every factor is
explainable, every weight is adjustable, and the composite is always a clean
0–100 no matter which signals are available.

## Composite

`total = round( Σ_present  value_f · w'_f )`

where the sum is over factors whose value is **not null**, and `w'_f` are the
**effective weights**: the configured weights restricted to the present factors
and renormalised to sum to 1.

```
present = { f : factors[f] != null }
W = Σ_{f in present} weight_f
w'_f = weight_f / W          (for f in present;  0 otherwise)
```

If `W == 0` (all present factors have zero weight) fall back to an equal split
over the present factors, so the score is never NaN. If *no* factor is present
(impossible in practice) `total = 0`.

This null-redistribution is the key design move: a **direct flight** (no
`hotelQuality`, `transfers`) and a **2-night stopover** are scored on the same
0–100 scale — the missing factors' weight flows to what remains, rather than
penalising the journey for lacking a hotel it never needed.

## User-adjustable weighting

Users express **importances** (raw non-negative numbers, e.g. 0–10 sliders).
`normalizeWeights(raw)`:

1. Clamp every importance to `>= 0`.
2. `S = Σ raw`. If `S == 0`, return `DEFAULT_JOURNEY_SCORE_WEIGHTS` (an empty
   preference is not a valid preference).
3. Otherwise `weight_f = raw_f / S` — so configured weights always sum to 1.

The default importances that seed the UI are `DEFAULT_JOURNEY_SCORE_WEIGHTS`
themselves (already summing to 1); a "reset" restores them. Changing any slider
recomputes the score live and deterministically.

## The twelve factors (higher = better; each clamped to [0, 100])

Derivation reads the `Journey` plus injected `JourneyScoreSignals`. Where a
signal is absent the factor is `null` (weight redistributes). "Stopover-or-dest"
means: use the mean over stopovers when the journey has them, else the
destination signal, else null.

1. **cost** — value against budget. `100 · clamp01(headroomPct)^0.7` from
   `journey.cost.headroomPct`. Concave: the first slice of headroom matters most.
2. **cabinQuality** — mean over legs of `0.6 · cabinBase[cabin] + 0.4 · (airline.comfortRating · 20)`,
   `cabinBase = { economy: 50, premium_economy: 74, business: 94 }`.
3. **hotelQuality** — mean over stopover hotels of `clamp(starRating · 12 + guestRating · 4)`.
   Direct journey → **null**.
4. **weather** — stopover-or-dest `signals.weather` (a pre-normalised 0–100
   comfort score; see the weather sub-model below). Absent → null.
5. **transfers** — mean over stopovers of `clamp(100 − durationPenalty + (comfortRating − 3) · 8)`
   where `durationPenalty = max(0, avgTransferMinutes − 45) · 0.5`. Direct → null.
6. **duration** — stationary efficiency vs the great-circle direct time:
   `100 · clamp01(referenceDurationMinutes / totalTravelTimeMinutes)^1.2`.
   Uses the injected reference (NOT the result-set minimum) so the score is
   stable and per-journey cacheable. Missing reference → null.
7. **jetLag** — from the net UTC-offset shift origin→destination:
   `Δ = |tz(dest) − tz(origin)|` hours; eastward travel (`tz(dest) > tz(origin)`)
   is harder, factor `1.3`, westward `1.0`. `raw = Δ · 9 · dirFactor`. An
   overnight stopover aids adjustment: subtract `min(stopoverNights,2) · 8` from
   `raw`. `jetLag = clamp(100 − max(0, raw))`. Missing tz → null.
8. **airportQuality** — mean of the airport-quality signals for every airport
   touched (origin, each stopover, destination). Absent → null.
9. **touristAppeal** — stopover-or-dest `touristAppeal`. Absent → null.
10. **neighbourhoodQuality** — stopover-or-dest `neighbourhoodQuality`. Absent → null.
11. **foodRating** — stopover-or-dest `foodRating`. Absent → null.
12. **safety** — stopover-or-dest `safety`. Absent → null.

### Weather sub-model (used by the data layer to produce `signals.weather`)

Given a `WeatherSummary { condition, averageHighC, averageLowC, precipitationChance }`:
`base = { sunny: 92, partly_cloudy: 80, cloudy: 62, rainy: 42, snowy: 52 }[condition]`;
`avgTemp = (high + low) / 2`; `tempPenalty = |avgTemp − 22| · 1.5`;
`precipPenalty = precipitationChance · 30`;
`weather = clamp(base − tempPenalty − precipPenalty)`. (Pinned here so the score's
weather factor is defined even though the normalisation runs in the data layer.)

## Explainability

`computeJourneyScore` returns `contributions` — per factor `{ value, weight,
contribution = value·weight }`, sorted by contribution desc — plus a one-line
narrative naming the top one or two contributing factors. This is the UI's
"why this scores N", and it updates live as the user reweights.

## Invariants (for Haiku's tests and Fable's consistency check)

- `DEFAULT_JOURNEY_SCORE_WEIGHTS` sums to 1 (±1e-9).
- `normalizeWeights` output always sums to 1; clamps negatives; empty/all-zero → defaults.
- `total ∈ [0, 100]` for every input; never NaN even with all-null or all-zero-weight factors.
- Every factor value the derivation emits is in `[0, 100]` or null.
- `effectiveWeights` sums to 1 (over present factors); null factors carry weight 0.
- `Σ contribution == total` (pre-rounding, ±1e-9).
- **Monotonic in factor value:** raising one present factor (others fixed) never
  lowers `total`.
- **Determinism:** same `(factors, weights)` → identical `JourneyScore`.
- **Weight monotonicity:** shifting importance onto a factor whose value is above
  the current weighted mean never lowers `total` (and vice-versa).
- Direct vs stopover journeys both yield a valid 0–100 with weight correctly
  redistributed over present factors.
