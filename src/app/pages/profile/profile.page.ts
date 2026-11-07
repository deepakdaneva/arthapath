import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import { AuthService, authErrorMessage } from '../../core/auth.service';

@Component({
  selector: 'app-profile',
  imports: [IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonNote, FormsModule],
  template: `
    <ion-content>
      <div class="ap-container page">
        <h1>Profile</h1>
        <div class="ap-card">
          <ion-list lines="full">
            <ion-item>
              <ion-input
                label="Display name"
                labelPlacement="stacked"
                [(ngModel)]="name"
                [maxlength]="100"
                autocomplete="name"
              />
            </ion-item>
            <ion-item>
              <ion-label>
                <p>Email</p>
                <h3>{{ user()?.email }}</h3>
              </ion-label>
              <ion-note slot="end">{{ user()?.emailVerified ? 'Verified' : 'Not verified' }}</ion-note>
            </ion-item>
            <ion-item>
              <ion-label>
                <p>Sign-in method</p>
                <h3>{{ providerLabel() }}</h3>
              </ion-label>
            </ion-item>
          </ion-list>
          @if (message()) {
            <p role="status" class="ap-muted">{{ message() }}</p>
          }
          <ion-button [disabled]="busy()" (click)="save()">Save</ion-button>
        </div>
        <p class="ap-muted note">
          Date of birth and other personal details are added with encrypted storage, so they are never
          stored in readable form.
        </p>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-bottom: 96px;
    }
    .note {
      font-size: 0.85rem;
      margin-top: 16px;
    }
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  readonly busy = signal(false);
  readonly message = signal('');
  name = this.user()?.displayName ?? '';

  providerLabel(): string {
    // Exact provider-ID comparison (Firebase constants), not URL matching.
    const p = this.user()?.providers ?? [];
    if (p.some((id) => id === GoogleAuthProvider.PROVIDER_ID)) return 'Google';
    if (p.some((id) => id === EmailAuthProvider.PROVIDER_ID)) return 'Email and password';
    return '—';
  }

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.updateDisplayName(this.name);
      this.message.set('Saved.');
    } catch (e) {
      this.message.set(authErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
