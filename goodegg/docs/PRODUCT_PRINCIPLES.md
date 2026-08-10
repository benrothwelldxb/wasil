# Product Principles

These six principles are the constitution of Be a Good Egg. When a feature,
a piece of copy, or a schema decision is in doubt, we return here. They are
listed in priority order — the earlier ones win ties.

> **North star:** a year of small, genuine kindnesses between colleagues —
> delivered with delight, never turned into a competition.

---

## 2.1 Kindness, not gifts

Be a Good Egg is about **thoughtfulness**, not spending. A handwritten note, a
well-timed thank-you, or a favourite song shared anonymously sits on exactly the
same footing as anything bought. Money is optional and always framed gently.

**What this means in practice**

- Budgets are **suggestions**, never requirements. `Group.suggested_budget` is
  nullable and the copy never says "you must spend".
- The idea engine always offers **free ideas** ("Operation Kind Words",
  "Operation Good Word") alongside paid ones, and `formatCost` shows `Free`
  proudly rather than as a lesser option.
- Language stays warm and human — "surprise", "little something", "buddy" —
  never "gift obligation" or "who owes whom".

**How we check it**

- Every idea list can produce at least one `cost: 0` idea for any profile.
- Copy review: no wording that implies spending is expected or that a bigger
  spend is a better gesture.

---

## 2.2 No gamification of generosity

Kindness must never become a scoreboard. The moment generosity is measured, it
stops being generosity. We therefore **ban** the mechanics that other apps reach
for by reflex.

**Explicitly banned mechanics**

- ❌ Leaderboards
- ❌ Streaks
- ❌ Scores or points
- ❌ Gift counts ("you've given 7 surprises!")
- ❌ Spending totals
- ❌ Public participation metrics
- ❌ Organiser monitoring of individual generosity

**What this means in practice**

- There is no counter, badge, ranking, or "activity level" anywhere in the UI or
  the data model. The schema has nowhere to store a per-person generosity tally,
  and that absence is deliberate.
- Organisers get **logistics**, not surveillance: whether profiles are complete,
  whether the draw has run — never who has surprised whom, how often, or how much
  they spent. See `ParticipantSummary`, which by design "never includes assignment
  data".
- Nudges (missions, ideas) are invitations, not obligations, and are never framed
  as "you're falling behind".

**How we check it**

- Schema review: reject any column, view, or event that would count, rank, or
  total individual giving.
- UI review: no leaderboard, streak flame, progress-versus-peers, or spend
  summary components.
- `ParticipantSummary` is the **only** organiser-facing view of a participant, and
  it exposes no giving activity.

---

## 2.3 Secrecy matters — and it's enforced at the database layer

The magic depends on secrecy. Who gives to whom is the single most sensitive fact
in the system, and we protect it in the **backend**, not merely by hiding it in
the frontend.

**What this means in practice**

- **Buddy assignments are never selectable** by ordinary clients. Row-Level
  Security makes `assignments` unreadable via the normal API; a participant learns
  only their _own_ receiver, through a narrow, privileged path.
- The **draw runs server-side** in the `run-draw` Edge Function using the service
  role, and writes all pairs transactionally (all or none). No client ever sees
  the full mapping.
- **Organisers cannot see who drew whom.** The organiser role grants scheme admin,
  not omniscience.
- **Anonymous questions are truly anonymous:** an `AnonymousQuestion` recipient can
  read the question but never the `sender_id`.

**How we check it**

- Security review against [`SECURITY.md`](SECURITY.md): every sensitive read is
  denied by default and only widened by an explicit, minimal policy.
- Principle: **"do not rely on frontend hiding for secrecy."** If the only thing
  stopping a leak is a component not rendering a value, that's a bug.

---

## 2.4 Delight without clutter

The app should feel like a **beautifully made modern application with a playful
soul** — roughly **80% modern app, 20% playful stationery**. Warmth comes from
craft and restraint, not from noise.

**What this means in practice**

- A warm cream ground (`#F7F3E9`), near-black ink, and a small, restrained pastel
  palette (yolk, lilac, sage, coral, peach) — see `tailwind.config.ts`. Accents are
  used sparingly to guide the eye, never to decorate every surface.
- Generous **whitespace**; a single, calm content column (`max-w-app`, ~480px).
- Playful touches are earned and gentle: the wobbling egg mark, "Operation …"
  codenames, Fraunces display type paired with clean Inter body text.
- One clear action per screen. No dense dashboards.

**How we check it**

- Design review: does the screen breathe? Is there exactly one obvious next step?
- The 80/20 test: playful elements should feel like a wink, never a theme park.

---

## 2.5 Extremely low friction

Every extra tap is a reason to give up. Joining, profile-building, and doing a
kind thing must be effortless.

**What this means in practice**

- Join with a short, **unmistakable join code** (`makeJoinCode` avoids confusable
  characters like 0/O and 1/I/L) or a link/QR code.
- Buddy profiles are lightly structured (arrays and free text) so people can share
  as little or as much as they like — nothing is mandatory beyond a name.
- "Get an idea" is one tap, and "Another idea" rotates fresh suggestions instantly
  (the idea engine's `cursor`), with no loading spinners or accounts to configure
  for the demo.

**How we check it**

- Count the taps for each core flow (join, complete profile, get an idea). If a
  flow grows a step, justify it or cut it.
- The local demo provider means the whole product is explorable with zero setup.

---

## 2.6 Mobile first

This is a phone app that happens to run in the browser. Every layout, tap target,
and interaction is designed for a thumb on a small screen first; larger screens are
a graceful enhancement.

**What this means in practice**

- A single narrow content column tuned for phones (`max-w-app`), portrait
  orientation, safe-area-aware (`viewport-fit=cover`).
- Installable as a **PWA** (standalone display, maskable icons, theme colour) so it
  feels native on a home screen.
- Touch-sized controls, bottom-reachable primary actions, and motion that respects
  small screens.

**How we check it**

- Design and QA start at a phone viewport; desktop is reviewed second.
- PWA install and offline shell are part of the release checklist
  (see [`DEPLOYMENT.md`](DEPLOYMENT.md)).

---

## Applying the principles

When two principles collide, the earlier number wins. In practice the sharpest
edge is between **delight (2.4)** and **friction (2.5)** — when they disagree, cut
the friction. And nothing overrides **secrecy (2.3)**: if a delightful feature
would weaken the secrecy guarantee, the feature changes, not the guarantee.
