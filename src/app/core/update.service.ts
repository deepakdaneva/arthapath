import { Injectable, Injector, inject } from '@angular/core';
import { appVersion } from '../../environments/app-config';

const CHECK_EVERY_MS = 15 * 60_000;

/** True when `remote` is a newer MAJOR.MINOR.BUILD than `local`. */
export function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/**
 * Detects a newer deployment by polling the static /version.json (no
 * Firestore reads) when the app regains focus and every 15 minutes, then
 * offers a reload. Hashed asset names plus a no-cache index.html mean a
 * reload always loads the new version.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly injector = inject(Injector);
  private offered: string | null = null;
  private started = false;

  readonly version = appVersion;

  start(): void {
    if (this.started) return;
    this.started = true;
    setInterval(() => void this.check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    setTimeout(() => void this.check(), 30_000);
  }

  async check(): Promise<void> {
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      if (version && version !== this.offered && isNewer(version, appVersion)) {
        this.offered = version;
        await this.offer(version);
      }
    } catch {
      // Offline: try again later.
    }
  }

  private async offer(version: string): Promise<void> {
    // Loaded only when needed, keeping the toast out of the initial bundle.
    const { ToastController } = await import('@ionic/angular/toast-controller');
    const toast = await this.injector.get(ToastController).create({
      header: 'New version available',
      message: `ArthaPath ${version} is ready. Reloading locks the app, so you will need your PIN to continue.`,
      position: 'bottom',
      cssClass: 'update-toast',
      buttons: [
        { text: 'Later', role: 'cancel' },
        { text: 'Reload', role: 'reload', handler: () => location.reload() },
      ],
    });
    await toast.present();
  }
}
