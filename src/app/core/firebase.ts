import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { firebaseConfig, useEmulators } from '../../environments/firebase-config';

/** Single Firebase app instance. Firestore is initialized in Phase 4 with encryption. */
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
