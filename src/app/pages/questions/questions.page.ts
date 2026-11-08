import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { ProfileService, type PendingQuestion } from '../../domain/profile.service';

/** Everything ArthaPath would like to know, why, and what depends on it. */
@Component({
  selector: 'app-questions',
  imports: [IonContent, IonButton, RouterLink],
  template: `
    <ion-content>
      <div class="ap-container page">
        <a routerLink="/app" class="back">← Dashboard</a>
        <h1>Questions to improve your plan</h1>
        <p class="ap-muted">
          Answering these makes your figures and recommendations more accurate. Your dashboard works without
          them; anything missing is simply left out.
        </p>
        @for (group of groups(); track group.title) {
          @if (group.items.length) {
            <section class="ap-card" [attr.aria-label]="group.title">
              <h2>{{ group.title }}</h2>
              <ul>
                @for (q of group.items; track q.id) {
                  <li>
                    <strong>{{ q.question }}</strong>
                    <span class="ap-muted small">{{ q.why }}</span>
                    @if (q.dependsOn?.length) {
                      <span class="ap-muted small">Used for: {{ q.dependsOn!.join(', ') }}</span>
                    }
                    <div class="actions">
                      @if (q.quick) {
                        <ion-button size="small" (click)="svc.setInsurance(q.quick!, true)">Yes</ion-button>
                        <ion-button size="small" fill="outline" (click)="svc.setInsurance(q.quick!, false)">No</ion-button>
                      } @else {
                        <a class="answer" routerLink="/app/onboarding" [queryParams]="{ prefill: prefill(q) }">Answer</a>
                      }
                      <ion-button size="small" fill="clear" (click)="svc.dismissQuestion(q.id)" [attr.aria-label]="'Skip: ' + q.question">Skip</ion-button>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        } @empty {
          <p>No open questions.</p>
        }
        @if (!svc.openQuestions().length) {
          <p class="ap-card">Nothing to ask right now. Your plan has what it needs.</p>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .page { padding-top: 8px; padding-bottom: 96px; display: flex; flex-direction: column; gap: 14px; max-width: 820px; }
    .back { color: var(--ion-color-secondary); font-size: 0.9rem; }
    h1 { font-size: 1.4rem; margin: 0; }
    h2 { font-size: 1.05rem; margin: 0 0 8px; }
    p { margin: 0; line-height: 1.5; }
    .small { font-size: 0.82rem; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
    li { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--ap-border); }
    .actions { display: flex; gap: 6px; margin-top: 4px; align-items: center; }
    .answer { padding: 6px 14px; border-radius: 8px; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); font-size: 0.85rem; font-weight: 600; text-decoration: none; }
  `,
})
export class QuestionsPage {
  readonly svc = inject(ProfileService);
  readonly groups = computed(() => {
    const qs = this.svc.openQuestions();
    return [
      { title: 'Needed for your plan', items: qs.filter((q) => !q.optional) },
      { title: 'Optional', items: qs.filter((q) => q.optional) },
    ];
  });

  /** Puts the question in the onboarding message box so the answer has context. */
  prefill(q: PendingQuestion): string {
    return `${q.question} `;
  }
}
