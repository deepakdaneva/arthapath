import { Injectable, computed, signal } from '@angular/core';

export interface AiStatus {
  /** Provider display name, e.g. "Gemini"; null when none is configured. */
  provider: string | null;
  model: string | null;
  state: 'none' | 'active' | 'exhausted';
}

/**
 * Current AI provider shown next to the logo. The AI router (Phase 5)
 * reports provider changes here; a switch after a provider is exhausted
 * makes the indicator blink so the user notices.
 */
@Injectable({ providedIn: 'root' })
export class AiStatusService {
  readonly status = signal<AiStatus>({ provider: null, model: null, state: 'none' });
  /** Increments on each switch; the indicator restarts its blink animation. */
  readonly switchCount = signal(0);

  readonly label = computed(() => {
    const s = this.status();
    if (s.state === 'none' || !s.provider) return 'AI not configured';
    if (s.state === 'exhausted') return `${s.provider} limit reached`;
    return s.model ? `${s.provider} · ${s.model}` : s.provider;
  });

  set(status: AiStatus): void {
    this.status.set(status);
  }

  /** Called when the current provider is exhausted and the next one takes over. */
  switchedTo(provider: string, model: string | null): void {
    this.status.set({ provider, model, state: 'active' });
    this.switchCount.update((n) => n + 1);
  }
}
