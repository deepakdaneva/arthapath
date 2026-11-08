import { describe, expect, it } from 'vitest';
import { rupees, type Goal } from '../domain/models';
import { parseAiUpdate, updatePrompt } from './updates';

const NOW = new Date(2026, 10, 8);
const goals: Goal[] = [{ id: 'g1', label: 'Family car', category: 'vehicle', target: rupees(800000), saved: 0, provenance: 'user' }];

describe('AI update fallback', () => {
  it('keeps valid entries and corrects or drops the rest', () => {
    const out = parseAiUpdate(
      JSON.stringify({
        entries: [
          { type: 'expense', amount: 450, date: '2026-11-07', category: 'dining', need: 'lifestyle', method: 'upi', merchant: 'Chai Point', description: 'tea with team' },
          { type: 'saving', amount: 3000, date: '2027-01-01', category: 'x', goal: 'family car', description: 'car fund' },
          { type: 'expense', amount: 0, description: 'no amount' },
          { type: 'bribe', amount: 100 },
          { type: 'expense', amount: 99, need: 'nonsense', category: '', description: 'PAN ABCPE1234F' },
        ],
      }),
      NOW,
      goals,
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ type: 'expense', amount: rupees(450), date: '2026-11-07', category: 'dining', need: 'lifestyle', method: 'upi', merchant: 'Chai Point', source: 'ai' });
    // Future date falls back to today; goal matched by name; fixed category for savings.
    expect(out[1]).toMatchObject({ type: 'saving', date: '2026-11-08', category: 'savings', goalId: 'g1' });
    // Unknown need falls back to a default; identifiers removed.
    expect(out[2]).toMatchObject({ category: 'other', need: 'necessary', description: 'PAN [PAN removed]' });
  });

  it('returns nothing for unusable output', () => {
    expect(parseAiUpdate('sorry, I cannot', NOW, goals)).toEqual([]);
    expect(parseAiUpdate('{"entries": "no"}', NOW, goals)).toEqual([]);
  });

  it('gives the model today\'s date and only goal names', () => {
    const p = updatePrompt(NOW, goals);
    expect(p).toContain('Today is 2026-11-08');
    expect(p).toContain('"Family car"');
    expect(p).not.toContain('800000');
  });
});
