import admin from 'firebase-admin'

// Notification branding. The web icon is a root-relative path served by the
// parent app (where the FCM service worker runs), so it's the same asset every
// tenant ships and needs no absolute origin. BRAND_COLOR tints the small icon on
// native Android.
const NOTIFICATION_ICON = '/icon-192.png'
const BRAND_COLOR = '#C4506E'

let firebaseApp: admin.app.App | null = null

export async function initFirebase(): Promise<boolean> {
  if (firebaseApp) return true

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!serviceAccountPath && !serviceAccountJson) {
    console.log('Firebase not configured - push notifications disabled')
    return false
  }

  try {
    let serviceAccount: any

    if (serviceAccountJson) {
      try {
        serviceAccount = JSON.parse(serviceAccountJson)
      } catch (parseError) {
        console.error('Firebase: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON. Ensure it is valid JSON on a single line.')
        console.error('First 100 chars:', serviceAccountJson.substring(0, 100))
        return false
      }
    } else if (serviceAccountPath) {
      const fs = await import('fs')
      const content = fs.readFileSync(serviceAccountPath, 'utf8')
      serviceAccount = JSON.parse(content)
    } else {
      return false
    }

    if (!serviceAccount?.project_id || !serviceAccount?.private_key) {
      console.error('Firebase: Service account JSON missing project_id or private_key fields')
      return false
    }

    const credential = admin.credential.cert(serviceAccount)
    firebaseApp = admin.initializeApp({ credential })
    console.log('Firebase initialized for push notifications')
    return true
  } catch (error) {
    console.error('Failed to initialize Firebase:', error)
    return false
  }
}

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, string>
  /**
   * Unread count to show on the app icon. Only set it where a TRUE count is
   * known (currently inbox messages); leave it undefined everywhere else so an
   * unrelated notification never overwrites a real message count.
   */
  badge?: number
}

export async function sendPushNotification(
  tokens: string[],
  message: PushMessage
): Promise<{ successCount: number; failureCount: number; failedTokens: string[] }> {
  if (!firebaseApp) {
    if (!initFirebase()) {
      return { successCount: 0, failureCount: tokens.length, failedTokens: tokens }
    }
  }

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, failedTokens: [] }
  }

  const messaging = admin.messaging()

  // Convert data values to strings (FCM requires string values)
  const stringData: Record<string, string> = {}
  if (message.data) {
    for (const [key, value] of Object.entries(message.data)) {
      stringData[key] = String(value)
    }
  }

  // Carried through to the web service worker (firebase-messaging-sw.js), which
  // reads it to badge the installed PWA's icon while the app is closed. FCM data
  // values must be strings.
  if (message.badge !== undefined) {
    stringData.badge = String(message.badge)
  }

  const fcmMessage: admin.messaging.MulticastMessage = {
    notification: {
      title: message.title,
      body: message.body,
    },
    data: stringData,
    tokens,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'wasil_notifications',
        // Brand tint for the small icon on native Android.
        color: BRAND_COLOR,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          // Only send a badge when the caller knows the real count. Omitting the
          // key entirely (rather than sending a placeholder 1) is deliberate:
          // APNs leaves the current badge UNTOUCHED for an absent key, so a
          // non-message notification can no longer stomp a true unread count.
          ...(message.badge !== undefined ? { badge: message.badge } : {}),
        },
      },
    },
    // Web push (browser / installed PWA). Without an explicit icon the FCM SW
    // auto-displays a generic (unbranded) notification — so point it at the app
    // icon. Paths are root-relative and resolve against the parent app's origin
    // where the FCM service worker runs (same asset every tenant ships).
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        icon: NOTIFICATION_ICON,
      },
    },
  }

  try {
    const response = await messaging.sendEachForMulticast(fcmMessage)

    const failedTokens: string[] = []
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx])
        console.error('FCM send error for token:', tokens[idx], resp.error?.message)
      }
    })

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
    }
  } catch (error) {
    console.error('Failed to send FCM messages:', error)
    return { successCount: 0, failureCount: tokens.length, failedTokens: tokens }
  }
}

export async function removeInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return

  // Import prisma here to avoid circular dependencies
  const prisma = (await import('./prisma.js')).default

  await prisma.deviceToken.deleteMany({
    where: { token: { in: tokens } },
  })

  console.log(`Removed ${tokens.length} invalid device tokens`)
}
