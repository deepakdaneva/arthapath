// Firestore persistence for vault metadata and encrypted documents.
// Loaded lazily by VaultService.
import {
  collection,
  type CollectionReference,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../data/db';
import type { CryptoParams, Envelope } from './crypto';

/** Encrypted per-user collections (must match firestore.rules). */
export const ENCRYPTED_COLLECTIONS = [
  'vault',
  'goals',
  'transactions',
  'aggregates',
  'pendingQuestions',
  'contextSnapshots',
  'analyses',
  'aiKeys',
  'conversations',
] as const;

export class VaultExistsError extends Error {
  constructor() {
    super('An encryption PIN is already set up for this account');
    this.name = 'VaultExistsError';
  }
}

export class VaultChangedError extends Error {
  constructor() {
    super('Encryption settings changed on another device');
    this.name = 'VaultChangedError';
  }
}

export async function loadCryptoParams(uid: string): Promise<CryptoParams | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return (snap.get('crypto') as CryptoParams | undefined) ?? null;
}

/** First-time setup. Refuses to overwrite existing parameters (would orphan data). */
export async function saveNewCryptoParams(uid: string, params: CryptoParams): Promise<void> {
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get('crypto')) throw new VaultExistsError();
    if (snap.exists()) tx.update(ref, { crypto: params, updatedAt: serverTimestamp() });
    else tx.set(ref, { crypto: params, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

/** PIN change. Only succeeds if the stored wrapped key is the one we unwrapped. */
export async function replaceCryptoParams(uid: string, previous: CryptoParams, next: CryptoParams): Promise<void> {
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const current = (await tx.get(ref)).get('crypto') as CryptoParams | undefined;
    if (current?.wrappedDek.ct !== previous.wrappedDek.ct) throw new VaultChangedError();
    tx.update(ref, { crypto: next, updatedAt: serverTimestamp() });
  });
}

/** Path below users/{uid}: [collection, id] or deeper, e.g. [conversations, c1, messages, m1]. */
export type DocPath = string[];

export async function putEnvelope(
  uid: string,
  path: DocPath,
  env: Envelope,
  plain: Record<string, unknown> = {},
): Promise<void> {
  await setDoc(doc(db, 'users', uid, ...path), { ...env, ...plain, updatedAt: serverTimestamp() });
}

export async function getEnvelope(uid: string, path: DocPath): Promise<Envelope | null> {
  const snap = await getDoc(doc(db, 'users', uid, ...path));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { v: d['v'], iv: d['iv'], ct: d['ct'] } as Envelope;
}

export interface EnvelopeRow {
  id: string;
  env: Envelope;
  /** Plaintext query fields stored next to the envelope (for example createdAt). */
  plain: Record<string, unknown>;
}

/** Lists encrypted documents of a collection below users/{uid}, optionally ordered and limited. */
export async function listEnvelopes(
  uid: string,
  collectionPath: DocPath,
  opts: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number } = {},
): Promise<EnvelopeRow[]> {
  const col = collection(db, 'users', uid, ...collectionPath);
  const constraints = [
    ...(opts.orderBy ? [orderBy(opts.orderBy, opts.direction ?? 'asc')] : []),
    ...(opts.limit ? [limit(opts.limit)] : []),
  ];
  const snap = await getDocs(query(col, ...constraints));
  return snap.docs.map((d) => {
    const { v, iv, ct, ...plain } = d.data();
    return { id: d.id, env: { v, iv, ct } as Envelope, plain };
  });
}

export async function deleteEnvelope(uid: string, path: DocPath): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, ...path));
}

/**
 * Forgotten-PIN reset: permanently deletes every encrypted document and the
 * encryption parameters. Profile fields (name, email, photo) are kept.
 */
export async function deleteVaultData(uid: string): Promise<void> {
  for (const name of ENCRYPTED_COLLECTIONS) {
    const col = collection(db, 'users', uid, name);
    for (;;) {
      const page = await getDocs(query(col, limit(BATCH)));
      if (page.empty) break;
      if (name === 'conversations') {
        for (const c of page.docs) await deleteAll(collection(c.ref, 'messages'));
      }
      const batch = writeBatch(db);
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', uid);
    if ((await tx.get(ref)).exists()) tx.update(ref, { crypto: deleteField(), updatedAt: serverTimestamp() });
  });
}

/** Firestore batches hold at most 500 writes. */
const BATCH = 400;

async function deleteAll(col: CollectionReference): Promise<void> {
  for (;;) {
    const page = await getDocs(query(col, limit(BATCH)));
    if (page.empty) return;
    const batch = writeBatch(db);
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Account deletion: every encrypted document, then the profile document. */
export async function deleteAccountData(uid: string): Promise<void> {
  await deleteVaultData(uid);
  await deleteDoc(doc(db, 'users', uid));
}
