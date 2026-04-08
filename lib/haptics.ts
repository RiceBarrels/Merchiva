// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nativeHaptics: any = null;

function initHaptics() {
  try {
    const { Capacitor } = require('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/haptics').then(
        mod => { nativeHaptics = mod.Haptics; },
        () => {}
      );
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  initHaptics();
}

export async function hapticLight() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.impact({ style: 'LIGHT' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger(40);
    }
  } catch {}
}

export async function hapticMedium() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.impact({ style: 'MEDIUM' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger('nudge');
    }
  } catch {}
}

export async function hapticHeavy() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.impact({ style: 'HEAVY' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger([{ duration: 100, intensity: 1 }, { delay: 50, duration: 100, intensity: 1 }]);
    }
  } catch {}
}

export async function hapticSuccess() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.notification({ type: 'SUCCESS' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger('success');
    }
  } catch {}
}

export async function hapticError() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.notification({ type: 'ERROR' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger('error');
    }
  } catch {}
}

export async function hapticWarning() {
  try {
    if (nativeHaptics) {
      await nativeHaptics.notification({ type: 'WARNING' });
    } else {
      const { WebHaptics } = await import('web-haptics');
      new WebHaptics().trigger([{ duration: 60, intensity: 0.7 }, { delay: 70, duration: 60, intensity: 0.7 }]);
    }
  } catch {}
}
