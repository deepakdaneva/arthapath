import { Component, computed, inject, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { EmailAuthProvider } from 'firebase/auth';
import { AuthService } from '../core/auth.service';

/** Reminds email/password users to verify their address. Google accounts are already verified. */
@Component({
  selector: 'app-verify-banner',
  imports: [IonButton],
  template: `
    @if (show()) {
      <div class="banner" role="status">
        <span>Please verify your email address. Check your inbox for the link.</span>
        <ion-button size="small" fill="clear" [disabled]="sent()" (click)="resend()">
          {{ sent() ? 'Sent' : 'Resend' }}
        </ion-button>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: 12px;
      background: rgba(var(--ion-color-warning-rgb), 0.12);
      color: var(--ion-text-color);
      font-size: 0.875rem;
    }
  `,
})
export class VerifyBannerComponent {
  private readonly auth = inject(AuthService);
  readonly sent = signal(false);
  readonly show = computed(() => {
    const u = this.auth.user();
    return !!u && !u.emailVerified && u.providers.some((id) => id === EmailAuthProvider.PROVIDER_ID);
  });

  async resend(): Promise<void> {
    try {
      await this.auth.resendVerification();
      this.sent.set(true);
    } catch {
      // Rate-limited or offline; the user can retry.
    }
  }
}
