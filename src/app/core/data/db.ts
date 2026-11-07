// Firestore instance. Imported only from lazily loaded modules so Firestore
// stays out of the initial bundle. The offline cache stores what Firestore
// holds: ciphertext for financial data.
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { useEmulators } from '../../../environments/app-config';
import { firebaseApp } from '../firebase';

// IndexedDB-backed cache when available (browsers, WebView); memory otherwise (tests).
export const db = initializeFirestore(
  firebaseApp,
  typeof indexedDB === 'undefined'
    ? {}
    : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
);
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
