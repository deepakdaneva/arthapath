/**
 * Client-side envelope encryption. See docs/architecture/ENCRYPTION_ARCHITECTURE.md.
 *
 *   PIN --Argon2id(salt, m, t, p)--> KEK (AES-256-GCM, wrap/unwrap only, never stored)
 *   DEK (random AES-256-GCM)  --wrapped by KEK-->  users/{uid}.crypto.wrappedDek
 *   data --AES-256-GCM(DEK, random 96-bit IV)-->  { v, iv, ct }
 *
 * A successful unwrap (GCM tag check) is the PIN verifier; nothing else about
 * the PIN is stored. Uses only WebCrypto and hash-wasm (Argon2id). No custom
 * cryptography.
 */
import { argon2id } from 'hash-wasm';

export interface KdfParams {
  alg: 'argon2id';
  /** Memory in KiB. */
  m: number;
  /** Iterations. */
  t: number;
  /** Parallelism. */
  p: number;
  /** Base64 random salt (16 bytes). */
  salt: string;
}

export interface WrappedKey {
  iv: string;
  ct: string;
}

/** Non-secret metadata stored in users/{uid}.crypto. */
export interface CryptoParams {
  version: 1;
  kdf: KdfParams;
  wrappedDek: WrappedKey;
}

export interface Envelope {
  v: 1;
  iv: string;
  ct: string;
}

/** About 0.5–1 s on a mid-range phone; stored per user so it can be raised later. */
export const DEFAULT_KDF = { alg: 'argon2id', m: 65536, t: 3, p: 1 } as const;
export const MIN_PIN_LENGTH = 6;
const IV_BYTES = 12;
const SALT_BYTES = 16;

// --- encoding --------------------------------------------------------------
export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

// --- keys ------------------------------------------------------------------
export async function deriveKek(pin: string, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.alg !== 'argon2id') throw new Error('Unsupported KDF');
  const raw = await argon2id({
    password: pin.normalize('NFKC'),
    salt: fromBase64(kdf.salt),
    memorySize: kdf.m,
    iterations: kdf.t,
    parallelism: kdf.p,
    hashLength: 32,
    outputType: 'binary',
  });
  try {
    return await crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'AES-GCM', false, [
      'wrapKey',
      'unwrapKey',
    ]);
  } finally {
    raw.fill(0);
  }
}

async function wrap(dek: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { iv: toBase64(iv), ct: toBase64(ct) };
}

async function unwrap(w: WrappedKey, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(w.ct),
    kek,
    { name: 'AES-GCM', iv: fromBase64(w.iv) },
    'AES-GCM',
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export class WrongPinError extends Error {
  constructor() {
    super('Incorrect PIN');
    this.name = 'WrongPinError';
  }
}

/** First-time setup: new random DEK wrapped with a KEK derived from the PIN. */
export async function createVault(
  pin: string,
  kdf: Omit<KdfParams, 'salt'> = DEFAULT_KDF,
): Promise<{ params: CryptoParams; dek: CryptoKey }> {
  assertPin(pin);
  const fullKdf: KdfParams = { ...kdf, alg: 'argon2id', salt: toBase64(randomBytes(SALT_BYTES)) };
  const kek = await deriveKek(pin, fullKdf);
  const tmp = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrappedDek = await wrap(tmp, kek);
  // Keep only a non-extractable copy in memory for the session.
  const dek = await unwrap(wrappedDek, kek, false);
  return { params: { version: 1, kdf: fullKdf, wrappedDek }, dek };
}

/** Unlocks the DEK. Throws WrongPinError if the PIN does not match. */
export async function openVault(pin: string, params: CryptoParams): Promise<CryptoKey> {
  const kek = await deriveKek(pin, params.kdf);
  try {
    return await unwrap(params.wrappedDek, kek, false);
  } catch {
    throw new WrongPinError();
  }
}

/** Rewraps the same DEK under a new PIN and salt. Data needs no re-encryption. */
export async function changeVaultPin(
  oldPin: string,
  newPin: string,
  params: CryptoParams,
): Promise<{ params: CryptoParams; dek: CryptoKey }> {
  assertPin(newPin);
  const oldKek = await deriveKek(oldPin, params.kdf);
  let exportable: CryptoKey;
  try {
    exportable = await unwrap(params.wrappedDek, oldKek, true);
  } catch {
    throw new WrongPinError();
  }
  const kdf: KdfParams = { ...params.kdf, salt: toBase64(randomBytes(SALT_BYTES)) };
  const newKek = await deriveKek(newPin, kdf);
  const wrappedDek = await wrap(exportable, newKek);
  const dek = await unwrap(wrappedDek, newKek, false);
  return { params: { version: 1, kdf, wrappedDek }, dek };
}

export function assertPin(pin: string): void {
  if (pin.length < MIN_PIN_LENGTH) throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
}

// --- data ------------------------------------------------------------------
export async function encryptJson(dek: CryptoKey, value: unknown): Promise<Envelope> {
  const iv = randomBytes(IV_BYTES);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plain);
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptJson<T>(dek: CryptoKey, env: Pick<Envelope, 'v' | 'iv' | 'ct'>): Promise<T> {
  if (env.v !== 1) throw new Error('Unsupported envelope version');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.iv) }, dek, fromBase64(env.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Rough strength hint for the PIN screen (not a security control). */
export function pinStrength(pin: string): 'weak' | 'fair' | 'strong' {
  const classes = [/\d/, /[a-z]/, /[A-Z]/, /[^A-Za-z0-9]/].filter((r) => r.test(pin)).length;
  const repeated = /^(.)\1+$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin);
  if (pin.length < MIN_PIN_LENGTH || repeated || (classes === 1 && pin.length < 10)) return 'weak';
  if (pin.length >= 12 && classes >= 2) return 'strong';
  return 'fair';
}
