import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/ion-content';
import { SLICE_LABELS, STATUS_LABEL, periodRange, toMonthly, type Period, type SliceKey } from '../../domain/engine';
import { LIQUID_ASSETS, formatInr, type Need, type Paise } from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';
import { METHOD_LABELS, TX_TYPE_LABELS, type Transaction } from '../../domain/transactions';
import { TransactionsService } from '../../domain/transactions.service';

interface Row {
  label: string;
  detail: string;
  amount: Paise;
}

/** Topics whose figures come from money moving in and out: they get a transaction list. */
const FLOW_TOPICS = new Set(['spending', 'necessary', 'lifestyle', 'discretionary', 'unnecessary', 'debt', 'investments', 'income']);

/** Which logged entries belong to a topic. */
function txMatches(topic: string, t: Transaction): boolean {
  switch (topic) {
    case 'spending':
      return t.type === 'expense';
    case 'debt':
      return t.type === 'loan_payment';
    case 'investments':
      return t.type === 'investment' || t.type === 'saving';
    case 'income':
      return t.type === 'income';
    default:
      return t.type === 'expense' && t.need === topic;
  }
}
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const human = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Drill-down behind every dashboard figure: the saved items it is made of, how
 * it is calculated, and (for money in and out) the transactions in a chosen
 * period. Transactions are logged in Updates; until then the list is empty.
 */
@Component({
  selector: 'app-details',
  imports: [IonContent, RouterLink, DecimalPipe, PercentPipe, DatePipe],
  templateUrl: './details.page.html',
  styleUrl: './details.page.scss',
})
export class DetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly svc = inject(ProfileService);
  private readonly tx = inject(TransactionsService);
  readonly fmt = formatInr;
  readonly periods = PERIODS;
  readonly statusLabel = STATUS_LABEL;

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly topic = computed(() => this.params().get('topic') ?? 'goal');
  readonly goalPlan = computed(() => {
    const id = this.params().get('id');
    return id ? (this.svc.plans().find((g) => g.goal.id === id) ?? null) : null;
  });
  readonly m = this.svc.metrics;

  readonly title = computed(() => {
    const t = this.topic();
    if (t === 'goal') return this.goalPlan()?.goal.label ?? 'Goal';
    const titles: Record<string, string> = {
      ...SLICE_LABELS,
      savings: 'Savings',
      spending: 'Spending',
      income: 'Income',
      networth: 'Net worth',
      health: 'Financial health score',
      fi: 'Financial independence',
      emergency: 'Emergency fund',
    };
    return titles[t] ?? 'Details';
  });

  /** Headline figure (monthly for flows). */
  readonly total = computed<Paise | null>(() => {
    const m = this.m();
    switch (this.topic()) {
      case 'income':
        return m.monthlyIncome;
      case 'spending':
        return m.monthlyExpenses;
      case 'debt':
        return m.monthlyDebtPayments;
      case 'investments':
        return m.monthlyInvesting;
      case 'savings':
        return m.monthlySurplus;
      case 'networth':
        return m.netWorth;
      case 'emergency':
        return m.liquidAssets;
      case 'fi':
        return m.investedAssets;
      case 'necessary':
      case 'lifestyle':
      case 'discretionary':
      case 'unnecessary':
        return this.rows().reduce((s, r) => s + r.amount, 0);
      default:
        return null;
    }
  });

  /** The saved items behind the figure, as monthly amounts where they recur. */
  readonly rows = computed<Row[]>(() => {
    const p = this.svc.profile();
    const t = this.topic();
    const expenseRows = (pred: (need: Need, category: string) => boolean) =>
      p.expenses
        .filter((e) => pred(e.need, e.category))
        .map((e) => ({ label: e.label, detail: `${human(e.category)} · ${human(e.frequency)}${e.frequency !== 'monthly' ? ` (${formatInr(e.amount)})` : ''}`, amount: toMonthly(e.amount, e.frequency) }));
    switch (t) {
      case 'necessary':
      case 'lifestyle':
      case 'discretionary':
      case 'unnecessary':
        return expenseRows((need, cat) => cat !== 'investments' && need === t);
      case 'investments':
        return expenseRows((_n, cat) => cat === 'investments');
      case 'spending':
        return expenseRows((_n, cat) => cat !== 'investments');
      case 'income':
        return p.incomes.map((i) => ({ label: i.label, detail: `${human(i.kind)} · ${i.earner} · ${human(i.frequency)}`, amount: toMonthly(i.amount, i.frequency) }));
      case 'debt':
        return p.liabilities.map((l) => ({
          label: l.label,
          detail: `${formatInr(l.outstanding)} outstanding${l.interestRate !== undefined ? ` · ${l.interestRate}% a year` : ''}`,
          amount: l.monthlyPayment,
        }));
      case 'emergency':
        return p.assets.filter((a) => LIQUID_ASSETS.has(a.kind)).map((a) => ({ label: a.label, detail: human(a.kind), amount: a.value }));
      case 'fi':
        return p.assets.filter((a) => !LIQUID_ASSETS.has(a.kind) && a.kind !== 'real_estate').map((a) => ({ label: a.label, detail: human(a.kind), amount: a.value }));
      default:
        return [];
    }
  });

  /** Net worth: two lists. */
  readonly owned = computed(() => this.svc.profile().assets.map((a) => ({ label: a.label, detail: human(a.kind), amount: a.value })));
  readonly owed = computed(() => this.svc.profile().liabilities.map((l) => ({ label: l.label, detail: human(l.kind), amount: l.outstanding })));

  // --- transactions filter ----------------------------------------------------
  readonly hasTransactions = computed(() => FLOW_TOPICS.has(this.topic()));
  readonly period = computed<Period>(() => {
    const p = this.query().get('period') as Period | null;
    return PERIODS.some((x) => x.key === p) ? p! : 'month';
  });
  readonly customFrom = computed(() => this.query().get('from') ?? '');
  readonly customTo = computed(() => this.query().get('to') ?? '');
  readonly range = computed(() => periodRange(this.period(), new Date(), { from: this.customFrom(), to: this.customTo() }));
  /** Last day shown, for display (the range end is exclusive). */
  /** Logged entries in the chosen period for this topic. */
  readonly txs = resource({
    params: () => ({ range: this.hasTransactions() ? this.range() : null, version: this.tx.totals() }),
    loader: async ({ params }) => (params.range ? this.tx.list(params.range.from, params.range.to) : []),
  });
  readonly matching = computed(() => (this.txs.value() ?? []).filter((t) => txMatches(this.topic(), t)));
  readonly matchingTotal = computed(() => this.matching().reduce((s, t) => s + t.amount, 0));
  readonly typeLabels = TX_TYPE_LABELS;
  readonly methodLabels = METHOD_LABELS;

  readonly rangeEnd = computed(() => {
    const r = this.range();
    return r ? new Date(r.to.getTime() - 1) : null;
  });

  setPeriod(period: Period): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { period, from: null, to: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setCustom(field: 'from' | 'to', value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { period: 'custom', [field]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  isSlice(t: string): t is SliceKey {
    return t in SLICE_LABELS;
  }
}
