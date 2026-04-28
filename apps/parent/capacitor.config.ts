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
  // For development - uncomment url for testing on physical device
  // server: {
  //   url: 'http://192.168.1.x:3004',
  // },
};

export default config;
