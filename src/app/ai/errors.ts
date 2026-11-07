/** Provider failure categories. Only some of them justify trying another key. */
export type AIErrorKind =
  | 'rate_limited'
  | 'quota_exhausted'
  | 'auth_invalid'
  | 'model_unavailable'
  | 'provider_down'
  | 'network'
  | 'invalid_request'
  | 'aborted';

export class AIError extends Error {
  constructor(
    readonly kind: AIErrorKind,
    message: string,
    /** Suggested wait before reusing the key, when the provider says so. */
    readonly retryAfterMs: number | null = null,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/** Errors where another key or provider may succeed. */
export const FALLBACK_KINDS: ReadonlySet<AIErrorKind> = new Set([
  'rate_limited',
  'quota_exhausted',
  'auth_invalid',
  'model_unavailable',
  'provider_down',
]);

/** Parses "30s", "1m26.4s", "2h3m", "120ms", or a google.rpc.RetryInfo "17s". */
export function parseDuration(text: string): number | null {
  const m = /(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?/.exec(text.trim());
  if (!m || !m[0]) return null;
  const [, h, min, s, ms] = m.map((x) => (x ? Number(x) : 0)) as number[];
  const total = ((h! * 60 + min!) * 60 + s!) * 1000 + ms!;
  return total > 0 ? Math.round(total) : null;
}

function retryHint(body: string): number | null {
  const gemini = /"retryDelay"\s*:\s*"([^"]+)"/.exec(body);
  if (gemini) return parseDuration(gemini[1]!);
  const prose = /try again in\s+([0-9hms.]+)/i.exec(body);
  if (prose) return parseDuration(prose[1]!);
  return null;
}

const QUOTA = /(per[\s_-]?day|daily|quota|insufficient|credits?|billing|exceeded your current|RPD|TPD)/i;
const BAD_KEY = /(api[\s_-]?key[^.]*(not valid|invalid|expired)|API_KEY_INVALID|invalid[\s_-]?api[\s_-]?key|unauthori[sz]ed|incorrect api key)/i;
const MODEL = /(model[^.]*(not found|does not exist|decommissioned|not supported|no longer available|unavailable))|NOT_FOUND/i;
const CONTEXT = /(context[\s_-]?length|too many tokens|maximum context|request too large)/i;

/** Maps an HTTP error from any supported provider to an AIError. */
export function classifyHttpError(status: number, body: string, provider: string): AIError {
  const hint = retryHint(body);
  const msg = (kind: string) => `${provider}: ${kind} (HTTP ${status})`;
  if (status === 401 || (status === 403 && !QUOTA.test(body)) || BAD_KEY.test(body)) {
    return new AIError('auth_invalid', msg('API key rejected'), null, status);
  }
  if (status === 402) return new AIError('quota_exhausted', msg('out of credits'), hint, status);
  if (status === 429) {
    return QUOTA.test(body)
      ? new AIError('quota_exhausted', msg('quota exhausted'), hint, status)
      : new AIError('rate_limited', msg('rate limited'), hint, status);
  }
  if (status === 404 || MODEL.test(body)) return new AIError('model_unavailable', msg('model unavailable'), null, status);
  if (status === 413 || CONTEXT.test(body)) return new AIError('invalid_request', msg('request too large'), null, status);
  if (status >= 500) return new AIError('provider_down', msg('service unavailable'), hint, status);
  return new AIError('invalid_request', msg('request rejected'), null, status);
}

/** Maps a thrown fetch error (no HTTP response). */
export function classifyThrown(err: unknown, provider: string): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') return new AIError('aborted', `${provider}: cancelled`);
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new AIError('provider_down', `${provider}: timed out`);
  }
  return new AIError('network', `${provider}: network error`);
}
