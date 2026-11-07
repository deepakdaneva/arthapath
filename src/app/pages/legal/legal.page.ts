import { Component, inject, resource } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';
import { repoRef, repoUrl } from '../../../environments/app-config';

const DOCS: Record<string, { html: string; source: string }> = {
  privacy: { html: 'legal/privacy.html', source: 'docs/product/PRIVACY_POLICY.md' },
  terms: { html: 'legal/terms.html', source: 'docs/product/TERMS_OF_SERVICE.md' },
};

/**
 * Policy documents rendered at build time from docs/product (see
 * scripts/write-app-config.mjs), so the app shows the version from the branch
 * it was built from. Angular sanitizes the HTML before insertion.
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
            <a [href]="githubUrl" target="_blank" rel="noopener noreferrer">GitHub</a>.
          </p>
        } @else {
          <article class="ap-card markdown" [innerHTML]="doc.value()"></article>
          <p class="ap-muted source">
            Source:
            <a [href]="githubUrl" target="_blank" rel="noopener noreferrer">{{ entry.source }}</a>
            ({{ ref }})
          </p>
        }
      </div>
    </ion-content>
  `,
  styleUrl: './legal.page.scss',
})
export class LegalPage {
  readonly entry = DOCS[inject(ActivatedRoute).snapshot.data['doc'] as string] ?? DOCS['privacy']!;
  readonly ref = repoRef;
  readonly githubUrl = `${repoUrl}/blob/${repoRef}/${this.entry.source}`;

  readonly doc = resource({
    loader: async () => {
      const res = await fetch(this.entry.html);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
}
