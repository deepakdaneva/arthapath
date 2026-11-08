import { describe, expect, it } from 'vitest';
import { emptyProfile, rupees, type Goal } from './models';
import { applyToTotals, emptyTotals, findAmounts, impactOf, parseDate, parseUpdate, type Transaction } from './transactions';

const NOW = new Date(2026, 10, 8, 14, 0); // Sun 8 Nov 2026
const car: Goal = { id: 'car', label: 'Family car', category: 'vehicle', target: rupees(800000), saved: rupees(100000), provenance: 'user' };

describe('parseUpdate', () => {
  it('reads the examples from the spec', () => {
    const one = (s: string) => parseUpdate(s, NOW, [car])[0]!;
    expect(one('Spent ₹500 on groceries through UPI.')).toMatchObject({ type: 'expense', amount: rupees(500), category: 'groceries', need: 'necessary', method: 'upi', date: '2026-11-08' });
    expect(one('Paid ₹2,000 using my credit card for fuel.')).toMatchObject({ type: 'expense', amount: rupees(2000), category: 'transport', method: 'credit_card' });
    expect(one('Received ₹10,000 from freelance work.')).toMatchObject({ type: 'income', amount: rupees(10000), category: 'income' });
    expect(one('Invested ₹5,000 in a mutual fund.')).toMatchObject({ type: 'investment', amount: rupees(5000), category: 'investments' });
    expect(one('Paid ₹25,000 towards my home loan EMI.')).toMatchObject({ type: 'loan_payment', amount: rupees(25000) });
  });

  it('understands shorthand amounts, dates, merchants, and goals', () => {
    expect(parseUpdate('Dinner at Truffles 1.2k yesterday', NOW)[0]).toMatchObject({ amount: rupees(1200), category: 'dining', need: 'lifestyle', merchant: 'Truffles', date: '2026-11-07' });
    expect(parseUpdate('salary 1.5 lakh credited on 1 Nov', NOW)[0]).toMatchObject({ type: 'income', amount: rupees(150000), date: '2026-11-01' });
    expect(parseUpdate('Put 5000 in FD for the family car', NOW, [car])[0]).toMatchObject({ type: 'saving', goalId: 'car' });
    expect(parseUpdate('Bought shoes for 3000 on 28/10', NOW)[0]).toMatchObject({ category: 'shopping', need: 'discretionary', date: '2026-10-28' });
  });

  it('splits several entries when each has an amount', () => {
    const xs = parseUpdate('Spent 500 on groceries and 200 on parking', NOW);
    expect(xs.map((x) => [x.category, x.amount])).toEqual([
      ['groceries', rupees(500)],
      ['transport', rupees(200)],
    ]);
    expect(parseUpdate('Spent ₹12,000 on groceries via UPI, ₹1,500 on fuel', NOW).map((x) => x.amount)).toEqual([rupees(12000), rupees(1500)]);
    expect(parseUpdate('Spent ₹12,000 on groceries via UPI and 300 on parking', NOW).map((x) => x.amount)).toEqual([rupees(12000), rupees(300)]);
  });

  it('marks spending unnecessary only in the user\'s own words', () => {
    expect(parseUpdate('Netflix 649', NOW)[0]!.need).toBe('lifestyle');
    expect(parseUpdate('Wasted 800 on an impulse buy', NOW)[0]!.need).toBe('unnecessary');
  });

  it('finds nothing without an amount, and ignores dates, counts, and percentages', () => {
    expect(parseUpdate('Had lunch with friends', NOW)).toEqual([]);
    expect(findAmounts('2 coffees for ₹380 on 3 Nov, 5% cashback')).toEqual([380]);
  });

  it('never returns a future date', () => {
    expect(parseDate('paid on 20 Dec', NOW)).toBe('2025-12-20');
    expect(parseDate('3 days ago', NOW)).toBe('2026-11-05');
  });
});

describe('aggregates and impact', () => {
  const tx = (over: Partial<Transaction>): Transaction => ({
    id: 'x', type: 'expense', amount: rupees(3000), date: '2026-11-08', category: 'groceries', need: 'necessary', description: '', source: 'parser', createdAt: 0, ...over,
  });

  it('adds and removes entries symmetrically', () => {
    const t = applyToTotals(emptyTotals('2026-11'), tx({}), 1, 5);
    expect(t).toMatchObject({ byType: { expense: rupees(3000) }, byCategory: { groceries: rupees(3000) }, byNeed: { necessary: rupees(3000) }, count: 1, lastAt: 5 });
    expect(applyToTotals(t, tx({}), -1, 6)).toEqual({ ...emptyTotals('2026-11'), lastAt: 6 });
  });

  it('compares a category with its plan and recent months', () => {
    const p = emptyProfile();
    p.expenses = [{ id: 'g', label: 'Groceries', category: 'groceries', amount: rupees(10000), frequency: 'monthly', need: 'necessary', provenance: 'user' }];
    const month = applyToTotals(emptyTotals('2026-11'), tx({ amount: rupees(12000) }), 1, 0);
    const prev = [9000, 8000, 7000].map((a, i) => applyToTotals(emptyTotals(`2026-0${8 + i}`.replace('2026-010', '2026-10')), tx({ amount: rupees(a) }), 1, 0));
    const lines = impactOf(tx({ amount: rupees(12000) }), month, prev, p, null, NOW).map((i) => i.text);
    expect(lines[0]).toBe('₹12,000 spent on groceries this month: ₹2,000 over your ₹10,000 plan.');
    expect(lines[1]).toContain('50% above your recent monthly average (₹8,000)');
    expect(lines[2]).toContain('above your monthly plan');
  });

  it('reports goal progress for a linked saving', () => {
    const lines = impactOf(tx({ type: 'saving', category: 'savings', need: undefined, goalId: 'car' }), emptyTotals('2026-11'), [], emptyProfile(), car, NOW);
    expect(lines.map((l) => l.text)).toEqual(['Family car: ₹1,00,000 of ₹8,00,000 saved (13%).']);
  });
});
