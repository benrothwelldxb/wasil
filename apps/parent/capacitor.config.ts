import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wasilconnect.vhpscoa',
  appName: 'VHPS CoA Connect',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  server: {
    androidScheme: 'https',
    allowNavigation: ['api.wasilconnect.com'],
  },
};

export default config;
