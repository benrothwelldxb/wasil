# Subscriptions & entitlements

## Principle: the paywall never blocks your data or your understanding

The hard rule (`src/domain/entitlements/entitlements.ts`): **core capabilities are
never paywalled.** `ALWAYS_FREE = ['timeline', 'cloud_sync', 'partner_sharing']`,
and export/deletion aren't even modelled as capabilities — they are
unconditional. Nothing about payment can stop a user recording, viewing, backing
up, understanding, exporting, or deleting their data.

Plus adds *advanced conveniences only*:
`['advanced_patterns', 'since_comparison', 'monthly_summary', 'ai_summaries',
'unlimited_reports']`.

## Capability model

Components ask **"can I do X?"**, never "which tier / which store?":

```ts
entitlementService.can('advanced_patterns')  // -> boolean
```

`hasCapability(entitlement, capability, flags, now)`:

1. Feature-flag gate first (a disabled flag hides a capability entirely during
   rollout — used for `ai_summaries`, `partner_sharing`, `cloud_sync`).
2. `ALWAYS_FREE` → always `true`.
3. If subscriptions are disabled entirely (`flags.subscriptions = false`), Plus
   conveniences are simply free.
4. Otherwise check the effective tier.

`effectiveTier` accounts for expiry and a billing **grace period** (`validUntil`,
`inGracePeriod`) so a lapsed renewal doesn't abruptly lock features mid-cycle.

## Billing (deferred)

`Entitlement.source` enumerates the intended real sources: `apple`, `google`,
`promo`, `local`, `free`. Production:

- **StoreKit 2** (iOS) / **Play Billing** (Android) own the purchase UX and money.
- Receipts are validated **server-side**; the server writes the authoritative
  `entitlements` row, which the client mirrors. A tampered client can at most
  grant itself Plus conveniences — and since capabilities never gate data, that
  exposes nothing (`docs/THREAT-MODEL.md` T8).
- **Restore** re-checks the store's existing purchase.

In this web build billing is **simulated on-device** (`entitlementService.setTier`)
and the Plus screen says so. No real payment, no secrets.

## Copy

The Plus screen leads with "elowa is fully usable for free" and lists what stays
free forever. No dark patterns, no countdown timers, no manipulative retention
language.
