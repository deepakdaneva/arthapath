/**
 * Starter templates for first-time users. They fill the message box with a
 * sentence to complete (blanks marked with ____), so users know what to share.
 */
export interface Starter {
  label: string;
  text: string;
}

export const ONBOARDING_STARTERS: Starter[] = [
  { label: 'My income', text: 'I earn ₹____ per month from my salary. My spouse earns ₹____ per month.' },
  { label: 'Monthly expenses', text: 'Our household expenses are about ₹____ a month, including rent of ₹____ and groceries of ₹____.' },
  { label: 'Loans and EMIs', text: 'I have a home loan with ₹____ outstanding and an EMI of ₹____ per month.' },
  { label: 'Savings and investments', text: 'I have ₹____ in my savings account, ₹____ in mutual funds, and ₹____ in PPF.' },
  { label: 'Family', text: 'We are a family of ____: me, my spouse, and ____ children aged ____.' },
  { label: 'My goals', text: 'I want to buy a car in ____ years for about ₹____, and save for my child’s education.' },
];

export const CHAT_STARTERS: Starter[] = [
  { label: 'Prioritize my goals', text: 'Which of my goals should I focus on first, and why?' },
  { label: 'Cut expenses', text: 'Where could I reduce my monthly expenses without hurting essentials?' },
  { label: 'Prepay or invest?', text: 'Should I prepay my home loan or invest the extra money?' },
  { label: 'Emergency fund', text: 'How big should my emergency fund be, and how long will it take to build?' },
];
