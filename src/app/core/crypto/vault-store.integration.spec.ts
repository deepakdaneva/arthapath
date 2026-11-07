// Runs against the Firebase emulators (Auth 9099, Firestore 8080) with the real
// security rules: `npm run test:integration`. Skipped when they are not running.
import { beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { db } from '../data/db';
import { syncUserProfile } from '../profile-store';
import { changeVaultPin, createVault, decryptJson, encryptJson } from './crypto';
import {
  VaultChangedError,
  VaultExistsError,
  deleteVaultData,
  getEnvelope,
  loadCryptoParams,
  putEnvelope,
  replaceCryptoParams,
  saveNewCryptoParams,
} from './vault-store';

const FAST = { alg: 'argon2id', m: 1024, t: 1, p: 1 } as const;

async function emulatorsUp(): Promise<boolean> {
  try {
    await Promise.all([fetch('http://127.0.0.1:8080/'), fetch('http://127.0.0.1:9099/')]);
    return true;
  } catch {
    return false;
  }
}

const up = await emulatorsUp();

describe.skipIf(!up)('vault persistence (emulator, real rules)', () => {
  let user: User;

  beforeAll(async () => {
    const email = `vault-${Date.now()}@example.com`;
    user = (await createUserWithEmailAndPassword(auth, email, 'correct-horse-9')).user;
    await syncUserProfile(user);
  });

  it('creates the profile document', async () => {
    const snap = await getDoc(doc(db, 'users', user.uid));
    expect(snap.get('email')).toBe(user.email);
    expect(snap.get('crypto')).toBeUndefined();
  });

  it('sets up, refuses a second setup, encrypts, changes PIN, and resets', async () => {
    const { params, dek } = await createVault('483920', FAST);
    await saveNewCryptoParams(user.uid, params);
    expect(await loadCryptoParams(user.uid)).toEqual(params);

    const other = await createVault('999999', FAST);
    await expect(saveNewCryptoParams(user.uid, other.params)).rejects.toBeInstanceOf(VaultExistsError);

    const secret = { prefs: { lockAfterMinutes: 15 } };
    await putEnvelope(user.uid, ['vault', 'main'], await encryptJson(dek, secret));
    const raw = (await getDoc(doc(db, 'users', user.uid, 'vault', 'main'))).data()!;
    expect(JSON.stringify(raw)).not.toContain('lockAfterMinutes');
    expect(await decryptJson(dek, (await getEnvelope(user.uid, ['vault', 'main']))!)).toEqual(secret);

    const changed = await changeVaultPin('483920', 'new-pin-123', params);
    await replaceCryptoParams(user.uid, params, changed.params);
    // A stale device still holding the old parameters cannot overwrite.
    await expect(replaceCryptoParams(user.uid, params, other.params)).rejects.toBeInstanceOf(VaultChangedError);

    await deleteVaultData(user.uid);
    expect(await loadCryptoParams(user.uid)).toBeNull();
    expect(await getEnvelope(user.uid, ['vault', 'main'])).toBeNull();
    expect((await getDoc(doc(db, 'users', user.uid))).get('email')).toBe(user.email);
  });
});
