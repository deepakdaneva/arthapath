import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { adapterFor } from '../../ai/adapters';
import { AiKeysService } from '../../ai/ai-keys.service';
import { IMPORT_CATEGORIZE_PROMPT, categorizeRequest, parseCategorized, type CategorizeInput } from '../../ai/import-categorize';
import { redacted } from '../../ai/redact';
import { route } from '../../ai/router';
import { AppPrefsService } from '../../core/app-prefs.service';
import { csvToRows, markDuplicates, textToRows, type ImportRow } from '../../domain/import';
import { NEEDS, formatInr, rupees, toRupees } from '../../domain/models';
import { CATEGORY_OPTIONS, TX_TYPES, TX_TYPE_LABELS, defaultNeed, type TxDraft, type TxType } from '../../domain/transactions';
import { TransactionsService } from '../../domain/transactions.service';
import { PdfPasswordError, pdfToText } from './pdf-text';

interface Row extends ImportRow {
  key: number;
  keep: boolean;
  duplicate: boolean;
  byAi: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Statement import: read on the device, review, then save. The file itself is
 * never uploaded or stored; only the reviewed entries are saved, encrypted.
 */
@Component({
  selector: 'app-import',
  imports: [IonContent, IonButton, IonSpinner, FormsModule, RouterLink],
  templateUrl: './import.page.html',
  styleUrl: './import.page.scss',
})
export class ImportPage {
  private readonly tx = inject(TransactionsService);
  private readonly keys = inject(AiKeysService);
  readonly app = inject(AppPrefsService);

  readonly types = TX_TYPES;
  readonly typeLabels = TX_TYPE_LABELS;
  readonly needs = NEEDS;
  readonly categories = [...CATEGORY_OPTIONS, 'income', 'investments', 'savings', 'loan', 'transfer'];
  readonly fmt = formatInr;

  readonly pasted = signal('');
  readonly rows = signal<Row[]>([]);
  readonly busy = signal(false);
  readonly status = signal('');
  readonly error = signal('');
  readonly skipped = signal(0);
  readonly done = signal<{ count: number; total: number } | null>(null);
  readonly needPassword = signal(false);
  readonly password = signal('');
  readonly aiCount = signal(0);
  private pendingPdf: ArrayBuffer | null = null;
  private nextKey = 1;

  readonly kept = computed(() => this.rows().filter((r) => r.keep));
  readonly duplicates = computed(() => this.rows().filter((r) => r.duplicate).length);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.reset();
    if (file.size > MAX_BYTES) {
      this.error.set('That file is larger than 10 MB. Export a shorter period.');
      return;
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      this.pendingPdf = await file.arrayBuffer();
      await this.readPdf();
    } else {
      await this.readText(await file.text());
    }
  }

  async readPdf(): Promise<void> {
    if (!this.pendingPdf) return;
    this.busy.set(true);
    this.status.set('Reading the PDF on this device…');
    this.error.set('');
    try {
      // pdf.js may detach the buffer: pass a copy so a retry with a password still works.
      const text = await pdfToText(this.pendingPdf.slice(0), this.password() || undefined);
      this.pendingPdf = null;
      this.needPassword.set(false);
      this.password.set('');
      if (!text.trim()) {
        this.error.set('No text found in this PDF. Scanned (image-only) statements are not supported; export a CSV from your bank instead.');
        return;
      }
      await this.readText(text);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        this.needPassword.set(true);
        this.error.set(e.wrong ? 'That password did not open the PDF.' : '');
      } else {
        this.error.set('Could not read this PDF. Try a CSV export or paste the statement text.');
      }
    } finally {
      this.busy.set(false);
      this.status.set('');
    }
  }

  async readPasted(): Promise<void> {
    this.reset();
    await this.readText(this.pasted());
  }

  private async readText(text: string): Promise<void> {
    const parsed = csvToRows(text) ?? textToRows(text);
    this.skipped.set(parsed.skipped);
    if (!parsed.rows.length) {
      this.error.set('No transactions found. Each line or row needs a date and an amount.');
      return;
    }
    this.busy.set(true);
    try {
      this.status.set('Checking for entries you already have…');
      const dates = parsed.rows.map((r) => r.date).sort();
      const from = new Date(`${dates[0]}T00:00:00`);
      const to = new Date(new Date(`${dates.at(-1)}T00:00:00`).getTime() + 86_400_000);
      const existing = await this.tx.list(from, to).catch(() => []);
      const dup = markDuplicates(parsed.rows, existing);
      let rows: Row[] = parsed.rows.map((r, i) => ({ ...r, description: redacted(r.description), raw: '', key: this.nextKey++, keep: !dup[i], duplicate: dup[i]!, byAi: false }));
      if (this.app.prefs().aiCategorizeImports) rows = await this.aiCategorize(rows);
      this.rows.set(rows);
      this.pasted.set('');
    } finally {
      this.busy.set(false);
      this.status.set('');
    }
  }

  /** Sends only uncategorized rows, as allowed in Settings. */
  private async aiCategorize(rows: Row[]): Promise<Row[]> {
    const unknown: CategorizeInput[] = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.category === 'other' && !r.duplicate)
      .map(({ r, i }) => ({ i, direction: r.type === 'income' ? ('in' as const) : ('out' as const), amount: toRupees(r.amount), description: r.description }));
    await this.keys.whenLoaded();
    if (!unknown.length || !this.keys.keys().some((k) => k.enabled)) return rows;
    this.status.set(`Asking your AI provider to categorize ${unknown.length} row${unknown.length === 1 ? '' : 's'}…`);
    try {
      const { response } = await route(
        { messages: [{ role: 'system', content: IMPORT_CATEGORIZE_PROMPT }, { role: 'user', content: categorizeRequest(unknown) }], temperature: 0, maxOutputTokens: 4000, json: true },
        this.keys.candidates(),
        { call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal), now: () => Date.now(), onHealth: (h) => void this.keys.applyHealth(h) },
      );
      const out = parseCategorized(response.text, unknown);
      this.aiCount.set(out.length);
      const byI = new Map(out.map((o) => [o.i, o]));
      return rows.map((r, i) => {
        const c = byI.get(i);
        if (!c) return r;
        const { need: _old, ...rest } = r;
        void _old;
        return { ...rest, type: c.type, category: c.category, ...(c.type === 'expense' ? { need: c.need ?? defaultNeed(c.category) } : {}), byAi: true };
      });
    } catch {
      this.error.set('Your AI provider could not categorize the rows; the device categories are kept.');
      return rows;
    }
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
        }
        return next;
      }),
    );
  }

  setAmount(row: Row, value: string): void {
    const n = Number(String(value).replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) this.patch(row, { amount: rupees(n) });
  }

  toggleAll(keep: boolean): void {
    this.rows.update((rs) => rs.map((r) => ({ ...r, keep })));
  }

  async save(): Promise<void> {
    const rows = this.kept();
    if (!rows.length) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const drafts: TxDraft[] = rows.map((r) => ({
        type: r.type,
        amount: r.amount,
        date: r.date,
        category: r.category,
        ...(r.type === 'expense' ? { need: r.need ?? defaultNeed(r.category) } : {}),
        description: r.description,
        source: 'import',
      }));
      await this.tx.add(drafts, (n) => this.status.set(`Saving ${n} of ${drafts.length}…`));
      this.done.set({ count: drafts.length, total: drafts.filter((d) => d.type === 'expense').reduce((s, d) => s + d.amount, 0) });
      this.rows.set([]);
    } catch {
      this.error.set('Saving stopped part-way. Entries saved so far are kept; check This month in Updates before importing again.');
    } finally {
      this.busy.set(false);
      this.status.set('');
    }
  }

  reset(): void {
    this.rows.set([]);
    this.error.set('');
    this.done.set(null);
    this.skipped.set(0);
    this.aiCount.set(0);
    this.needPassword.set(false);
    this.pendingPdf = null;
  }

  label(s: string): string {
    return s ? s[0]!.toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';
  }

  rupeesOf(paise: number): number {
    return toRupees(paise);
  }
}
