import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, closeOutline, informationCircleOutline, sparklesOutline, trashOutline } from 'ionicons/icons';
import { adapterFor } from '../../ai/adapters';
import { AiKeysService } from '../../ai/ai-keys.service';
import { describeRedactions, redact } from '../../ai/redact';
import { AllProvidersExhaustedError, exhaustedMessage, route } from '../../ai/router';
import { parseAiUpdate, updatePrompt } from '../../ai/updates';
import { NoticeService } from '../../core/notice.service';
import { periodRange } from '../../domain/engine';
import { NEEDS, formatInr, rupees, toRupees } from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';
import {
  CATEGORY_OPTIONS,
  METHOD_LABELS,
  PAYMENT_METHODS,
  TX_TYPES,
  TX_TYPE_LABELS,
  defaultNeed,
  isoDate,
  parseUpdate,
  type Impact,
  type Transaction,
  type TxDraft,
  type TxType,
} from '../../domain/transactions';
import { TransactionsService } from '../../domain/transactions.service';

const EXAMPLES = [
  'Spent ₹500 on groceries via UPI',
  'Paid ₹2,000 for fuel by credit card',
  'Received ₹10,000 from freelance work',
  'Invested ₹5,000 in a mutual fund',
  'Paid ₹25,000 home loan EMI',
];

/** Editable review row: amount in rupees as typed. */
interface Row extends TxDraft {
  key: number;
  rupees: string;
  customCategory: boolean;
}

/**
 * Log activity in one line. The note is understood on this device first; the
 * AI provider is asked only when no amount is found. Every entry is reviewed
 * and can be corrected before it is saved.
 */
@Component({
  selector: 'app-updates',
  imports: [IonContent, IonButton, IonIcon, IonSpinner, FormsModule, RouterLink],
  templateUrl: './updates.page.html',
  styleUrl: './updates.page.scss',
})
export class UpdatesPage {
  readonly svc = inject(TransactionsService);
  private readonly profile = inject(ProfileService);
  private readonly keys = inject(AiKeysService);
  private readonly notices = inject(NoticeService);

  readonly examples = EXAMPLES;
  readonly types = TX_TYPES;
  readonly typeLabels = TX_TYPE_LABELS;
  readonly methods = PAYMENT_METHODS;
  readonly methodLabels = METHOD_LABELS;
  readonly needs = NEEDS;
  readonly categories = CATEGORY_OPTIONS;
  readonly goals = this.profile.goals;
  readonly fmt = formatInr;
  readonly today = isoDate(new Date());

  readonly text = signal('');
  readonly rows = signal<Row[]>([]);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly impact = signal<Impact[]>([]);
  readonly recent = signal<Transaction[] | null>(null);
  readonly overdue = this.svc.updateOverdueDays;
  readonly hasProvider = computed(() => this.keys.keys().some((k) => k.enabled));
  private nextKey = 1;

  constructor() {
    addIcons({ trashOutline, closeOutline, sparklesOutline, checkmarkCircleOutline, alertCircleOutline, informationCircleOutline });
    void this.loadRecent();
  }

  /** Ionic keeps this page cached: refresh the list whenever it is shown again (e.g. after an import). */
  ionViewWillEnter(): void {
    void this.loadRecent();
  }

  async loadRecent(): Promise<void> {
    const r = periodRange('month', new Date())!;
    try {
      this.recent.set(await this.svc.list(r.from, r.to));
    } catch {
      this.recent.set([]);
    }
  }

  /** Reads the note on the device; falls back to the AI only without an amount. */
  async read(): Promise<void> {
    const { text, found } = redact(this.text().trim());
    if (!text || this.busy()) return;
    if (found.length) void this.notices.show(`Removed ${describeRedactions(found)} for your safety. ArthaPath never needs ID numbers or secrets.`, 'warning');
    this.error.set('');
    this.impact.set([]);
    await this.profile.whenLoaded();
    let drafts = parseUpdate(text, new Date(), this.goals());
    if (!drafts.length) {
      await this.keys.whenLoaded();
      if (!this.hasProvider()) {
        this.error.set('No amount found. Try "Spent ₹500 on groceries", or add an AI provider so ArthaPath can read freer notes.');
        return;
      }
      drafts = await this.askAi(text);
      if (!drafts.length) {
        if (!this.error()) this.error.set('No amount found in that note. Include how much, for example "₹500".');
        return;
      }
    }
    this.rows.set(drafts.map((d) => this.toRow(d)));
    this.text.set('');
  }

  private async askAi(text: string): Promise<TxDraft[]> {
    this.busy.set(true);
    try {
      const { response } = await route(
        { messages: [{ role: 'system', content: updatePrompt(new Date(), this.goals()) }, { role: 'user', content: text }], temperature: 0, maxOutputTokens: 800, json: true },
        this.keys.candidates(),
        { call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal), now: () => Date.now(), onHealth: (h) => void this.keys.applyHealth(h) },
      );
      return parseAiUpdate(response.text, new Date(), this.goals());
    } catch (e) {
      this.error.set(e instanceof AllProvidersExhaustedError ? exhaustedMessage(e, (c) => this.keys.nameOf(c)) : 'Could not read that note. Try including the amount, for example "₹500".');
      return [];
    } finally {
      this.busy.set(false);
    }
  }

  addBlank(): void {
    this.impact.set([]);
    this.rows.update((rs) => [...rs, this.toRow({ type: 'expense', amount: 0, date: this.today, category: 'other', need: 'necessary', description: '', source: 'form' })]);
  }

  private toRow(d: TxDraft): Row {
    return { ...d, key: this.nextKey++, rupees: d.amount ? String(toRupees(d.amount)) : '', customCategory: d.type === 'expense' && !CATEGORY_OPTIONS.includes(d.category) };
  }

  patch(row: Row, change: Partial<Row>): void {
    this.rows.update((rs) =>
      rs.map((r) => {
        if (r.key !== row.key) return r;
        const next = { ...r, ...change };
        if (change.type && change.type !== r.type) {
          const fixed: Partial<Record<TxType, string>> = { income: 'income', investment: 'investments', saving: 'savings', loan_payment: 'loan', transfer: 'transfer' };
          next.category = fixed[change.type] ?? 'other';
          next.need = change.type === 'expense' ? defaultNeed(next.category) : undefined;
          next.customCategory = false;
          if (change.type !== 'investment' && change.type !== 'saving') delete next.goalId;
        }
        return next;
      }),
    );
  }

  setCategory(row: Row, value: string): void {
    if (value === '__custom') this.patch(row, { customCategory: true, category: '' });
    else this.patch(row, { category: value, need: defaultNeed(value), customCategory: false });
  }

  remove(row: Row): void {
    this.rows.update((rs) => rs.filter((r) => r.key !== row.key));
  }

  /** Validates every row; returns an error message or null. */
  private problem(r: Row): string | null {
    const n = Number(r.rupees.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 1e11) return 'Enter an amount above zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date > this.today) return 'Choose a date up to today.';
    if (r.type === 'expense' && !r.category.trim()) return 'Enter a category.';
    return null;
  }

  async save(): Promise<void> {
    const rows = this.rows();
    const bad = rows.map((r) => this.problem(r)).find(Boolean);
    if (bad) {
      this.error.set(bad);
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const drafts: TxDraft[] = rows.map((r) => ({
        type: r.type,
        amount: rupees(Number(r.rupees.replace(/,/g, ''))),
        date: r.date,
        category: r.type === 'expense' ? r.category.trim().toLowerCase().slice(0, 30) : r.category,
        ...(r.type === 'expense' && r.need ? { need: r.need } : {}),
        ...(r.method ? { method: r.method } : {}),
        ...(r.merchant ? { merchant: r.merchant } : {}),
        ...(r.goalId ? { goalId: r.goalId } : {}),
        description: r.description,
        source: r.source,
      }));
      const { impact } = await this.svc.add(drafts);
      this.impact.set(impact);
      this.rows.set([]);
      void this.notices.show(`Saved ${drafts.length} entr${drafts.length === 1 ? 'y' : 'ies'}.`, 'success');
      await this.loadRecent();
    } catch {
      this.error.set('Could not save. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(tx: Transaction): Promise<void> {
    await this.svc.remove(tx);
    await this.loadRecent();
  }

  onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      void this.read();
    }
  }

  label(s: string): string {
    return s ? s[0]!.toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';
  }

  goalName(id: string | undefined): string {
    return this.goals().find((g) => g.id === id)?.label ?? '';
  }
}
