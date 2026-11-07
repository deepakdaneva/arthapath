import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { VaultService } from './vault.service';

/** The app requires a PIN to be set up and the vault unlocked. */
export const vaultUnlockedGuard: CanActivateFn = async (_route, state) => {
  const vault = inject(VaultService);
  const router = inject(Router);
  try {
    switch (await vault.load()) {
      case 'unlocked':
        return true;
      case 'no-pin':
        return router.createUrlTree(['/setup-pin']);
      default:
        return router.createUrlTree(['/unlock'], { queryParams: { r: state.url } });
    }
  } catch {
    // Could not read settings (for example offline on first use): the unlock
    // page shows the error and a retry.
    return router.createUrlTree(['/unlock'], { queryParams: { r: state.url } });
  }
};

/** PIN setup page only while no PIN exists. */
export const needsPinGuard: CanActivateFn = async () => {
  const vault = inject(VaultService);
  const router = inject(Router);
  try {
    const s = await vault.load();
    return s === 'no-pin' ? true : router.createUrlTree([s === 'unlocked' ? '/app' : '/unlock']);
  } catch {
    return router.createUrlTree(['/unlock']);
  }
};
