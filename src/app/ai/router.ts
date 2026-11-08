import type { AIRequest, AIResponse, Credentials } from './adapters';
import { AIError, FALLBACK_KINDS, type AIErrorKind } from './errors';

/** A configured key as the router sees it (decrypted, in memory only). */
export interface RouteCandidate {
  id: string;
  label: string;
  credentials: Credentials;
  priority: number;
  enabled: boolean;
  /** Epoch ms until which the key should not be used (rate limit, quota). */
  cooldownUntil?: number | null;
  /** Set after an auth or model error until the user edits the key. */
  blocked?: 'auth_invalid' | 'model_unavailable' | null;
}

/** State changes the caller should persist for a key. */
export interface KeyHealthUpdate {
  id: string;
  cooldownUntil: number | null;
  blocked: RouteCandidate['blocked'];
  lastError: AIErrorKind | null;
  lastUsedAt?: number;
}

export type RouteEvent =
  | { type: 'attempt'; candidate: RouteCandidate }
  | { type: 'failed'; candidate: RouteCandidate; error: AIError }
  | { type: 'switch'; from: RouteCandidate; to: RouteCandidate; reason: AIErrorKind }
  | { type: 'success'; candidate: RouteCandidate; response: AIResponse };

export interface RouteDeps {
  call(req: AIRequest, c: Credentials, signal?: AbortSignal): Promise<AIResponse>;
  now(): number;
  onEvent?(e: RouteEvent): void;
  onHealth?(u: KeyHealthUpdate): void;
}

export class AllProvidersExhaustedError extends Error {
  constructor(
    readonly attempts: { candidate: RouteCandidate; error: AIError }[],
    readonly noneConfigured: boolean,
  ) {
    super(noneConfigured ? 'No AI provider is configured' : 'All configured AI providers are unavailable');
    this.name = 'AllProvidersExhaustedError';
  }
}

/**
 * Explains to the user why no key could answer. Keys that need fixing (bad key,
 * unavailable model) are named, because waiting will not help them.
 */
export function exhaustedMessage(e: AllProvidersExhaustedError, nameOf: (c: RouteCandidate) => string): string {
  const fixable = e.attempts.filter((a) => a.error.kind === 'auth_invalid' || a.error.kind === 'model_unavailable');
  if (e.attempts.length > 0 && fixable.length === e.attempts.length) {
    if (fixable.length > 1) return 'None of your AI providers can be used right now. Check their keys and models under AI Providers.';
    const { candidate, error } = fixable[0]!;
    return error.kind === 'model_unavailable'
      ? `${nameOf(candidate)} can no longer use the model "${candidate.credentials.model}" (it may have been retired). Choose another model under AI Providers.`
      : `${nameOf(candidate)} rejected your API key. Update the key under AI Providers.`;
  }
  return 'All configured AI providers have reached their available limits. Please add another provider or try again later.';
}

const MINUTE = 60_000;
/** Cooldown when the provider gives no retry hint. */
const DEFAULT_COOLDOWN: Partial<Record<AIErrorKind, number>> = {
  rate_limited: MINUTE,
  quota_exhausted: 60 * MINUTE,
  provider_down: 2 * MINUTE,
};

/** Keys that may be tried now, in priority order. */
export function eligible(candidates: RouteCandidate[], now: number): RouteCandidate[] {
  return candidates
    .filter((c) => c.enabled && !c.blocked && !(c.cooldownUntil && c.cooldownUntil > now))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Sends the request with the highest-priority usable key. On errors where
 * another key may succeed (rate limit, quota, bad key, missing model, outage)
 * it records the key's state and tries the next one. Each key is tried at most
 * once per request; network errors and invalid requests stop immediately
 * because another provider would fail the same way.
 */
export async function route(
  req: AIRequest,
  candidates: RouteCandidate[],
  deps: RouteDeps,
  signal?: AbortSignal,
): Promise<{ response: AIResponse; used: RouteCandidate }> {
  const queue = eligible(candidates, deps.now());
  if (queue.length === 0) {
    // Report why each enabled key is unusable (blocked, or cooling down after a limit).
    const skipped = candidates
      .filter((c) => c.enabled)
      .map((candidate) => ({ candidate, error: new AIError(candidate.blocked ?? 'rate_limited', 'not usable now') }));
    throw new AllProvidersExhaustedError(skipped, skipped.length === 0);
  }
  const attempts: { candidate: RouteCandidate; error: AIError }[] = [];
  const downProviders = new Set<string>();

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i]!;
    // An outage affects every key of that provider: skip the rest of them.
    if (downProviders.has(candidate.credentials.provider)) continue;
    deps.onEvent?.({ type: 'attempt', candidate });
    try {
      const response = await deps.call(req, candidate.credentials, signal);
      deps.onHealth?.({ id: candidate.id, cooldownUntil: null, blocked: null, lastError: null, lastUsedAt: deps.now() });
      deps.onEvent?.({ type: 'success', candidate, response });
      return { response, used: candidate };
    } catch (e) {
      const error = e instanceof AIError ? e : new AIError('network', String(e));
      attempts.push({ candidate, error });
      deps.onEvent?.({ type: 'failed', candidate, error });
      if (!FALLBACK_KINDS.has(error.kind)) throw error;

      const blocked = error.kind === 'auth_invalid' || error.kind === 'model_unavailable' ? error.kind : null;
      const wait = error.retryAfterMs ?? DEFAULT_COOLDOWN[error.kind] ?? null;
      deps.onHealth?.({
        id: candidate.id,
        cooldownUntil: blocked ? null : wait ? deps.now() + wait : null,
        blocked,
        lastError: error.kind,
      });
      if (error.kind === 'provider_down') downProviders.add(candidate.credentials.provider);

      const next = queue.slice(i + 1).find((c) => !downProviders.has(c.credentials.provider));
      if (next) deps.onEvent?.({ type: 'switch', from: candidate, to: next, reason: error.kind });
    }
  }
  throw new AllProvidersExhaustedError(attempts, false);
}
