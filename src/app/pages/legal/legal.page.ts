import { Component, inject, resource } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';

const FILES: Record<string, string> = {
  privacy: 'legal/PRIVACY_POLICY.md',
  terms: 'legal/TERMS_OF_SERVICE.md',
};

/**
 * Shows the policy documents from docs/product (copied as build assets), so the
 * app and the repository never diverge. Rendered as plain text: no HTML parsing.
 */
@Component({
  selector: 'app-legal',
  imports: [IonContent, IonSpinner, RouterLink],
  template: `
    <ion-content>
      <div class="ap-container page">
        <a routerLink="/" class="back">← ArthaPath</a>
        @if (doc.isLoading()) {
          <ion-spinner name="crescent" aria-label="Loading" />
        } @else if (doc.error()) {
          <p class="ap-error" role="alert">
            Could not load this document. Read it on
            <a [href]="repoUrl" target="_blank" rel="noopener">GitHub</a>.
          </p>
        } @else {
          <article class="ap-card text">{{ doc.value() }}</article>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding: 16px 20px 64px;
    }
    .back {
      display: inline-block;
      margin-bottom: 16px;
      color: var(--ion-color-secondary);
      text-decoration: none;
    }
    .text {
      white-space: pre-wrap;
      line-height: 1.6;
      font-size: 0.95rem;
    }
  `,
})
export class LegalPage {
  private readonly file = FILES[inject(ActivatedRoute).snapshot.data['doc'] as string] ?? FILES['privacy']!;
  readonly repoUrl = `https://github.com/deepakdaneva/arthapath/blob/main/docs/product/${this.file.split('/')[1]}`;

  readonly doc = resource({
    loader: async () => {
      const res = await fetch(this.file);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
}
