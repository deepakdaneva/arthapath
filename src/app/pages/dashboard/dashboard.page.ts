import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/ion-content';
import { AuthService } from '../../core/auth.service';
import { VerifyBannerComponent } from '../../shell/verify-banner.component';

@Component({
  selector: 'app-dashboard',
  imports: [IonContent, RouterLink, VerifyBannerComponent],
  template: `
    <ion-content>
      <div class="ap-container page">
        <app-verify-banner />
        <p class="ap-muted greeting">Hello{{ firstName() ? ', ' + firstName() : '' }}</p>

        <!-- No financial profile yet: onboarding call to action instead of an empty dashboard. -->
        <section class="empty" aria-labelledby="start-title">
          <a class="orb" routerLink="/app/chat" aria-describedby="start-sub">
            <span class="ring" aria-hidden="true"></span>
            <span class="ring two" aria-hidden="true"></span>
            <span id="start-title" class="orb-text">Let's start with your financial goals.</span>
          </a>
          <p id="start-sub" class="ap-muted sub">
            Tell ArthaPath about your income, expenses, family, and goals in your own words. Your
            dashboard builds itself from the conversation.
          </p>
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-top: 8px;
      padding-bottom: 96px;
    }
    .greeting {
      margin: 8px 0 0;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding-top: 6vh;
    }
    .orb {
      position: relative;
      width: min(68vw, 280px);
      aspect-ratio: 1;
      border-radius: 50%;
      display: grid;
      place-items: center;
      padding: 32px;
      background: var(--ap-hero);
      color: #fff;
      text-decoration: none;
      box-shadow: 0 20px 60px rgba(var(--ion-color-secondary-rgb), 0.35);
      transition: transform 0.2s ease;
    }
    .orb:hover {
      transform: scale(1.03);
    }
    .orb-text {
      position: relative;
      font-size: clamp(1.1rem, 4.5vw, 1.4rem);
      font-weight: 700;
      line-height: 1.3;
    }
    .ring {
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 2px solid rgba(var(--ion-color-secondary-rgb), 0.5);
      animation: pulse 2.8s ease-out infinite;
    }
    .ring.two {
      animation-delay: 1.4s;
    }
    .sub {
      max-width: 440px;
      margin-top: 32px;
      line-height: 1.6;
    }
    @keyframes pulse {
      from {
        transform: scale(0.95);
        opacity: 0.9;
      }
      to {
        transform: scale(1.25);
        opacity: 0;
      }
    }
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  readonly firstName = computed(() => this.auth.user()?.displayName?.split(' ')[0] ?? '');
}
