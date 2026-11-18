import {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  QuanticDataError,
  errorForStatus,
} from './errors';
import { parseRateLimit, parseRetryAfter, type RateLimitInfo } from './rate-limit';
import { VERSION } from '../version';

export const DEFAULT_BASE_URL = 'https://api.quanticdata.io/v1';
export const ENV_API_KEY = 'QUANTICDATA_API_KEY';
export const ENV_API_BASE = 'QUANTICDATA_API_BASE';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;

export interface ResponseInfo {
  method: HttpMethod;
  path: string;
  status: number;
  durationMs: number;
  attempt: number;
  headers: Headers;
  rateLimit: RateLimitInfo | undefined;
}

export interface ClientOptions {
  /** API key (`qd_live_...`). Defaults to the `QUANTICDATA_API_KEY` environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to `QUANTICDATA_API_BASE` or `https://api.quanticdata.io/v1`. */
  baseURL?: string;
  /** Per-request timeout in milliseconds. Default 120000 (browser-rendered scrapes can be slow). */
  timeoutMs?: number;
  /**
   * Extra attempts after the first one. Default 2.
   * Retried: HTTP 429 on any method (the call was not processed), and connection
   * errors and HTTP 500/502/504 on GET and DELETE only. A POST that reached the
   * server is never retried, so a billed call is never sent twice by the SDK.
   */
  maxRetries?: number;
  /** Custom `fetch` implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /** Called after every HTTP response (including retried ones). Useful for logging and rate-limit tracking. */
  onResponse?: (info: ResponseInfo) => void;
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
}

const RETRYABLE_IDEMPOTENT = new Set([500, 502, 504]);
const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

function readEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const v = g.process?.env?.[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new APIUserAbortError('Request was aborted.'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new APIUserAbortError('Request was aborted.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function backoff(attempt: number): number {
  const base = Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return base / 2 + Math.random() * (base / 2);
}

export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Low-level transport: auth, envelope unwrapping, typed errors, retries, timeouts. */
export class HttpClient {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly onResponse: ((info: ResponseInfo) => void) | undefined;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv(ENV_API_KEY);
    if (!apiKey) {
      throw new QuanticDataError(
        `No API key. Pass { apiKey } or set ${ENV_API_KEY}. Create a key on the API keys page of the QuanticData dashboard.`,
      );
    }
    this.apiKey = apiKey;
    this.baseURL = (options.baseURL ?? readEnv(ENV_API_BASE) ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRetries = options.maxRetries ?? 2;
    const f = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) throw new QuanticDataError('No fetch implementation found. Use Node.js 18.17+ or pass { fetch }.');
    this.fetchImpl = f;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.onResponse = options.onResponse;
  }

  /**
   * Sends a request and returns the envelope's `payload` (or the raw body for
   * non-JSON answers such as CSV exports and PEM files).
   */
  async request<T = unknown>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = `${this.baseURL}${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`;
    const idempotent = method === 'GET' || method === 'DELETE';
    const maxRetries = opts.maxRetries ?? this.maxRetries;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const headers: Record<string, string> = {
      Accept: 'application/json, text/csv;q=0.9, */*;q=0.8',
      'User-Agent': `quanticdata-node/${VERSION}`,
      ...this.defaultHeaders,
      ...opts.headers,
      Authorization: `Bearer ${this.apiKey}`,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onUserAbort = () => controller.abort();
      if (opts.signal?.aborted) {
        clearTimeout(timer);
        throw new APIUserAbortError('Request was aborted.', { method, path });
      }
      opts.signal?.addEventListener('abort', onUserAbort, { once: true });

      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onUserAbort);
        if (opts.signal?.aborted) throw new APIUserAbortError('Request was aborted.', { method, path, cause: err });
        const error = timedOut
          ? new APITimeoutError(`Request timed out after ${timeoutMs} ms: ${method} ${path}`, { method, path, cause: err })
          : new APIConnectionError(`Cannot reach the QuanticData API at ${this.baseURL}: ${(err as Error)?.message ?? err}`, {
              method,
              path,
              cause: err,
            });
        if (idempotent && attempt <= maxRetries) {
          await sleep(backoff(attempt), opts.signal);
          continue;
        }
        throw error;
      }

      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onUserAbort);
        if (opts.signal?.aborted) throw new APIUserAbortError('Request was aborted.', { method, path, cause: err });
        throw timedOut
          ? new APITimeoutError(`Request timed out after ${timeoutMs} ms: ${method} ${path}`, { method, path, cause: err })
          : new APIConnectionError(`Connection lost while reading the response of ${method} ${path}`, { method, path, cause: err });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onUserAbort);
      }

      const rateLimit = parseRateLimit(res.headers);
      this.onResponse?.({ method, path, status: res.status, durationMs: Date.now() - started, attempt, headers: res.headers, rateLimit });

      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      const canRetry = attempt <= maxRetries && (res.status === 429 || (idempotent && RETRYABLE_IDEMPOTENT.has(res.status)));
      if (canRetry) {
        const wait = res.status === 429 && retryAfterMs !== undefined ? Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) : backoff(attempt);
        await sleep(wait, opts.signal);
        continue;
      }

      return this.parse<T>(res, text, { method, path, rateLimit, retryAfterMs });
    }
  }

  private parse<T>(
    res: Response,
    text: string,
    ctx: { method: HttpMethod; path: string; rateLimit: RateLimitInfo | undefined; retryAfterMs: number | undefined },
  ): T {
    const contentType = res.headers.get('content-type') ?? '';
    const init = { status: res.status, headers: res.headers, rateLimit: ctx.rateLimit, method: ctx.method, path: ctx.path, retryAfterMs: ctx.retryAfterMs };

    if (!contentType.includes('json')) {
      if (res.ok) return text as T;
      throw errorForStatus(res.status, text.slice(0, 500) || `Request failed (HTTP ${res.status})`, init);
    }

    let doc: unknown;
    try {
      doc = text === '' ? undefined : JSON.parse(text);
    } catch (err) {
      throw new QuanticDataError(`Invalid JSON in the response (HTTP ${res.status})`, { ...init, cause: err });
    }

    const envelope = doc && typeof doc === 'object' ? (doc as { type?: unknown; message?: unknown; payload?: unknown }) : undefined;
    if (!res.ok || envelope?.type === 'error') {
      const message = typeof envelope?.message === 'string' && envelope.message ? envelope.message : `Request failed (HTTP ${res.status})`;
      throw errorForStatus(res.status, message, { ...init, payload: envelope?.payload });
    }
    if (envelope && envelope.type === 'response' && 'payload' in envelope) return envelope.payload as T;
    return doc as T;
  }
}
