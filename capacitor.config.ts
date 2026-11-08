import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.deepakdaneva.arthapath',
  appName: 'ArthaPath',
  webDir: 'www',
  // Matches the launch screen, so there is no white flash before the app paints.
  backgroundColor: '#0b1f3a',
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
