# Stopover Discovery Engine — optimisation algorithm (Opus design)

The defining feature: given **origin, destination, maximum stopover nights, and
budget**, intelligently discover candidate stopover cities, then for each build a
real journey (inbound flight → hotel → outbound flight → total cost) and return
**ranked journeys**.

The engine is designed so an **AI recommender can be dropped in later** without
touching the orchestrator: candidate generation sits behind the
`CandidateRecommender` port. Heuristic today; AI tomorrow — *the AI proposes
cities, the engine still verifies each with real flight/hotel/cost math and
ranks by the same experience model.* An AI suggestion never bypasses budget or
feasibility.

## Pipeline

```
DiscoveryRequest {origin, destination, maxStopoverNights, budget, departureDate, pax, cabin, preferences}
   │
   ▼  (1) CANDIDATE RECOMMENDATION  — CandidateRecommender port (heuristic | ai)
   scored StopoverRecommendation[]  (city + nights + score + optional rationale/confidence)
   │
   ▼  (2) BUDGET-AWARE SHORTLIST     — cheap cost estimate prunes to top-K before expensive construction
   │
   ▼  (3) PER-CANDIDATE CONSTRUCTION — for each shortlisted candidate:
   │         inbound  = FlightSearchPort(origin → city)
   │         hotel    = HotelEstimatorPort(city, nights)
   │         outbound = FlightSearchPort(city → destination)
   │         cost     = computeCostBreakdown(legs, [stopover])   ← never trust estimates
   │
   ▼  (4) FEASIBILITY + HARD BUDGET  — drop over-budget / infeasible (reuses domain constraints)
   │
   ▼  (5) RANK                       — rankJourneys(...) from @/domain/scoring (one model for all)
   ▼
DiscoveryResult { journeys ranked desc by experience, diagnostics }
```

## (1) Candidate scoring — the optimisation objective

For each candidate hub city `X` (from the injected city pool, excluding
origin/destination), compute a **candidate score** in [0, 1]. The recommender
returns the top candidates by this score; it is the AI-swappable heuristic.

Let `direct = haversine(O, D)`, `detour = (haversine(O,X) + haversine(X,D)) / direct`.

**Hard gates (reject the city outright):**
- `detour > MAX_DETOUR` (1.6) — too far off-path.
- `X ∈ {O, D}`.
- cheapest feasible estimate (see §2) exceeds `budget` even at 1 night.

**Soft factors, each normalised to [0, 1]:**

| Factor | Definition | Weight |
|---|---|---|
| `routeEfficiency` | `clamp((MAX_DETOUR − detour) / (MAX_DETOUR − 1))` — 1 when on-path, 0 at the limit | 0.30 |
| `hubViability` | `hubStrength / 5` — connectivity of the city as an air hub | 0.20 |
| `appeal` | `appealScore / 100` — curated destination desirability | 0.30 |
| `budgetFit` | headroom sweet-spot (see below) from the cheap estimate | 0.20 |

`candidateScore = (0.30·routeEfficiency + 0.20·hubViability + 0.30·appeal + 0.20·budgetFit) · preferenceBoost`

`preferenceBoost = 1 + 0.15 · min(2, |cityTags ∩ preferences|)` — cities matching
the traveller's stated interests rank higher (and this is exactly the signal a
future AI recommender would enrich).

**`budgetFit`** rewards using the budget well without busting it. With
`estFrac = estimatedTotal / budget`:
- `estFrac > 1` → gated out (hard).
- `estFrac ∈ [0.55, 0.85]` → 1.0 (the sweet spot: a real trip, comfortable headroom).
- `estFrac < 0.55` → `0.6 + 0.4·(estFrac / 0.55)` (very cheap = likely a thin experience, mild penalty).
- `estFrac ∈ (0.85, 1]` → `1 − (estFrac − 0.85) / 0.15 · 0.5` (tight, penalised toward 0.5).

## (1b) Nights optimisation (per candidate)

For each candidate the recommender also picks `n* ∈ [1, maxStopoverNights]` that
maximises experience-value while staying in budget:

`nightsValue(n) = appealScore · nightsFactor(n)` with `nightsFactor = {1:0.85, 2:1.0, 3:0.95}`
(matches the experience scorer, so discovery and ranking agree).

`n* = argmax_n { nightsValue(n) : estimatedTotal(n) ≤ budget }`, falling back to
the largest feasible `n`, else 1. This is why one extra affordable night is
preferred (2 nights beats 1), but the engine never books a night the budget
can't cover.

## (2) Budget-aware shortlist — cheap-estimate pruning

Constructing full journeys (two flight searches + hotel) for every city is
wasteful. The optimiser first ranks all gated candidates by `candidateScore`
using a **cheap closed-form estimate** — `estFlights(O,X,D)` from great-circle
distance × a per-km fare constant, plus `estHotel(city, n*)` from the city's
base nightly rate — and shortlists the top `K = min(RECOMMEND_LIMIT, gated.length)`
(RECOMMEND_LIMIT = 8). Only the shortlist pays for full construction. Complexity:
O(cities) cheap scoring + O(K) full construction.

## (3)–(5) Construction, budget, rank

Shortlisted candidates are built with the injected ports (real leg + hotel
data), costed with `computeCostBreakdown` (**wire/estimate totals are never
trusted** — cost is recomputed from the constructed legs and hotel), filtered by
the hard budget constraint and connection feasibility (`applyBudgetConstraint`,
`isFeasible` from `@/domain/scoring`), and ranked by `rankJourneys`. The engine
also constructs the **direct** journey (no stopover) as a baseline so the ranked
output answers "is a stopover actually better than flying direct?" — the whole
point of RouteCraft.

## Ports (dependency injection — the seams that make it testable & AI-ready)

- `CandidateRecommender.recommend(request, cityPool)` → `StopoverRecommendation[]`.
  `HeuristicCandidateRecommender` implements the above. An `AiCandidateRecommender`
  (future) implements the same signature; its recommendations carry `rationale`
  and `confidence`, and are fed through the identical §2–§5 verification.
- `FlightSearchPort.search({from,to,date,cabin,pax})` → `FlightLeg[]` — cheapest
  suitable leg is chosen by the engine.
- `HotelEstimatorPort.estimate({city, nights, rooms})` → hotel + alternatives.

Determinism: all randomness is injected (RNG / clock via the port
implementations), so the same request yields the same journeys — a hard test
invariant. Nothing in `src/domain/stopover/**` imports datasets, React, or I/O;
the city pool and ports are passed in. The `src/data/stopover/**` layer wires the
real dataset + synthetic generators and exposes the engine as a `FlightAdapter`
(`stopover-v1`) so it rides the existing provider-independent pipeline and the UI
stays blind to it.

## Extension points for AI (explicit)

1. `AiCandidateRecommender implements CandidateRecommender` — swap at the port; the
   orchestrator is unchanged.
2. `StopoverRecommendation.rationale?: string` / `confidence?: number` — populated
   by AI, surfaced later as "why this city" copy; ignored by the heuristic.
3. `StopoverRecommendation.source: 'heuristic' | 'ai'` — provenance for
   blending/telemetry.
4. A `BlendingRecommender` can later merge heuristic + AI candidates behind the
   same port. None of this changes construction, budgeting, or ranking.
