import { describe, expect, it } from 'vitest';
import {
  WrongPinError,
  changeVaultPin,
  createVault,
  decryptJson,
  encryptJson,
  fromBase64,
  openVault,
  pinStrength,
} from './crypto';

// Small Argon2 memory keeps tests fast; production uses DEFAULT_KDF.
const FAST = { alg: 'argon2id', m: 1024, t: 1, p: 1 } as const;
const data = { income: 15000000, goals: ['Emergency fund', 'Home loan'], note: '₹ परिवार' };

describe('vault crypto', () => {
  it('round-trips data through the DEK', async () => {
    const { dek } = await createVault('483920', FAST);
    const env = await encryptJson(dek, data);
    expect(env.v).toBe(1);
    expect(env.ct).not.toContain('Emergency');
    expect(await decryptJson(dek, env)).toEqual(data);
  });

  it('stores only non-secret parameters (no PIN, no raw key)', async () => {
    const { params } = await createVault('483920', FAST);
    const json = JSON.stringify(params);
    expect(json).not.toContain('483920');
    expect(Object.keys(params).sort()).toEqual(['kdf', 'version', 'wrappedDek']);
    expect(fromBase64(params.kdf.salt)).toHaveLength(16);
    expect(fromBase64(params.wrappedDek.iv)).toHaveLength(12);
    // 32-byte key + 16-byte GCM tag
    expect(fromBase64(params.wrappedDek.ct)).toHaveLength(48);
  });

  it('keeps the in-memory DEK non-extractable', async () => {
    const { dek } = await createVault('483920', FAST);
    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toThrow();
  });

  it('unlocks with the right PIN and decrypts earlier data', async () => {
    const { params, dek } = await createVault('483920', FAST);
    const env = await encryptJson(dek, data);
    const reopened = await openVault('483920', params);
    expect(await decryptJson(reopened, env)).toEqual(data);
  });

  it('rejects a wrong PIN', async () => {
    const { params } = await createVault('483920', FAST);
    await expect(openVault('483921', params)).rejects.toBeInstanceOf(WrongPinError);
  });

  it('detects tampered ciphertext', async () => {
    const { dek } = await createVault('483920', FAST);
    const env = await encryptJson(dek, data);
    const bytes = fromBase64(env.ct);
    bytes[0] ^= 1;
    const tampered = { ...env, ct: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptJson(dek, tampered)).rejects.toThrow();
  });

  it('uses a fresh IV for every encryption', async () => {
    const { dek } = await createVault('483920', FAST);
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) ivs.add((await encryptJson(dek, data)).iv);
    expect(ivs.size).toBe(50);
  });

  it('changes the PIN without re-encrypting data', async () => {
    const { params, dek } = await createVault('483920', FAST);
    const env = await encryptJson(dek, data);
    const changed = await changeVaultPin('483920', 'new-passphrase-9', params);
    expect(changed.params.kdf.salt).not.toBe(params.kdf.salt);
    await expect(openVault('483920', changed.params)).rejects.toBeInstanceOf(WrongPinError);
    const reopened = await openVault('new-passphrase-9', changed.params);
    expect(await decryptJson(reopened, env)).toEqual(data);
  });

  it('refuses a PIN change with the wrong current PIN', async () => {
    const { params } = await createVault('483920', FAST);
    await expect(changeVaultPin('000000', 'another-pin', params)).rejects.toBeInstanceOf(WrongPinError);
  });

  it('enforces a minimum PIN length', async () => {
    await expect(createVault('12345', FAST)).rejects.toThrow(/at least 6/);
  });
});

describe('pinStrength', () => {
  it('flags trivial PINs as weak', () => {
    expect(pinStrength('111111')).toBe('weak');
    expect(pinStrength('123456')).toBe('weak');
    expect(pinStrength('483920')).toBe('weak');
  });

  it('rates longer mixed passphrases higher', () => {
    expect(pinStrength('mango-river-42')).toBe('strong');
    expect(pinStrength('Ab3$xy')).toBe('fair');
  });
});
