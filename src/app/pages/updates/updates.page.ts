import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { receiptOutline } from 'ionicons/icons';

@Component({
  selector: 'app-updates',
  imports: [IonContent, IonIcon],
  template: `
    <ion-content>
      <div class="ap-container state">
        <ion-icon name="receipt-outline" aria-hidden="true" />
        <h1>Updates</h1>
        <p class="ap-muted">
          Log spending, income, and investments whenever it suits you: daily, weekly, or once a month.
          Type it in one line, such as "Spent ₹500 on groceries via UPI" or "Paid ₹25,000 home loan EMI
          this month", then review before saving. Available in an upcoming release.
        </p>
      </div>
    </ion-content>
  `,
  styleUrl: '../placeholder-state.scss',
})
export class UpdatesPage {
  constructor() {
    addIcons({ receiptOutline });
  }
}
