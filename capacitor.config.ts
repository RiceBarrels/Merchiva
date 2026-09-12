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
    // Keep the WebView origin separate from the merchiva:// auth/deep-link scheme.
    iosScheme: 'capacitor',
    androidScheme: 'https',
    // Start at the static root shim. It decides whether the WebView should
    // enter /manager/ or /login after reading local auth state.
    appStartPath: '/',
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
