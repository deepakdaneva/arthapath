import type { ChatMessage } from './adapters';
import { SYSTEM_PROMPT } from './prompts';

/**
 * Provider-independent context. The app (not the provider) owns the
 * conversation, so any provider can continue it: every request carries the
 * system prompt, the current financial context snapshot, a rolling summary of
 * older turns, and the most recent messages that fit the token budget.
 */
export interface ContextSnapshot {
  /** Increments whenever the underlying financial data changes. */
  version: number;
  /** Compact JSON-serializable financial context (filled from Phase 6). */
  data: Record<string, unknown>;
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  /** Provider and model that produced an assistant message. */
  provider?: string;
  model?: string;
}

/** Rough token estimate (about 4 characters per token); exact counts are not needed for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const INPUT_BUDGET_TOKENS = 6000;

export interface BuiltContext {
  messages: ChatMessage[];
  /** Older history messages that did not fit (candidates for summarization). */
  droppedCount: number;
  estimatedTokens: number;
}

export function buildMessages(opts: {
  snapshot: ContextSnapshot;
  summary: string | null;
  history: StoredMessage[];
  userMessage: string;
  budget?: number;
}): BuiltContext {
  const budget = opts.budget ?? INPUT_BUDGET_TOKENS;
  const contextBlock =
    `Financial context (version ${opts.snapshot.version}, JSON):\n${JSON.stringify(opts.snapshot.data)}` +
    (opts.summary ? `\n\nSummary of earlier conversation:\n${opts.summary}` : '');
  const fixed: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextBlock },
  ];
  const user: ChatMessage = { role: 'user', content: opts.userMessage };
  let used = [...fixed, user].reduce((n, m) => n + estimateTokens(m.content), 0);

  // Newest first until the budget is spent.
  const kept: ChatMessage[] = [];
  let i = opts.history.length - 1;
  for (; i >= 0; i--) {
    const m = opts.history[i]!;
    const cost = estimateTokens(m.content);
    if (used + cost > budget) break;
    used += cost;
    kept.unshift({ role: m.role, content: m.content });
  }
  return { messages: [...fixed, ...kept, user], droppedCount: i + 1, estimatedTokens: used };
}
