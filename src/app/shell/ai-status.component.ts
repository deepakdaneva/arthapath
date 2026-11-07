import { Component, ElementRef, effect, inject, untracked, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { sparkles, sparklesOutline } from 'ionicons/icons';
import { AiStatusService } from '../core/ai-status.service';

/** Always-visible current AI indicator; blinks 5 times when the provider switches. */
@Component({
  selector: 'app-ai-status',
  imports: [IonIcon],
  template: `
    <span
      #chip
      class="chip"
      [class.none]="ai.status().state === 'none'"
      [class.exhausted]="ai.status().state === 'exhausted'"
      role="status"
      aria-live="polite"
      [attr.aria-label]="'Current AI: ' + ai.label()"
      [title]="'Current AI: ' + ai.label()"
    >
      <ion-icon [name]="ai.status().state === 'active' ? 'sparkles' : 'sparkles-outline'" aria-hidden="true" />
      <span class="text">{{ ai.label() }}</span>
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 42vw;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--ion-color-secondary);
      background: rgba(var(--ion-color-secondary-rgb), 0.12);
      border: 1px solid rgba(var(--ion-color-secondary-rgb), 0.3);
      white-space: nowrap;
    }
    .chip.none {
      color: var(--ap-text-muted);
      background: var(--ap-surface-2);
      border-color: var(--ap-border);
    }
    .chip.exhausted {
      color: var(--ion-color-warning);
      background: rgba(var(--ion-color-warning-rgb), 0.12);
      border-color: rgba(var(--ion-color-warning-rgb), 0.35);
    }
    .text {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    ion-icon {
      font-size: 14px;
      flex: none;
    }
    .chip.blink {
      animation: blink 0.6s ease-in-out 5;
    }
    @keyframes blink {
      50% {
        opacity: 0.15;
        transform: scale(0.96);
      }
    }
    @media (max-width: 420px) {
      .text {
        display: none;
      }
    }
  `,
})
export class AiStatusComponent {
  readonly ai = inject(AiStatusService);
  private readonly chip = viewChild.required<ElementRef<HTMLElement>>('chip');

  constructor() {
    addIcons({ sparkles, sparklesOutline });
    effect(() => {
      if (this.ai.switchCount() === 0) return;
      untracked(() => {
        // Restart the animation even if a previous blink is still running.
        const el = this.chip().nativeElement;
        el.classList.remove('blink');
        void el.offsetWidth;
        el.classList.add('blink');
      });
    });
  }
}
