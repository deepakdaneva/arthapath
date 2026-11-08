import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth.service';
import type { CryptoParams, Envelope } from './crypto';

export type VaultState = 'unknown' | 'no-pin' | 'locked' | 'unlocked';

/** Lazily loads crypto + Firestore code (keeps them out of the initial bundle). */
const lib = () => Promise.all([import('./crypto'), import('./vault-store')]);

const FREE_ATTEMPTS = 5;
const MAX_DELAY_MS = 15 * 60_000;

/**
 * Holds the data encryption key (DEK) in memory while unlocked. The key is a
 * non-extractable CryptoKey and is dropped on lock, sign-out, or reload. The
 * PIN and the key-encryption key are never stored.
 */
@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly auth = inject(AuthService);

  private readonly _state = signal<VaultState>('unknown');
  private dek: CryptoKey | null = null;
  private params: CryptoParams | null = null;
  private loading: Promise<VaultState> | null = null;
  private loadedFor: string | null = null;

  readonly state = this._state.asReadonly();
  readonly unlocked = computed(() => this._state() === 'unlocked');
  /** Increments on every lock so caches of decrypted data can clear themselves. */
  readonly lockEpoch = signal(0);

  constructor() {
    // Sign-out or account switch: forget everything.
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid !== this.loadedFor) this.reset();
    });
  }

  private get uid(): string {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Not signed in');
    return uid;
  }

  /** Reads the encryption parameters once per account. */
  load(): Promise<VaultState> {
    if (this._state() !== 'unknown') return Promise.resolve(this._state());
    this.loading ??= (async () => {
      const uid = this.uid;
      const [, store] = await lib();
      this.params = await store.loadCryptoParams(uid);
      this.loadedFor = uid;
      this._state.set(this.params ? 'locked' : 'no-pin');
      return this._state();
    })().finally(() => (this.loading = null));
    return this.loading;
  }

  async setup(pin: string): Promise<void> {
    const [crypto, store] = await lib();
    const { params, dek } = await crypto.createVault(pin);
    try {
      await store.saveNewCryptoParams(this.uid, params);
    } catch (e) {
      // Set up meanwhile on another device: re-read so unlock uses that PIN.
      if (e instanceof store.VaultExistsError) this._state.set('unknown');
      throw e;
    }
    this.params = params;
    this.open(dek);
  }

  /** Throws WrongPinError on a wrong PIN, or a delay error while throttled. */
  async unlock(pin: string): Promise<void> {
    // The PIN may arrive before the settings finished loading (fast typing,
    // password managers): wait for them instead of failing.
    if (!this.params) await this.load();
    if (!this.params) throw new Error('No vault');
    const wait = this.retryDelayMs();
    if (wait > 0) throw new ThrottledError(wait);
    const [crypto] = await lib();
    try {
      const dek = await crypto.openVault(pin, this.params);
      this.setFailures(0);
      this.open(dek);
    } catch (e) {
      if (e instanceof crypto.WrongPinError) this.setFailures(this.failures() + 1);
      throw e;
    }
  }

  /** Checks a PIN without changing the lock state. Throws WrongPinError. */
  async verifyPin(pin: string): Promise<void> {
    if (!this.params) throw new Error('No vault');
    const [crypto] = await lib();
    await crypto.openVault(pin, this.params);
  }

  async changePin(currentPin: string, newPin: string): Promise<void> {
    if (!this.params || !this.unlocked()) throw new Error('Unlock first');
    const [crypto, store] = await lib();
    const next = await crypto.changeVaultPin(currentPin, newPin, this.params);
    await store.replaceCryptoParams(this.uid, this.params, next.params);
    this.params = next.params;
    this.dek = next.dek;
  }

  lock(): void {
    if (this._state() !== 'unlocked') return;
    this.dek = null;
    this._state.set('locked');
    this.lockEpoch.update((n) => n + 1);
  }

  /** Forgotten PIN: permanently deletes all encrypted data and the PIN setup. */
  async resetVault(): Promise<void> {
    const [, store] = await lib();
    await store.deleteVaultData(this.uid);
    this.dek = null;
    this.params = null;
    this.setFailures(0);
    this._state.set('no-pin');
    this.lockEpoch.update((n) => n + 1);
  }

  async encrypt(value: unknown): Promise<Envelope> {
    const [crypto] = await lib();
    return crypto.encryptJson(this.requireKey(), value);
  }

  async decrypt<T>(env: Envelope): Promise<T> {
    const [crypto] = await lib();
    return crypto.decryptJson<T>(this.requireKey(), env);
  }

  /** Encrypts and stores users/{uid}/{collection}/{id}. */
  async put(path: string[], value: unknown, plain: Record<string, unknown> = {}): Promise<void> {
    const [, store] = await lib();
    await store.putEnvelope(this.uid, path, await this.encrypt(value), plain);
  }

  /** Reads and decrypts users/{uid}/{collection}/{id}; null if absent. */
  async get<T>(path: string[]): Promise<T | null> {
    const [, store] = await lib();
    const env = await store.getEnvelope(this.uid, path);
    return env ? this.decrypt<T>(env) : null;
  }

  /** Lists and decrypts a collection below users/{uid}. */
  async list<T>(
    collectionPath: string[],
    opts: import('./vault-store').ListOptions = {},
  ): Promise<{ id: string; value: T; plain: Record<string, unknown> }[]> {
    const [, store] = await lib();
    const rows = await store.listEnvelopes(this.uid, collectionPath, opts);
    return Promise.all(rows.map(async (r) => ({ id: r.id, value: await this.decrypt<T>(r.env), plain: r.plain })));
  }

  async remove(path: string[]): Promise<void> {
    const [, store] = await lib();
    await store.deleteEnvelope(this.uid, path);
  }

  // --- internals -------------------------------------------------------------
  private open(dek: CryptoKey): void {
    this.dek = dek;
    this._state.set('unlocked');
  }

  private requireKey(): CryptoKey {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  private reset(): void {
    this.dek = null;
    this.params = null;
    this.loadedFor = null;
    this._state.set('unknown');
    this.lockEpoch.update((n) => n + 1);
  }

  // Wrong-PIN throttling. A UI speed bump only: the real protection against
  // guessing is Argon2id plus Firestore rules keeping the parameters private.
  private key(): string {
    return `arthapath.pinFailures.${this.uid}`;
  }

  failures(): number {
    try {
      return Number(JSON.parse(localStorage.getItem(this.key()) ?? '{}').n ?? 0);
    } catch {
      return 0;
    }
  }

  private setFailures(n: number): void {
    try {
      if (n === 0) localStorage.removeItem(this.key());
      else localStorage.setItem(this.key(), JSON.stringify({ n, at: Date.now() }));
    } catch {
      // Storage unavailable: throttling resets on reload.
    }
  }

  retryDelayMs(): number {
    try {
      const { n = 0, at = 0 } = JSON.parse(localStorage.getItem(this.key()) ?? '{}');
      if (n < FREE_ATTEMPTS) return 0;
      const delay = Math.min(30_000 * 2 ** (n - FREE_ATTEMPTS), MAX_DELAY_MS);
      return Math.max(0, at + delay - Date.now());
    } catch {
      return 0;
    }
  }
}

export class ThrottledError extends Error {
  constructor(readonly waitMs: number) {
    super('Too many attempts');
    this.name = 'ThrottledError';
  }
}
