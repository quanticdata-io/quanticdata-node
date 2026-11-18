import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  PaymentRequiredError,
  QuanticData,
  QuanticDataError,
  RateLimitError,
  ServiceUnavailableError,
  type ResponseInfo,
} from '../src';
import { fakeFetch, fixture, ok, TEST_KEY } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('configuration', () => {
  it('requires an API key', () => {
    vi.stubEnv('QUANTICDATA_API_KEY', '');
    expect(() => new QuanticData()).toThrow(/No API key/);
  });

  it('reads the key and the base URL from the environment', async () => {
    vi.stubEnv('QUANTICDATA_API_KEY', TEST_KEY);
    vi.stubEnv('QUANTICDATA_API_BASE', 'http://localhost:9999/v1/');
    const { fetch, calls } = fakeFetch(() => ok({ balance: 0 }));
    const qd = new QuanticData({ fetch });
    await qd.account.balance();
    expect(calls[0]!.url.href).toBe('http://localhost:9999/v1/public/balance');
    expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${TEST_KEY}`);
  });

  it('defaults to the documented API host', () => {
    vi.stubEnv('QUANTICDATA_API_BASE', '');
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: fakeFetch(() => ok({})).fetch });
    expect(qd.http.baseURL).toBe('https://api.quanticdata.io/v1');
  });

  it('sends a JSON body, a user agent and custom headers', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: fixture('scrapeUrl') }));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch, defaultHeaders: { 'X-Trace': 'abc' } });
    await qd.scrape({ url: 'https://example.com', format: 'markdown' });
    const req = calls[0]!;
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/v1/scraper/extract');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(req.headers.get('user-agent')).toMatch(/^quanticdata-node\/\d+\.\d+\.\d+/);
    expect(req.headers.get('x-trace')).toBe('abc');
    expect(req.body).toEqual({ url: 'https://example.com', format: 'markdown' });
  });

  it('cannot override the Authorization header through defaultHeaders', async () => {
    const { fetch, calls } = fakeFetch(() => ok({}));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch, defaultHeaders: { Authorization: 'Bearer other' } });
    await qd.request('GET', '/public/balance');
    expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${TEST_KEY}`);
  });
});

describe('envelope and errors', () => {
  it('unwraps the payload of the success envelope', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: fakeFetch(() => ({ body: fixture('scrapeUrl') })).fetch });
    const page = await qd.scrape({ url: 'https://example.com/pricing' });
    expect(page.url).toBe('https://example.com/pricing');
    expect(page.format).toBe('markdown');
    expect(typeof page.content).toBe('string');
  });

  it('maps HTTP statuses to error classes and keeps message and payload', async () => {
    const body = fixture('scrapeUrl', '402');
    const qd = new QuanticData({ apiKey: TEST_KEY, maxRetries: 0, fetch: fakeFetch(() => ({ status: 402, body })).fetch });
    const err = await qd.scrape({ url: 'https://example.com' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect(err).toBeInstanceOf(QuanticDataError);
    const e = err as PaymentRequiredError;
    expect(e.status).toBe(402);
    expect(e.message).toBe(body.message);
    expect(e.method).toBe('POST');
    expect(e.path).toBe('/scraper/extract');
  });

  it('throws AuthenticationError on 401', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: fakeFetch(() => ({ status: 401, body: fixture('scrapeUrl', '401') })).fetch });
    await expect(qd.account.billing()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('treats an error envelope as an error even with HTTP 200', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: fakeFetch(() => ({ status: 200, body: { type: 'error', message: 'nope', payload: { code: 'X' } } })).fetch });
    const err = (await qd.account.billing().catch((e: unknown) => e)) as QuanticDataError;
    expect(err.message).toBe('nope');
    expect(err.code).toBe('X');
  });

  it('passes non-JSON bodies through as text', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: fakeFetch(() => ({ body: 'a,b\n1,2\n', headers: { 'content-type': 'text/csv' } })).fetch });
    await expect(qd.datasets.downloadCsv('ds_1')).resolves.toBe('a,b\n1,2\n');
  });

  it('reports 503 as ServiceUnavailableError and does not retry it', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 503, body: { type: 'error', message: 'disabled' } }));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch });
    await expect(qd.account.billing()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(calls).toHaveLength(1);
  });
});

describe('retries', () => {
  it('retries a 429 on POST, honouring Retry-After', async () => {
    const { fetch, calls } = fakeFetch((_req, n) =>
      n === 1 ? { status: 429, body: { type: 'error', message: 'slow down' }, headers: { 'retry-after': '0' } } : (({ body: fixture('scrapeUrl') })),
    );
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch });
    const page = await qd.scrape({ url: 'https://example.com/pricing' });
    expect(page.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries with RateLimitError carrying retryAfterMs', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 429, body: { type: 'error', message: 'slow down' }, headers: { 'retry-after': '0' } }));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch, maxRetries: 1 });
    const err = (await qd.search({ query: 'x' }).catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfterMs).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it('never retries a POST that got a 5xx (a billed call is not sent twice)', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 500, body: { type: 'error', message: 'boom' } }));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch });
    await expect(qd.scrape({ url: 'https://example.com' })).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  it('retries a GET on 502 and on connection errors', async () => {
    const { fetch, calls } = fakeFetch((_req, n) => {
      if (n === 1) return new TypeError('fetch failed');
      if (n === 2) return { status: 502, body: { type: 'error', message: 'bad gateway' } };
      return ok({ balance: 0 });
    });
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch, maxRetries: 2 });
    await expect(qd.account.balance()).resolves.toEqual({ balance: 0 });
    expect(calls).toHaveLength(3);
  });

  it('does not retry a POST on a connection error', async () => {
    const { fetch, calls } = fakeFetch(() => new TypeError('fetch failed'));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch });
    await expect(qd.scrape({ url: 'https://example.com' })).rejects.toBeInstanceOf(APIConnectionError);
    expect(calls).toHaveLength(1);
  });
});

describe('timeouts, aborts and hooks', () => {
  const hanging = ((_: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;

  it('throws APITimeoutError when the request exceeds timeoutMs', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: hanging, timeoutMs: 20, maxRetries: 0 });
    await expect(qd.account.balance()).rejects.toBeInstanceOf(APITimeoutError);
  });

  it('throws APIUserAbortError when the caller aborts', async () => {
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch: hanging });
    const ac = new AbortController();
    const p = qd.account.balance({ signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it('reports every response with its rate-limit headers', async () => {
    const seen: ResponseInfo[] = [];
    const { fetch } = fakeFetch(() => ({
      ...ok({}),
      headers: { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '998', 'x-ratelimit-reset': '1767225600' },
    }));
    const qd = new QuanticData({ apiKey: TEST_KEY, fetch, onResponse: (i) => seen.push(i) });
    await qd.account.usage({ days: 7 });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.rateLimit).toEqual({ limit: 1000, remaining: 998, reset: '1767225600', scope: undefined });
    expect(seen[0]!.path).toBe('/scraper/usage');
  });
});
