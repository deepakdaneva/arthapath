import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { MarkdownPipe } from '../../ai/markdown.pipe';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonTextarea } from '@ionic/angular/ion-textarea';
import { NavController } from '@ionic/angular/nav-controller';
import { addIcons } from 'ionicons';
import { closeOutline, send } from 'ionicons/icons';
import { adapterFor } from '../../ai/adapters';
import { AiKeysService } from '../../ai/ai-keys.service';
import { EXTRACTION_PROMPT, extractionIsEmpty, parseExtraction, type Extraction } from '../../ai/extraction';
import { AIError } from '../../ai/errors';
import { OFF_TOPIC_REPLY, classifyIntent } from '../../ai/guardrails';
import { ONBOARDING_STARTERS } from '../../ai/starters';
import { AllProvidersExhaustedError, exhaustedMessage, route } from '../../ai/router';
import { AiStatusService } from '../../core/ai-status.service';
import { NoticeService } from '../../core/notice.service';
import { describeRedactions, redact } from '../../ai/redact';
import { formatInr, rupees, toRupees, type Provenance } from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** One reviewable extracted fact. */
interface ReviewRow {
  section: 'incomes' | 'expenses' | 'liabilities' | 'assets' | 'goals' | 'family';
  id: string;
  label: string;
  detail: string;
  /** Editable amount in rupees (null for family members). */
  amount: number | null;
  estimated: boolean;
  keep: boolean;
}

const INTRO =
  "Let's build your plan. Tell me about your finances in your own words: income, regular expenses, loans or credit cards, savings and investments, family, and what you're saving for. For example: \"I earn ₹1,50,000 a month, my spouse earns ₹50,000, our home loan EMI is ₹25,000, and we want to buy a car in three years.\"";

@Component({
  selector: 'app-onboarding',
  imports: [IonContent, IonButton, IonIcon, IonSpinner, IonTextarea, FormsModule, RouterLink, MarkdownPipe],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage {
  readonly profile = inject(ProfileService);
  readonly keys = inject(AiKeysService);
  private readonly status = inject(AiStatusService);
  private readonly notices = inject(NoticeService);
  private readonly nav = inject(NavController);
  private readonly content = viewChild.required<IonContent>('content');

  readonly starters = ONBOARDING_STARTERS;
  readonly turns = signal<Turn[]>([{ role: 'assistant', content: INTRO }]);
  /** A starter chosen in Chat arrives as ?prefill=… */
  readonly text = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('prefill')?.slice(0, 500) ?? '');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly pending = signal<Extraction | null>(null);
  readonly rows = signal<ReviewRow[]>([]);
  readonly done = signal(false);
  readonly saving = signal(false);

  readonly noProvider = computed(() => this.keys.loaded() && this.keys.keys().filter((k) => k.enabled).length === 0);

  constructor() {
    addIcons({ send, closeOutline });
    effect(() => {
      this.turns();
      this.rows();
      setTimeout(() => void this.content().scrollToBottom(200));
    });
  }

  onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      void this.send();
    }
  }

  async send(): Promise<void> {
    // ID numbers and secrets are removed on this device: never stored, shown again, or sent.
    const { text: message, found } = redact(this.text().trim());
    if (!message || this.busy() || this.pending()) return;
    if (found.length) {
      void this.notices.show(`Removed ${describeRedactions(found)} for your safety. ArthaPath never needs ID numbers or secrets.`, 'warning');
    }
    this.text.set('');
    this.error.set('');
    this.turns.update((t) => [...t, { role: 'user', content: message }]);
    if (classifyIntent(message) === 'offtopic') {
      this.turns.update((t) => [...t, { role: 'assistant', content: OFF_TOPIC_REPLY }]);
      return;
    }
    this.busy.set(true);
    try {
      // Right after unlock, keys and profile may still be loading.
      await Promise.all([this.keys.whenLoaded(), this.profile.whenLoaded()]);
      const snapshot = this.profile.snapshot();
      const recent = this.turns().slice(-7, -1);
      const { response } = await route(
        {
          messages: [
            { role: 'system', content: EXTRACTION_PROMPT },
            { role: 'system', content: `Current profile (JSON, amounts in rupees):\n${JSON.stringify(snapshot.data)}` },
            ...recent.map((t) => ({ role: t.role, content: t.content })),
            { role: 'user', content: message },
          ],
          temperature: 0.1,
          maxOutputTokens: 1500,
          json: true,
        },
        this.keys.candidates(),
        {
          call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal),
          now: () => Date.now(),
          onHealth: (h) => void this.keys.applyHealth(h),
          onEvent: (e) => {
            if (e.type === 'switch') {
              this.status.switchedTo(this.keys.nameOf(e.to), e.to.credentials.model);
              void this.notices.show(`${this.keys.nameOf(e.from)} unavailable. Switching to ${this.keys.nameOf(e.to)}.`, 'warning');
            }
          },
        },
      );
      const x = parseExtraction(response.text);
      this.turns.update((t) => [...t, { role: 'assistant', content: x.reply }]);
      if (!extractionIsEmpty(x)) {
        this.pending.set(x);
        this.rows.set(this.toRows(x));
      } else {
        await this.profile.setQuestions(x.questions);
      }
      if (x.done) this.done.set(true);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  setAmount(row: ReviewRow, value: string | null | undefined): void {
    const n = Number(String(value ?? '').replace(/[,₹\s]/g, ''));
    this.rows.update((rs) => rs.map((r) => (r === row ? { ...r, amount: Number.isFinite(n) && n >= 0 ? n : r.amount } : r)));
  }

  toggle(row: ReviewRow): void {
    this.rows.update((rs) => rs.map((r) => (r === row ? { ...r, keep: !r.keep } : r)));
  }

  /** Saves the reviewed facts (with any corrected amounts) to the encrypted profile. */
  async confirm(): Promise<void> {
    const x = this.pending();
    if (!x) return;
    this.saving.set(true);
    try {
      const keep = new Map(this.rows().filter((r) => r.keep).map((r) => [r.id, r]));
      /** Keeps reviewed items; an edited amount becomes a user-confirmed value. */
      const review = <T extends { id: string; provenance: Provenance }>(items: T[], field: keyof T & string): T[] =>
        items
          .filter((i) => keep.has(i.id))
          .map((i) => {
            const edited = keep.get(i.id)!.amount;
            const original = i[field] as unknown as number;
            if (edited === null || rupees(edited) === original) return i;
            return { ...i, [field]: rupees(edited), provenance: 'user' };
          });
      const reviewed: Extraction = {
        ...x,
        incomes: review(x.incomes, 'amount'),
        expenses: review(x.expenses, 'amount'),
        liabilities: review(x.liabilities, 'outstanding'),
        assets: review(x.assets, 'value'),
        goals: review(x.goals, 'target'),
        family: x.family.filter((i) => keep.has(i.id)),
      };
      await this.profile.applyExtraction(reviewed);
      await this.profile.setQuestions(x.questions);
      this.pending.set(null);
      this.rows.set([]);
      this.turns.update((t) => [...t, { role: 'assistant', content: 'Saved. ' + (this.done() ? 'You can see your plan now, or keep adding details.' : 'What else should I know?') }]);
    } catch {
      this.error.set('Could not save. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  discard(): void {
    this.pending.set(null);
    this.rows.set([]);
    this.turns.update((t) => [...t, { role: 'assistant', content: 'Discarded. Tell me again in your own words, or correct anything I misunderstood.' }]);
  }

  async finish(): Promise<void> {
    await this.profile.markOnboarded();
    await this.nav.navigateRoot('/app');
  }

  private toRows(x: Extraction): ReviewRow[] {
    const r = (p: number) => Math.round(toRupees(p));
    const est = (p: string) => p === 'ai_estimate';
    return [
      ...x.incomes.map((i) => ({ section: 'incomes' as const, id: i.id, label: i.label, detail: `Income · ${i.frequency.replace('_', '-')} · ${i.earner}`, amount: r(i.amount), estimated: est(i.provenance), keep: true })),
      ...x.expenses.map((i) => ({ section: 'expenses' as const, id: i.id, label: i.label, detail: `Expense · ${i.frequency.replace('_', '-')} · ${i.essential ? 'essential' : 'flexible'}`, amount: r(i.amount), estimated: est(i.provenance), keep: true })),
      ...x.liabilities.map((i) => ({ section: 'liabilities' as const, id: i.id, label: i.label, detail: `Loan · EMI ${formatInr(i.monthlyPayment)}${i.interestRate !== undefined ? ` · ${i.interestRate}%` : ''} · outstanding`, amount: r(i.outstanding), estimated: est(i.provenance), keep: true })),
      ...x.assets.map((i) => ({ section: 'assets' as const, id: i.id, label: i.label, detail: `Asset · ${i.kind.replace('_', ' ')}`, amount: r(i.value), estimated: est(i.provenance), keep: true })),
      ...x.goals.map((i) => ({ section: 'goals' as const, id: i.id, label: i.label, detail: `Goal${i.targetDate ? ` · by ${i.targetDate}` : ''} · target`, amount: r(i.target), estimated: est(i.provenance), keep: true })),
      ...x.family.map((i) => ({ section: 'family' as const, id: i.id, label: i.relation, detail: `Family${i.age !== undefined ? ` · age ${i.age}` : ''}${i.dependent ? ' · dependent' : ''}`, amount: null, estimated: false, keep: true })),
    ];
  }

  private describe(e: unknown): string {
    if (e instanceof AllProvidersExhaustedError) {
      return e.noneConfigured
        ? 'Add an AI provider first (AI Providers in the account menu), or enter details manually.'
        : exhaustedMessage(e, (c) => this.keys.nameOf(c));
    }
    if (e instanceof AIError && e.kind === 'network') return "You appear to be offline. Try again when you're connected.";
    return 'I could not understand the response. Please try rephrasing.';
  }
}
