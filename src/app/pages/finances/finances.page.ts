import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonButton } from '@ionic/angular/ion-button';
import { IonContent } from '@ionic/angular/ion-content';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { addIcons } from 'ionicons';
import { arrowDownOutline, arrowUpOutline, trashOutline } from 'ionicons/icons';
import { toMonthly } from '../../domain/engine';
import {
  ASSET_KINDS,
  EXPENSE_CATEGORIES,
  GOAL_CATEGORIES,
  INCOME_KINDS,
  LIABILITY_KINDS,
  formatInr,
  rupees,
  type Frequency,
  type Goal,
  type Provenance,
  NEEDS,
  type Need,
} from '../../domain/models';
import { ProfileService } from '../../domain/profile.service';

type Section = 'incomes' | 'expenses' | 'liabilities' | 'assets' | 'family' | 'goals';

interface Draft {
  label: string;
  type: string;
  amount: string;
  frequency: Frequency;
  need: Need;
  payment: string;
  rate: string;
  saved: string;
  date: string;
  age: string;
  dependent: boolean;
}

const BLANK: Draft = { label: '', type: '', amount: '', frequency: 'monthly', need: 'necessary', payment: '', rate: '', saved: '', date: '', age: '', dependent: true };

const TYPES: Record<Exclude<Section, 'family'>, readonly string[]> = {
  incomes: INCOME_KINDS,
  expenses: EXPENSE_CATEGORIES,
  liabilities: LIABILITY_KINDS,
  assets: ASSET_KINDS,
  goals: GOAL_CATEGORIES,
};

const num = (v: string) => {
  const n = Number(v.replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

@Component({
  selector: 'app-finances',
  imports: [IonContent, IonButton, IonIcon, IonSpinner, FormsModule, NgTemplateOutlet],
  templateUrl: './finances.page.html',
  styleUrl: './finances.page.scss',
})
export class FinancesPage {
  readonly svc = inject(ProfileService);
  readonly fmt = formatInr;
  readonly toMonthly = toMonthly;
  /** Type options for the open add form. */
  readonly typeOptions = computed(() => {
    const s = this.adding();
    return s && s !== 'family' ? TYPES[s] : [];
  });
  readonly frequencies: Frequency[] = ['monthly', 'yearly', 'quarterly', 'half_yearly', 'weekly'];
  readonly needs = NEEDS;

  readonly adding = signal<Section | null>(null);
  readonly draft = signal<Draft>({ ...BLANK });
  readonly error = signal('');
  readonly busy = signal(false);

  readonly p = this.svc.profile;
  readonly m = this.svc.metrics;
  readonly orderedGoals = computed(() => this.svc.plans());

  constructor() {
    addIcons({ trashOutline, arrowUpOutline, arrowDownOutline });
  }

  label(s: string): string {
    return s.replace(/_/g, ' ');
  }

  provLabel(p: Provenance): string {
    return { user: 'You said', calculated: 'Calculated', ai_estimate: 'Estimate', assumption: 'Assumption' }[p];
  }

  open(section: Section): void {
    this.adding.set(section);
    this.error.set('');
    this.draft.set({ ...BLANK, type: section === 'family' ? '' : TYPES[section][0]! });
  }

  patch(p: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  async add(): Promise<void> {
    const s = this.adding();
    const d = this.draft();
    if (!s) return;
    const label = d.label.trim() || this.label(d.type) || 'Item';
    const amount = num(d.amount);
    const id = crypto.randomUUID();
    const base = { id, label, provenance: 'user' as const };
    try {
      this.busy.set(true);
      if (s === 'goals') {
        if (Number.isNaN(amount)) throw new Error('Enter the target amount.');
        const saved = d.saved ? num(d.saved) : 0;
        if (Number.isNaN(saved)) throw new Error('Saved so far must be a number.');
        if (d.date && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.date)) throw new Error('Use the date picker for the target month.');
        const goal: Goal = { ...base, category: d.type as Goal['category'], target: rupees(amount), saved: rupees(saved), ...(d.date ? { targetDate: d.date } : {}) };
        await this.svc.saveGoal(goal);
      } else if (s === 'family') {
        if (!d.label.trim()) throw new Error('Enter the relation, for example "daughter".');
        const age = d.age ? num(d.age) : NaN;
        await this.svc.updateProfile((p) => ({
          ...p,
          family: [...p.family, { ...base, relation: label, dependent: d.dependent, ...(Number.isNaN(age) ? {} : { age: Math.round(age) }) }],
        }));
      } else {
        if (Number.isNaN(amount) || (s !== 'liabilities' && amount === 0)) throw new Error('Enter an amount in rupees.');
        await this.svc.updateProfile((p) => {
          if (s === 'incomes') p.incomes.push({ ...base, kind: d.type as never, amount: rupees(amount), frequency: d.frequency, earner: 'self' });
          if (s === 'expenses') p.expenses.push({ ...base, category: d.type as never, amount: rupees(amount), frequency: d.frequency, need: d.need });
          if (s === 'assets') p.assets.push({ ...base, kind: d.type as never, value: rupees(amount) });
          if (s === 'liabilities') {
            const pay = num(d.payment || '0');
            const rate = d.rate ? num(d.rate) : NaN;
            p.liabilities.push({ ...base, kind: d.type as never, outstanding: rupees(amount), monthlyPayment: rupees(Number.isNaN(pay) ? 0 : pay), ...(Number.isNaN(rate) ? {} : { interestRate: rate }) });
          }
          return p;
        });
      }
      this.adding.set(null);
    } catch (e) {
      this.error.set(e instanceof Error && e.message.length < 80 ? e.message : 'Could not save. Check your connection.');
    } finally {
      this.busy.set(false);
    }
  }

  async setInsurance(field: 'health' | 'term', value: boolean): Promise<void> {
    await this.svc.updateProfile((p) => ({ ...p, insurance: { ...p.insurance, [field]: value } }));
  }

  async setAssumption(field: 'expectedReturn' | 'inflation' | 'fiMultiple', value: string): Promise<void> {
    const n = num(value);
    const max = field === 'fiMultiple' ? 50 : 30;
    if (Number.isNaN(n) || n > max) return;
    await this.svc.updateProfile((p) => ({ ...p, assumptions: { ...p.assumptions, [field]: n } }));
  }

  async moveGoal(id: string, delta: -1 | 1): Promise<void> {
    const ids = this.orderedGoals().map((g) => g.goal.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await this.svc.reorderGoals(ids);
  }

  statusLabel(s: string): string {
    return { achieved: 'Achieved', on_track: 'On track', at_risk: 'At risk', behind: 'Behind', no_date: 'No target date' }[s] ?? s;
  }
}
