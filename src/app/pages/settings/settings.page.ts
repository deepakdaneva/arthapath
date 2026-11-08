import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonInput } from '@ionic/angular/ion-input';
import { IonItem } from '@ionic/angular/ion-item';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonList } from '@ionic/angular/ion-list';
import { IonSegment } from '@ionic/angular/ion-segment';
import { IonSegmentButton } from '@ionic/angular/ion-segment-button';
import { IonSelect } from '@ionic/angular/ion-select';
import { IonSelectOption } from '@ionic/angular/ion-select-option';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonToggle } from '@ionic/angular/ion-toggle';
import { AppPrefsService } from '../../core/app-prefs.service';
import { weakPinReason } from '../../core/crypto/crypto';
import { LOCK_OPTIONS, SessionLockService } from '../../core/crypto/session-lock.service';
import { VaultService } from '../../core/crypto/vault.service';
import { ThemeService, type ThemeMode } from '../../core/theme.service';

@Component({
  selector: 'app-settings',
  imports: [
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonButton,
    IonSpinner,
    IonToggle,
    FormsModule,
  ],
  template: `
    <ion-content>
      <div class="ap-container page">
        <h1>Settings</h1>

        <section class="ap-card" aria-labelledby="appearance">
          <h2 id="appearance">Appearance</h2>
          <ion-segment [value]="theme.mode()" (ionChange)="setMode($event.detail.value)" aria-labelledby="appearance">
            <ion-segment-button value="system"><ion-label>System</ion-label></ion-segment-button>
            <ion-segment-button value="light"><ion-label>Light</ion-label></ion-segment-button>
            <ion-segment-button value="dark"><ion-label>Dark</ion-label></ion-segment-button>
          </ion-segment>
        </section>

        <section class="ap-card" aria-labelledby="ai-privacy">
          <h2 id="ai-privacy">AI and imports</h2>
          <ion-list lines="none">
            <ion-item>
              <ion-toggle
                [checked]="app.prefs().aiCategorizeImports"
                (ionChange)="app.set({ aiCategorizeImports: $event.detail.checked })"
              >Let AI categorize imported rows</ion-toggle>
            </ion-item>
          </ion-list>
          <p class="ap-muted small">
            When on, statement rows that ArthaPath cannot categorize on this device are sent to your AI provider
            (direction, amount, and a short description with account numbers removed; no dates or balances), under
            the provider's terms. When off, imports are categorized only on this device and you fix the rest.
          </p>
        </section>

        <section class="ap-card" aria-labelledby="security">
          <h2 id="security">Security</h2>
          <ion-list lines="full">
            <ion-item>
              <ion-select
                label="Auto-lock after inactivity"
                interface="popover"
                [value]="lock.prefs().lockAfterMinutes"
                (ionChange)="setLockAfter($event.detail.value)"
              >
                @for (m of lockOptions; track m) {
                  <ion-select-option [value]="m">{{ m }} minute{{ m === 1 ? '' : 's' }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>
          <p class="ap-muted small">
            ArthaPath also locks when it stays in the background for more than
            {{ lock.prefs().backgroundGraceSeconds }} seconds, and when you sign out.
          </p>
          <ion-button fill="outline" (click)="lock.lockNow()">Lock now</ion-button>

          <h3>Change PIN</h3>
          <form (ngSubmit)="changePin()" novalidate class="pin-form">
            <ion-input type="password" label="Current PIN" labelPlacement="floating" fill="outline"
              autocomplete="current-password" name="current" [ngModel]="current()" (ngModelChange)="current.set($event ?? '')" />
            <ion-input type="password" label="New PIN" labelPlacement="floating" fill="outline"
              autocomplete="new-password" name="next" [ngModel]="next()" (ngModelChange)="next.set($event ?? '')" />
            <ion-input type="password" label="Confirm new PIN" labelPlacement="floating" fill="outline"
              autocomplete="new-password" name="confirm" [ngModel]="confirm()" (ngModelChange)="confirm.set($event ?? '')" />
            @if (pinMessage()) {
              <p role="status" [class.ap-error]="pinError()">{{ pinMessage() }}</p>
            }
            <ion-button type="submit" [disabled]="busy() || !current() || !next()">
              @if (busy()) {
                <ion-spinner name="crescent" aria-label="Updating" />
              } @else {
                Change PIN
              }
            </ion-button>
          </form>
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-bottom: 96px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 12px;
    }
    h3 {
      font-size: 1rem;
      margin: 24px 0 8px;
    }
    .small {
      font-size: 0.85rem;
    }
    .pin-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 420px;
    }
  `,
})
export class SettingsPage {
  readonly theme = inject(ThemeService);
  readonly lock = inject(SessionLockService);
  readonly app = inject(AppPrefsService);
  private readonly vault = inject(VaultService);

  readonly lockOptions = LOCK_OPTIONS;
  readonly current = signal('');
  readonly next = signal('');
  readonly confirm = signal('');
  readonly busy = signal(false);
  readonly pinMessage = signal('');
  readonly pinError = signal(false);

  setMode(v: unknown): void {
    if (v === 'system' || v === 'light' || v === 'dark') this.theme.mode.set(v as ThemeMode);
  }

  async setLockAfter(v: unknown): Promise<void> {
    if (typeof v === 'number' && (LOCK_OPTIONS as readonly number[]).includes(v)) {
      await this.lock.setLockAfter(v);
    }
  }

  async changePin(): Promise<void> {
    const fail = (m: string) => {
      this.pinError.set(true);
      this.pinMessage.set(m);
    };
    const weak = weakPinReason(this.next());
    if (weak) return fail(weak);
    if (this.next() !== this.confirm()) return fail('The new PINs do not match.');
    this.busy.set(true);
    try {
      await this.vault.changePin(this.current(), this.next());
      this.current.set('');
      this.next.set('');
      this.confirm.set('');
      this.pinError.set(false);
      this.pinMessage.set('PIN changed. Use the new PIN next time you unlock.');
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      fail(
        name === 'WrongPinError'
          ? 'Current PIN is incorrect.'
          : name === 'VaultChangedError'
            ? 'Your PIN was changed on another device. Lock and unlock with the latest PIN.'
            : 'Could not change your PIN. Check your connection and try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
