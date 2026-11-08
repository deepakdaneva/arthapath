import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { AiKeysService } from '../../ai/ai-keys.service';
import { MarkdownPipe } from '../../ai/markdown.pipe';
import { AllProvidersExhaustedError, exhaustedMessage } from '../../ai/router';
import { AnalysisService } from '../../domain/analysis.service';
import { formatInr } from '../../domain/models';

/** Calculated recommendations, an AI analysis on request, and the saved history. */
@Component({
  selector: 'app-analysis',
  imports: [IonContent, IonButton, IonSpinner, RouterLink, DatePipe, DecimalPipe, MarkdownPipe],
  template: `
    <ion-content>
      <div class="ap-container page">
        <a routerLink="/app" class="back">← Dashboard</a>
        <h1>Analysis</h1>

        <section class="ap-card" aria-labelledby="h-recs">
          <h2 id="h-recs">Recommendations</h2>
          <p class="ap-muted small">Calculated from your saved figures. No AI is used for these.</p>
          <ol class="recs">
            @for (r of svc.recommendations(); track r.key) {
              <li><strong>{{ r.title }}</strong><span>{{ r.detail }}</span></li>
            } @empty {
              <li class="ap-muted">Nothing stands out. Keep logging updates to stay on track.</li>
            }
          </ol>
        </section>

        <section class="ap-card" aria-labelledby="h-ai">
          <h2 id="h-ai">AI analysis</h2>
          @if (svc.nudge(); as n) {
            <p class="nudge">{{ n }} A fresh analysis may help.</p>
          }
          <p class="ap-muted small">
            Sends your financial context (amounts, categories, goals, and monthly totals; no names, ID numbers, or
            account numbers) to your AI provider, under its terms. Runs only when you ask, and is saved here encrypted.
          </p>
          @if (noProvider()) {
            <p>Add an AI provider under <a routerLink="/app/ai-providers">AI Providers</a> to get an analysis.</p>
          } @else {
            <ion-button (click)="run()" [disabled]="busy()">
              @if (busy()) {
                <ion-spinner name="crescent" aria-label="Analyzing" />
              } @else {
                Analyze my finances
              }
            </ion-button>
          }
          @if (error()) {
            <p class="ap-error" role="alert">{{ error() }}</p>
          }
        </section>

        <section class="ap-card" aria-labelledby="h-hist">
          <h2 id="h-hist">History</h2>
          @if (!svc.loaded()) {
            <ion-spinner name="crescent" aria-label="Loading" />
          }
          <ul class="history">
            @for (a of svc.history(); track a.id) {
              <li>
                <button type="button" class="row" (click)="open.set(open() === a.id ? null : a.id)" [attr.aria-expanded]="open() === a.id">
                  <span>
                    <strong>{{ a.createdAt | date: 'd MMM y, h:mm a' }}</strong>
                    <span class="ap-muted small">{{ a.provider }} · {{ a.model }}</span>
                  </span>
                  <span class="figs ap-muted small">
                    Score {{ a.figures.score ?? '—' }} · saves {{ a.figures.savingsRatePct !== null ? (a.figures.savingsRatePct | number: '1.0-1') + '%' : '—' }} · surplus {{ fmt(a.figures.surplus) }}
                  </span>
                </button>
                @if (open() === a.id) {
                  <div class="ap-markdown body" [innerHTML]="a.text | markdown"></div>
                  <button type="button" class="link danger" (click)="svc.remove(a.id)">Delete this analysis</button>
                }
              </li>
            } @empty {
              @if (svc.loaded()) {
                <li class="ap-muted">No analyses yet.</li>
              }
            }
          </ul>
        </section>
        <p class="ap-muted small">Informational guidance, not professional financial advice.</p>
      </div>
    </ion-content>
  `,
  styles: `
    .page { padding-top: 8px; padding-bottom: 96px; display: flex; flex-direction: column; gap: 14px; max-width: 820px; }
    .back, .link, a { color: var(--ion-color-secondary); font-size: 0.9rem; }
    h1 { font-size: 1.4rem; margin: 0; }
    h2 { font-size: 1.05rem; margin: 0 0 6px; }
    p { margin: 0 0 8px; line-height: 1.5; }
    .small { font-size: 0.82rem; }
    .recs { margin: 8px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; }
    .recs li { line-height: 1.5; }
    .recs strong { display: block; }
    .nudge { padding: 8px 12px; border-radius: 10px; background: rgba(var(--ion-color-secondary-rgb), 0.1); }
    .history { list-style: none; padding: 0; margin: 0; }
    .history li { border-bottom: 1px solid var(--ap-border); padding: 4px 0; }
    .row { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 0;
      border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .row > span:first-child { display: flex; flex-direction: column; gap: 2px; }
    .body { padding: 8px 0 12px; line-height: 1.55; }
    .link { border: none; background: none; padding: 0 0 10px; cursor: pointer; font: inherit; }
    .danger { color: var(--ion-color-danger); }
  `,
})
export class AnalysisPage {
  readonly svc = inject(AnalysisService);
  private readonly keys = inject(AiKeysService);
  readonly fmt = formatInr;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly open = signal<string | null>(null);
  readonly noProvider = computed(() => this.keys.loaded() && !this.keys.keys().some((k) => k.enabled));

  async run(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const a = await this.svc.generate();
      this.open.set(a.id);
    } catch (e) {
      this.error.set(e instanceof AllProvidersExhaustedError ? exhaustedMessage(e, (c) => this.keys.nameOf(c)) : 'The analysis could not be created. Try again in a moment.');
    } finally {
      this.busy.set(false);
    }
  }
}
