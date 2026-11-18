/**
 * Rate-limit state reported by the API on every response
 * (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, hourly window).
 */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  /** Raw value of `X-RateLimit-Reset` as sent by the API. */
  reset?: string;
  /** `X-RateLimit-Scope`, set by plan-level limiters. */
  scope?: string;
}

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = num(headers.get('x-ratelimit-limit'));
  const remaining = num(headers.get('x-ratelimit-remaining'));
  const reset = headers.get('x-ratelimit-reset') ?? undefined;
  const scope = headers.get('x-ratelimit-scope') ?? undefined;
  if (limit === undefined && remaining === undefined && reset === undefined && scope === undefined) return undefined;
  return { limit, remaining, reset, scope };
}

/** Parses `Retry-After` (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}
