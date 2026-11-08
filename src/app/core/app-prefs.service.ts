import { Injectable, effect, inject, signal } from '@angular/core';
import { VaultService } from './crypto/vault.service';

export interface AppPrefs {
  /** Imports: let the AI provider categorize rows the device could not. Off by default. */
  aiCategorizeImports: boolean;
}

const DEFAULTS: AppPrefs = { aiCategorizeImports: false };

/** App preferences, stored encrypted in vault/main next to the security preferences. */
@Injectable({ providedIn: 'root' })
export class AppPrefsService {
  private readonly vault = inject(VaultService);
  readonly prefs = signal<AppPrefs>(DEFAULTS);

  constructor() {
    effect(() => {
      this.vault.lockEpoch();
      if (this.vault.unlocked()) void this.load();
      else this.prefs.set(DEFAULTS);
    });
  }

  private async load(): Promise<void> {
    try {
      const doc = await this.vault.get<{ app?: Partial<AppPrefs> }>(['vault', 'main']);
      this.prefs.set({ ...DEFAULTS, ...(doc?.app ?? {}) });
    } catch {
      // Keep defaults (AI categorization off) when preferences cannot be read.
    }
  }

  async set(change: Partial<AppPrefs>): Promise<void> {
    const next = { ...this.prefs(), ...change };
    const doc = (await this.vault.get<Record<string, unknown>>(['vault', 'main'])) ?? {};
    await this.vault.put(['vault', 'main'], { ...doc, app: next });
    this.prefs.set(next);
  }
}
