// Loaded lazily (dynamic import) so Firestore stays out of the initial bundle.
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './data/db';
import { changedFields, toProfileFields } from './profile-fields';

/**
 * Creates or updates users/{uid} with the name, email, and photo URL from the
 * sign-in provider (Google or email/password). Writes only when something
 * changed, to save Firestore quota. Runs in a transaction so it can never
 * overwrite encryption parameters written concurrently by the vault.
 */
export async function syncUserProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const next = toProfileFields(user);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { ...next, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return;
    }
    const diff = changedFields(snap.data(), next);
    if (diff) tx.update(ref, { ...diff, updatedAt: serverTimestamp() });
  });
}
