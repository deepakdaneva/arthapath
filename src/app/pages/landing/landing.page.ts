import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { repoRef, repoUrl } from '../../../environments/app-config';
import {
  analyticsOutline,
  chatbubblesOutline,
  flagOutline,
  keyOutline,
  lockClosedOutline,
  logoAndroid,
  logoGithub,
  globeOutline,
  receiptOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-landing',
  imports: [IonContent, IonButton, IonIcon, RouterLink],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
})
export class LandingPage {
  // Links follow the deployed branch: development on UAT, main in production.
  readonly repo = `${repoUrl}/tree/${repoRef}`;
  readonly docs = `${repoUrl}/tree/${repoRef}/docs`;
  readonly releases = `${repoUrl}/releases/latest`;
  readonly year = new Date().getFullYear();

  readonly features: Feature[] = [
    {
      icon: 'chatbubbles-outline',
      title: 'Plan by conversation',
      text: 'Describe your income, family, loans, and goals in plain language. ArthaPath asks only for what is missing.',
    },
    {
      icon: 'flag-outline',
      title: 'Goals, prioritized',
      text: 'Emergency fund, home loan, education, retirement: see what to fund first and why, with monthly targets.',
    },
    {
      icon: 'analytics-outline',
      title: 'Interactive dashboard',
      text: 'Cash flow, savings rate, net worth, and goal progress. Tap any chart to drill into the transactions behind it.',
    },
    {
      icon: 'receipt-outline',
      title: 'Updates, on your schedule',
      text: '"Spent ₹500 on groceries via UPI." Log activity daily, weekly, or monthly in one line, review, and save. Import CSV and PDF statements too.',
    },
    {
      icon: 'swap-horizontal-outline',
      title: 'Any AI provider',
      text: 'Gemini, Groq, OpenRouter, or any OpenAI-compatible API. Add multiple keys; ArthaPath switches automatically at limits.',
    },
    {
      icon: 'key-outline',
      title: 'Your keys, your data',
      text: 'Bring your own API keys. Financial data is encrypted on your device before it is stored.',
    },
  ];

  constructor() {
    addIcons({
      analyticsOutline,
      chatbubblesOutline,
      flagOutline,
      keyOutline,
      lockClosedOutline,
      logoAndroid,
      logoGithub,
      globeOutline,
      receiptOutline,
      swapHorizontalOutline,
    });
  }
}
