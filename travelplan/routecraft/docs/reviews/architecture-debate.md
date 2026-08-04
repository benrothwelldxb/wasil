# Architecture Roundtable — "What would you build to win journey optimisation?"

*A moderated debate (Fable moderating) among three composite expert perspectives,
briefed on RouteCraft's current architecture: a client-side SPA with a
provider-independent flight-engine seam, a heuristic candidate recommender over a
~24-city curated pool, a linear six-factor experience score, single-stopover
construction, and an in-tab TTL cache.*

- **Dana** — ex-Head of Search, Google Flights (fare-search systems, latency, planetary precompute)
- **Rafa** — ex-Chief Scientist, Airbnb (search ranking as ML, embeddings, personalization, experimentation)
- **Mei** — Principal Engineer, Skyscanner (metasearch aggregation, price integrity, virtual interlining)

---

## Round 1 — Opening positions

**Dana:** What's built is a *product prototype wearing a systems costume*. There is no search — candidate generation is a linear scan of 24 hand-picked cities, and it runs in the browser. Real journey search is a combinatorial explosion; search is won on **coverage, latency, and price correctness**, and today there's a heuristic and a `Map`.

**Rafa:** The *instinct* — rank whole trips by experience, not flights by price — is the correct wedge, and one Google structurally can't chase. But the experience score is six typed constants. The value at Airbnb was the **data flywheel**: the ranker improved because we saw what guests booked. There is no events pipeline here — no impressions, clicks, bookings, or satisfaction signal. Hand-tuning a ranker with no gradient isn't a moat; it's a guess a competitor reproduces in a weekend.

**Mei:** Both are romanticising. The hard part isn't the algorithm — it's that **the price is wrong by the time the user clicks**. Real flight search is asynchronous fan-out (submit → dribble → paginate → expire in minutes). The adapter does one synchronous GET and trusts the body; `currency` is a type literal and non-USD offers are dropped. The fun 10% is optimised; the brutal 90% is stubbed.

---

## Round 2 — The clashes

### Candidate generation — precompute vs learn vs "you can't precompute what you don't own"

- **Dana:** Model a **time-expanded transport graph**; precompute **contraction hierarchies**; journey discovery becomes **multi-criteria / resource-constrained shortest path** (budget and time as resources) in milliseconds.
- **Mei:** And it's stale in five minutes — you don't own inventory. Precompute *structure* (plausible routings); price *live*.
- **Rafa:** You're arguing about the index of a two-stage retrieval system. The graph is one retrieval signal; "is this stopover *worth* a night for *this* traveller" is **learned two-tower retrieval** over trip embeddings. Structure from the graph, desirability from embeddings, verify live. The current estimate→shortlist→construct shape is right; it's just filled with heuristics.

### Ranking — learned utility vs correctness vs "ranking is moot if the price is a lie"

- **Rafa:** Replace the linear score with a **learned, personalized utility over a Pareto frontier**; keep the explainability — it's ahead of Google.
- **Dana:** LTR optimises clicks, not truth. You need a cold-start heuristic, guardrails, and **latency + correctness as ranking inputs**.
- **Mei:** None of it matters if the top result 404s at booking. **Price freshness and bookability are ranking signals**, not footnotes.

### Is "experience score" real, and is flights even the wedge?

- **Dana:** Sceptical the score is falsifiable — it's a vibe with weights.
- **Rafa:** It's falsifiable once **calibrated against outcomes** (booked, returned, rated). Bigger challenge: **why flights-first?** The unit of value is the *trip* — air + rail + stay + a thing to do. Flights are the commoditised, Google-owned layer.
- **Dana:** Rail and ground are Google's genuine blind spot — that's where I'd attack.
- **Mei:** Multi-modal aggregation is operationally savage, which is why it's defensible. The routing IP has a name: **virtual interlining** with a **missed-connection guarantee**. Google won't touch it — channel conflict and liability.

---

## Round 3 — Radical proposals

- **Dana:** Kill per-request candidate scoring. Precomputed multi-modal time-expanded graph + contraction hierarchies; serve discovery as **Pareto/RCSP shortest path** with a live-price overlay. p99 < 500ms or you've lost.
- **Rafa:** The company is a **learning platform**. Build the **events pipeline, feature store, offline-replay/counterfactual eval, and model registry first**. Retrieval = two-tower; ranking = LTR + contextual bandits; personalization end-to-end. The flywheel *is* the moat.
- **Mei:** The company is an **aggregation-and-integrity fabric**. Async fan-out, singleflight, price-freshness cache, rate-limit budgeter, circuit breakers; a **canonical offer model** (multi-currency, fare rules, baggage, expiry); **virtual interlining + a self-transfer guarantee**.

---

## Convergence — the architecture we'd build today

A layered platform where each obsession is a layer, not a religion.

1. **Provider & integrity fabric (Mei) — server-side, day one.** Async orchestration (submit → poll/stream → paginate), a **canonical offer model** with real currency/fare-rules/baggage/expiry, a shared **price-freshness cache** with **singleflight**, rate-limit budgeting, circuit-breaking, negative caching. Secrets live here, not in a browser.
2. **Transport graph & candidate retrieval (Dana + Rafa).** Offline time-expanded multi-modal graph + contraction hierarchies for structural candidates (**RCSP/k-shortest-path**), fused with **learned two-tower retrieval** for experiential candidates, diversified via **submodular selection**.
3. **Verification & bundling (all).** Live-price the shortlist; construct bundles (flight + stay + transfer + experiences) with **recomputed totals — never trust the wire**; **virtual interlining** with an insured missed-connection guarantee; budget as a hard resource constraint.
4. **Ranking (Rafa, with guardrails).** **Pareto frontier** over (price, time, experience, bookability) → **learned, personalized, calibrated utility**, with price-accuracy/bookability as first-class signals, a cold-start heuristic, and hard guardrails. **Keep the explainable factor breakdown** — the real UX edge.
5. **Learning & experimentation platform (Rafa) — the company's actual IP.** Events pipeline (search → impression → click → book → satisfaction), feature store, offline replay / counterfactual eval, contextual-bandit online tuning, model registry.
6. **What we keep from what exists — unanimously.** RouteCraft already has the right **contracts**: the provider-independent `JourneyProvider` seam, the pluggable `CandidateRecommender` port, "recompute cost / never trust the estimate," determinism-in-tests, and the explainable score. The implementations behind those seams get replaced; **the seams survive.**

**Agreed sequencing:** fabric + canonical offer model + **events pipeline first**; live pricing + bundling + virtual interlining second; learned retrieval and ranking third, once the flywheel has data.

**Agreed wedge:** not "cheaper flights A→B" but **personalised, explainable, bundled, multi-modal *trips* with virtual interlining and a guarantee** — the intersection Google is disinclined to play, Skyscanner isn't experiential enough to own, and Airbnb never extended to transport.

---

### Immediate implication for the codebase

Of the "first" items, the **events pipeline is the one buildable today** with no backend and no real provider — a typed, pluggable analytics seam (mirroring the logger's sink pattern) that captures the search→select→intent funnel. It is the first vertebra of the flywheel and the prerequisite for every learned component above. That is the next step this repo should take. *(Implemented in `src/lib/analytics/` — see `docs/conventions/analytics.md`.)*
