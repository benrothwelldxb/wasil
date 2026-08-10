# Roadmap

Where Be a Good Egg is heading — and, just as importantly, where it is deliberately
**not** heading. Scope is a feature: every principle in
[`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md) is easier to keep with a small,
focused product.

---

## MVP — in scope

The first release delivers a complete, delightful year-long Secret Buddy loop:

| Area | In the MVP |
| --- | --- |
| **Groups** | Create a scheme, share a join code / link / QR, join with low friction |
| **Buddy profiles** | Lightly-structured preferences (drink, snacks, shops, interests, colours, "little things", dislikes, dietary needs) |
| **The draw** | Fair, secret, exclusion-aware, deterministic pairing via `computeDraw`, run server-side in `run-draw` |
| **See your buddy** | Each participant sees only the person they give to |
| **Surprise ideas** | Tailored, low-cost "Operation …" ideas from the template `IdeaProvider`, including free ones; budget/type filters; "Another idea" rotation |
| **Anonymous questions** | Ask a buddy something without revealing who's asking |
| **Missions** | Gentle, optional prompts to spark kindness |
| **Inbox** | Answered questions, new ideas, new missions, accomplice nudges |
| **Secrecy** | RLS-enforced; organisers see logistics only (see [`SECURITY.md`](SECURITY.md)) |
| **Platform** | Mobile-first PWA; local demo provider for zero-setup review |

`Accomplice` ships as **schema only** in the MVP — the tables and types exist, the
full flow lands in Phase 1.

---

## Explicitly out of scope

These are intentional non-goals for the foreseeable future. They are listed so the
answer to "why don't we just add…" is already written down.

| Not building | Why |
| --- | --- |
| **Native iOS/Android apps** | The PWA covers mobile-first needs (installable, offline shell, home-screen icon) without app-store overhead. |
| **Payments / in-app purchases** | Kindness, not gifts (2.1). We never handle money or turn spending into a flow. |
| **AI APIs for idea generation** | The curated template engine is private, offline-friendly, and predictable. AI stays behind the existing `IdeaProvider` interface if/when it's added — never a hard dependency. |
| **Full real-time chat / messaging** | Beyond scope and a secrecy risk. Anonymous questions cover the narrow, safe need. |
| **Analytics / engagement scoring** | No gamification of generosity (2.2). We will not measure, rank, or "optimise engagement" on individual kindness. |
| **Leaderboards, streaks, gift counts, spend totals** | Banned by principle 2.2. There is nowhere in the data model to store them, by design. |

---

## Phased roadmap

A sensible order that keeps each release shippable and principle-safe.

### Phase 1 — Accomplices, full flow
Turn the `Accomplice` schema into a real experience: invite a colleague to help,
`invited → active / declined` transitions, a helper view scoped to just that
surprise, and inbox nudges. Careful RLS so a helper learns only what they must
(their giver's buddy), nothing wider.

### Phase 2 — AI idea provider (behind the existing interface)
Add an `AiIdeaProvider` implementing the current `IdeaProvider` contract, blended
with or falling back to the template provider. Kindness-first framing and
free-idea availability remain contractual, not optional. No UI change required —
that's the whole point of the extension point.

### Phase 3 — Previous-year exclusion UI
Exclusions already exist in the model; give organisers a friendly way to import
last year's pairings so nobody draws the same buddy twice. Feeds straight into
`computeDraw` as exclusion pairs; surfaces `INFEASIBLE` gracefully if constraints
over-tighten.

### Phase 4 — Reveal event
Make `reveal_date` a real moment: a designed, opt-in reveal that unwraps identities
with delight (and only if the group chooses to reveal at all). Moves groups from
`drawn` to `revealed`.

### Phase 5 — Reminders
Gentle, respectful nudges (never nagging, never "you're behind"): profile-completion
prompts before the draw, occasional "here's a little idea" pings. Fully optional and
tuned to avoid pressure — consistent with principles 2.1 and 2.2.

### Phase 6 — Internationalisation (i18n)
Externalise copy and add locale support, keeping British English as the source
tone. Date/format helpers already lean on `en-GB`; this generalises them.

---

## Guiding rule for anything new

Before a feature enters the roadmap it must pass one test: **does it deepen a small,
genuine kindness without measuring, ranking, or exposing generosity — and without
weakening the secrecy guarantee?** If not, it belongs in "out of scope".
