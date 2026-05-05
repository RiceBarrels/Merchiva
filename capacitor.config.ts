import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.merchiva.app',
  appName: 'Merchiva',
  webDir: 'out',
  // // for testing
  // server: {
  //   url: 'http://192.168.1.147:3001',
  //   cleartext: true,
  // },
  // for production
  server: {
    iosScheme: 'merchiva',
    androidScheme: 'merchiva',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      showSpinner: true,
      backgroundColor: '#ffffff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: false,
    },
  },
};

export default config;
