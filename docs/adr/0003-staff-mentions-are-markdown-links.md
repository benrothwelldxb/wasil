# ADR 0003 — Staff @mentions are markdown links, not a bespoke token

- **Status:** Accepted
- **Date:** 2026-09-16
- **Deciders:** Ben Rothwell
- **Related:** Connect PR #86 (markdown in weekly updates), PR #87 (mentions). Desk's broadcast composer is the second writer of this format and must match it.

## Context

School announcements are full of the sentence "message Rob for more details". Until now it was the least useful sentence in the newsletter: the parent had to remember who Rob was, find the inbox, work out *which* Rob, and start a thread from a picker. Most never did.

Making the name tappable needs a way to write "this run of text refers to staff user X" into a body that is stored as a single `String` column and rendered by several different clients — Connect's parent app, Connect's admin preview, Desk's broadcast composer, push notification bodies, and machine translation on the way to non-English families.

The obvious move is a bespoke token: `@[Rob Davies](staff:clx123)`, or a `mentions` JSON column alongside the text, or a `<mention>` element. Each creates a second source of truth about where a tag points, and each turns into visible syntax in any renderer that has not been taught about it.

That last point is not hypothetical here. The same content already passes through at least five renderers, one of which (Google Translate, called with `format: 'text'`) actively rewrites punctuation it does not understand.

## Decision

**A staff mention is an ordinary markdown link whose target is the parent app's own compose route.**

```
[@Rob Davies](/inbox/new?staff=clx123abc)
```

No new syntax, no parallel column, no custom element.

### Why this shape

1. **It degrades to a name, never to syntax.** Any renderer that understands markdown — including ones written before this decision — shows "@Rob Davies". A bespoke token shows its own punctuation to the reader.

2. **The link target *is* the behaviour.** `/inbox/new?staff=<id>` is a real route that really opens a thread with that person. There is no lookup table mapping tags to destinations, so there is nothing to fall out of step.

3. **`stripMarkdown` already handles it.** Push bodies and list previews reduce it to "@Rob Davies" with no mention-specific code, because link-label extraction was already the first rule in that function.

4. **The id resolves; the name is a snapshot.** Staff who change their name keep working links, and text that was published keeps the name it was published with — the honest record of what the school actually sent, rather than a body that silently rewrites itself.

### The contract

| | |
|---|---|
| **Wire format** | `[@<display name>](/inbox/new?staff=<userId>)` |
| **`userId`** | A Connect `User.id` (cuid) whose `role` is `STAFF`, `ADMIN` or `SUPER_ADMIN`, in the same school |
| **Display name** | `User.name` at authoring time, with `[` and `]` stripped (they would terminate the label early) |
| **Matcher** | `/\[@([^\]]*)\]\(\/inbox\/new\?staff=([A-Za-z0-9_-]+)\)/g` |
| **Canonical implementation** | `packages/shared/src/utils/mentions.ts` (`buildMention`, `parseMentions`, `mentionStaffId`) |
| **Server twin** | `server/src/services/markdownText.ts` — the API does not depend on `@wasil/shared`, so it keeps a copy. Both carry a comment pointing at the other. |

Writers **must** pick the staff member from a real staff list rather than accept typed text. A typed `@rob` resolves to nobody, and the parent discovers that by tapping it.

Readers **must** treat an unresolvable id as ordinary text, not an error: staff leave, and old updates stay published.

### Guardrails

1. **Tagging notifies the tagged.** A tag is a promise made on someone else's behalf — it points every reader at a person who may not know. Connect sends a `STAFF_MENTION` notification on publish, and on edit sends only to the *newly* added ids, so correcting a typo is not a second round of pings.

2. **Individual addressing never widens an audience.** `sendStaffNotification` gained a `userIds` narrowing that is *intersected* with its role filter, so naming individuals cannot reach a parent. The function's existing guarantee — parents unreachable by construction — is preserved rather than re-argued.

3. **Markdown survives translation.** Google Translate pads the markers (`** Friday **`), which stops react-markdown seeing emphasis, and spaces link brackets apart, which breaks the mention outright. `repairTranslatedMarkdown` closes the padding on the way out. Without it, adding formatting would have been a visible regression for exactly the families who depend on translation.

## Consequences

- Desk's broadcast composer must write this exact format. Any divergence surfaces as literal markdown in the parent app.
- A mention deep link creates a thread with no `studentId`, so it is a general enquiry and cannot later be shared with a co-guardian. Acceptable for a whole-school announcement; wrong if this format is ever reused for child-specific content, which would need `?student=` added to the route and to this ADR.
- `POST /api/inbox/conversations` accepts any same-school staff member; the contactable-staff restriction lives only in the UI list (`isStaffContactableByParent` gates staff CCs but not creation). The deep link adds no capability a parent lacked via the API, but it does make the gap easier to reach. Tightening it is a separate decision, because it could cut off legitimate existing threads.
