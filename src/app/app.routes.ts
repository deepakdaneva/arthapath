import { Routes } from '@angular/router';
import { appStartGuard, authGuard, guestGuard } from './core/auth.guards';
import { needsPinGuard, vaultUnlockedGuard } from './core/crypto/vault.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard, appStartGuard],
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
    title: 'ArthaPath · Your Money. Your Goals. Your Financial Future.',
  },
  {
    path: 'welcome',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/welcome/welcome.page').then((m) => m.WelcomePage),
    title: 'Welcome · ArthaPath',
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
    title: 'Sign in · ArthaPath',
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
    data: { doc: 'privacy' },
    title: 'Privacy Policy · ArthaPath',
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
    data: { doc: 'terms' },
    title: 'Terms of Service · ArthaPath',
  },
  {
    path: 'setup-pin',
    canActivate: [authGuard, needsPinGuard],
    loadComponent: () => import('./pages/pin/setup-pin.page').then((m) => m.SetupPinPage),
    title: 'Set up your PIN · ArthaPath',
  },
  {
    path: 'unlock',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pin/unlock.page').then((m) => m.UnlockPage),
    title: 'Unlock · ArthaPath',
  },
  {
    path: 'app',
    canActivate: [authGuard, vaultUnlockedGuard],
    canActivateChild: [vaultUnlockedGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
        title: 'Dashboard · ArthaPath',
      },
      {
        path: 'chat',
        loadComponent: () => import('./pages/chat/chat.page').then((m) => m.ChatPage),
        title: 'Chat · ArthaPath',
      },
      {
        path: 'updates',
        loadComponent: () => import('./pages/updates/updates.page').then((m) => m.UpdatesPage),
        title: 'Updates · ArthaPath',
      },
      // Old name of the Updates tab.
      { path: 'today', redirectTo: 'updates', pathMatch: 'full' },
      {
        path: 'analysis',
        loadComponent: () => import('./pages/analysis/analysis.page').then((m) => m.AnalysisPage),
        title: 'Analysis · ArthaPath',
      },
      {
        path: 'questions',
        loadComponent: () => import('./pages/questions/questions.page').then((m) => m.QuestionsPage),
        title: 'Questions · ArthaPath',
      },
      {
        path: 'import',
        loadComponent: () => import('./pages/import/import.page').then((m) => m.ImportPage),
        title: 'Import · ArthaPath',
      },
      {
        path: 'details/goal/:id',
        loadComponent: () => import('./pages/details/details.page').then((m) => m.DetailsPage),
        title: 'Goal · ArthaPath',
      },
      {
        path: 'details/:topic',
        loadComponent: () => import('./pages/details/details.page').then((m) => m.DetailsPage),
        title: 'Details · ArthaPath',
      },

      {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
        title: 'Profile · ArthaPath',
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
        title: 'Settings · ArthaPath',
      },
      {
        path: 'onboarding',
        loadComponent: () => import('./pages/onboarding/onboarding.page').then((m) => m.OnboardingPage),
        title: 'Your financial goals · ArthaPath',
      },
      {
        path: 'finances',
        loadComponent: () => import('./pages/finances/finances.page').then((m) => m.FinancesPage),
        title: 'Your finances · ArthaPath',
      },
      {
        path: 'ai-providers',
        loadComponent: () => import('./pages/ai-providers/ai-providers.page').then((m) => m.AiProvidersPage),
        title: 'AI Providers · ArthaPath',
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/about/about.page').then((m) => m.AboutPage),
        title: 'About · ArthaPath',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
