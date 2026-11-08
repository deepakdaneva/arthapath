import { Component, computed, inject, signal } from '@angular/core';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { NavController } from '@ionic/angular/nav-controller';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, flagOutline, pieChartOutline, receiptOutline, shieldCheckmarkOutline, trendingUp } from 'ionicons/icons';

/** First-launch introduction in the Android app, shown before sign-in. */
export const WELCOME_SEEN = 'arthapath.welcome.seen'; // also read by appStartGuard

interface Slide {
  icon: string;
  title: string;
  text: string;
  example?: string;
}

const SLIDES: Slide[] = [
  { icon: 'trending-up', title: 'Your money. Your goals. Your future.', text: 'ArthaPath turns your income, spending, and goals into a clear plan you can follow every day.' },
  { icon: 'shield-checkmark-outline', title: 'Private by design', text: 'Everything is encrypted on your phone with your PIN before it is saved. Nobody else can read it, not even us.' },
  { icon: 'pie-chart-outline', title: 'See where it goes', text: 'A live dashboard: health score, where each rupee goes, net worth, and trends. Tap any figure to see why.' },
  { icon: 'receipt-outline', title: 'Log it in plain words', text: 'Type what happened, or import a bank statement. It is read on your phone and you review it first.', example: 'Spent ₹500 on groceries via UPI' },
  { icon: 'chatbubbles-outline', title: 'Your AI, your key', text: 'Ask questions and get an analysis with your own AI key. ID numbers and passwords are removed before anything is sent.' },
  { icon: 'flag-outline', title: 'Stay on track', text: 'Early warnings when a goal falls behind or spending runs over plan, before it is too late.' },
];

const SLIDE_MS = 5000;

@Component({
  selector: 'app-welcome',
  imports: [IonContent, IonButton, IonIcon],
  template: `
    <ion-content [fullscreen]="true">
      <div class="story" [class.paused]="paused()">
        <div class="bars" aria-hidden="true">
          @for (s of slides; track $index) {
            <span class="bar">
              <span
                class="fill"
                [class.done]="$index < index()"
                [class.active]="$index === index()"
                [style.animation-duration.ms]="slideMs"
                (animationend)="next()"
              ></span>
            </span>
          }
        </div>
        @if (!last()) {
          <button type="button" class="skip" (click)="finish()">Skip</button>
        }

        <!-- Tap left/right to go back/forward; press and hold to pause. -->
        <button type="button" class="zone prev" aria-label="Previous" (click)="prev()" (pointerdown)="paused.set(true)" (pointerup)="paused.set(false)" (pointerleave)="paused.set(false)"></button>
        <button type="button" class="zone next" aria-label="Next" (click)="next()" (pointerdown)="paused.set(true)" (pointerup)="paused.set(false)" (pointerleave)="paused.set(false)"></button>

        @for (s of slides; track $index) {
          @if ($index === index()) {
            <section class="slide" [attr.aria-label]="'Slide ' + ($index + 1) + ' of ' + slides.length" aria-live="polite">
              <div class="art"><ion-icon [name]="s.icon" aria-hidden="true" /></div>
              <h1>{{ s.title }}</h1>
              <p>{{ s.text }}</p>
              @if (s.example) {
                <p class="example">“{{ s.example }}”</p>
              }
            </section>
          }
        }

        @if (last()) {
          <div class="cta">
            <ion-button expand="block" (click)="finish('signup')">Create account</ion-button>
            <ion-button expand="block" fill="clear" class="signin" (click)="finish('signin')">I already have an account</ion-button>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: radial-gradient(120% 80% at 50% 0%, #134e4a 0%, #0b1f3a 55%, #07111f 100%);
      color: #fff;
    }
    .story {
      position: relative;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      padding: 12px 20px 24px;
    }
    .bars {
      display: flex;
      gap: 4px;
      position: relative;
      z-index: 2;
    }
    .bar {
      flex: 1;
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.25);
      overflow: hidden;
    }
    .fill {
      display: block;
      height: 100%;
      width: 0;
      background: #fff;
    }
    .fill.done {
      width: 100%;
    }
    .fill.active {
      animation: grow linear forwards;
    }
    .paused .fill.active {
      animation-play-state: paused;
    }
    @keyframes grow {
      from { width: 0; }
      to { width: 100%; }
    }
    .skip {
      position: absolute;
      top: 22px;
      right: 16px;
      z-index: 3;
      background: none;
      border: 0;
      color: rgba(255, 255, 255, 0.85);
      font: inherit;
      font-weight: 600;
      padding: 8px;
    }
    .zone {
      position: absolute;
      top: 60px;
      bottom: 140px;
      z-index: 1;
      background: none;
      border: 0;
      padding: 0;
    }
    .zone.prev { left: 0; width: 35%; }
    .zone.next { right: 0; width: 65%; }
    .slide {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      gap: 12px;
      animation: rise 0.45s ease-out;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: none; }
    }
    .art {
      align-self: center;
      width: 132px;
      height: 132px;
      border-radius: 36px;
      display: grid;
      place-items: center;
      margin-bottom: 16px;
      background: linear-gradient(145deg, rgba(20, 184, 166, 0.35), rgba(94, 234, 212, 0.08));
      box-shadow: 0 0 0 1px rgba(94, 234, 212, 0.25), 0 18px 48px rgba(20, 184, 166, 0.25);
      ion-icon { font-size: 64px; color: #5eead4; }
    }
    h1 {
      margin: 0;
      color: #fff;
      font-size: 1.75rem;
      line-height: 1.2;
    }
    p {
      margin: 0 auto;
      max-width: 34ch;
      font-size: 1.05rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.82);
    }
    .example {
      margin-top: 8px;
      padding: 10px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.08);
      font-style: italic;
    }
    .cta {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cta ion-button:not(.signin) {
      --background: #14b8a6;
      --background-activated: #0d9488;
      --color: #04221f;
      font-weight: 700;
    }
    .signin { --color: #fff; }
    @media (prefers-reduced-motion: reduce) {
      .slide { animation: none; }
    }
  `,
})
export class WelcomePage {
  private readonly nav = inject(NavController);
  readonly slides = SLIDES;
  readonly slideMs = SLIDE_MS;
  readonly index = signal(0);
  readonly paused = signal(false);
  readonly last = computed(() => this.index() === SLIDES.length - 1);

  constructor() {
    addIcons({ trendingUp, shieldCheckmarkOutline, pieChartOutline, receiptOutline, chatbubblesOutline, flagOutline });
  }

  next(): void {
    if (!this.last()) this.index.update((i) => i + 1);
  }

  prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  finish(mode: 'signup' | 'signin' = 'signup'): void {
    try {
      localStorage.setItem(WELCOME_SEEN, '1');
    } catch {
      // Storage unavailable: the introduction shows again next time.
    }
    void this.nav.navigateRoot('/auth', { queryParams: { mode } });
  }
}
