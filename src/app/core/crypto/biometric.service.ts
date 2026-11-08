import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Fingerprint or face unlock on Android, tied to the PIN.
 *
 * The PIN is stored in the Android Keystore under a key that requires
 * biometric authentication and is invalidated when a new fingerprint or face
 * is enrolled (AccessControl.BIOMETRY_CURRENT_SET). Unlocking reads it back
 * only after a successful biometric prompt and then unlocks exactly as if the
 * user had typed it, so the PIN stays the only way into the encrypted data.
 * Nothing is stored on the web.
 */
const SERVER = 'io.github.deepakdaneva.arthapath.pin';
const DECLINED = 'arthapath.biometric.declined';

const plugin = () => import('@capgo/capacitor-native-biometric');

/** Deletes the saved PIN from this phone (sign-out, account deletion). */
export async function forgetBiometricPin(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { NativeBiometric } = await plugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    // Nothing saved.
  }
}

@Injectable({ providedIn: 'root' })
export class BiometricService {
  readonly native = Capacitor.isNativePlatform();
  /** Device has strong biometrics enrolled. */
  readonly available = signal(false);
  /** A PIN is saved for this account. */
  readonly enabled = signal(false);

  /** Reads availability and whether a PIN is saved for `uid`. */
  async refresh(uid: string): Promise<void> {
    if (!this.native) return;
    try {
      const { NativeBiometric } = await plugin();
      const a = await NativeBiometric.isAvailable();
      this.available.set(a.isAvailable);
      // The saved PIN's account is checked when it is read (readPin).
      this.enabled.set(!!uid && a.isAvailable && (await NativeBiometric.isCredentialsSaved({ server: SERVER })).isSaved);
    } catch {
      this.available.set(false);
      this.enabled.set(false);
    }
  }

  /** Saves the PIN behind biometrics. The system may show a fingerprint prompt. */
  async enable(uid: string, pin: string): Promise<void> {
    const { NativeBiometric, AccessControl } = await plugin();
    await NativeBiometric.setCredentials({
      server: SERVER,
      username: uid,
      password: pin,
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      title: 'Turn on fingerprint unlock',
      negativeButtonText: 'Cancel',
    });
    this.enabled.set(true);
    this.setDeclined(false);
  }

  /**
   * Shows the biometric prompt and returns the saved PIN, or null when the user
   * cancels. Throws when the saved PIN cannot be read any more (for example a
   * new fingerprint was enrolled); callers then fall back to the PIN.
   */
  async readPin(uid: string): Promise<string | null> {
    const { NativeBiometric, BiometricAuthError } = await plugin();
    try {
      const c = await NativeBiometric.getSecureCredentials({
        server: SERVER,
        title: 'Unlock ArthaPath',
        subtitle: 'Use your fingerprint or face',
        negativeButtonText: 'Use PIN',
      });
      if (c.username !== uid) throw new Error('Saved for another account');
      return c.password;
    } catch (e) {
      const code = Number((e as { code?: unknown })?.code);
      if ([BiometricAuthError.USER_CANCEL, BiometricAuthError.SYSTEM_CANCEL, BiometricAuthError.APP_CANCEL, BiometricAuthError.USER_FALLBACK].includes(code)) {
        return null;
      }
      throw e;
    }
  }

  /** Removes the saved PIN (sign-out, PIN reset, turned off, or no longer valid). */
  async disable(): Promise<void> {
    this.enabled.set(false);
    await forgetBiometricPin();
  }

  /** Whether to offer fingerprint unlock after a PIN unlock. */
  shouldOffer(): boolean {
    return this.native && this.available() && !this.enabled() && !this.declined();
  }

  setDeclined(v: boolean): void {
    try {
      if (v) localStorage.setItem(DECLINED, '1');
      else localStorage.removeItem(DECLINED);
    } catch {
      // Storage unavailable: the offer may repeat.
    }
  }

  private declined(): boolean {
    try {
      return localStorage.getItem(DECLINED) === '1';
    } catch {
      return false;
    }
  }
}
