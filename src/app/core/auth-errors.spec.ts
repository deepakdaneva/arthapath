import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors';

const err = (code: string) => new FirebaseError(code, 'internal details');

describe('authErrorMessage', () => {
  it('does not reveal whether the email or the password was wrong', () => {
    const a = authErrorMessage(err('auth/user-not-found'));
    const b = authErrorMessage(err('auth/wrong-password'));
    const c = authErrorMessage(err('auth/invalid-credential'));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('maps known codes to friendly messages', () => {
    expect(authErrorMessage(err('auth/email-already-in-use'))).toContain('already exists');
    expect(authErrorMessage(err('auth/network-request-failed'))).toContain('Network');
    expect(authErrorMessage(err('auth/popup-blocked'))).toContain('popup');
  });

  it('never leaks internal error text', () => {
    expect(authErrorMessage(err('auth/some-new-code'))).toBe('Something went wrong. Please try again.');
    expect(authErrorMessage(new Error('stack trace with secrets'))).not.toContain('secrets');
  });
});
