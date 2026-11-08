import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { addIcons } from 'ionicons';
import { alertCircle, chevronForward, informationCircle, trendingUpOutline, warning } from 'ionicons/icons';
import { ChartComponent, type ChartOption } from '../../charts/chart.component';
import { chartTokens, seriesColors } from '../../charts/palette';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { STATUS_LABEL, type GoalSuggestion, type Severity, type SliceKey } from '../../domain/engine';
import { LIQUID_ASSETS, formatInr, type Paise } from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';
import { VerifyBannerComponent } from '../../shell/verify-banner.component';

/** Fixed colour slot per entity, so a slice keeps its colour when others are absent. */
const SLICE_SLOT: Record<SliceKey, number> = { necessary: 0, discretionary: 1, unnecessary: 4, debt: 3, investments: 2, savings: 5 };

@Component({
  selector: 'app-dashboard',
  imports: [IonContent, IonButton, IonIcon, IonSpinner, RouterLink, VerifyBannerComponent, PercentPipe, DecimalPipe, ChartComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  readonly svc = inject(ProfileService);
  readonly fmt = formatInr;
  readonly statusLabel = STATUS_LABEL;
  readonly firstName = computed(() => this.auth.user()?.displayName?.split(' ')[0] ?? '');
  readonly m = this.svc.metrics;
  readonly health = this.svc.health;
  readonly showAllWarnings = signal(false);
  readonly warnings = computed(() => (this.showAllWarnings() ? this.svc.warnings() : this.svc.warnings().slice(0, 3)));

  /** Legend rows for the spending donut: colour, label, amount, share of income. */
  readonly slices = computed(() => {
    const colors = seriesColors(this.theme.dark());
    const income = this.m().monthlyIncome;
    return this.svc.breakdown().map((s) => ({ ...s, color: colors[SLICE_SLOT[s.key]]!, share: income > 0 ? s.amount / income : null }));
  });

  readonly donut = computed<ChartOption>(() => {
    const t = chartTokens();
    this.theme.dark();
    return {
      tooltip: { trigger: 'item', valueFormatter: (v) => formatInr(Number(v)) + ' a month', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.text } },
      series: [
        {
          type: 'pie',
          radius: ['58%', '88%'],
          padAngle: 1,
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: this.slices().map((s) => ({ name: s.label, value: s.amount, key: s.key, itemStyle: { color: s.color } })),
        },
      ],
    };
  });

  /** What you own (by kind) and what you owe, for the net worth bar chart. */
  readonly worth = computed(() => {
    const p = this.svc.profile();
    const sumBy = (pred: (k: string) => boolean) => p.assets.filter((a) => pred(a.kind)).reduce((s, a) => s + a.value, 0);
    const rows = [
      { key: 'liquid', label: 'Cash and deposits', amount: sumBy((k) => LIQUID_ASSETS.has(k as never)), owed: false },
      { key: 'invested', label: 'Investments', amount: sumBy((k) => !LIQUID_ASSETS.has(k as never) && k !== 'real_estate'), owed: false },
      { key: 'property', label: 'Property', amount: sumBy((k) => k === 'real_estate'), owed: false },
      { key: 'loans', label: 'Loans and cards', amount: this.m().totalLiabilities, owed: true },
    ];
    return rows.filter((r) => r.amount > 0);
  });

  readonly worthChart = computed<ChartOption>(() => {
    const t = chartTokens();
    const [owned, owed] = seriesColors(this.theme.dark());
    const rows = [...this.worth()].reverse();
    return {
      grid: { left: 8, right: 16, top: 8, bottom: 8 },
      tooltip: { trigger: 'item', valueFormatter: (v) => formatInr(Number(v)), backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.text } },
      xAxis: { type: 'value', axisLabel: { color: t.muted, formatter: (v: number) => compactInr(v) }, splitLine: { lineStyle: { color: t.border } } },
      yAxis: { type: 'category', data: rows.map((r) => r.label), axisLabel: { color: t.text }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: rows.map((r) => ({ value: r.amount, key: 'networth', itemStyle: { color: r.owed ? owed : owned, borderRadius: [0, 4, 4, 0] } })),
        },
      ],
    };
  });

  readonly worthColors = computed(() => seriesColors(this.theme.dark()).slice(0, 2));

  /** Saved so far across all goals vs their combined targets. */
  readonly goalSavings = computed(() => {
    const goals = this.svc.goals();
    const target = goals.reduce((s, g) => s + g.target, 0);
    const saved = goals.reduce((s, g) => s + Math.min(g.saved, g.target), 0);
    return target > 0 ? { saved, target, progress: saved / target } : null;
  });

  constructor() {
    addIcons({ alertCircle, warning, informationCircle, chevronForward, trendingUpOutline });
  }

  severityIcon(s: Severity): string {
    return s === 'critical' ? 'alert-circle' : s === 'serious' ? 'warning' : 'information-circle';
  }

  severityLabel(s: Severity): string {
    return s === 'critical' ? 'Urgent' : s === 'serious' ? 'Important' : 'Note';
  }

  openSlice(key: string): void {
    void this.router.navigate(['/app/details', key]);
  }

  async addSuggestion(s: GoalSuggestion): Promise<void> {
    await this.svc.saveGoal({ id: crypto.randomUUID(), label: s.label, category: s.category, target: s.target, saved: 0, provenance: 'calculated' });
  }
}

/** Axis labels in lakh and crore (₹12L, ₹1.2Cr). */
export function compactInr(paise: Paise): string {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${+(r / 1e7).toFixed(1)}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${+(r / 1e5).toFixed(1)}L`;
  if (Math.abs(r) >= 1e3) return `₹${+(r / 1e3).toFixed(0)}K`;
  return `₹${r}`;
}
