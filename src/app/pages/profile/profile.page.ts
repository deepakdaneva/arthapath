import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar } from '@ionic/angular/ion-avatar';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonInput } from '@ionic/angular/ion-input';
import { IonItem } from '@ionic/angular/ion-item';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonList } from '@ionic/angular/ion-list';
import { IonNote } from '@ionic/angular/ion-note';
import { FirebaseError } from 'firebase/app';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { NavController } from '@ionic/angular/nav-controller';
import { AuthService, authErrorMessage } from '../../core/auth.service';
import { isSafePhotoUrl } from '../../core/profile-fields';

@Component({
  selector: 'app-profile',
  imports: [IonContent, IonList, IonItem, IonLabel, IonInput, IonButton, IonNote, IonAvatar, IonSpinner, FormsModule],
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

        <section class="ap-card danger-zone" aria-labelledby="delete-title">
          <h2 id="delete-title">Delete account</h2>
          <p>
            This permanently deletes your ArthaPath account: your profile, your encrypted financial
            data (goals, transactions, chats, AI keys), and your sign-in. It cannot be undone.
          </p>
          <p class="ap-muted small">
            Data you previously sent to an AI provider is held by that provider; ask them to delete
            it under their terms.
          </p>
          @if (!deleteOpen()) {
            <ion-button color="danger" fill="outline" (click)="deleteOpen.set(true)">Delete my account</ion-button>
          } @else {
            <form class="delete-form" (ngSubmit)="deleteAccount()" novalidate>
              @if (usesPassword()) {
                <ion-input
                  type="password"
                  label="Your password"
                  labelPlacement="floating"
                  fill="outline"
                  autocomplete="current-password"
                  name="password"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event ?? '')"
                />
              } @else {
                <p class="ap-muted small">You will be asked to confirm with Google.</p>
              }
              <ion-input
                label="Type DELETE to confirm"
                labelPlacement="floating"
                fill="outline"
                autocomplete="off"
                name="confirm"
                [ngModel]="confirmText()"
                (ngModelChange)="confirmText.set($event ?? '')"
              />
              @if (deleteError()) {
                <p class="ap-error" role="alert">{{ deleteError() }}</p>
              }
              <div class="row">
                <ion-button type="submit" color="danger" [disabled]="confirmText() !== 'DELETE' || deleting()">
                  @if (deleting()) {
                    <ion-spinner name="crescent" aria-label="Deleting" />
                  } @else {
                    Permanently delete
                  }
                </ion-button>
                <ion-button fill="clear" (click)="cancelDelete()" [disabled]="deleting()">Cancel</ion-button>
              </div>
            </form>
          }
        </section>
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
    .danger-zone {
      margin-top: 24px;
      border-color: rgba(var(--ion-color-danger-rgb), 0.4);
      h2 {
        margin: 0 0 8px;
        font-size: 1.1rem;
        color: var(--ion-color-danger);
      }
      p {
        line-height: 1.5;
      }
    }
    .small {
      font-size: 0.85rem;
    }
    .delete-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 420px;
    }
    .row {
      display: flex;
      gap: 8px;
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
  private readonly nav = inject(NavController);

  readonly deleteOpen = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal('');
  readonly password = signal('');
  readonly confirmText = signal('');
  readonly usesPassword = computed(
    () => !(this.user()?.providers ?? []).some((id) => id === GoogleAuthProvider.PROVIDER_ID),
  );

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

  cancelDelete(): void {
    this.deleteOpen.set(false);
    this.password.set('');
    this.confirmText.set('');
    this.deleteError.set('');
  }

  async deleteAccount(): Promise<void> {
    if (this.confirmText() !== 'DELETE') return;
    this.deleting.set(true);
    this.deleteError.set('');
    try {
      await this.auth.deleteAccount(this.password() || undefined);
      await this.nav.navigateRoot('/');
    } catch (e) {
      this.deleteError.set(
        e instanceof FirebaseError && e.code.startsWith('auth/')
          ? authErrorMessage(e)
          : 'Could not delete your account. Check your connection and try again.',
      );
    } finally {
      this.deleting.set(false);
      this.password.set('');
    }
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
