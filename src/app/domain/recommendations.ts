/**
 * Calculated recommendations: rules over saved figures, each with the numbers
 * behind it. They feed the analysis page and the AI analysis prompt; the AI
 * explains them but does not compute them.
 */
import type { GoalPlan, Metrics } from './engine';
import { formatInr, type FinancialProfile, type Paise } from './models';

export interface Recommendation {
  key: string;
  title: string;
  detail: string;
  /** Lower comes first. */
  priority: number;
}

const inr = formatInr;

export function recommendations(p: FinancialProfile, m: Metrics, plans: GoalPlan[]): Recommendation[] {
  const out: Recommendation[] = [];
  const costly = p.liabilities.filter((l) => l.kind === 'credit_card' || (l.interestRate ?? 0) >= 12);
  if (costly.length) {
    const total = costly.reduce((s, l) => s + l.outstanding, 0);
    out.push({
      key: 'costly_debt',
      priority: 1,
      title: 'Clear high-interest debt first',
      detail: `${costly.map((l) => l.label).join(', ')}: ${inr(total)} outstanding at 12% a year or more (or a credit card). Paying this down usually beats investing, since few investments reliably earn more than the interest saved.`,
    });
  }
  if (m.essentialMonthly > 0 && (m.emergencyMonths ?? 0) < 6) {
    const target = m.essentialMonthly * 6;
    const gap = Math.max(0, target - m.liquidAssets);
    out.push({
      key: 'emergency',
      priority: 2,
      title: 'Build the emergency fund to 6 months',
      detail: `Target ${inr(target)} (6 × ${inr(m.essentialMonthly)} of necessary spending and loan payments); ${inr(gap)} to go. Keep it in a savings account or fixed deposit.`,
    });
  }
  const dependents = p.family.filter((f) => f.dependent).length;
  if (dependents && !p.insurance.term && m.monthlyIncome > 0) {
    const yearly = m.monthlyIncome * 12;
    out.push({
      key: 'term',
      priority: 3,
      title: 'Consider term life cover',
      detail: `${dependents} ${dependents === 1 ? 'person depends' : 'people depend'} on your income. A common rule of thumb is cover of 10 to 15 times yearly income: about ${inr(yearly * 10)} to ${inr(yearly * 15)}. Compare plans with a licensed adviser.`,
    });
  }
  if (p.insurance.health === false) {
    out.push({ key: 'health', priority: 3, title: 'Get health insurance', detail: 'Without cover, one hospital stay can undo years of saving. A family floater plan is a common starting point.' });
  }
  const unnecessary = sumNeed(p, 'unnecessary');
  const behind = plans.find((g) => g.status === 'behind' || g.status === 'at_risk');
  if (unnecessary > 0) {
    out.push({
      key: 'cut',
      priority: 4,
      title: 'Redirect spending you marked unnecessary',
      detail: `${inr(unnecessary)} a month${behind ? `; moving it to ${behind.goal.label} would cover ${Math.min(100, Math.round((unnecessary / Math.max(1, (behind.requiredMonthly ?? 0) - behind.allocated)) * 100))}% of its monthly gap` : ' could go to your goals instead'}.`,
    });
  }
  for (const g of plans.filter((x) => x.status === 'behind' || x.status === 'at_risk').slice(0, 2)) {
    const months = g.allocated > 0 ? Math.ceil(g.remaining / g.allocated) : null;
    out.push({
      key: `goal:${g.goal.id}`,
      priority: 5,
      title: `${g.goal.label}: close the gap`,
      detail: `Needs ${inr(g.requiredMonthly ?? 0)} a month; your plan can set aside ${inr(g.allocated)}. Options: raise the monthly amount by ${inr((g.requiredMonthly ?? 0) - g.allocated)}${months ? `, or move the date to about ${months} months from now` : ''}, or lower the target.`,
    });
  }
  // Surplus not already set aside for goals.
  const idle = m.monthlySurplus - plans.reduce((sum, g) => sum + g.allocated, 0);
  if (m.monthlyIncome > 0 && idle > m.monthlyIncome * 0.2 && m.monthlyInvesting === 0) {
    out.push({
      key: 'automate',
      priority: 6,
      title: 'Put idle surplus to work',
      detail: `About ${inr(idle)} a month is not set aside for any goal and there is no regular investment. An automatic monthly transfer (for example a SIP or recurring deposit) toward your goals keeps it from being spent.`,
    });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

function sumNeed(p: FinancialProfile, need: string): Paise {
  const per: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 };
  return Math.round(p.expenses.filter((e) => e.category !== 'investments' && e.need === need).reduce((s, e) => s + e.amount * (per[e.frequency] ?? 1), 0));
}
