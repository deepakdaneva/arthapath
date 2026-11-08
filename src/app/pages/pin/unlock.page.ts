import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonInput } from '@ionic/angular/ion-input';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { NavController } from '@ionic/angular/nav-controller';
import { addIcons } from 'ionicons';
import { fingerPrint, lockClosedOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { ThrottledError, VaultService } from '../../core/crypto/vault.service';
import { BiometricService } from '../../core/crypto/biometric.service';

@Component({
  selector: 'app-unlock',
  imports: [IonContent, IonButton, IonInput, IonIcon, IonSpinner, FormsModule],
  template: `
    <ion-content>
      <div class="wrap">
        <section class="ap-card panel" aria-labelledby="unlock-title">
          <ion-icon class="icon" name="lock-closed-outline" aria-hidden="true" />
          <h1 id="unlock-title">Unlock ArthaPath</h1>
          <p class="ap-muted">{{ email() }}</p>

          @if (loadError()) {
            <p class="ap-error" role="alert">
              Could not load your encryption settings. Check your connection.
            </p>
            <ion-button expand="block" (click)="retryLoad()">Try again</ion-button>
          } @else if (offer()) {
            <div class="offer" role="region" aria-labelledby="offer-title">
              <ion-icon class="icon" name="finger-print" aria-hidden="true" />
              <h2 id="offer-title">Unlock with your fingerprint next time?</h2>
              <p class="ap-muted">
                Your PIN is kept in this phone's secure hardware and is released only after your
                fingerprint or face is recognised. You can turn this off in Settings.
              </p>
              @if (error()) {
                <p class="ap-error" role="alert">{{ error() }}</p>
              }
              <ion-button expand="block" (click)="acceptOffer()">Turn on</ion-button>
              <ion-button expand="block" fill="clear" (click)="declineOffer()">Not now</ion-button>
            </div>
          } @else if (!resetMode()) {
            @if (bio.enabled()) {
              <ion-button expand="block" fill="outline" class="bio" [disabled]="busy()" (click)="unlockWithBiometrics()">
                <ion-icon slot="start" name="finger-print" aria-hidden="true" />
                Unlock with fingerprint
              </ion-button>
            }
            <form (ngSubmit)="unlock()" novalidate>
              <ion-input
                type="password"
                label="PIN or passphrase"
                labelPlacement="floating"
                fill="outline"
                autocomplete="current-password"
                [ngModel]="pin()"
                (ngModelChange)="pin.set($event ?? '')"
                name="pin"
                [maxlength]="128"
              />
              @if (error()) {
                <p class="ap-error" role="alert">{{ error() }}</p>
              }
              <ion-button type="submit" expand="block" [disabled]="!pin() || busy()">
                @if (busy()) {
                  <ion-spinner name="crescent" aria-label="Unlocking" />
                } @else {
                  Unlock
                }
              </ion-button>
            </form>
          } @else {
            <div class="warn danger" role="region" aria-labelledby="reset-title">
              <strong id="reset-title">Forgot your PIN?</strong>
              <p>
                Your PIN cannot be recovered, and nobody can decrypt your data without it. The only
                option is to <strong>permanently delete all your encrypted financial data</strong>
                (goals, transactions, chats, AI keys) and create a new PIN. Your account and profile
                stay.
              </p>
            </div>
            <form (ngSubmit)="reset()" novalidate>
              <ion-input
                label="Type DELETE to confirm"
                labelPlacement="floating"
                fill="outline"
                autocomplete="off"
                [ngModel]="confirmText()"
                (ngModelChange)="confirmText.set($event ?? '')"
                name="confirm"
              />
              @if (error()) {
                <p class="ap-error" role="alert">{{ error() }}</p>
              }
              <ion-button type="submit" color="danger" expand="block" [disabled]="confirmText() !== 'DELETE' || busy()">
                Delete my encrypted data
              </ion-button>
            </form>
          }

          <div class="links" [hidden]="offer()">
            <button type="button" (click)="toggleReset()">
              {{ resetMode() ? 'Back to unlock' : 'Forgot PIN?' }}
            </button>
            <button type="button" (click)="signOut()">Sign out</button>
          </div>
        </section>
      </div>
    </ion-content>
  `,
  styleUrl: './pin.scss',
})
export class UnlockPage {
  private readonly vault = inject(VaultService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  readonly bio = inject(BiometricService);
  private readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('r');

  readonly email = () => this.auth.user()?.email ?? '';
  readonly pin = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly loadError = signal(false);
  readonly resetMode = signal(false);
  readonly confirmText = signal('');
  /** After a PIN unlock on Android: offer fingerprint unlock (holds the PIN until answered). */
  readonly offer = signal(false);
  private offeredPin = '';

  constructor() {
    addIcons({ lockClosedOutline, fingerPrint });
    void this.retryLoad();
  }

  async retryLoad(): Promise<void> {
    try {
      this.loadError.set(false);
      const s = await this.vault.load();
      if (s === 'no-pin') await this.router.navigateByUrl('/setup-pin', { replaceUrl: true });
      if (s === 'unlocked') await this.goBack();
      if (s === 'locked') {
        await this.bio.refresh(this.uid());
        if (this.bio.enabled()) await this.unlockWithBiometrics();
      }
    } catch {
      this.loadError.set(true);
    }
  }

  async unlock(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.vault.unlock(this.pin());
      if (this.bio.shouldOffer()) {
        this.offeredPin = this.pin();
        this.pin.set('');
        this.offer.set(true);
        return;
      }
      this.pin.set('');
      await this.goBack();
    } catch (e) {
      this.pin.set('');
      if (e instanceof ThrottledError) {
        this.error.set(`Too many incorrect attempts. Try again in ${Math.ceil(e.waitMs / 1000)} seconds.`);
      } else if (e instanceof Error && e.name === 'WrongPinError') {
        const left = 5 - this.vault.failures();
        this.error.set(
          left > 0
            ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} before a waiting period.`
            : 'Incorrect PIN. Please wait before trying again.',
        );
      } else {
        this.error.set('Could not unlock. Check your connection and try again.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Biometric prompt, then the same unlock as a typed PIN. */
  async unlockWithBiometrics(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const pin = await this.bio.readPin(this.uid());
      if (pin === null) return; // cancelled: use the PIN field
      await this.vault.unlock(pin);
      await this.goBack();
    } catch (e) {
      if (e instanceof ThrottledError) {
        this.error.set(`Too many incorrect attempts. Try again in ${Math.ceil(e.waitMs / 1000)} seconds.`);
        return;
      }
      // Saved PIN no longer works (PIN changed elsewhere, new fingerprint enrolled): forget it.
      await this.bio.disable();
      this.error.set(
        e instanceof Error && e.name === 'WrongPinError'
          ? 'Your PIN has changed. Enter it to unlock, then turn fingerprint unlock on again.'
          : 'Fingerprint unlock is no longer set up on this phone. Enter your PIN.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async acceptOffer(): Promise<void> {
    try {
      await this.bio.enable(this.uid(), this.offeredPin);
    } catch {
      this.error.set('Could not turn on fingerprint unlock. Try again, or choose Not now.');
      return;
    }
    this.offeredPin = '';
    await this.goBack();
  }

  async declineOffer(): Promise<void> {
    this.bio.setDeclined(true);
    this.offeredPin = '';
    await this.goBack();
  }

  private uid(): string {
    return this.auth.user()?.uid ?? '';
  }

  toggleReset(): void {
    this.resetMode.update((v) => !v);
    this.error.set('');
    this.confirmText.set('');
  }

  async reset(): Promise<void> {
    if (this.confirmText() !== 'DELETE') return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.vault.resetVault();
      await this.bio.disable();
      await this.router.navigateByUrl('/setup-pin', { replaceUrl: true });
    } catch {
      this.error.set('Could not delete your data. Check your connection and try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.nav.navigateRoot('/');
  }

  private goBack(): Promise<boolean> {
    // Only allow in-app return paths (no open redirects).
    const target = this.returnUrl?.startsWith('/app') ? this.returnUrl : '/app';
    return this.nav.navigateRoot(target);
  }
}
