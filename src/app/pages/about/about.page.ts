import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { version } from '../../../../package.json';
import { repoRef, repoUrl } from '../../../environments/app-config';

@Component({
  selector: 'app-about',
  imports: [IonContent, RouterLink],
  template: `
    <ion-content>
      <div class="ap-container page">
        <h1>About ArthaPath</h1>
        <div class="ap-card">
          <p><strong>Your Money. Your Goals. Your Financial Future.</strong></p>
          <p class="ap-muted">
            ArthaPath is an open-source, privacy-first personal financial planner. Financial data is
            encrypted on your device, and AI features use the provider and keys you choose.
          </p>
          <dl>
            <dt>Version</dt>
            <dd>{{ version }}</dd>
            <dt>License</dt>
            <dd>
              <a [href]="license" target="_blank" rel="noopener">Apache License 2.0</a>
            </dd>
            <dt>Source</dt>
            <dd><a [href]="repo" target="_blank" rel="noopener">github.com/deepakdaneva/arthapath</a> ({{ ref }})</dd>
            <dt>Third-party software</dt>
            <dd><a href="3rdpartylicenses.txt" target="_blank" rel="noopener">Licenses</a></dd>
          </dl>
          <p class="ap-muted small">
            Informational financial assistance only. Not a substitute for a qualified financial, tax,
            or legal professional. <a routerLink="/terms">Terms</a> ·
            <a routerLink="/privacy">Privacy</a>
          </p>
        </div>
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      padding-bottom: 96px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 16px;
    }
    dt {
      color: var(--ap-text-muted);
    }
    dd {
      margin: 0;
    }
    a {
      color: var(--ion-color-secondary);
    }
    .small {
      font-size: 0.85rem;
    }
  `,
})
export class AboutPage {
  readonly version = version;
  readonly ref = repoRef;
  readonly repo = `${repoUrl}/tree/${repoRef}`;
  readonly license = `${repoUrl}/blob/${repoRef}/LICENSE`;
}
