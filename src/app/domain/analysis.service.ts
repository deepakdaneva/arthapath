import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { adapterFor } from '../ai/adapters';
import { AiKeysService } from '../ai/ai-keys.service';
import { SYSTEM_PROMPT } from '../ai/prompts';
import { redacted } from '../ai/redact';
import { route } from '../ai/router';
import { VaultService } from '../core/crypto/vault.service';
import { ProfileService } from './profile.service';
import { recommendations } from './recommendations';
import { isoDate } from './transactions';
import { TransactionsService } from './transactions.service';

export interface Analysis {
  id: string;
  createdAt: number;
  provider: string;
  model: string;
  /** Profile version the analysis was based on. */
  contextVersion: number;
  /** Key figures at the time, so history shows how things moved. */
  figures: { score: number | null; savingsRatePct: number | null; surplus: number; netWorth: number | null };
  text: string;
}

const COLLECTION = ['analyses'];
/** Suggest a fresh analysis after this many days. */
const STALE_DAYS = 30;

export const ANALYSIS_PROMPT = `Write a personal financial analysis for this user from the context below.
Structure, in Markdown with short headings:
1. Where you stand (2-3 sentences using the calculated figures).
2. What is going well.
3. What needs attention (use the calculated recommendations; explain why, in plain words).
4. Your next three steps for the coming month (specific amounts where the figures support them).
Rules: use only the figures given; never invent numbers. Mark estimates and assumptions as such. Keep it under 400 words. Educational guidance, not regulated advice; suggest a licensed professional for complex tax, legal, or investment decisions.`;

/**
 * AI analyses on request, saved encrypted (analyses/{id}) with the figures at
 * the time. Never runs on its own; the app only suggests when one is due.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly vault = inject(VaultService);
  private readonly profile = inject(ProfileService);
  private readonly tx = inject(TransactionsService);
  private readonly keys = inject(AiKeysService);

  readonly history = signal<Analysis[]>([]);
  readonly loaded = signal(false);
  readonly recommendations = computed(() => recommendations(this.profile.profile(), this.profile.metrics(), this.profile.plans()));

  /** Why a fresh analysis would help now, or null. */
  readonly nudge = computed<string | null>(() => {
    if (!this.loaded() || !this.profile.hasData()) return null;
    const last = this.history()[0];
    if (!last) return 'You have not had an analysis yet.';
    const days = Math.floor((Date.now() - last.createdAt) / 86_400_000);
    if (isoDate(new Date(last.createdAt)).slice(0, 7) !== isoDate(new Date()).slice(0, 7) && days >= 7) return 'A new month has started since your last analysis.';
    if (days >= STALE_DAYS) return `Your last analysis is ${days} days old.`;
    if (this.profile.plans().some((g) => g.status === 'behind') && last.figures.score !== this.profile.health().score) return 'A goal is behind schedule and your figures have changed.';
    return null;
  });

  constructor() {
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else {
        this.history.set([]);
        this.loaded.set(false);
      }
    });
  }

  async load(): Promise<void> {
    try {
      const rows = await this.vault.list<Analysis>(COLLECTION);
      this.history.set(rows.map((r) => ({ ...r.value, id: r.id })).sort((a, b) => b.createdAt - a.createdAt));
    } finally {
      this.loaded.set(true);
    }
  }

  async generate(): Promise<Analysis> {
    await Promise.all([this.profile.whenLoaded(), this.tx.whenLoaded(), this.keys.whenLoaded()]);
    const snap = this.profile.snapshot();
    const months = this.tx.totals().slice(-6).map((t) => ({
      month: t.month,
      income: Math.round((t.byType.income ?? 0) / 100),
      spending: Math.round((t.byType.expense ?? 0) / 100),
      savedAndInvested: Math.round(((t.byType.saving ?? 0) + (t.byType.investment ?? 0)) / 100),
    }));
    const recs = this.recommendations().map((r) => `- ${r.title}: ${r.detail}`).join('\n');
    const { response, used } = await route(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Financial context (version ${snap.version}, JSON, amounts in rupees):\n${JSON.stringify(snap.data)}` },
          { role: 'system', content: `Logged monthly totals (rupees):\n${JSON.stringify(months)}\n\nCalculated recommendations:\n${recs || '- none'}` },
          { role: 'user', content: ANALYSIS_PROMPT },
        ],
        temperature: 0.3,
        maxOutputTokens: 1400,
      },
      this.keys.candidates(),
      { call: (req, c, signal) => adapterFor(c.provider).complete(req, c, signal), now: () => Date.now(), onHealth: (h) => void this.keys.applyHealth(h) },
    );
    const m = this.profile.metrics();
    const a: Analysis = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      provider: this.keys.nameOf(used),
      model: response.model,
      contextVersion: snap.version,
      figures: {
        score: this.profile.health().score,
        savingsRatePct: m.savingsRate === null ? null : Math.round(m.savingsRate * 1000) / 10,
        surplus: m.monthlySurplus,
        netWorth: m.netWorth,
      },
      text: redacted(response.text).slice(0, 20_000),
    };
    await this.vault.put([...COLLECTION, a.id], a);
    this.history.update((h) => [a, ...h]);
    return a;
  }

  async remove(id: string): Promise<void> {
    await this.vault.remove([...COLLECTION, id]);
    this.history.update((h) => h.filter((a) => a.id !== id));
  }
}
