import { Injectable, computed, signal } from '@angular/core';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';
import { googleWebClientId } from '../../environments/app-config';
import { isSafePhotoUrl } from './profile-fields';

export { authErrorMessage } from './auth-errors';

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providers: string[];
}

function toAppUser(u: User): AppUser {
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL,
    emailVerified: u.emailVerified,
    providers: u.providerData.map((p) => p.providerId),
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<AppUser | null>(null);
  private readonly _ready = signal(false);
  private readyResolve!: () => void;

  /** Resolves once Firebase has restored (or ruled out) a persisted session. */
  readonly whenReady = new Promise<void>((r) => (this.readyResolve = r));
  readonly user = this._user.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly signedIn = computed(() => this._user() !== null);

  constructor() {
    onAuthStateChanged(auth, (u) => {
      this._user.set(u ? toAppUser(u) : null);
      if (u) void this.syncProfile(u);
      if (!this._ready()) {
        this._ready.set(true);
        this.readyResolve();
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await signInWithCredential(auth, await nativeGoogleCredential());
      return;
    }
    // Browsers: Firebase popup. Default scopes only: name, email, profile picture.
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async signUpWithEmail(name: string, email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    await sendEmailVerification(cred.user);
    this._user.set(toAppUser(cred.user));
    await this.syncProfile(cred.user);
  }

  async resendVerification(): Promise<void> {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email.trim());
  }

  /** Updates name and photo in Firebase Auth and the Firestore profile. */
  async updateProfileDetails(name: string, photoURL: string | null): Promise<void> {
    const u = auth.currentUser;
    if (!u) return;
    if (photoURL && !isSafePhotoUrl(photoURL)) throw new Error('invalid-photo-url');
    await updateProfile(u, { displayName: name.trim() || null, photoURL: photoURL || null });
    this._user.set(toAppUser(u));
    await this.syncProfile(u);
  }

  private syncQueue: Promise<void> = Promise.resolve();

  /**
   * Persists name, email, and photo URL to users/{uid}. Firestore loads lazily.
   * Calls run one after another (sign-up triggers two in quick succession).
   */
  private syncProfile(u: User): Promise<void> {
    this.syncQueue = this.syncQueue.then(async () => {
      try {
        const { syncUserProfile } = await import('./profile-store');
        await syncUserProfile(u);
      } catch {
        // Offline or quota exhausted: the next sign-in or profile save retries.
        // No details logged (they may contain personal data).
        console.warn('Profile sync deferred');
      }
    });
    return this.syncQueue;
  }

  /**
   * Permanently deletes the account: all Firestore data (encrypted documents
   * and profile), then the Firebase Auth user. Firebase requires a recent
   * sign-in, so the user re-authenticates first (password, or Google popup);
   * nothing is deleted if that fails.
   */
  async deleteAccount(password?: string): Promise<void> {
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    if (u.providerData.some((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID)) {
      if (Capacitor.isNativePlatform()) await reauthenticateWithCredential(u, await nativeGoogleCredential());
      else await reauthenticateWithPopup(u, new GoogleAuthProvider());
    } else {
      if (!password || !u.email) throw new FirebaseError('auth/missing-password', 'Password required');
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    }
    const { deleteAccountData } = await import('./crypto/vault-store');
    await deleteAccountData(u.uid);
    try {
      localStorage.removeItem(`arthapath.pinFailures.${u.uid}`);
    } catch {
      // Storage unavailable: nothing to clean up.
    }
    await deleteUser(u);
    await this.clearLocalData();
  }

  async signOut(): Promise<void> {
    await signOut(auth);
    await this.clearLocalData();
  }

  /**
   * Removes the offline Firestore cache (encrypted documents and the PIN
   * parameters) from this device, then reloads so the next sign-in starts
   * with a fresh database instance.
   */
  private async clearLocalData(): Promise<void> {
    const { forgetBiometricPin } = await import('./crypto/biometric.service');
    await forgetBiometricPin();
    try {
      const [{ db }, { terminate, clearIndexedDbPersistence }] = await Promise.all([import('./data/db'), import('firebase/firestore')]);
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch {
      // Cache unavailable (private mode) or already gone: nothing to clear.
    }
    location.assign('/');
  }
}

/** Google sign-in on Android: system account picker (Credential Manager), then a Firebase credential. No redirects or Dynamic Links. */
let socialLoginReady: Promise<void> | null = null;
async function nativeGoogleCredential() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  socialLoginReady ??= SocialLogin.initialize({ google: { webClientId: googleWebClientId } });
  await socialLoginReady;
  // No custom scopes: the ID token already carries name, email, and picture.
  const { result } = await SocialLogin.login({ provider: 'google', options: {} }).catch((e: unknown) => {
    // Closing the account picker is a cancel, not an error.
    if (/cancel/i.test(String((e as Error)?.message ?? e))) throw new FirebaseError('auth/popup-closed-by-user', 'Google sign-in was cancelled');
    throw e;
  });
  const idToken = 'idToken' in result ? result.idToken : null;
  if (!idToken) throw new FirebaseError('auth/popup-closed-by-user', 'Google sign-in was cancelled');
  return GoogleAuthProvider.credential(idToken);
}
