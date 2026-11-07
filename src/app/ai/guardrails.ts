/**
 * Local, zero-cost intent check before any AI call. It only blocks requests
 * that are clearly unrelated to personal finance; anything ambiguous goes to
 * the model, whose system prompt also restricts scope. It must never block a
 * legitimate financial question, so finance signals always win.
 */
export type Intent = 'finance' | 'offtopic' | 'unclear';

export const OFF_TOPIC_REPLY =
  "I'm designed specifically to help you manage your finances and achieve your financial goals. Let's get back to your financial planning.";

const FINANCE = new RegExp(
  [
    '₹', '\\$', '€', '£', '\\brs\\.?\\s?\\d', '\\binr\\b', 'rupee', 'lakh', 'crore', 'money', 'salary', 'income', 'earn',
    'expens', 'spend', 'spent', 'budget', 'sav(e|ing)', 'invest', 'mutual fund', '\\bsip\\b', '\\bppf\\b', '\\bepf\\b',
    '\\bnps\\b', '\\bfd\\b', 'fixed deposit', 'stock', 'share market', 'equity', 'bond', 'gold', 'crypto', 'loan',
    '\\bemi\\b', 'mortgage', 'credit card', 'debt', 'interest', 'tax', 'insurance', 'premium', 'retire', 'pension',
    'goal', 'emergency fund', 'net worth', 'asset', 'liabilit', 'rent', 'bill', 'pay', 'paid', 'price', 'cost',
    'afford', 'bank', '\\bupi\\b', 'inflation', 'portfolio', 'dividend', 'financ', 'wealth', 'fees?', 'tuition',
    'house', 'home loan', 'car', 'vehicle', 'vacation', 'travel budget', 'education', 'wedding', 'cash',
  ].join('|'),
  'i',
);

const OFF_TOPIC = new RegExp(
  [
    'write (me )?(a |an )?(poem|story|song|essay|code|program|script)', 'tell (me )?a joke', '\\bjoke\\b', 'lyrics',
    'recipe', 'weather', 'movie', 'film', 'tv show', 'netflix', 'football', 'cricket score', '\\bnba\\b', 'who won',
    'election', 'politic', 'president', 'prime minister', 'translate', 'debug (my|this)', 'javascript', 'python',
    'html', '\\bsql\\b', 'homework', 'capital of', 'celebrity', 'dating', 'horoscope', 'video game',
  ].join('|'),
  'i',
);

export function classifyIntent(text: string): Intent {
  if (FINANCE.test(text)) return 'finance';
  if (OFF_TOPIC.test(text)) return 'offtopic';
  return 'unclear';
}
