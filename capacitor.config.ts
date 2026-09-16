import type { CapacitorConfig } from '@capacitor/cli';
// Importing the plugin loads its `@capacitor/cli` augmentation, which types `Keyboard.resize` as this
// enum (the string literal no longer type-checks). The CLI loads this file through a CommonJS require,
// and the plugin's `main` is a CJS build, so the runtime import is safe; the value serializes to "body".
import { KeyboardResize } from '@capacitor/keyboard';

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
      resize: KeyboardResize.Body,
      resizeOnFullScreen: false,
    },
  },
};

export default config;
