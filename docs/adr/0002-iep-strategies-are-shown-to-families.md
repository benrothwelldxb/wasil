# ADR 0002 — A target's strategies are shown to the family

- **Status:** Accepted
- **Date:** 2026-09-11
- **Deciders:** Ben Rothwell
- **Related:** Wasil Inclusion (SEND) `docs/CONNECT-INTEGRATION.md` §4.2 (the staff-only exclusion list this overrules) and §D.3.5 (the same question recorded from SEND's side); [ADR 0006](https://github.com/benrothwelldxb/wasil) ILSA messaging, for the pattern of recording a cross-app disagreement rather than letting one side's default stand.

## Context

Connect and Wasil Inclusion disagreed about whether a parent may see the **strategies** recorded against an IEP target — the "what we will try" for each goal.

Both positions were already shipped, in opposite directions:

- **Connect** renders `target.strategies` to the parent under its own heading in the parent Inclusion page, and types the target shape for it. A designed, parent-facing section.
- **Wasil Inclusion** placed `strategies` on a staff-only exclusion list and never serialised it to a family, alongside `successCriteria`, `resources`, `responsibleStaff` and `reviewSummary`.

Two systems cannot both be right about what a family may read, and the disagreement would otherwise have been settled silently by whichever app happened to serve the page after the Connect↔SEND integration landed.

**The two positions were not equally considered, and that is what decided it.** SEND's exclusion list was *descriptive* — derived from what its token parent portal happened to render, a portal now being retired. Its own spec says as much ("this response is the parent view, verbatim"). Connect's was a *designed* choice by someone who thought about a parent reading it. The SEND session established this itself, against its own side's position, and recorded it rather than letting the provenance stay invisible.

That asymmetry is not a tie-breaker of last resort. An inherited default and a deliberate decision look identical in code, and the only thing that distinguishes them is whether someone went and checked — which is the same failure mode that made this disagreement invisible until the two apps were wired together.

The arguments on the merits, both real:

- **For showing it.** A strategy is the most actionable thing on the plan. A parent who knows the ten-second rule their child's teacher uses can use it at home, and consistency between school and home is most of what makes a strategy work at all.
- **Against.** Planning detail written for a colleague can read as a promise, and a strategy applied at home without the context it was written in can do harm.

The second is a real risk. It is an argument for writing strategies in language a parent can act on, which is an authoring concern, not an argument for hiding them.

## Decision

**Families see a target's strategies.** `targets[].strategies` comes off SEND's staff-only exclusion list, and the guardian API serialises it. Connect's existing behaviour stands, and when the parent Inclusion page is rebuilt against the guardian API, strategies are a first-class part of each goal rather than an appended field.

**Still excluded from every parent-facing surface**, unchanged by this: `successCriteria`, `resources`, `responsibleStaff`, `reviewSummary`, `parentMeetingNotes`, `studentVoice`, template blocks, and author ids.

## Consequences

- SEND's §4.2 exclusion list is the thing that moves. Connect needs no code change — it already serialises and renders strategies.
- The stored **progress vocabulary** is a separate question and is *not* settled by this. SEND's internal gradings (`no_progress`, `regression`) are clinical terms written for a colleague and read as a verdict on a child; they must be mapped to plainer language before reaching a parent, and never rendered as a raw chip. Connect's current page does no such mapping, which is one of the reasons the old push lane is being decommissioned rather than repointed.
- Anyone who later finds `strategies` on a parent surface and takes it for an oversight should find this record first. That is most of the point of writing it down: a ruling without its reasoning becomes the next person's unexplained constraint, and a deliberate behaviour that reads as accidental gets "fixed".
