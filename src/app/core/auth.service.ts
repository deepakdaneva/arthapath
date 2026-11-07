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
      if (!this._ready()) {
        this._ready.set(true);
        this.readyResolve();
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    // Popup works in browsers. Native Android sign-in needs a platform plugin
    // (planned); the WebView blocks third-party auth popups.
    const provider = new GoogleAuthProvider();
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
  }

  async resendVerification(): Promise<void> {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email.trim());
  }

  async updateDisplayName(name: string): Promise<void> {
    const u = auth.currentUser;
    if (!u) return;
    await updateProfile(u, { displayName: name.trim() || null });
    this._user.set(toAppUser(u));
  }

  signOut(): Promise<void> {
    return signOut(auth);
  }
}
