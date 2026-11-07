import { Component, computed, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import {
  IonAvatar,
  IonButton,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPopover,
  IonRouterOutlet,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  chatbubbles,
  chatbubblesOutline,
  documentTextOutline,
  informationCircleOutline,
  keyOutline,
  logOutOutline,
  personOutline,
  settingsOutline,
  sparklesOutline,
  today,
  todayOutline,
} from 'ionicons/icons';
import { AuthService } from '../core/auth.service';

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
    IonNote,
    IonFab,
    IonFabButton,
    IonRouterOutlet,
    RouterLink,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { class: 'ion-page' },
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly menu = viewChild.required(IonPopover);

  readonly user = this.auth.user;
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
  readonly onToday = computed(() => this.url().startsWith('/app/today'));

  constructor() {
    addIcons({
      add,
      chatbubbles,
      chatbubblesOutline,
      documentTextOutline,
      informationCircleOutline,
      keyOutline,
      logOutOutline,
      personOutline,
      settingsOutline,
      sparklesOutline,
      today,
      todayOutline,
    });
  }

  async go(path: string): Promise<void> {
    await this.menu().dismiss();
    await this.router.navigateByUrl(path);
  }

  async logout(): Promise<void> {
    await this.menu().dismiss();
    await this.auth.signOut();
    await this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
