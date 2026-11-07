import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/** Only signed-in users; others go to the sign-in page. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  return auth.signedIn() ? true : router.createUrlTree(['/auth']);
};

/** Public-only pages (landing, sign-in); signed-in users go to the dashboard. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  return auth.signedIn() ? router.createUrlTree(['/app']) : true;
};
