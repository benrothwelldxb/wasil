# ADR 0001 — Children's pickup addresses at rest in Connect

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** Ben Rothwell
- **Related:** Desk [ADR 0008](../../../wasildesk/docs/adr/0008-transport-pupil-address-at-rest.md) (the Desk-side permission this answers), Desk Transport PRD §6 (the push contract), `PARENT-AUTH.md` (the guardian graph every read is scoped through).

## Context

Desk's ADR 0008 permits the Transport module to hold, at rest, a named child, their home address, and the minute they will be standing outside it. It fences that permission carefully to Desk's `transport_*` tables, with hard-delete retention, a two-tier read where the wider tier never sees an address, and a metadata-only audit log.

Guardrail 8 of that ADR then pushes the same data to Connect, and says of it only that reads must be scoped to the requesting guardian's own children.

That covers egress. It does not cover **retention or staff access on this side**, and those are where the exposure actually sits. Taken literally, the PRD's contract — a full replacement of every route, stop and pupil for a leg — would make Connect a second at-rest copy of the school's complete list of children's home addresses, holding it under none of the guardrails that made the Desk copy acceptable.

Two things are true only here, and they are why this needs its own decision rather than an inherited clause:

1. **Connect's admin app is a general staff tool.** Desk restricts this data to a transport manager and admin, and gives reception the roster without addresses. Connect has no equivalent tier. Any model added here is one `include` away from a staff screen, and the restraint would live in code review rather than in the design.

2. **Connect models guardians; Desk deliberately does not.** So a case Desk structurally cannot see is visible here: a child with two linked guardians living at different addresses after a separation. Connect shows a child's data to every linked guardian, so "your child's stop: Villa 27, 06:52" discloses one parent's home address, and a predictable daily time, to the other.

## Decision

**Connect stores one flattened assignment row per child per leg — route name, stop name, time — and exposes it through exactly one guardian-scoped read. There is no staff-facing transport surface in Connect at all.**

### Guardrails

1. **Parent-facing only.** No admin screen, no staff route, no export, no inclusion in any existing staff query. If no staff read path exists, Desk's two-tier problem cannot arise here, and the restraint is structural rather than a convention someone has to remember.

2. **Flattened, not normalised.** Routes and stops are *not* modelled as entities. A `TransportStop` table would be a queryable directory of the home address of every child in the school — precisely the artefact worth not having. One row per (student, leg) means an address exists only as many times as children are collected from it, and there is no shape to enumerate.

3. **One read, and it takes no arguments.** `GET /api/transport/mine` returns the requesting guardian's own children. There is no stop list, no route list, no school-wide view, and no parameter that could widen it. A read path that cannot express "someone else's child" cannot leak one.

4. **Hard delete on replacement.** The push is a full replacement per leg and *deletes* rows absent from the payload. There is no `active` flag and no soft delete, for the reason Desk gives: a soft-deleted row is a retained home address wearing a disguise. Cascades on `Student` delete.

5. **No coordinates, ever.** Text only, as Desk holds it. Adding a map is a new ADR, not an enhancement.

6. **Stop names may be suppressed per assignment.** `hideStopName` omits the address from the guardian read, leaving route and time. Connect cannot detect which families need it — it holds no household data, and inferring from "two guardians" would suppress for the many ordinary families who share an address. The school knows and Desk holds the roster, so the flag travels in the push and the decision sits with the people who have the information.

7. **Metadata-only logging.** Counts, never an address or a child's name.

8. **Absent is not empty.** A failed read renders as an error, never as "no bus". Desk's PRD asks for this because a screen that silently shows nothing is worse than one that admits it is broken; Connect has the same bug in its history and the same risk here.

## Consequences

**Positive**
- Parents get their own child's bus details, which is the point of the push.
- The flattening is a real minimisation, not a modelling shortcut: Connect never holds an enumerable stop directory.
- The separated-guardian case has an answer, and it sits with the party that can actually judge it.

**Negative / accepted trade-off**
- Children's home addresses are at rest in a second system. Mitigated by: no staff surface, no enumerable shape, one argument-free read, hard-delete retention, and text-only storage.
- Connect cannot answer any historical transport question. Accepted, matching Desk.
- Guardrail 6 depends on Desk sending `hide_stop_name`. Until it does, every linked guardian of a child sees the stop name. **This is the residual risk and it is not closed by this ADR** — it is closed when Desk adds the field.

## Alternatives considered

- **Store route/stop entities mirroring Desk's model.** Rejected: it would give Connect a queryable address book of the school's children for no parent-facing benefit. A parent needs one line, not a graph.
- **Suppress the stop name whenever a child has more than one linked guardian.** Rejected as too blunt — most families have two guardians at one address, and the feature would be degraded for the majority to address a minority the system cannot identify.
- **Have Desk push only to guardians it names.** Rejected: Desk does not model guardians, by its own design, and teaching it to would widen ADR 0008 rather than narrow this.
- **Do not push to Connect at all; parents ask the office.** Rejected: the transport team's stated goal is that parents stop asking, and the spreadsheet this replaces was itself circulated by email.
