# Bloom — Perimenopause tracking (Phase 0)

> **Bloom** is a temporary working name. See [Replacing the brand name](#replacing-the-brand-name).

A calm, intelligent, mobile-first web app that helps people **track**, **understand** and
**act** on the changes of perimenopause. Phase 0 delivers a production-quality **product
shell**: the full navigation, screens, visual system, domain models and realistic mock data —
without any backend, authentication, AI, or medical logic.

The product proposition: **Track → Understand → Act.**

- A very fast daily wellbeing check-in (~15 seconds)
- Symptom tracking over time
- Gentle, cautious pattern insights (illustrative in Phase 0)
- Cycle changes recorded *without* making fertility the centre of the experience
- HRT / medication / lifestyle timeline
- A concise, one-page summary to bring to a healthcare appointment
- A calm, evidence-based educational hub

---

## Quick start

```bash
cd bloom
npm install
npm run dev        # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build      # type-check (tsc -b) then production build (vite)
npm run preview    # preview the production build
npm run typecheck  # strict TypeScript check, no emit
npm run lint       # eslint, zero warnings allowed
```

Requirements: Node 20+ (developed on Node 22).

> This app lives in its own self-contained folder inside the `wasil` repository and is **not**
> part of that repo's npm workspaces — it has its own `package.json` and dependencies.

---

## What you can do in Phase 0

Navigate every major screen and experience the intended product:

| Route | Screen | Notes |
| --- | --- | --- |
| `/today` | **Today** | Greeting, wellbeing selector, pinned-symptom preview, "what changed?" card |
| `/check-in` | **Check-in** | 4-step flow + "Today feels unusual" flag (interactive, local state) |
| `/insights` | **Insights** | Cautious, example insight cards from mock data |
| `/calendar` | **Calendar** | Month history with markers; tap a day for its summary |
| `/learn` | **Learn** | Educational hub with category filter and article pages |
| `/learn/:slug` | **Article** | Placeholder body + source/review metadata slots |
| `/appointment` | **Appointment** | One-page visit summary with export/share (static) |
| `/profile` | **Me** | Symptoms, cycle, treatments, privacy, integrations |
| `/onboarding` | **Onboarding** | "What made you download this today?" + symptom picker |

The seeded user is **Emma, 47**, with ~12 weeks of deterministic mock history containing
deliberately recognisable patterns (night sweats easing after HRT; sleep & mood moving
together; cycles ranging 23–45 days).

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture overview & folder structure
- [`docs/DESIGN-TOKENS.md`](docs/DESIGN-TOKENS.md) — the design token system
- [`docs/DOMAIN-MODEL.md`](docs/DOMAIN-MODEL.md) — domain model explanation
- [`docs/DEFERRED.md`](docs/DEFERRED.md) — deliberately deferred functionality

---

## Tech stack

React 18 · TypeScript (strict) · Vite · Tailwind CSS · shadcn/ui-style primitives (Radix) ·
React Router · Zustand · TanStack Query · lucide-react icons.

---

## Replacing the brand name

"Bloom" is a placeholder. It is centralised in **`src/config/brand.ts`** and rendered through
the `Wordmark` component (`src/components/brand/Wordmark.tsx`). To rename the product, change
`BRAND.name` (and optionally the mark). The public favicon lives at `public/bloom-mark.svg`.

---

## A note on safety & privacy

Bloom records and helps you understand patterns in your wellbeing. **It does not diagnose
medical conditions or replace advice from a healthcare professional.** All insight language is
deliberately cautious and association-based — never causal. Privacy messaging is a visible part
of the product, and the architecture is built so that data export and deletion are
straightforward to implement. No analytics or advertising SDKs are included.
