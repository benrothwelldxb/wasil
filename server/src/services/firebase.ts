import * as admin from 'firebase-admin'

let firebaseApp: admin.app.App | null = null

export function initFirebase(): boolean {
  if (firebaseApp) return true

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!serviceAccountPath && !serviceAccountJson) {
    console.log('Firebase not configured - push notifications disabled')
    return false
  }

  try {
    let credential: admin.credential.Credential

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      credential = admin.credential.cert(serviceAccount)
    } else if (serviceAccountPath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(serviceAccountPath)
      credential = admin.credential.cert(serviceAccount)
    } else {
      return false
    }

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
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
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
