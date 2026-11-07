import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.deepakdaneva.arthapath',
  appName: 'ArthaPath',
  webDir: 'www',
  android: {
    // Serve from https://localhost so the WebView is a secure context
    // (required by WebCrypto) and matches the API key's allowed referrers.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
