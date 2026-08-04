# RouteCraft Optimiser — Architectural Review

**Reviewer of record:** Fable (Chief Architect) · **Contributors:** Opus (algorithms, search, ranking, OR/graph/recsys), Sonnet (code, interfaces, models, API, caching, extensibility, testing), Haiku (hygiene, dead code, naming, docs).
**Scope:** the optimisation engine only — `domain/stopover`, `domain/scoring`, `data/{stopover,engine,adapters,normalise,cache}`, and the data-access hooks. No new features written; no refactors applied except the one critical defect noted below.

> One critical defect was found and fixed during review: the stopover engine ignored `maxStopovers: 0` ("Direct only"), so a direct-only search could return stopover journeys. Fixed in commit `1ffca37` (direct-only now skips candidate discovery; regression test added). Everything else in this document is analysis, not code.

---

## 1. Executive summary

The optimiser is **architecturally excellent and unusually disciplined for an MVP**, but it is **not yet a defensible optimiser** — it is a hand-tuned heuristic over a ~24-city curated pool, wrapped in a genuinely strong substrate.

Two things are true at once:

- **The substrate is the asset.** Provider-independence, an AI-recommender seam that is real (not aspirational), determinism by construction, and a "never trust provider pricing" invariant give RouteCraft a platform that most competitors' organically-grown search stacks *don't* have. Swapping in a learned recommender, a real provider, or a new ranking model is a port change, not a rewrite — for the two seams that were designed for it.
- **The algorithm is a placeholder.** Candidate generation is a separable linear score over a static array; ranking is a linear scalarisation of six factors with one non-stationary term. There is no learning, no data flywheel, no diversity, no multi-hop routing. Today's differentiation is **product framing and curated data** (experience-first whole-trip bundling + explainability), not algorithmic depth. That framing is a real wedge, but it is replicable.

The gaps fall into two buckets. **(a) Foundational model gaps that block real-provider integration** — currency modelled as a constant, a single-shot synchronous adapter contract that doesn't match how real flight APIs work, a `maxStopovers: 2` type the orchestrator never honours, and a 100%-client-side architecture with no backend to hold secrets or share a cache. **(b) The strategic gap** — the optimiser needs an engagement→learning loop to become a moat. None of this requires a rewrite *if sequenced now*; the currency and adapter-shape gaps become rewrites if deferred past the first real provider.

**Bottom line:** ship the demo on the current engine, but treat the next two quarters as "make the foundations real-provider-shaped and start the data flywheel" — in that order — before investing in fancier algorithms.

---

## 2. The five greatest architectural risks

1. **Currency is a constant, not a dimension (High).** `Currency = 'USD'` is baked at the type (`domain/types.ts:14`), the Zod schema (`schemas.ts:37`), and every `money()` call (`scoring/cost.ts:16`); `normalise/http.ts` drops *all* offers on any non-USD currency. Any real, non-US, or multi-market provider forces a cross-cutting change through the model, every schema, and most of `domain/scoring`. This is the single most expensive thing to defer.
2. **The adapter models a toy REST call, not a real flight search (High).** `FlightAdapter.search(): Promise<TRaw>` assumes one synchronous, complete response. Real flight-search APIs (Amadeus, Duffel, NDC aggregators) are asynchronous fan-outs: submit → poll/stream → paginate, over seconds, rate-limited with `Retry-After`. The `search_id` field in the wire type hints this was anticipated but never built. Integrating a real provider means redesigning the contract, not implementing it.
3. **Interface/implementation divergence caps the core promise (High).** The type promises `maxStopovers: 2`, but `discover.ts` always builds exactly one stopover (`legs = [inbound, outbound]`). "I don't care how I get there" implies multi-hop (O→X→Y→D), open-jaw, and virtual interlining — none of which the orchestrator can express. The product's headline is structurally limited to a single intermediate city.
4. **No backend; the real-provider path has nowhere to live (High).** Execution is 100% in the browser. `HttpFlightAdapter` cannot hold provider secrets or survive CORS; the engine cache is a per-tab `Map` singleton with no cross-user sharing, no request coalescing, and no negative caching. Combined with **sequential** per-candidate construction (up to ~24 serial round-trips per search), real-provider latency and cost will multiply. The server tier where caching/coalescing/rate-limiting must live does not exist yet.
5. **The optimiser is replicable — no learning, no flywheel (High, strategic).** Weights (`0.30/0.20/0.30/0.20`), the budget-fit sweet-spot `[0.55, 0.85]`, and the linear ranking are hand-tuned constants. Ranking is a linear scalarisation that collapses a Pareto frontier and includes a **non-stationary** factor (`travelTimeEfficiency` is relative to the fastest journey *in the result set*), so a journey's score changes when its neighbours change — which quietly undermines per-journey cacheability and "why did the ranking move?" explainability. A competitor can reproduce this heuristic in a weekend.

---

## 3. The five strongest aspects

1. **Provider-independence and the AI-recommender seam are real.** `discover.ts` never branches on recommendation `source`; every recommendation — heuristic or future AI — is verified by the identical cost/feasibility/ranking pipeline (grep-verified: no `if (source === 'ai')` anywhere). Nothing outside `src/data` imports the engine internals. This is the best-executed part of the system.
2. **Determinism by construction.** RNG and clock are injected, never called directly in the domain, and it's enforced by tests. This buys reproducibility, cacheability, and trivially reliable testing — properties most search stacks never achieve.
3. **"Recompute cost; never trust the estimate."** Cost is always recomputed from constructed legs + hotel via `computeCostBreakdown`, never read from the provider's claimed totals (`discover.ts:146`, `normalise/http.ts`). This invariant will hold up against real, untrustworthy provider pricing.
4. **Two-phase candidate generation is the correct industry pattern.** Cheap closed-form estimate → shortlist top-K → full construction mirrors retrieval→ranking in production recommender systems. The bones are right for scaling later.
5. **The experience score is explainable.** Per-factor contributions, effective weights, a one-line narrative, and Pareto-corner badges (`best-experience`/`fastest`/`best-value`/`hidden-gem`) are surfaced to the UI. Explainability is a genuine trust asset and a product differentiator that price-only engines don't offer.

---

## 4. Is the stopover generation genuinely differentiated?

**Partially — differentiated in framing and data, not yet in algorithm.**

- **vs Google Flights / Skyscanner** (optimise price/time on a *chosen* route): yes. RouteCraft reframes the question from "cheapest way to fly A→B" to "best whole trip within budget, including a stopover city with hotel and transfers costed into one capped total." That is a real, defensible *product* wedge.
- **vs Kiwi.com** (Nomad multi-city, "search anywhere/radius", and virtual interlining): much less so. Kiwi already does multi-city discovery and destination-agnostic search; its moat is virtual interlining (self-transfer inventory across carriers), which RouteCraft cannot currently express (single-stopover, no interlining graph).
- **The mechanics themselves are not differentiated.** A curated pool of ~24 cities + a linear candidate score + a linear rank is table-stakes engineering. The *appeal data* (curated `appealScore`, tags, editorial headlines) and the *bundling* are the differentiators — and those are data/product assets, not algorithmic ones.

**Verdict:** the concept is differentiated; the current implementation of it is not hard to copy. The moat has to come from data and bundling economics layered onto this substrate.

---

## 5. Is the current optimiser likely to become a defensible competitive advantage?

**Not as it stands — but the architecture is the right substrate to build one.**

The heuristic is replicable. Defensibility requires assets that compound and that competitors cannot buy off the shelf:

1. **An engagement data flywheel** → learning-to-rank (LambdaMART/listwise) and learned candidate retrieval (two-tower embeddings). This is the classic recsys moat: the product's own usage data trains a ranker nobody else has. Requires instrumentation *now* (it doesn't exist yet).
2. **A proprietary experience graph** — city appeal by season, event, and persona; layover quality; "is this stopover actually worth a night?" — curated *and* learned. A data asset, not code.
3. **Bundled trip economics / a virtual-interlining route graph** — supplier relationships and routing IP that turn "flight + hotel + transfer" into margin and into itineraries the majors won't sell (channel conflict).
4. **Personalisation** from user history, which raises switching costs.

The good news: the pluggable `CandidateRecommender`, the provider-independent pipeline, and the "verify everything" invariant mean all four can be built *behind the existing seams*. The optimiser becomes defensible when the data flywheel is turning — not before.

---

## 6. Recommended improvements (by area)

- **Candidate generation.** Move from a static array to a **retrieval index** (so the pool can grow to thousands of airports without per-request linear scans). Add **diversity** (submodular maximisation / MMR — a facility-location objective with a (1−1/e) guarantee) so the shortlist isn't eight similar culture cities. Introduce **multi-hop** candidates (O→X→Y→D) via k-shortest-paths (Yen/Eppstein). Add seasonality/event signals. Long-term: two-tower embeddings for learned retrieval.
- **Ranking.** Replace pure linear scalarisation with a **Pareto-frontier + preference-utility** approach: compute the non-dominated set over (cost, time, experience), then rank within it by a preference-weighted utility (weighted-Chebyshev scalarisation reaches non-convex frontier points that linear weights cannot). Add **list diversity** (MMR). When engagement data exists, move to **learning-to-rank**. This also fixes the "badges approximate Pareto corners" intuition by making it explicit.
- **Scoring.** Make normalisation **stationary/absolute** — reference `travelTimeEfficiency` against the great-circle direct time, not the result-set minimum, so a journey's score is stable and per-journey cacheable. Calibrate factor weights against real booking/engagement outcomes rather than hand-tuning. Add uncertainty to factors that a real provider will make noisy.
- **Explainability.** Already strong. Add **counterfactuals** ("$120 more unlocks +12 experience"), **Pareto positioning** ("cheapest option that still scores ≥ 80"), and surface the AI recommender's `rationale`/`confidence` (the fields already exist) as "why this city."
- **Caching.** Add **request coalescing (singleflight)** at the engine boundary so N concurrent identical searches make one provider call. Add **short-TTL negative caching** for terminal errors (`NO_ROUTES`/`UNKNOWN_AIRPORT`) so bad searches don't re-run the retry/fallback chain. When the backend exists, front `TtlCache` with a **shared store (Redis)** keyed by route+date+cabin+pax-bucket, and add per-segment leg caching + stale-while-revalidate for popular routes.
- **API abstraction.** Introduce an **async-search port variant** (submit → poll/webhook → paginate) alongside the synchronous one; parse and honour `Retry-After`; **split `PROVIDER_FAILURE`** into a transient code and a permanent "unusable response" code so retry doesn't waste attempts on deterministic failures (e.g. currency mismatch); model **partial provider failure** ("some carriers timed out, here's a partial result"); add a **segment-level flight port** so O→X legs can be reused across nights variants and candidates.
- **Personalisation.** Design the seam *now*, using the AI-recommender port as the template: thread a `PersonalizationContext` (profile, history-derived preference priors) into `ScoringContext`/`DiscoveryRequest`. Then a **contextual bandit** (Thompson sampling) can tune weights online, and collaborative signals can personalise candidate retrieval. Today there is no user/session concept anywhere in scoring — this is a missing foundation, not a swap.
- **Future AI integration.** The port is ready. Add an **LLM-based recommender** (proposes cities + rationale + confidence; the engine still verifies cost/feasibility — "AI proposes, the engine disposes"), a **BlendingRecommender** to merge heuristic + AI candidates, guardrails (clamp AI `nights` to 1..maxNights; defensively `slice(0, RECOMMEND_LIMIT)` so an AI returning 50 candidates doesn't 50× construction cost), and an **offline replay/eval harness** to test recommenders against historical searches before shipping.

---

## 7. Computational complexity and scaling

**Per-search complexity (today, synthetic, client-side):** candidate scoring `O(P)` (pool size P ≈ 24), shortlist `K = 8`, construction `O(K)` with each synthetic port `O(1)`, ranking `O(N log N)` with N ≈ 9. Net ≈ `O(P + K)` — effectively constant, sub-millisecond, entirely in the user's browser.

| Users | Behaviour today (synthetic, client-side) | Behaviour with real providers | Dominant bottleneck |
|---|---|---|---|
| **100** | Trivial. Each browser does its own ~O(P) work; no server, no shared state. | Needs a backend proxy for secrets/CORS even at 100 users. | None (synthetic) / provider secrets + latency (real). |
| **10,000** | Still trivial client-side. | Provider **API cost and latency** dominate; sequential construction makes each search multi-second; no coalescing means duplicate calls. | Provider $/call + per-search latency. |
| **100,000** | Fine client-side, but the static-array pool won't scale if it grows to thousands of airports (linear scan per request). | Must be **server-side**. Cache **hit-rate** becomes the primary cost lever; `maxEntries: 50` in-process is trivially small; no cross-instance sharing on serverless. | Flight-API QPS/quota; cache hit-rate; sequential construction. |
| **1,000,000** | N/A client-side alone. | Requires **retrieval-index candidate generation, shared cache (Redis) + singleflight, async-search, precomputed popular-route caches, and model serving**. The linear heuristic is no longer competitive. | Provider economics; cache hit-rate; ranking-model serving; cold-start on rare routes. |

**Highlighted bottlenecks (in priority order):** (1) sequential per-candidate construction — parallelise with bounded concurrency before any real provider; (2) no request coalescing/negative caching — duplicate paid calls; (3) single-process in-memory cache — no cross-user reuse once server-side; (4) synchronous single-shot adapter — can't absorb async fan-out; (5) static-array candidate pool — linear per request, won't scale past a small curated set.

**Key insight:** the client-side synthetic build scales to millions *for free* (each browser is independent). The scaling inflection is entirely at the **first real provider integration**, which forces a backend — and that backend is where every caching/coalescing/rate-limiting concern above must be solved.

---

## 8. Twelve-month optimiser roadmap (no major rewrites)

Sequenced so each quarter lands *behind existing seams* and unblocks the next. Foundations before cleverness.

- **Q1 — real-provider-shaped foundations + flywheel fuel (pre-beta).** Rank once, canonically (remove the discovery/engine double-rank); stationary/absolute score normalisation; parallelise candidate construction (bounded concurrency); add a segment-level flight port + per-segment cache; **instrument engagement telemetry** (searches, clicks, journey selections) — the flywheel's fuel; stand up a **server-side proxy** and wire one real flight provider behind the existing `FlightAdapter` (async variant). Promote `Currency` to a real union with a conversion boundary.
- **Q2 — ranking maturity + resilience (around beta).** Pareto-frontier + preference-utility ranking with list diversity (MMR); shared server cache + singleflight + negative caching; async-search/pagination support in the adapter contract; split the `PROVIDER_FAILURE` taxonomy; personalisation v1 (preference priors threaded through `ScoringContext`); ship the LLM recommender behind the port + an offline eval harness.
- **Q3 — scale the search space.** Candidate **retrieval index** (grow the pool to thousands via ANN/embeddings); **multi-hop** itineraries (k-shortest-path / resource-constrained shortest path with budget as the resource) — this finally honours `maxStopovers: 2` and opens virtual interlining; learning-to-rank v1 trained on Q1–Q2 engagement; real hotel provider integration.
- **Q4 — turn the flywheel into a moat.** Contextual bandit for online weight tuning; two-tower personalised retrieval; virtual-interlining route graph; the proprietary experience/appeal/seasonality data asset. All incremental on the seams built in Q1–Q3.

No step above requires discarding the current engine; each replaces a port implementation or adds a stage.

---

## 9. Prioritised backlog

Effort: S (≤ few days) · M (1–2 wks) · L (multi-week). Risk: how likely to destabilise. Beta = do it **before** or **after** public beta.

### Critical — before beta / before any real provider

| Item | User impact | Effort | Risk | Beta |
|---|---|---|---|---|
| Promote `Currency` to a real union + conversion boundary (types/schema/`money()`/normalise) | Enables any non-USD/real provider; prevents silent offer-drops | L | Med (cross-cutting, well-tested) | Before |
| Backend proxy + async/paginated adapter contract (submit→poll→paginate; `Retry-After`) | Unblocks real flight data; correct behaviour under real APIs | L | High (new tier) | Before |
| Parallelise candidate construction (bounded concurrency) | Multi-second → sub-second searches on real providers | S | Low | Before |
| Rank once, canonically + stationary normalisation | Stable, cacheable, explainable scores; removes double-rank | S | Low | Before |

### High

| Item | User impact | Effort | Risk | Beta |
|---|---|---|---|---|
| Engagement telemetry (the data flywheel's fuel) | Indirect but foundational to every future improvement | M | Low | Before |
| Request coalescing (singleflight) + negative caching | Cuts duplicate paid calls; protects rate limits | M | Low | Before |
| Split `PROVIDER_FAILURE` (transient vs unusable) so retry stops wasting attempts | Faster failures; lower cost | S | Low | Before |
| Honour `maxStopovers: 2` (multi-hop) **or** shrink the type to match reality | Removes a promise the engine can't keep | M (align) / L (multi-hop) | Med | Align before; multi-hop after |
| Tests + coverage for `src/hooks/**` (in-scope, currently zero-covered) | Correctness of the data-access layer | S | Low | Before |
| Pareto-frontier + preference-utility ranking + list diversity | Better, less redundant results | M | Med | After |

### Medium

| Item | User impact | Effort | Risk | Beta |
|---|---|---|---|---|
| Personalisation seam (`PersonalizationContext`) | Enables the personalisation roadmap | M | Med | After |
| Shared cache tier (Redis) design for the server engine | Cross-user reuse at scale | M | Med | After |
| LLM recommender behind the port + offline eval harness | "Why this city"; smarter candidates | M | Med | After |
| Explainability: counterfactuals + Pareto positioning | Higher trust/conversion | S | Low | After |
| Property-based tests for scoring/candidate formulas; slow-fake-port latency test | Catches invariant + perf regressions (e.g. sequential construction) | S | Low | After |
| De-duplicate shared constants/utils (cabin multipliers, fare constants, time math, score placeholders) — Haiku | Maintainability | S | Low | After |

### Low

| Item | User impact | Effort | Risk | Beta |
|---|---|---|---|---|
| Unify `adapterId`/`providerId` terminology; doc-comments on exported constants | Maintainability/clarity | S | Low | After |
| Adapter **contract test** ("rejects only with HttpError/ProviderError") | Guards future real adapters | S | Low | After |
| Remove/justify the unreachable validation fallback in `use-journey-search.ts` | Clarity of ownership | S | Low | After |
| Make silent synthetic-fallback visible in `SearchResult`/telemetry | Trust (real vs fabricated data) | S | Low | Before if real data ships |

---

## 10. If Google Flights shipped this tomorrow

**What RouteCraft would still do better:**

1. **Whole-trip budget bundling.** One capped total across flight + hotel + transfer, optimised together. Google optimises the flight; it does not treat the stopover as a costed, hotel-inclusive experience within a single budget.
2. **Experience-first, explainable ranking.** An opinionated "best trip for *you*" with a transparent factor breakdown and counterfactuals — versus price/duration defaults. Explainability builds trust that a black-box price sort doesn't.
3. **Provider neutrality + virtual interlining (once built).** Google favours what's bookable on Google and won't self-transfer across competing carriers (channel conflict). RouteCraft can be genuinely agnostic and assemble itineraries the majors won't sell.
4. **Personalisation as the product, not a feature.** A preference/history-driven optimiser is the core value proposition, not a sidebar filter.

**Google's structural advantages** (be honest): data scale, price accuracy/freshness, distribution, and infrastructure. RouteCraft cannot win on those.

**Proprietary capabilities to build in the next six months to create a lasting moat:**

1. **The engagement data flywheel → learned ranking + learned candidate retrieval.** The one asset Google can't copy from us: a ranker trained on RouteCraft's own "which stopover did travellers actually choose?" signal. Start instrumenting immediately.
2. **A proprietary experience graph** — city appeal by season, event, and persona; layover-worthiness; editorial + learned. A data asset that improves with usage and that a price-index competitor has no incentive (or data) to build.
3. **Bundled trip economics + a virtual-interlining route graph** — supplier relationships and routing IP that make "flight + hotel + transfer" both cheaper and more interesting than anything a flight-only index will assemble.
4. **Deep personalisation** from history — raising switching costs so a user's "best trips" get better the more they use RouteCraft.

**The strategic point:** competing with Google on flight-price search is unwinnable. Competing on **personalised, explainable, bundled travel *experiences*, powered by proprietary appeal data and a usage-trained ranker** is a game Google is structurally disinclined to play. The architecture reviewed here is the right substrate for exactly that game — provided the next two quarters are spent making the foundations real-provider-shaped and starting the flywheel, rather than polishing the heuristic.
