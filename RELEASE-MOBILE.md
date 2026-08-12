# Mobile & PWA Release Runbook

How to ship the **parent app** (`apps/parent`) to iOS (TestFlight), Android
(direct APK now, Play Store after approval), and the web (installable PWA).

> **Status:** the app is Capacitor-ready. `capacitor.config.ts` is set
> (`appId: com.wasilconnect.vhpscoa`, `webDir: dist`, PushNotifications plugin),
> the iOS + Android native projects exist, and **native push is already wired**
> end-to-end (`src/services/pushNotifications.ts` → `POST /api/device-tokens` →
> FCM/APNs). The PWA baseline (manifest + service worker) is in place. What
> remains is **signing + distribution**, which needs your Apple/Google accounts
> and a Mac (or macOS CI) — none of it is app-code work.

---

## 0. One-time prerequisites

| Need | For | Notes |
| --- | --- | --- |
| Apple Developer account ($99/yr) | iOS / TestFlight | Enrol the school org or your account |
| A Mac with Xcode (or macOS CI) | iOS builds | Cannot archive iOS on Linux |
| **APNs Auth Key** (.p8) uploaded to Firebase → Cloud Messaging | iOS push | This is what makes iOS push work with the existing FCM backend |
| Google Play Console account ($25 once) | Play Store | Direct APK needs no account |
| **Android release keystore** (`.jks`) | Signed APK/AAB | Generate once, back it up securely, never commit it |
| Firebase project + `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) | Push | Place in the native projects |
| App icons + splash (1024² source) | Both stores | Generate with `npx @capacitor/assets generate` |

## 1. Set the production API URL (critical)

The bundled app talks to your live API. Build with it set:

```bash
# apps/parent
VITE_API_URL=https://api.wasilconnect.com npm run build
```
Confirm `capacitor.config.ts` → `server.allowNavigation` includes that host
(currently `api.wasilconnect.com`).

## 2. Version bump (every release)

- iOS: bump `CFBundleShortVersionString` (marketing) + `CFBundleVersion` (build) in `apps/parent/ios/App`.
- Android: bump `versionName` + **`versionCode`** (must increase every upload) in `apps/parent/android/app/build.gradle`.

## 3. Build web + sync native

```bash
cd apps/parent
VITE_API_URL=https://api.wasilconnect.com npm run build
npx cap sync            # copies dist/ into ios + android, updates native deps
```

## 4. Generate icons/splash (once, or when branding changes)

```bash
# put a 1024x1024 icon.png (and optional splash.png) in apps/parent/resources/
npx @capacitor/assets generate --iconBackgroundColor '#FFF8F4'
```
Replace the placeholder PWA icons (`public/wasil-icon.png`, `public/logo.png`)
with properly sized **192²/512² + maskable** exports for a clean install icon.

## 5. iOS → TestFlight (needs macOS)

```bash
npx cap open ios        # opens Xcode
```
In Xcode:
1. **Signing & Capabilities** → select your Team; add **Push Notifications** and **Background Modes → Remote notifications** capabilities.
2. Drop `GoogleService-Info.plist` into the App target.
3. Set the bundle id to `com.wasilconnect.vhpscoa` (already the default).
4. **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. In App Store Connect → TestFlight, add internal testers (instant) / external testers (needs a short Beta App Review).

Testers install via the **TestFlight app**. Verify push: sign in → the app calls
`initPushNotifications()` → a device row appears via `/api/device-tokens` → send
a test notification and confirm delivery.

## 6. Android → direct APK now, Play Store next

**Signed build:**
```bash
npx cap open android    # Android Studio
# Build → Generate Signed Bundle/APK → choose your keystore
#   • APK  → direct-install file for beta testers (sideload)
#   • AAB  → upload to Play Console
```
Or headless with Gradle (keystore via `~/.gradle/gradle.properties` or env):
```bash
cd apps/parent/android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

**Direct APK distribution (while Play review is pending):**
- Host `app-release.apk` on a trusted URL (or send directly). Testers enable
  "Install unknown apps" for their browser/files app, then tap the APK.
- This is the fastest path to Android testers and needs no Play account.

**Play Store:** create the app in Play Console → upload the **AAB** to the
**Internal testing** track (fastest review) → add testers by email. Promote to
Closed/Production after review.

## 7. PWA (web) — the third option

Already wired: `public/manifest.webmanifest` + `public/sw.js`, registered on the
web build only (`main.tsx` guards on `!Capacitor.isNativePlatform()`).
- Deploy `apps/parent/dist` behind HTTPS (required for install + SW).
- Parents can "Add to Home Screen" (installable, offline shell).
- **Push on the PWA:** native apps are the primary push channel. iOS *web* push
  works only for home-screen-installed PWAs (iOS 16.4+) and needs a separate
  Web Push/VAPID path (not built) — treat it as a future best-effort add-on; the
  `push` handler slot in `sw.js` is left ready for it.

## 8. Notification channel policy (do this before beta)

Native push reaches installed-app users, but not web-only/uninstalled parents.
Route **time-critical** categories (emergency alerts, pickup changes, absence)
through **SMS/WhatsApp** (Twilio, already wired in the outbox) + email, so a
missed push never means a missed emergency. Push is the convenience channel;
SMS/email is the guarantee.

## 9. Verify push end-to-end (per platform)

1. Sign in on the device → confirm a `DeviceToken` row exists for the user (Ops Console → parent record, or DB).
2. Trigger a notification (e.g. a test announcement) → confirm receipt in foreground and background.
3. Tap it → confirm deep-link/nav (`pushNotificationActionPerformed`).
4. Sign out → confirm the token is cleaned up (`unregisterPushNotifications`).

## 10. CI (optional, later)

- **Android:** a GitHub Actions job on `ubuntu-latest` can `npm ci`, `npm run build`, `cap sync`, `./gradlew assembleRelease` with the keystore from encrypted secrets → attach the APK as an artifact.
- **iOS:** needs a `macos-latest` runner + **fastlane** (`gym` to build, `pilot` to upload to TestFlight) with the signing cert + App Store Connect API key in secrets.
Keep signing material in CI secrets — never in the repo.
