import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'arthapath.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.load());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply(this.mode()));
    effect(() => {
      const m = this.mode();
      this.apply(m);
      try {
        localStorage.setItem(KEY, m);
      } catch {
        // Storage unavailable (private mode): theme still applies for this session.
      }
    });
  }

  private load(): ThemeMode {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(m: ThemeMode): void {
    const dark = m === 'dark' || (m === 'system' && this.media.matches);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
  }
}
