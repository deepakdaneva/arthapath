import { describe, expect, it } from 'vitest';
import { describeRedactions, redact } from './redact';

describe('redact', () => {
  it('removes identity numbers and secrets', () => {
    const cases: [string, string, string][] = [
      ['My PAN is ABCPE1234F', 'My PAN is [PAN removed]', 'pan'],
      ['Card 4111 1111 1111 1111 is maxed', 'Card [card ending 1111] is maxed', 'card'],
      ['aadhaar 2345 6789 0124', 'aadhaar [Aadhaar removed]', 'aadhaar'],
      ['HDFC a/c no 50100123456789 salary', 'HDFC a/c no [ending 6789] salary', 'account'],
      ['OTP is 482913, do not share', 'OTP is [removed] do not share', 'secret'],
      ['mail me at riya.k@example.co.in', 'mail me at [email removed]', 'email'],
      ['pay to riya@okhdfcbank', 'pay to [UPI ID removed]', 'upi'],
      ['call +91 98765 43210', 'call [phone removed]', 'phone'],
      ['passport J8369854', 'passport [passport removed]', 'passport'],
    ];
    for (const [input, out, kind] of cases) {
      const r = redact(input);
      expect(r.text, input).toBe(out);
      expect(r.found, input).toEqual([kind]);
    }
  });

  it('never touches amounts, dates, rates, or ordinary text', () => {
    for (const s of [
      'I earn ₹1,50,000 a month and spend 45000',
      'Home loan of 3000000 at 8.5%, EMI 25000 till 2045',
      'Net worth 120000000 and FD of 9876543210 paise',
      'Goal: car by 2029-11, target 8,00,000',
      'SIP of 5000 since 01/04/2023',
      'Card limit 200000, bill 4111',
    ]) {
      expect(redact(s)).toEqual({ text: s, found: [] });
    }
  });

  it('ignores digit runs that fail the card and Aadhaar checksums', () => {
    expect(redact('ref 4111 1111 1111 1112').found).toEqual([]);
    expect(redact('order 2345 6789 0123').found).toEqual([]);
  });

  it('describes what was removed', () => {
    expect(describeRedactions(['pan'])).toBe('1 PAN');
    expect(describeRedactions(['card', 'pan', 'card'])).toBe('2 card numbers and 1 PAN');
  });
});
