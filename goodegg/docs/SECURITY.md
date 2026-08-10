# Security & Threat Model

Be a Good Egg keeps one promise above all others: **secrecy of who gives to whom.**
The delight of Secret Buddy collapses the moment that mapping leaks. This document
sets out what we protect, from whom, and how — and states plainly the guarantees
the system makes.

> **Governing principle (2.3):** secrecy is enforced at the **database layer**, not
> by the frontend. **Do not rely on frontend hiding for secrecy.** If the only
> thing preventing a leak is a component choosing not to render a value, that is a
> defect, not a control.

---

## 1. Assets — what we protect, most sensitive first

| Rank | Asset | Where it lives | Why it matters |
| --- | --- | --- | --- |
| 1 | **Buddy assignments** (`giver_id → receiver_id`) | `assignments` | The core secret. Leaking it ruins the entire scheme for everyone. |
| 2 | **Identity behind anonymous questions** (`sender_id`) | `anonymous_questions` | Anonymity is promised; exposure breaks trust and can reveal a buddy pairing. |
| 3 | **Buddy profiles** | `buddy_profiles` | Personal preferences (birthday, dietary/health hints, dislikes). |
| 4 | **Accomplice relationships** | `accomplices` | A helper knows a giver's buddy — a partial assignment leak. |
| 5 | Membership & group metadata | `groups`, `group_members`, `profiles` | Lower sensitivity, but scoping still matters. |

Explicitly **not** an asset we create: any per-person **generosity metric**. We do
not store, derive, or expose gift counts, spend totals, streaks, or scores
(principle 2.2). The safest sensitive data is the data that does not exist.

---

## 2. Actors & trust boundaries

| Actor | Trust | Capability we assume |
| --- | --- | --- |
| **Participant** | Semi-trusted | Authenticated member of a group. Should see their own data and their _own_ buddy — nothing more. |
| **Organiser** | Semi-trusted (admin, not omniscient) | Runs the scheme: opens the group, sets exclusions, triggers the draw. **Must not** see who drew whom. |
| **Curious insider** | Semi-trusted, adversarial intent | A legitimate member (possibly an organiser) probing the API/DB to uncover assignments or question askers. |
| **Attacker with a stolen session** | Untrusted, holds a valid token | Has a participant's (or organiser's) credentials/session; can call the API as them. |
| **Anonymous network attacker** | Untrusted | No valid session; can hit public endpoints and the static site. |

The **trust boundary** sits at the Supabase API / Postgres RLS layer and at the
`run-draw` Edge Function. The browser is treated as fully untrusted for secrecy
purposes.

---

## 3. Guarantees (stated plainly)

- **Assignments are never selectable by anyone via RLS.** No participant, no
  organiser, no curious insider can `SELECT` the assignment mapping through the
  normal API. A participant may learn **only their own `receiver_id`**, and only
  through a narrow, purpose-built path.
- **The draw runs server-side with the service role.** `computeDraw` executes
  inside the `run-draw` Edge Function; the service-role key never touches the
  browser. The function writes all pairs **transactionally — all or none**.
- **Organisers cannot see who drew whom.** The organiser role grants scheme
  logistics only. Their view of participants is `ParticipantSummary`, which by
  construction carries no assignment data.
- **Anonymous question recipients cannot see the asker.** The recipient-facing
  projection of `anonymous_questions` exposes `question`, `answer`, `status` —
  **never `sender_id`.**

---

## 4. Threats & mitigations

| # | Threat | Actor | Mitigation |
| --- | --- | --- | --- |
| T1 | Read the full assignment mapping via the data API | Curious insider / stolen session | `assignments` has **no client-readable SELECT policy**. Deny by default; only `run-draw` (service role) writes it. |
| T2 | Read _someone else's_ buddy | Participant / stolen session | The single narrow read path is scoped to `giver_id = auth.uid()`; a request for another giver returns nothing. |
| T3 | Organiser inspects pairings | Organiser | Organiser policies grant group logistics, not `assignments`. UI shows `ParticipantSummary` only. |
| T4 | Client tampering / running the draw itself | Any client | The draw is privileged server logic. Clients can only _trigger_ it; the mapping is computed and stored server-side, never returned wholesale. |
| T5 | De-anonymise a question's asker | Recipient / stolen session | `sender_id` is excluded from every recipient-facing view/policy; only the asker can see their own sent questions. |
| T6 | Read other groups' data | Any member | Every table is scoped by `group_id` membership in RLS; cross-group reads are denied. |
| T7 | Guess/enumerate join codes to gate-crash | Anonymous attacker | Codes drawn from a 30-char confusable-free alphabet; joining still creates an auditable membership. Rotate/expire codes if abused. |
| T8 | Service-role key leaks to the browser | Misconfiguration | Key is a **function secret**, never a `VITE_*` var; `.env*` (bar `.env.example`) is git-ignored; only URL + anon key ship to the client. |
| T9 | Infer pairings from side effects (ideas, questions, accomplices) | Curious insider | Idea generation runs client-side against the giver's _own_ buddy only; question/accomplice rows are scoped to their participants. No endpoint reveals the reverse direction. |
| T10 | Force an unfair/rigged draw | Organiser | `validateDraw` re-checks the result server-side before persisting; exclusions honoured or `INFEASIBLE` is raised; draw is deterministic under a seed for auditability. |
| T11 | Stolen session acts as the user | Attacker with token | RLS still constrains blast radius to that one user's own rows and their single buddy — never the whole mapping. Short-lived sessions and sign-out mitigate further. |
| T12 | Persist a partial/inconsistent draw | Bug / interrupted request | Pairs are written transactionally (all or none); a failure leaves the group in `ready`, not half-drawn. |

---

## 5. Requirement → control map (brief §8)

Each secrecy/security requirement from the product brief's section 8 maps to a
concrete control:

| §8 requirement | Control |
| --- | --- |
| **8.1** Assignments must be secret from all participants | RLS: no client SELECT on `assignments` (T1) |
| **8.2** A participant may see only their own buddy | Narrow per-giver read scoped to `auth.uid()` (T2) |
| **8.3** Organisers must not see who drew whom | Organiser policies exclude `assignments`; `ParticipantSummary` carries none (T3) |
| **8.4** The draw must be computed with elevated privilege, not on the client | `run-draw` Edge Function + service role; clients only trigger (T4) |
| **8.5** Draw results are written atomically | Transactional persist — all pairs or none (T12) |
| **8.6** Anonymous questions must not reveal the asker | `sender_id` omitted from recipient views/policies (T5) |
| **8.7** Data is isolated per group | `group_id` membership checks on every table (T6) |
| **8.8** No secret material in the client bundle | Service-role key is a server-only function secret; `.env*` git-ignored (T8) |
| **8.9** No generosity is measured or exposed | No metric columns exist to leak; `ParticipantSummary` shows logistics only (principle 2.2) |
| **8.10** Draws must be fair and honour exclusions | `computeDraw` guarantees a valid derangement; `validateDraw` guards before persist (T10) |

_(Section numbers follow the brief; adjust if the brief renumbers.)_

---

## 6. Residual risks & assumptions

- **A trusted actor going rogue with the service role.** Anyone with the Supabase
  service-role key or direct database access bypasses RLS entirely. Protect that
  key: least-privilege project access, rotation, and audit logging. This is an
  operational trust assumption, not something the app can enforce.
- **Physical / social observation.** The app cannot stop someone seeing a colleague
  place a surprise on a desk. Secrecy is a software guarantee about the _mapping_,
  not about the real world.
- **Statistical inference in tiny groups.** In very small groups, elimination can
  narrow possibilities (e.g. _n = 2_ is inherently reciprocal). We warn organisers
  that small schemes are less secret by nature.
- **Stolen session within its own scope.** RLS limits a stolen session to that one
  user's rows and single buddy, but cannot distinguish the legitimate user from an
  impostor. Session hygiene (expiry, sign-out, device security) is the mitigation.
- **Metadata timing.** Creation timestamps could, in principle, be correlated. We
  keep timestamps coarse where practical and expose no ordering that reveals
  pairings.
- **Provider parity.** The local demo provider computes draws in-browser for review
  only; it is **not** a security boundary and must never be used with real personal
  data.

Nothing above weakens the headline guarantees in §3 — those are the fixed points the
rest of the design serves.
