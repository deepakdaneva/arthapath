import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AiStatusService } from '../core/ai-status.service';
import { VaultService } from '../core/crypto/vault.service';
import type { AIErrorKind } from './errors';
import { PROVIDERS, maskKey, type ProviderId } from './providers';
import { eligible, type KeyHealthUpdate, type RouteCandidate } from './router';

/** One configured key. Stored encrypted (users/{uid}/aiKeys/{id}); decrypted only in memory while unlocked. */
export interface AiKeyRecord {
  id: string;
  provider: ProviderId;
  label: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
  priority: number;
  createdAt: number;
  cooldownUntil?: number | null;
  blocked?: 'auth_invalid' | 'model_unavailable' | null;
  lastError?: AIErrorKind | null;
}

/** Safe view for the UI: never contains the full key. */
export interface AiKeyView extends Omit<AiKeyRecord, 'apiKey'> {
  masked: string;
  providerName: string;
  status: 'ready' | 'disabled' | 'cooling' | 'invalid' | 'model';
}

export type NewKey = Pick<AiKeyRecord, 'provider' | 'label' | 'apiKey' | 'model' | 'baseUrl'>;

const COLLECTION = 'aiKeys';

@Injectable({ providedIn: 'root' })
export class AiKeysService {
  private readonly vault = inject(VaultService);
  private readonly status = inject(AiStatusService);

  private readonly records = signal<AiKeyRecord[]>([]);
  readonly loaded = signal(false);
  readonly loadError = signal(false);
  /** Re-evaluates cooldown expiry. */
  private readonly clock = signal(Date.now());

  readonly keys = computed<AiKeyView[]>(() => {
    const now = this.clock();
    return [...this.records()]
      .sort((a, b) => a.priority - b.priority)
      .map(({ apiKey, ...r }) => ({
        ...r,
        masked: maskKey(apiKey),
        providerName: r.provider === 'custom' ? r.label || 'Custom' : PROVIDERS[r.provider].name,
        status: !r.enabled
          ? 'disabled'
          : r.blocked === 'auth_invalid'
            ? 'invalid'
            : r.blocked === 'model_unavailable'
              ? 'model'
              : r.cooldownUntil && r.cooldownUntil > now
                ? 'cooling'
                : 'ready',
      }));
  });

  constructor() {
    setInterval(() => this.clock.set(Date.now()), 30_000);
    // Load after unlock; forget decrypted keys on lock or sign-out.
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else {
        this.records.set([]);
        this.loaded.set(false);
      }
    });
    // Keep the top-bar indicator in sync with the first usable key.
    effect(() => {
      this.clock();
      const all = this.candidates();
      const ready = eligible(all, Date.now());
      if (ready[0]) {
        const r = ready[0];
        const s = this.status.status();
        if (s.state !== 'active' || s.provider !== this.nameOf(r)) {
          this.status.set({ provider: this.nameOf(r), model: r.credentials.model, state: 'active' });
        }
      } else if (all.some((c) => c.enabled)) {
        const first = all.filter((c) => c.enabled).sort((a, b) => a.priority - b.priority)[0]!;
        this.status.set({ provider: this.nameOf(first), model: first.credentials.model, state: 'exhausted' });
      } else {
        this.status.set({ provider: null, model: null, state: 'none' });
      }
    });
  }

  nameOf(c: RouteCandidate): string {
    return c.credentials.provider === 'custom' ? c.label || 'Custom' : PROVIDERS[c.credentials.provider].name;
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
      const rows = await this.vault.list<AiKeyRecord>([COLLECTION]);
      this.records.set(rows.map((r) => ({ ...r.value, id: r.id })));
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loaded.set(true);
    }
  }

  /** Decrypted credentials for the router (memory only). */
  candidates(): RouteCandidate[] {
    return this.records().map((r) => ({
      id: r.id,
      label: r.label,
      priority: r.priority,
      enabled: r.enabled,
      cooldownUntil: r.cooldownUntil ?? null,
      blocked: r.blocked ?? null,
      credentials: { provider: r.provider, apiKey: r.apiKey, model: r.model, baseUrl: r.baseUrl },
    }));
  }

  async add(input: NewKey): Promise<void> {
    const max = Math.max(0, ...this.records().map((r) => r.priority));
    const rec: AiKeyRecord = {
      ...input,
      apiKey: input.apiKey.trim(),
      label: input.label.trim(),
      id: crypto.randomUUID(),
      enabled: true,
      priority: max + 1,
      createdAt: Date.now(),
      cooldownUntil: null,
      blocked: null,
      lastError: null,
    };
    await this.save(rec);
    this.records.update((rs) => [...rs, rec]);
  }

  /** Edits a key. Changing the key or model clears its error state. */
  async update(id: string, patch: Partial<Pick<AiKeyRecord, 'label' | 'apiKey' | 'model' | 'baseUrl' | 'enabled'>>): Promise<void> {
    const cur = this.records().find((r) => r.id === id);
    if (!cur) return;
    const resets = patch.apiKey !== undefined || patch.model !== undefined;
    const next: AiKeyRecord = {
      ...cur,
      ...patch,
      ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey.trim() } : {}),
      ...(resets ? { blocked: null, cooldownUntil: null, lastError: null } : {}),
    };
    await this.save(next);
    this.replace(next);
  }

  async remove(id: string): Promise<void> {
    await this.vault.remove([COLLECTION, id]);
    this.records.update((rs) => rs.filter((r) => r.id !== id));
  }

  /** Moves a key up (-1) or down (+1) in the fallback order. */
  async move(id: string, delta: -1 | 1): Promise<void> {
    const sorted = [...this.records()].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    const renumbered = sorted.map((r, idx) => ({ ...r, priority: idx + 1 }));
    const changed = renumbered.filter((r) => r.priority !== this.records().find((o) => o.id === r.id)!.priority);
    await Promise.all(changed.map((r) => this.save(r)));
    this.records.set(renumbered);
  }

  /** Persists router feedback only when the key's state actually changes (saves writes). */
  async applyHealth(u: KeyHealthUpdate): Promise<void> {
    const cur = this.records().find((r) => r.id === u.id);
    if (!cur) return;
    const same =
      (cur.cooldownUntil ?? null) === u.cooldownUntil && (cur.blocked ?? null) === u.blocked && (cur.lastError ?? null) === u.lastError;
    if (same) return;
    const next = { ...cur, cooldownUntil: u.cooldownUntil, blocked: u.blocked, lastError: u.lastError };
    this.replace(next);
    try {
      await this.save(next);
    } catch {
      // Offline: kept in memory; saved with the next change.
    }
  }

  private replace(rec: AiKeyRecord): void {
    this.records.update((rs) => rs.map((r) => (r.id === rec.id ? rec : r)));
  }

  private save(rec: AiKeyRecord): Promise<void> {
    return this.vault.put([COLLECTION, rec.id], rec);
  }
}
