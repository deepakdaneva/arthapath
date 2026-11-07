import { Component } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline } from 'ionicons/icons';

@Component({
  selector: 'app-chat',
  imports: [IonContent, IonIcon],
  template: `
    <ion-content>
      <div class="ap-container state">
        <ion-icon name="chatbubbles-outline" aria-hidden="true" />
        <h1>Chat</h1>
        <p class="ap-muted">
          Conversational onboarding and financial Q&amp;A arrive once encryption and AI provider setup
          are in place. You will be able to describe your finances in plain language and pick up the
          conversation on any AI provider.
        </p>
      </div>
    </ion-content>
  `,
  styleUrl: '../placeholder-state.scss',
})
export class ChatPage {
  constructor() {
    addIcons({ chatbubblesOutline });
  }
}
