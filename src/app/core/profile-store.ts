// Loaded lazily (dynamic import) so Firestore stays out of the initial bundle.
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { useEmulators } from '../../environments/app-config';
import { firebaseApp } from './firebase';
import { changedFields, toProfileFields } from './profile-fields';

export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);

/**
 * Creates or updates users/{uid} with the name, email, and photo URL from the
 * sign-in provider (Google or email/password). Writes only when something
 * changed, to save Firestore quota.
 */
export async function syncUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const next = toProfileFields(user);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, { ...next, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return;
  }
  const diff = changedFields(snap.data(), next);
  if (diff) await updateDoc(ref, { ...diff, updatedAt: serverTimestamp() });
}
