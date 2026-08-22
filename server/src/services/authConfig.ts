// Shared auth lifetimes. Kept in its own module (rather than in jwt.ts) so
// consumers like the refresh-cookie helper can read it without importing jwt.ts
// — several test suites mock jwt.ts wholesale, and importing a constant from a
// mock would fail. This module is never mocked.

// 90 days: parents open the PWA infrequently, and the refresh token now rides an
// httpOnly cookie that survives iOS/WebKit localStorage eviction, so a long-lived
// session actually holds. The refresh-cookie Max-Age tracks this.
export const REFRESH_TOKEN_EXPIRY_DAYS = 90
