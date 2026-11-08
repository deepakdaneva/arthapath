import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonCheckbox } from '@ionic/angular/ion-checkbox';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonInput } from '@ionic/angular/ion-input';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { NavController } from '@ionic/angular/nav-controller';
import { addIcons } from 'ionicons';
import { shieldCheckmarkOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { MIN_PIN_LENGTH, pinStrength, weakPinReason } from '../../core/crypto/crypto';
import { VaultService } from '../../core/crypto/vault.service';

@Component({
  selector: 'app-setup-pin',
  imports: [IonContent, IonButton, IonInput, IonCheckbox, IonIcon, IonSpinner, FormsModule],
  template: `
    <ion-content>
      <div class="wrap">
        <section class="ap-card panel" aria-labelledby="setup-title">
          <ion-icon class="icon" name="shield-checkmark-outline" aria-hidden="true" />
          <h1 id="setup-title">Create your encryption PIN</h1>
          <p class="ap-muted">
            Your PIN locks your financial data on this device. Everything you add is encrypted before
            it leaves your device, so not even the people running ArthaPath can read it.
          </p>
          <ul class="ap-muted">
            <li>Use at least {{ minLength }} characters. A longer passphrase is much stronger.</li>
            <li>Your PIN is never sent or stored anywhere.</li>
            <li>You will enter it each time you open ArthaPath or after it locks.</li>
          </ul>
          <p class="warn">
            <strong>There is no way to recover a forgotten PIN.</strong> If you forget it, your
            encrypted financial data is permanently lost. You would have to delete it and start again.
          </p>

          <form (ngSubmit)="submit()" novalidate>
            <ion-input
              type="password"
              label="PIN or passphrase"
              labelPlacement="floating"
              fill="outline"
              autocomplete="new-password"
              [ngModel]="pin()"
              (ngModelChange)="pin.set($event ?? '')"
              name="pin"
              [maxlength]="128"
            />
            @if (pin()) {
              <span class="strength {{ strength() }}" aria-live="polite">Strength: {{ strength() }}</span>
            }
            <ion-input
              type="password"
              label="Confirm PIN"
              labelPlacement="floating"
              fill="outline"
              autocomplete="new-password"
              [ngModel]="confirm()"
              (ngModelChange)="confirm.set($event ?? '')"
              name="confirm"
              [maxlength]="128"
            />
            @if (mismatch()) {
              <span class="ap-error" aria-live="polite">The PINs do not match.</span>
            }
            <ion-checkbox
              labelPlacement="end"
              justify="start"
              [checked]="ack()"
              (ionChange)="ack.set($event.detail.checked)"
            >
              I understand that a forgotten PIN cannot be recovered.
            </ion-checkbox>
            @if (error()) {
              <p class="ap-error" role="alert">{{ error() }}</p>
            }
            <ion-button type="submit" expand="block" [disabled]="!canSubmit() || busy()">
              @if (busy()) {
                <ion-spinner name="crescent" aria-label="Encrypting" />
              } @else {
                Create PIN
              }
            </ion-button>
          </form>
          <div class="links">
            <button type="button" (click)="signOut()">Sign out</button>
          </div>
        </section>
      </div>
    </ion-content>
  `,
  styleUrl: './pin.scss',
})
export class SetupPinPage {
  private readonly vault = inject(VaultService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  readonly minLength = MIN_PIN_LENGTH;
  readonly pin = signal('');
  readonly confirm = signal('');
  readonly ack = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly strength = computed(() => pinStrength(this.pin()));
  readonly mismatch = computed(() => this.confirm().length > 0 && this.confirm() !== this.pin());
  readonly canSubmit = computed(
    () => !weakPinReason(this.pin()) && this.pin() === this.confirm() && this.ack(),
  );

  constructor() {
    addIcons({ shieldCheckmarkOutline });
  }

  async submit(): Promise<void> {
    const weak = weakPinReason(this.pin());
    if (weak) return this.error.set(weak);
    if (this.pin() !== this.confirm()) return this.error.set('The PINs do not match.');
    if (!this.ack()) return this.error.set('Please confirm you understand the PIN cannot be recovered.');
    this.busy.set(true);
    this.error.set('');
    try {
      await this.vault.setup(this.pin());
      this.pin.set('');
      this.confirm.set('');
      await this.nav.navigateRoot('/app');
    } catch (e) {
      if (e instanceof Error && e.name === 'VaultExistsError') {
        // Set up on another device meanwhile: use that PIN.
        await this.router.navigateByUrl('/unlock', { replaceUrl: true });
        return;
      }
      this.error.set('Could not save your PIN setup. Check your connection and try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.nav.navigateRoot('/');
  }
}
