import { Component, inject } from '@angular/core';
import { IonApp } from '@ionic/angular/ion-app';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';
import { ThemeService } from './core/theme.service';
import { UpdateService } from './core/update.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet /></ion-app>`,
})
export class App {
  // Instantiated at startup so the saved theme applies before first paint.
  protected readonly theme = inject(ThemeService);

  constructor() {
    // Offers a reload when a newer version is deployed (landing page included).
    inject(UpdateService).start();
  }
}
