import { describe, expect, it } from 'vitest';
import { changedFields, isSafePhotoUrl, toProfileFields } from './profile-fields';

describe('isSafePhotoUrl', () => {
  it('accepts https only', () => {
    expect(isSafePhotoUrl('https://lh3.googleusercontent.com/a/abc')).toBe(true);
    expect(isSafePhotoUrl('http://example.com/a.png')).toBe(false);
    expect(isSafePhotoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePhotoUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafePhotoUrl('not a url')).toBe(false);
  });

  it('rejects URLs longer than the stored limit', () => {
    expect(isSafePhotoUrl('https://x.io/' + 'a'.repeat(2048))).toBe(false);
  });
});

describe('toProfileFields', () => {
  it('maps Google profile data', () => {
    expect(
      toProfileFields({
        displayName: ' Asha Rao ',
        email: 'asha@example.com',
        photoURL: 'https://lh3.googleusercontent.com/a/x',
      }),
    ).toEqual({
      displayName: 'Asha Rao',
      email: 'asha@example.com',
      photoURL: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it('omits empty names and drops unsafe photo URLs', () => {
    expect(toProfileFields({ displayName: '  ', email: 'a@b.co', photoURL: 'http://x/y.png' })).toEqual({
      email: 'a@b.co',
      photoURL: null,
    });
  });

  it('truncates names to the rules limit', () => {
    expect(toProfileFields({ displayName: 'n'.repeat(150), email: null, photoURL: null }).displayName).toHaveLength(100);
  });
});

describe('changedFields', () => {
  const next = { displayName: 'Asha', email: 'a@b.co', photoURL: null };

  it('returns null when nothing changed (no write)', () => {
    expect(changedFields({ displayName: 'Asha', email: 'a@b.co' }, next)).toBeNull();
  });

  it('returns only the changed fields', () => {
    expect(changedFields({ displayName: 'Old', email: 'a@b.co', photoURL: null }, next)).toEqual({
      displayName: 'Asha',
    });
  });
});
