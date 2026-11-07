import { Injectable, computed, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
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
    // Popup works in browsers. Native Android sign-in needs a platform plugin
    // (planned); the WebView blocks third-party auth popups.
    // Default scopes only: name, email, profile picture. No sensitive scopes.
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

  signOut(): Promise<void> {
    return signOut(auth);
  }
}
