import { initializeApp } from 'firebase/app';
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { firebaseConfig, recaptchaSiteKey, useEmulators } from '../../environments/app-config';

/** Single Firebase app instance. Firestore is initialized lazily with encryption (core/data/db.ts). */
export const firebaseApp = initializeApp(firebaseConfig);

// App Check: proves requests come from this app on a real browser (reCAPTCHA v3,
// invisible), so scripts cannot burn the free Firestore quota. Started before
// Auth and Firestore so their requests carry the token.
if (recaptchaSiteKey) {
  initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(firebaseApp);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
