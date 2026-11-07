import { Component } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { todayOutline } from 'ionicons/icons';

@Component({
  selector: 'app-today',
  imports: [IonContent, IonIcon],
  template: `
    <ion-content>
      <div class="ap-container state">
        <ion-icon name="today-outline" aria-hidden="true" />
        <h1>Today's Updates</h1>
        <p class="ap-muted">
          Log spending, income, and investments in one line, such as "Spent ₹500 on groceries via
          UPI", then review before saving. Available after encrypted storage is in place.
        </p>
      </div>
    </ion-content>
  `,
  styleUrl: '../placeholder-state.scss',
})
export class TodayPage {
  constructor() {
    addIcons({ todayOutline });
  }
}
