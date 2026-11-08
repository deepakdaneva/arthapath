import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { VaultService } from '../core/crypto/vault.service';
import type { Extraction, PendingQuestionDraft } from '../ai/extraction';
import { redacted } from '../ai/redact';
import { computeMetrics, healthScore, planGoals, spendingBreakdown, suggestGoals } from './engine';
import { emptyProfile, normalizeProfile, type FinancialProfile, type Goal } from './models';
import { missingInfo } from './questions';

export interface PendingQuestion extends PendingQuestionDraft {
  id: string;
  status: 'open' | 'answered' | 'dismissed';
  createdAt: number;
  /** From gaps in the saved data (not stored until dismissed). */
  derived?: boolean;
  dependsOn?: string[];
  quick?: 'health' | 'term';
}

type Section = 'incomes' | 'expenses' | 'liabilities' | 'assets' | 'family';

const PROFILE_PATH = ['vault', 'profile'];

/**
 * The encrypted financial profile (users/{uid}/vault/profile), goals
 * (goals/{id}), and pending questions (pendingQuestions/{id}). All derived
 * numbers come from the deterministic engine.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly vault = inject(VaultService);

  readonly profile = signal<FinancialProfile>(emptyProfile());
  readonly goals = signal<Goal[]>([]);
  readonly questions = signal<PendingQuestion[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal(false);

  readonly metrics = computed(() => computeMetrics(this.profile()));
  readonly plans = computed(() => planGoals(this.goals(), this.metrics(), this.profile().assumptions, new Date()));
  readonly health = computed(() => healthScore(this.profile(), this.metrics(), this.plans()));
  readonly suggestions = computed(() => suggestGoals(this.profile(), this.metrics(), this.goals()));
  readonly breakdown = computed(() => spendingBreakdown(this.profile(), this.metrics()));
  /** Questions the AI asked that are still open (stored). */
  readonly storedOpen = computed(() => this.questions().filter((q) => q.status === 'open'));
  /** Stored open questions plus gaps found in the data, unless the user dismissed that gap. */
  readonly openQuestions = computed<PendingQuestion[]>(() => {
    const seen = new Set(this.questions().map((q) => q.key));
    const derived = missingInfo(this.profile(), this.goals())
      .filter((d) => !seen.has(d.key))
      .map((d) => ({ ...d, id: `derived:${d.key}`, status: 'open' as const, createdAt: 0, derived: true }));
    return [...this.storedOpen(), ...derived];
  });
  readonly hasData = computed(() => {
    const p = this.profile();
    return p.incomes.length + p.expenses.length + p.assets.length + p.liabilities.length + this.goals().length > 0;
  });

  constructor() {
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else {
        this.profile.set(emptyProfile());
        this.goals.set([]);
        this.questions.set([]);
        this.loaded.set(false);
      }
    });
  }

  private loading: Promise<void> | null = null;

  /** Resolves once data for the unlocked account is loaded (starts loading if needed). */
  whenLoaded(): Promise<void> {
    return this.loaded() ? Promise.resolve() : this.load();
  }

  load(): Promise<void> {
    this.loading ??= this.fetch().finally(() => (this.loading = null));
    return this.loading;
  }

  private async fetch(): Promise<void> {
    try {
      const [p, goals, qs] = await Promise.all([
        this.vault.get<FinancialProfile>(PROFILE_PATH),
        this.vault.list<Goal>(['goals']),
        this.vault.list<PendingQuestion>(['pendingQuestions']),
      ]);
      this.profile.set(normalizeProfile(p));
      this.goals.set(goals.map((g) => ({ ...g.value, id: g.id })));
      this.questions.set(qs.map((q) => ({ ...q.value, id: q.id })).sort((a, b) => a.createdAt - b.createdAt));
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loaded.set(true);
    }
  }

  async saveProfile(next: FinancialProfile): Promise<void> {
    // Labels are free text: ID numbers typed into them are removed before saving.
    const clean = <T extends { label: string }>(xs: T[]) => xs.map((x) => ({ ...x, label: redacted(x.label) }));
    const versioned = {
      ...next,
      incomes: clean(next.incomes),
      expenses: clean(next.expenses),
      liabilities: clean(next.liabilities),
      assets: clean(next.assets),
      version: this.profile().version + 1,
      updatedAt: Date.now(),
    };
    await this.vault.put(PROFILE_PATH, versioned);
    this.profile.set(versioned);
  }

  async updateProfile(change: (p: FinancialProfile) => FinancialProfile): Promise<void> {
    await this.saveProfile(change(structuredClone(this.profile())));
  }

  async removeItem(section: Section, id: string): Promise<void> {
    await this.updateProfile((p) => ({ ...p, [section]: (p[section] as { id: string }[]).filter((x) => x.id !== id) }));
  }

  async saveGoal(input: Goal): Promise<void> {
    const goal = { ...input, label: redacted(input.label) };
    await this.vault.put(['goals', goal.id], goal);
    this.goals.update((gs) => (gs.some((g) => g.id === goal.id) ? gs.map((g) => (g.id === goal.id ? goal : g)) : [...gs, goal]));
    await this.bumpVersion();
  }

  async removeGoal(id: string): Promise<void> {
    await this.vault.remove(['goals', id]);
    this.goals.update((gs) => gs.filter((g) => g.id !== id));
    await this.bumpVersion();
  }

  /** Saves the user's own goal order as priority overrides (1 = first). */
  async reorderGoals(orderedIds: string[]): Promise<void> {
    const byId = new Map(this.goals().map((g) => [g.id, g]));
    const changed = orderedIds
      .map((gid, i) => ({ ...byId.get(gid)!, priorityOverride: i + 1 }))
      .filter((g) => byId.get(g.id)!.priorityOverride !== g.priorityOverride);
    await Promise.all(changed.map((g) => this.vault.put(['goals', g.id], g)));
    this.goals.update((gs) => gs.map((g) => changed.find((c) => c.id === g.id) ?? g));
    await this.bumpVersion();
  }

  /**
   * Applies reviewed extraction results. Items with the same type and label
   * as an existing one replace it (an update); others are added.
   */
  async applyExtraction(x: Extraction): Promise<void> {
    const merge = <T extends { id: string; label: string }>(cur: T[], add: T[], key: (t: T) => string): T[] => {
      const out = [...cur];
      for (const a of add) {
        const i = out.findIndex((c) => key(c) === key(a));
        if (i >= 0) out[i] = { ...a, id: out[i]!.id };
        else out.push(a);
      }
      return out;
    };
    const k = (t: { label: string }, type: string) => `${type}:${t.label.toLowerCase()}`;
    await this.updateProfile((p) => ({
      ...p,
      incomes: merge(p.incomes, x.incomes, (t) => k(t, t.kind)),
      expenses: merge(p.expenses, x.expenses, (t) => k(t, t.category)),
      liabilities: merge(p.liabilities, x.liabilities, (t) => k(t, t.kind)),
      assets: merge(p.assets, x.assets, (t) => k(t, t.kind)),
      family: merge(p.family, x.family, (t) => k(t, t.relation)),
      insurance: { ...p.insurance, ...x.insurance },
    }));
    for (const g of x.goals) {
      const existing = this.goals().find((e) => e.label.toLowerCase() === g.label.toLowerCase());
      await this.saveGoal(existing ? { ...g, id: existing.id, priorityOverride: existing.priorityOverride } : g);
    }
  }

  /** Replaces open questions with the latest set from the assistant. */
  async setQuestions(drafts: PendingQuestionDraft[]): Promise<void> {
    const open = this.storedOpen();
    const keep = new Set(drafts.map((d) => d.key));
    for (const q of open.filter((q) => !keep.has(q.key))) {
      await this.vault.put(['pendingQuestions', q.id], { ...q, status: 'answered' }, { status: 'answered' });
    }
    const added: PendingQuestion[] = [];
    for (const d of drafts.filter((d) => !open.some((q) => q.key === d.key))) {
      const q: PendingQuestion = { ...d, id: crypto.randomUUID(), status: 'open', createdAt: Date.now() };
      await this.vault.put(['pendingQuestions', q.id], q, { status: 'open' });
      added.push(q);
    }
    this.questions.update((qs) => [...qs.map((q) => (open.includes(q) && !keep.has(q.key) ? { ...q, status: 'answered' as const } : q)), ...added]);
  }

  async dismissQuestion(id: string): Promise<void> {
    if (id.startsWith('derived:')) {
      // Remember the dismissal so the gap is not asked about again.
      const d = this.openQuestions().find((x) => x.id === id);
      if (!d) return;
      const q: PendingQuestion = { key: d.key, question: d.question, why: d.why, optional: d.optional, id: crypto.randomUUID(), status: 'dismissed', createdAt: Date.now() };
      await this.vault.put(['pendingQuestions', q.id], q, { status: 'dismissed' });
      this.questions.update((qs) => [...qs, q]);
      return;
    }
    const q = this.questions().find((x) => x.id === id);
    if (!q) return;
    const next = { ...q, status: 'dismissed' as const };
    await this.vault.put(['pendingQuestions', id], next, { status: 'dismissed' });
    this.questions.update((qs) => qs.map((x) => (x.id === id ? next : x)));
  }

  /** Goals live in their own documents; bump the profile version so AI context updates. */
  private async bumpVersion(): Promise<void> {
    await this.saveProfile(this.profile());
  }

  /** Yes/no answer for insurance questions. */
  async setInsurance(kind: 'health' | 'term', has: boolean): Promise<void> {
    await this.updateProfile((p) => ({ ...p, insurance: { ...p.insurance, [kind]: has } }));
  }

  async markOnboarded(): Promise<void> {
    if (!this.profile().onboarded) await this.updateProfile((p) => ({ ...p, onboarded: true }));
  }

  /** Compact, provider-independent context for AI prompts (amounts in rupees). */
  snapshot(): { version: number; data: Record<string, unknown> } {
    const p = this.profile();
    const m = this.metrics();
    const r = (paise: number | null) => (paise === null ? null : Math.round(paise / 100));
    return {
      version: p.version,
      data: {
        currency: 'INR',
        incomes: p.incomes.map((i) => ({ label: i.label, kind: i.kind, amount: r(i.amount), frequency: i.frequency, earner: i.earner, source: i.provenance })),
        expenses: p.expenses.map((e) => ({ label: e.label, category: e.category, amount: r(e.amount), frequency: e.frequency, need: e.need, source: e.provenance })),
        liabilities: p.liabilities.map((l) => ({ label: l.label, kind: l.kind, outstanding: r(l.outstanding), monthlyPayment: r(l.monthlyPayment), interestRate: l.interestRate ?? null })),
        assets: p.assets.map((a) => ({ label: a.label, kind: a.kind, value: r(a.value) })),
        family: p.family.map((f) => ({ relation: f.relation, age: f.age ?? null, dependent: f.dependent })),
        insurance: p.insurance,
        assumptions: p.assumptions,
        calculated: {
          monthlyIncome: r(m.monthlyIncome),
          monthlyExpenses: r(m.monthlyExpenses),
          monthlyDebtPayments: r(m.monthlyDebtPayments),
          monthlySurplus: r(m.monthlySurplus),
          savingsRatePct: m.savingsRate === null ? null : Math.round(m.savingsRate * 1000) / 10,
          debtToIncomePct: m.debtToIncome === null ? null : Math.round(m.debtToIncome * 1000) / 10,
          emergencyMonths: m.emergencyMonths === null ? null : Math.round(m.emergencyMonths * 10) / 10,
          netWorth: r(m.netWorth),
          healthScore: this.health().score,
        },
        goals: this.plans().map((g) => ({
          rank: g.rank,
          label: g.goal.label,
          category: g.goal.category,
          target: r(g.goal.target),
          saved: r(g.goal.saved),
          targetDate: g.goal.targetDate ?? null,
          requiredMonthly: r(g.requiredMonthly),
          status: g.status,
        })),
        openQuestions: this.openQuestions().map((q) => q.question),
      },
    };
  }
}

