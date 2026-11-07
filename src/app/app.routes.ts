import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
    title: 'ArthaPath · Your Money. Your Goals. Your Financial Future.',
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
    path: 'app',
    canActivate: [authGuard],
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
        path: 'today',
        loadComponent: () => import('./pages/today/today.page').then((m) => m.TodayPage),
        title: "Today's Updates · ArthaPath",
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
        path: 'about',
        loadComponent: () => import('./pages/about/about.page').then((m) => m.AboutPage),
        title: 'About · ArthaPath',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
