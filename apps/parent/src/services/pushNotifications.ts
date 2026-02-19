import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { deviceTokens } from '@wasil/shared'

// Check if we're running on a native platform
export const isPushSupported = () => Capacitor.isNativePlatform()

// Initialize push notifications
export async function initPushNotifications(): Promise<string | null> {
  if (!isPushSupported()) {
    console.log('Push notifications not supported on this platform')
    return null
  }

  try {
    // Request permission
    const permStatus = await PushNotifications.requestPermissions()

    if (permStatus.receive !== 'granted') {
      console.log('Push notification permission denied')
      return null
    }

    // Register with the native push notification service
    await PushNotifications.register()

    // Return a promise that resolves with the token
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, token:', token.value)

        // Send token to backend
        try {
          await deviceTokens.register({
            token: token.value,
            platform: Capacitor.getPlatform() as 'ios' | 'android',
          })
          console.log('Device token registered with backend')
        } catch (error) {
          console.error('Failed to register device token:', error)
        }

        resolve(token.value)
      })

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error)
        resolve(null)
      })
    })
  } catch (error) {
    console.error('Error initializing push notifications:', error)
    return null
  }
}

// Set up notification listeners
export function setupPushListeners(onNotification?: (notification: PushNotificationData) => void) {
  if (!isPushSupported()) return

  // Handle notifications received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push notification received:', notification)
    onNotification?.({
      title: notification.title || '',
      body: notification.body || '',
      data: notification.data,
    })
  })

  // Handle notification tap (when user taps on notification)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Push notification action performed:', action)
    const notification = action.notification
    onNotification?.({
      title: notification.title || '',
      body: notification.body || '',
      data: notification.data,
      tapped: true,
    })
  })
}

// Remove all listeners (call on cleanup)
export async function removePushListeners() {
  if (!isPushSupported()) return
  await PushNotifications.removeAllListeners()
}

// Unregister device token (call on logout)
export async function unregisterPushNotifications() {
  if (!isPushSupported()) return

  try {
    // Get current token and remove from backend
    // Note: Capacitor doesn't expose a way to get the current token after registration
    // The backend should handle token cleanup based on user logout
    await PushNotifications.removeAllListeners()
    console.log('Push notifications unregistered')
  } catch (error) {
    console.error('Error unregistering push notifications:', error)
  }
}

export interface PushNotificationData {
  title: string
  body: string
  data?: Record<string, unknown>
  tapped?: boolean
}
