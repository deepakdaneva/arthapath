// Firestore security rules tests. Run with `npm test` (starts the emulator).
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const ALICE = 'alice';
const BOB = 'bob';

const envelope = (extra = {}) => ({
  v: 1,
  iv: 'AAAAAAAAAAAAAAAA', // 16 base64 chars = 12 bytes
  ct: 'ciphertext-base64',
  updatedAt: serverTimestamp(),
  ...extra,
});

const crypto = {
  version: 1,
  kdf: { alg: 'argon2id', m: 65536, t: 3, p: 1, salt: 'c2FsdHNhbHRzYWx0c2FsdA==' },
  wrappedDek: { iv: 'AAAAAAAAAAAAAAAA', ct: 'x'.repeat(64) },
};

const userDoc = (extra = {}) => ({
  displayName: 'Alice',
  email: 'alice@example.com',
  photoURL: 'https://example.com/a.png',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-arthapath',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

describe('users/{uid}', () => {
  test('owner can create and read own user doc', async () => {
    const ref = doc(db(ALICE), 'users', ALICE);
    await assertSucceeds(setDoc(ref, userDoc({ crypto })));
    await assertSucceeds(getDoc(ref));
  });

  test('unauthenticated access denied', async () => {
    await assertFails(getDoc(doc(db(null), 'users', ALICE)));
    await assertFails(setDoc(doc(db(null), 'users', ALICE), userDoc()));
  });

  test('other user cannot read or write', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE), userDoc()));
    await assertFails(getDoc(doc(db(BOB), 'users', ALICE)));
    await assertFails(setDoc(doc(db(BOB), 'users', ALICE), userDoc()));
    await assertFails(deleteDoc(doc(db(BOB), 'users', ALICE)));
  });

  test('unknown fields rejected', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE), userDoc({ income: 150000 })));
  });

  test('non-https photoURL rejected', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE), userDoc({ photoURL: 'javascript:alert(1)' })));
  });

  test('crypto must be argon2id with expected shape', async () => {
    const bad = { ...crypto, kdf: { ...crypto.kdf, alg: 'md5' } };
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE), userDoc({ crypto: bad })));
    const extra = { ...crypto, pin: '123456' };
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE), userDoc({ crypto: extra })));
  });

  test('createdAt cannot change on update', async () => {
    const ref = doc(db(ALICE), 'users', ALICE);
    await assertSucceeds(setDoc(ref, userDoc()));
    await assertFails(updateDoc(ref, { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { displayName: 'A', updatedAt: serverTimestamp() }));
  });
});

describe('encrypted subcollections', () => {
  test('owner can write encrypted envelope to goals, aiKeys, vault/main', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'goals', 'g1'), envelope()));
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'aiKeys', 'k1'), envelope()));
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'vault', 'main'), envelope()));
  });

  test('plaintext financial fields rejected', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'goals', 'g1'), envelope({ target: 500000 })));
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'aiKeys', 'k1'), envelope({ key: 'secret' })));
  });

  test('envelope must be complete and versioned', async () => {
    const { ct, ...noCt } = envelope();
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'goals', 'g1'), noCt));
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'goals', 'g1'), envelope({ v: 2 })));
  });

  test('vault only allows the main document', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'vault', 'other'), envelope()));
  });

  test('unknown collections denied', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'random', 'x'), envelope()));
    await assertFails(setDoc(doc(db(ALICE), 'public', 'x'), { a: 1 }));
  });

  test('other user cannot read encrypted docs', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'goals', 'g1'), envelope()));
    await assertFails(getDoc(doc(db(BOB), 'users', ALICE, 'goals', 'g1')));
  });

  test('transactions require valid month bucket and occurredAt', async () => {
    const ref = doc(db(ALICE), 'users', ALICE, 'transactions', 't1');
    await assertSucceeds(setDoc(ref, envelope({ month: '2026-11', occurredAt: Timestamp.now() })));
    await assertFails(setDoc(ref, envelope({ month: '2026-13', occurredAt: Timestamp.now() })));
    await assertFails(setDoc(ref, envelope({ month: '2026-11' })));
    await assertFails(setDoc(ref, envelope({ month: '2026-11', occurredAt: Timestamp.now(), amount: 500 })));
  });

  test('aggregate doc id must be a month', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'users', ALICE, 'aggregates', '2026-11'), envelope()));
    await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'aggregates', 'all'), envelope()));
  });

  test('messages are append-only', async () => {
    const ref = doc(db(ALICE), 'users', ALICE, 'conversations', 'c1', 'messages', 'm1');
    await assertSucceeds(setDoc(ref, envelope({ createdAt: serverTimestamp() })));
    await assertFails(updateDoc(ref, { ct: 'changed', updatedAt: serverTimestamp() }));
  });

  test('pending question status restricted', async () => {
    const ref = doc(db(ALICE), 'users', ALICE, 'pendingQuestions', 'q1');
    await assertSucceeds(setDoc(ref, envelope({ status: 'open' })));
    await assertFails(setDoc(ref, envelope({ status: 'whatever' })));
  });
});
