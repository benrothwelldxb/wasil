# Native apps

## Approach: Capacitor

The recommended path to iOS/Android is **Capacitor** wrapping the existing web
app. Rationale: the entire UI, domain, storage and sync layers ship unchanged;
Capacitor adds native capabilities through plugins that implement interfaces the
app already depends on. No rewrite, one codebase.

The alternative (React Native) would mean reimplementing the UI for no benefit
here — the product is a form-and-chart tracker, not a graphics-heavy app.

## What native unlocks (via existing abstractions)

Each native capability slots into an interface that already exists, so the web
build degrades honestly and the native build "lights up" the same code:

| Capability | Interface / seam | Web build |
|-----------|------------------|-----------|
| Apple HealthKit | `HealthDataProvider` → `registerNativeHealthProvider()` (`src/domain/health`) | `UnsupportedHealthProvider` (honest "not available") |
| Android Health Connect | same `HealthDataProvider` | same |
| Encrypted key storage | wrapping key in Keychain / Keystore (`docs/SECURITY.md`) | not performed (no server) |
| Biometric app lock | `appLockService` → platform biometrics | simple on-open gate |
| Push notifications | notification rules already computed locally (`docs/NOTIFICATIONS-PRIVACY.md`) | in-app only |
| Store billing | `entitlementService` capability checks (`docs/SUBSCRIPTIONS.md`) | simulated on-device |

Feature flags `healthKit` / `healthConnect` are **false by default** in the web
build (`src/config/featureFlags.ts`) precisely because they only mean something in
a native wrapper.

## Integration checklist (deferred work)

1. Add Capacitor, wrap the built `dist/`.
2. Implement `HealthDataProvider` against HealthKit (Swift) and Health Connect
   (Kotlin); call `registerNativeHealthProvider()` at startup.
3. Implement client-side encryption key wrapping against Keychain/Keystore.
4. Bridge `appLockService` to `BiometricAuth`.
5. Wire push via APNs/FCM; the *payload* is a soft prompt only — the decision of
   *whether* to notify is already computed by the local rules engine.
6. Implement store billing (StoreKit 2 / Play Billing) behind `entitlementService`
   and validate receipts server-side.

The seams are all present today; native is additive, not a rewrite.
