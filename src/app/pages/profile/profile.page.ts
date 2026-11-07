import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
} from '@ionic/angular';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import { AuthService, authErrorMessage } from '../../core/auth.service';
import { isSafePhotoUrl } from '../../core/profile-fields';

@Component({
  selector: 'app-profile',
  imports: [IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonNote, IonAvatar, FormsModule],
  template: `
    <ion-content>
      <div class="ap-container page">
        <h1>Profile</h1>
        <div class="ap-card">
          <div class="head">
            <ion-avatar class="avatar">
              @if (previewUrl(); as src) {
                <img [src]="src" alt="Profile picture" referrerpolicy="no-referrer" />
              } @else {
                <span>{{ initial() }}</span>
              }
            </ion-avatar>
            <div>
              <h2>{{ user()?.displayName || 'Your account' }}</h2>
              <p class="ap-muted">{{ user()?.email }}</p>
            </div>
          </div>
          <ion-list lines="full">
            <ion-item>
              <ion-input
                label="Name"
                labelPlacement="stacked"
                [ngModel]="name()"
                (ngModelChange)="name.set($event ?? '')"
                [maxlength]="100"
                autocomplete="name"
              />
            </ion-item>
            <ion-item>
              <ion-input
                label="Profile picture URL (https)"
                labelPlacement="stacked"
                type="url"
                inputmode="url"
                [ngModel]="photo()"
                (ngModelChange)="photo.set($event ?? '')"
                [maxlength]="2048"
                [class.ion-invalid]="!photoValid()"
                [class.ion-touched]="!photoValid()"
                errorText="Use an https:// image URL, or leave empty."
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
          <ion-button [disabled]="busy() || !photoValid()" (click)="save()">Save</ion-button>
        </div>
        <p class="ap-muted note">
          Your name, email, and profile picture link are saved to your ArthaPath profile so they
          appear on every device.
        </p>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-bottom: 96px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
      h2 {
        margin: 0;
        font-size: 1.2rem;
      }
      p {
        margin: 2px 0 0;
      }
    }
    .avatar {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      background: var(--ion-color-secondary);
      color: var(--ion-color-secondary-contrast);
      font-weight: 700;
      font-size: 1.4rem;
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
  readonly name = signal(this.user()?.displayName ?? '');
  readonly photo = signal(this.user()?.photoURL ?? '');

  readonly photoValid = computed(() => {
    const p = this.photo().trim();
    return p === '' || isSafePhotoUrl(p);
  });
  readonly previewUrl = computed(() => (this.photoValid() ? this.photo().trim() : '') || null);
  readonly initial = computed(() => (this.name() || this.user()?.email || '?')[0]!.toUpperCase());

  providerLabel(): string {
    // Exact provider-ID comparison (Firebase constants), not URL matching.
    const p = this.user()?.providers ?? [];
    if (p.some((id) => id === GoogleAuthProvider.PROVIDER_ID)) return 'Google';
    if (p.some((id) => id === EmailAuthProvider.PROVIDER_ID)) return 'Email and password';
    return '—';
  }

  async save(): Promise<void> {
    if (!this.photoValid()) return;
    this.busy.set(true);
    try {
      await this.auth.updateProfileDetails(this.name(), this.photo().trim() || null);
      this.message.set('Saved.');
    } catch (e) {
      this.message.set(authErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
