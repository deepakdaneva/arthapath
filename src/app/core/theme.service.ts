import { Injectable, effect, signal } from '@angular/core';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'arthapath.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.load());
  /** The theme in effect (system resolved); charts pick their palette from it. */
  readonly dark = signal(false);
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

  /** System → Light → Dark → System. */
  cycle(): void {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    this.mode.set(order[(order.indexOf(this.mode()) + 1) % order.length]!);
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
    this.dark.set(dark);
    // Android: status bar icons follow the app theme, not the phone's.
    if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
}
