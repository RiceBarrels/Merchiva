import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizops.app',
  appName: 'BizOps',
  webDir: 'out',
  server: {
    url: 'https://project-management-phi-red.vercel.app',
    cleartext: true,
  },
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
