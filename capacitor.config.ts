import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizops.app',
  appName: 'BizOps',
  webDir: 'out',
  // Local mode: no server URL, loads from webDir
  // To use Vercel: uncomment server.url below
  // server: {
  //   url: 'https://project-management-phi-red.vercel.app',
  //   cleartext: true,
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
