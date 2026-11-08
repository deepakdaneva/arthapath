import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { AuthService } from '../../core/auth.service';
import type { GoalSuggestion } from '../../domain/engine';
import { formatInr } from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';
import { VerifyBannerComponent } from '../../shell/verify-banner.component';

@Component({
  selector: 'app-dashboard',
  imports: [IonContent, IonButton, IonSpinner, RouterLink, VerifyBannerComponent, PercentPipe, DecimalPipe],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  readonly svc = inject(ProfileService);
  readonly fmt = formatInr;
  readonly firstName = computed(() => this.auth.user()?.displayName?.split(' ')[0] ?? '');
  readonly m = this.svc.metrics;
  readonly health = this.svc.health;
  readonly topGoals = computed(() => this.svc.plans().slice(0, 5));

  statusLabel(s: string): string {
    return { achieved: 'Achieved', on_track: 'On track', at_risk: 'At risk', behind: 'Behind', no_date: 'No date' }[s] ?? s;
  }

  async addSuggestion(s: GoalSuggestion): Promise<void> {
    await this.svc.saveGoal({ id: crypto.randomUUID(), label: s.label, category: s.category, target: s.target, saved: 0, provenance: 'calculated' });
  }
}
