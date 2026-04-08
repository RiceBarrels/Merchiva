const defaultInsets = { top: 0, bottom: 0, left: 0, right: 0 };
let cachedInsets = defaultInsets;
let cachedCornerRadius = 0;

if (typeof window !== 'undefined') {
  try {
    import('capacitor-plugin-safe-area').then(({ SafeArea }) => {
      SafeArea.getSafeAreaInsets()
        .then((result: { insets: typeof defaultInsets }) => { cachedInsets = result.insets; })
        .catch(() => {});
    }).catch(() => {});
  } catch {}

  // Get device screen corner radius via native plugin
  try {
    import('@capacitor/core').then(({ registerPlugin }) => {
      const ScreenCornerRadius = registerPlugin<{ get(): Promise<{ radius: number }> }>('ScreenCornerRadius');
      ScreenCornerRadius.get()
        .then(({ radius }) => { cachedCornerRadius = radius; })
        .catch(() => {});
    }).catch(() => {});
  } catch {}
}

export function getSafeAreaInsets() {
  return cachedInsets;
}

export function getScreenCornerRadius() {
  return cachedCornerRadius;
}
