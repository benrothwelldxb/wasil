// Named scopes for partner tokens, so a token is minted with what the partner
// was AGREED to call rather than whatever someone typed on the night.
//
//   npx tsx scripts/mint-partner-token.ts beyond --preset=beyond
//
// A preset is only a pair of allowlists — the same two the middleware already
// enforces (see middleware/partnerAuth). It grants nothing a hand-written
// --prefixes/--methods pair could not; it exists so the agreed scope is written
// down once, next to the reasons, and reviewed like code.
//
// The token NAME matters beyond the scope. A group or form a partner publishes
// under an externalRef is stamped `managedBy` with that name, and only a token
// of the same name may change it afterwards. Mint Beyond's token as `beyond`,
// and mint a replacement under the same name, or the replacement is locked out
// of every trip group the old one made.

export interface PartnerScope {
  allowedPrefixes: string[]
  allowedMethods: string[]
}

export const PARTNER_SCOPE_PRESETS: Record<string, PartnerScope> = {
  // Wasil Beyond (educational visits). Each trip gets a parents' group, kept in
  // step by Beyond; Beyond posts to it, attaches its consent form, and reads the
  // answers back.
  //
  // Reads ARE allowed, unlike Active's token, because Beyond has to read: the
  // consent answers, the group as Connect holds it, and the school's post log
  // for the trip's message history. What keeps parent correspondence out of
  // reach is the prefix list — no inbox threads, no oversight, no recipients,
  // no services. `/api/partner/messages` does read the school's whole post log
  // (staff-written announcements, not parent data); `group_id` narrows it.
  //
  // `/api/partner/inbox/upload` is the ONE inbox path, and only because a trip
  // letter PDF has to be uploaded before a post can carry it. Prefixes match on
  // whole segments, so this does not open `/api/partner/inbox/threads`, and the
  // upload route is POST-only.
  beyond: {
    allowedPrefixes: [
      '/api/partner/groups',
      '/api/partner/messages',
      '/api/partner/forms',
      '/api/partner/inbox/upload',
      // Whether the school has turned Beyond on (services/partnerSwitch).
      '/api/partner/status',
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
}
