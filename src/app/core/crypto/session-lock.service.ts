import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular/nav-controller';
import { VaultService } from './vault.service';

export interface SecurityPrefs {
  /** Lock after this many minutes without interaction. */
  lockAfterMinutes: number;
  /** Lock if the app stays in the background longer than this. */
  backgroundGraceSeconds: number;
}

export const LOCK_OPTIONS = [1, 5, 15, 30] as const;
const DEFAULTS: SecurityPrefs = { lockAfterMinutes: 5, backgroundGraceSeconds: 30 };
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Auto-lock policy: inactivity timeout, background (tab hidden or app paused),
 * and sign-out. Preferences are stored encrypted in users/{uid}/vault/main.
 */
@Injectable({ providedIn: 'root' })
export class SessionLockService {
  private readonly vault = inject(VaultService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  readonly prefs = signal<SecurityPrefs>(DEFAULTS);
  private lastActivity = Date.now();
  private hiddenAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly onActivity = () => {
    this.lastActivity = Date.now();
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
    } else if (this.hiddenAt !== null) {
      const away = Date.now() - this.hiddenAt;
      this.hiddenAt = null;
      if (away > this.prefs().backgroundGraceSeconds * 1000) this.lockNow();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    effect(() => {
      if (this.vault.unlocked()) {
        this.start();
        void this.loadPrefs();
      } else {
        this.stop();
        this.prefs.set(DEFAULTS);
      }
    });
  }

  lockNow(): void {
    this.vault.lock();
    const url = this.router.url;
    // Root navigation destroys cached app pages, so no decrypted data stays
    // in the (hidden) DOM while locked.
    void this.nav.navigateRoot(['/unlock'], { queryParams: url.startsWith('/app') ? { r: url } : {} });
  }

  async setLockAfter(minutes: number): Promise<void> {
    const next = { ...this.prefs(), lockAfterMinutes: minutes };
    const doc = (await this.vault.get<{ prefs?: SecurityPrefs }>(['vault', 'main'])) ?? {};
    await this.vault.put(['vault', 'main'], { ...doc, prefs: next });
    this.prefs.set(next);
  }

  private async loadPrefs(): Promise<void> {
    try {
      const doc = await this.vault.get<{ prefs?: Partial<SecurityPrefs> }>(['vault', 'main']);
      if (doc?.prefs) this.prefs.set({ ...DEFAULTS, ...doc.prefs });
    } catch {
      // Offline or not yet created: defaults apply.
    }
  }

  private start(): void {
    if (this.timer) return;
    this.lastActivity = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, this.onActivity, { passive: true }));
    document.addEventListener('visibilitychange', this.onVisibility);
    this.timer = setInterval(() => {
      if (Date.now() - this.lastActivity > this.prefs().lockAfterMinutes * 60_000) this.lockNow();
    }, 15_000);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, this.onActivity));
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
