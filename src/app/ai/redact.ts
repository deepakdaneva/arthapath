/**
 * Removes identity and access secrets from free text on this device, before it
 * is stored, shown again, or sent to an AI provider. Financial planning needs
 * amounts, not ID numbers, so these are never needed for processing.
 *
 * Amounts are left alone: ID patterns either have a fixed shape (PAN, email),
 * a checksum (cards: Luhn, Aadhaar: Verhoeff), or need a nearby keyword
 * (account numbers, OTPs). Detection is best effort: an unusual format can
 * slip through, so the UI also asks users not to type such details.
 */

export type RedactionKind = 'pan' | 'aadhaar' | 'card' | 'account' | 'secret' | 'email' | 'upi' | 'phone' | 'passport';

export interface RedactionResult {
  text: string;
  found: RedactionKind[];
}

const LABEL: Record<RedactionKind, string> = {
  pan: 'PAN',
  aadhaar: 'Aadhaar number',
  card: 'card number',
  account: 'account number',
  secret: 'OTP, PIN, CVV or password',
  email: 'email address',
  upi: 'UPI ID',
  phone: 'phone number',
  passport: 'passport number',
};

/** Human-readable list for a notice, e.g. "1 PAN and 2 card numbers". */
export function describeRedactions(found: RedactionKind[]): string {
  const counts = new Map<RedactionKind, number>();
  for (const k of found) counts.set(k, (counts.get(k) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => `${n} ${LABEL[k]}${n > 1 ? 's' : ''}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Verhoeff checksum tables (used by Aadhaar).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
function verhoeff(digits: string): boolean {
  let c = 0;
  for (let i = 0; i < digits.length; i++) c = D[c]![P[i % 8]![Number(digits[digits.length - 1 - i])]!]!;
  return c === 0;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Order matters: specific shapes first, so a card is not also called a phone. */
const RULES: { kind: RedactionKind; re: RegExp; replace: (m: string, ...g: string[]) => string | null }[] = [
  // Secrets after a keyword: "OTP 482913", "PIN is 1234", "password: hunter2".
  {
    kind: 'secret',
    re: /\b(otp|cvv|cvc|m?pin|password|passcode|pwd)(\s*(?:is|:|=|-)?\s*)(\S+)/gi,
    replace: (_m, word, sep) => `${word}${sep}[removed]`,
  },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, replace: () => '[email removed]' },
  // UPI IDs have no dot after the @ (name@okhdfcbank).
  { kind: 'upi', re: /\b[\w.-]{2,}@[a-z]{2,}\b(?!\.)/gi, replace: () => '[UPI ID removed]' },
  // Account numbers only next to a keyword, so large amounts are never touched.
  // Checked before cards: some account numbers happen to pass the card checksum.
  {
    kind: 'account',
    re: /\b(a\/c|acct|account|acc)(\.?\s*(?:no\.?|number|#)?\s*:?\s*)(\d[\d -]{7,20}\d)/gi,
    replace: (_m, word, sep, num) => `${word}${sep}[ending ${onlyDigits(num).slice(-4)}]`,
  },
  { kind: 'pan', re: /\b[A-Z]{3}[PCHABGJLFT][A-Z]\d{4}[A-Z]\b/gi, replace: () => '[PAN removed]' },
  {
    kind: 'card',
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    replace: (m) => {
      const d = onlyDigits(m);
      return luhn(d) ? `[card ending ${d.slice(-4)}]` : null;
    },
  },
  {
    kind: 'aadhaar',
    re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
    replace: (m) => (verhoeff(onlyDigits(m)) ? '[Aadhaar removed]' : null),
  },
  { kind: 'passport', re: /\b[A-PR-WY][1-9]\d{6}\b/g, replace: () => '[passport removed]' },
  // Phone numbers need +91 or a nearby keyword: a bare 10-digit number may be an amount.
  { kind: 'phone', re: /\+91[ -]?[6-9]\d{4}[ -]?\d{5}\b/g, replace: () => '[phone removed]' },
  {
    kind: 'phone',
    re: /\b(phone|mobile|mob|cell|call|whatsapp|contact)(\.?\s*(?:no\.?|number|#|on|me on|at)?\s*:?\s*)0?[6-9]\d{4}[ -]?\d{5}\b/gi,
    replace: (_m, word, sep) => `${word}${sep}[phone removed]`,
  },
];

export function redact(input: string): RedactionResult {
  let text = input;
  const found: RedactionKind[] = [];
  for (const rule of RULES) {
    text = text.replace(rule.re, (m: string, ...rest: unknown[]) => {
      const groups = rest.filter((x): x is string => typeof x === 'string');
      const out = rule.replace(m, ...groups);
      if (out === null) return m;
      found.push(rule.kind);
      return out;
    });
  }
  return { text, found };
}

/** Redacted text only, for labels and replies. */
export const redacted = (s: string) => redact(s).text;
