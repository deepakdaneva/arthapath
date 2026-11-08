import { Component, computed, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { IonAvatar } from '@ionic/angular/ion-avatar';
import { IonButton } from '@ionic/angular/ion-button';
import { IonFab } from '@ionic/angular/ion-fab';
import { IonFabButton } from '@ionic/angular/ion-fab-button';
import { IonFooter } from '@ionic/angular/ion-footer';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonItem } from '@ionic/angular/ion-item';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonList } from '@ionic/angular/ion-list';
import { IonPopover } from '@ionic/angular/ion-popover';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { NavController } from '@ionic/angular/nav-controller';
import { addIcons } from 'ionicons';
import {
  add,
  chatbubbles,
  chatbubblesOutline,
  contrastOutline,
  documentTextOutline,
  informationCircleOutline,
  keyOutline,
  moonOutline,
  notificationsOffOutline,
  notificationsOutline,
  settingsOutline,
  sunnyOutline,
  receipt,
  receiptOutline,
  walletOutline,
  analyticsOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { AuthService } from '../core/auth.service';
import { SessionLockService } from '../core/crypto/session-lock.service';
import { ThemeService } from '../core/theme.service';
import { TransactionsService } from '../domain/transactions.service';
import { ProfileService } from '../domain/profile.service';
import { UpdateService } from '../core/update.service';
import { AiStatusComponent } from './ai-status.component';

@Component({
  selector: 'app-shell',
  imports: [
    IonHeader,
    IonToolbar,
    IonFooter,
    IonButton,
    IonAvatar,
    IonIcon,
    IonPopover,
    IonList,
    IonItem,
    IonLabel,
    IonFab,
    IonFabButton,
    IonRouterOutlet,
    RouterLink,
    AiStatusComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { class: 'ion-page' },
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly menu = viewChild.required<IonPopover>('accountMenu');
  // Starts auto-lock (inactivity and background) while the app shell is open.
  private readonly sessionLock = inject(SessionLockService);

  readonly user = this.auth.user;
  readonly version = inject(UpdateService).version;
  readonly theme = inject(ThemeService);
  private readonly profileSvc = inject(ProfileService);
  readonly openQuestions = computed(() => this.profileSvc.openQuestions().length);
  private readonly txSvc = inject(TransactionsService);
  readonly updateOverdue = computed(() => this.txSvc.updateOverdueDays());
  private static readonly THEME = {
    system: { label: 'System', icon: 'contrast-outline' },
    light: { label: 'Light', icon: 'sunny-outline' },
    dark: { label: 'Dark', icon: 'moon-outline' },
  } as const;
  readonly themeLabel = computed(() => ShellComponent.THEME[this.theme.mode()].label);
  readonly themeIcon = computed(() => ShellComponent.THEME[this.theme.mode()].icon);
  readonly nextThemeLabel = computed(
    () => ({ system: 'Light', light: 'Dark', dark: 'System' })[this.theme.mode()],
  );
  readonly initials = computed(() => {
    const u = this.user();
    const src = u?.displayName || u?.email || '?';
    return src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('');
  });

  readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  readonly onChat = computed(() => this.url().startsWith('/app/chat'));
  readonly onUpdates = computed(() => this.url().startsWith('/app/updates'));
  readonly hasComposer = computed(() => this.onChat() || this.onUpdates() || this.url().startsWith('/app/onboarding'));

  constructor() {
    addIcons({
      add,
      chatbubbles,
      chatbubblesOutline,
      contrastOutline,
      documentTextOutline,
      informationCircleOutline,
      keyOutline,
      moonOutline,
      notificationsOffOutline,
      notificationsOutline,
      settingsOutline,
      sunnyOutline,
      receipt,
      receiptOutline,
      walletOutline,
      analyticsOutline,
      cloudUploadOutline,
    });
  }

  async go(path: string): Promise<void> {
    await this.menu().dismiss();
    await this.router.navigateByUrl(path);
  }

  async logout(): Promise<void> {
    await this.menu().dismiss();
    await this.auth.signOut();
    await this.nav.navigateRoot('/');
  }
}
