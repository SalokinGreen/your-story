import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourstory.app',
  appName: 'Your Story',
  webDir: 'out',
  // Overrides window.fetch/XMLHttpRequest on native to route through
  // native HTTP instead of the WebView's fetch - bypasses CORS the same
  // way Tauri's http plugin does (see app/misc/platformFetch.ts), without
  // needing Capacitor-specific code there: the plain `fetch` fallback
  // just becomes CORS-free once this is on and running on-device.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
