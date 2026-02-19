import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wasil.parent',
  appName: 'Wasil Parent',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  // For development - comment out for production builds
  server: {
    // Use your local machine IP for testing on physical device
    // url: 'http://192.168.1.x:3004',
    cleartext: true,
  },
};

export default config;
