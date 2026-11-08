import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { VaultService } from '../core/crypto/vault.service';
import { redacted } from '../ai/redact';
import { UPDATE_REMINDER_DAYS, daysSince, financialWarnings, type Warning } from './engine';
import { formatInr } from './models';
import { ProfileService } from './profile.service';
import {
  applyToTotals,
  emptyTotals,
  impactOf,
  isoDate,
  monthOf,
  plannedByCategory,
  type Impact,
  type MonthTotals,
  type Transaction,
  type TxDraft,
} from './transactions';

const TX = ['transactions'];
const AGG = ['aggregates'];

/**
 * Logged activity: encrypted transactions (transactions/{id}, with the month
 * and date as plaintext query fields) and encrypted monthly totals
 * (aggregates/{YYYY-MM}). Totals are loaded on unlock (one small read per
 * month); transactions are read only when a list is opened.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly vault = inject(VaultService);
  private readonly profile = inject(ProfileService);

  /** Monthly totals, oldest first. */
  readonly totals = signal<MonthTotals[]>([]);
  readonly loaded = signal(false);

  readonly thisMonth = computed(() => {
    const m = isoDate(new Date()).slice(0, 7);
    return this.totals().find((t) => t.month === m) ?? emptyTotals(m);
  });

  /** Latest change anywhere: a logged entry or an edit in Your finances. */
  readonly lastActivityAt = computed(() => Math.max(this.profile.profile().updatedAt ?? 0, ...this.totals().map((t) => t.lastAt)) || undefined);

  readonly updateOverdueDays = computed(() => {
    const d = daysSince(this.lastActivityAt(), new Date());
    return d !== null && d > UPDATE_REMINDER_DAYS ? d : null;
  });

  /** Profile warnings plus this month's categories that ran over plan, most severe first. */
  readonly warnings = computed<Warning[]>(() => {
    const p = this.profile.profile();
    const base = financialWarnings(p, this.profile.metrics(), this.profile.plans(), new Date(), this.lastActivityAt());
    const planned = plannedByCategory(p);
    const month = this.thisMonth();
    const over: Warning[] = Object.entries(month.byCategory)
      .filter(([cat, spent]) => planned[cat] && spent > planned[cat]!)
      .map(([cat, spent]) => ({
        key: `over:${cat}`,
        severity: 'warning' as const,
        title: `${cat[0]!.toUpperCase()}${cat.slice(1).replace(/_/g, ' ')} over plan this month`,
        detail: `${formatInr(spent)} spent against a ${formatInr(planned[cat]!)} monthly plan.`,
        link: '/app/updates',
      }));
    const rank = { critical: 0, serious: 1, warning: 2 };
    return [...base, ...over].sort((a, b) => rank[a.severity] - rank[b.severity]);
  });

  constructor() {
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else {
        this.totals.set([]);
        this.loaded.set(false);
      }
    });
  }

  private loading: Promise<void> | null = null;

  whenLoaded(): Promise<void> {
    return this.loaded() ? Promise.resolve() : this.load();
  }

  load(): Promise<void> {
    this.loading ??= this.vault
      .list<MonthTotals>(AGG)
      .then((rows) => {
        this.totals.set(rows.map((r) => ({ ...r.value, month: r.id })).sort((a, b) => a.month.localeCompare(b.month)));
        this.loaded.set(true);
      })
      .catch(() => this.loaded.set(true))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  /**
   * Saves reviewed entries, updates the month totals, and adds linked
   * savings and investments to their goal. Returns the deterministic impact.
   */
  async add(drafts: TxDraft[], onProgress?: (done: number) => void): Promise<{ saved: Transaction[]; impact: Impact[] }> {
    await Promise.all([this.whenLoaded(), this.profile.whenLoaded()]);
    const now = Date.now();
    const saved: Transaction[] = [];
    const impact: Impact[] = [];
    // Month totals are updated in memory and written once per month at the end (fewer writes for imports).
    const touched = new Map<string, MonthTotals>();
    for (const d of drafts) {
      const tx: Transaction = {
        ...d,
        description: redacted(d.description).slice(0, 200),
        ...(d.merchant ? { merchant: redacted(d.merchant).slice(0, 60) } : {}),
        id: crypto.randomUUID(),
        createdAt: now,
      };
      await this.vault.put([...TX, tx.id], tx, { month: monthOf(tx.date), occurredAt: new Date(`${tx.date}T12:00:00`) });
      const m = monthOf(tx.date);
      const month = applyToTotals(touched.get(m) ?? this.totals().find((t) => t.month === m) ?? emptyTotals(m), tx, 1, now);
      touched.set(m, month);
      const goal = await this.moveGoal(tx, 1);
      saved.push(tx);
      // Detailed impact only for a few typed entries; an import gets a summary instead.
      if (drafts.length <= 5) impact.push(...impactOf(tx, month, this.totals(), this.profile.profile(), goal, new Date()));
      onProgress?.(saved.length);
    }
    for (const [m, totals] of touched) {
      await this.vault.put([...AGG, m], totals);
      this.totals.update((ts) => [...ts.filter((t) => t.month !== m), totals].sort((a, b) => a.month.localeCompare(b.month)));
    }
    return { saved, impact };
  }

  async remove(tx: Transaction): Promise<void> {
    await this.vault.remove([...TX, tx.id]);
    await this.bump(tx, -1, Date.now());
    await this.moveGoal(tx, -1);
  }

  /** Entries dated in [from, to) (local dates), newest first. */
  async list(from: Date, to: Date): Promise<Transaction[]> {
    const last = new Date(to.getTime() - 1);
    const rows = await this.vault.list<Transaction>(TX, {
      where: [
        ['month', '>=', isoDate(from).slice(0, 7)],
        ['month', '<=', isoDate(last).slice(0, 7)],
      ],
      limit: 1000,
    });
    const lo = isoDate(from);
    const hi = isoDate(last);
    return rows
      .map((r) => ({ ...r.value, id: r.id }))
      .filter((t) => t.date >= lo && t.date <= hi)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  private async bump(tx: Transaction, sign: 1 | -1, now: number): Promise<MonthTotals> {
    const m = monthOf(tx.date);
    const next = applyToTotals(this.totals().find((t) => t.month === m) ?? emptyTotals(m), tx, sign, now);
    await this.vault.put([...AGG, m], next);
    this.totals.update((ts) => [...ts.filter((t) => t.month !== m), next].sort((a, b) => a.month.localeCompare(b.month)));
    return next;
  }

  /** Linked savings and investments count toward the goal (reversed on delete). */
  private async moveGoal(tx: Transaction, sign: 1 | -1) {
    if (!tx.goalId || (tx.type !== 'investment' && tx.type !== 'saving')) return null;
    const goal = this.profile.goals().find((g) => g.id === tx.goalId);
    if (!goal) return null;
    const next = { ...goal, saved: Math.max(0, goal.saved + sign * tx.amount) };
    await this.profile.saveGoal(next);
    return next;
  }
}
