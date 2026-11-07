import { Component, inject } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton } from '@ionic/angular';
import { ThemeService, type ThemeMode } from '../../core/theme.service';

@Component({
  selector: 'app-settings',
  imports: [IonContent, IonList, IonItem, IonLabel, IonSegment, IonSegmentButton],
  template: `
    <ion-content>
      <div class="ap-container page">
        <h1>Settings</h1>
        <div class="ap-card">
          <ion-list lines="none">
            <ion-item>
              <ion-label id="theme-label">Appearance</ion-label>
            </ion-item>
            <ion-segment
              aria-labelledby="theme-label"
              [value]="theme.mode()"
              (ionChange)="setMode($event.detail.value)"
            >
              <ion-segment-button value="system"><ion-label>System</ion-label></ion-segment-button>
              <ion-segment-button value="light"><ion-label>Light</ion-label></ion-segment-button>
              <ion-segment-button value="dark"><ion-label>Dark</ion-label></ion-segment-button>
            </ion-segment>
          </ion-list>
        </div>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-bottom: 96px;
    }
  `,
})
export class SettingsPage {
  readonly theme = inject(ThemeService);

  setMode(v: unknown): void {
    if (v === 'system' || v === 'light' || v === 'dark') this.theme.mode.set(v as ThemeMode);
  }
}
