import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.merchiva.app',
  appName: 'Merchiva',
  webDir: 'out',
  // for testing
  server: {
    url: 'http://192.168.1.108:3000',
    cleartext: true,
  },
  // // for production
  // server: {
  //   iosScheme: 'merchiva',
  //   androidScheme: 'merchiva',
  // },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      showSpinner: false,
      backgroundColor: '#ffffff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
