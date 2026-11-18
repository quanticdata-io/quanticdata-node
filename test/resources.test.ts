import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobTimeoutError, QuanticData } from '../src';
import { fakeFetch, fixture, ok, TEST_KEY } from './helpers';
import { startMockServer, type MockServer } from './mock-server';

let mock: MockServer;
let qd: QuanticData;

beforeAll(async () => {
  mock = await startMockServer();
  qd = new QuanticData({ apiKey: TEST_KEY, baseURL: mock.url });
});
afterAll(() => mock.close());

describe('against the local mock server (documented examples)', () => {
  it('scrapes a page', async () => {
    const page = await qd.scrape({ url: 'https://example.com/pricing', format: 'markdown' });
    expect(page.finalUrl).toBe('https://example.com/pricing');
    expect(mock.requests.at(-1)!.operationId).toBe('scrapeUrl');
  });

  it('searches', async () => {
    const serp = await qd.search({ query: 'best coffee grinder', country: 'us' });
    expect(serp.organic.length).toBeGreaterThan(0);
    expect(serp.organic[0]!.link).toMatch(/^https?:\/\//);
  });

  it('maps a site', async () => {
    const map = await qd.map({ url: 'https://example.com', limit: 10 });
    expect(map.count).toBeTypeOf('number');
  });

  it('rejects a malformed key with AuthenticationError', async () => {
    const bad = new QuanticData({ apiKey: 'not-a-key', baseURL: mock.url });
    await expect(bad.account.billing()).rejects.toMatchObject({ name: 'AuthenticationError', status: 401 });
  });

  it('lists collectors and gets one by slug', async () => {
    const { collectors } = await qd.collectors.list({ category: 'local' });
    expect(collectors!.length).toBeGreaterThan(0);
    const one = await qd.collectors.get('google_maps_places');
    expect(one.slug).toBe('google_maps_places');
  });

  it('runs a collector synchronously', async () => {
    const run = await qd.collectors.run('google_maps_places', { query: 'pizza restaurants', location: 'Brooklyn, NY' });
    expect(run.status).toBe('done');
    expect(Array.isArray(run.results)).toBe(true);
    expect(mock.requests.at(-1)!.body).toEqual({ input: { query: 'pizza restaurants', location: 'Brooklyn, NY' } });
  });

  it('runs a collector in the background and polls the run', async () => {
    const run = await qd.collectors.run('google_maps_places', { query: 'pizza' }, { async: true, pollIntervalMs: 0 });
    expect(run.status).toBe('done');
    const ops = mock.requests.slice(-2).map((r) => r.operationId);
    expect(ops).toEqual(['runCollector', 'getCollectorRun']);
  });

  it('exports a collector run as CSV', async () => {
    const csv = await qd.collectors.getRunCsv('cmgfq2x1b0001');
    expect(csv.split('\n')[0]).toContain(',');
    expect(mock.requests.at(-1)!.url).toContain('format=csv');
  });

  it('generates proxy strings and parses them into URLs', async () => {
    const urls = await qd.proxies.generateUrls({ orderId: 'ord_8c21', quantity: 2, rotation: 'sticky' });
    expect(urls.length).toBeGreaterThan(0);
    for (const p of urls) {
      expect(p.url).toMatch(/^(http|socks5):\/\/[^@]+@[^:]+:\d+$/);
      expect(p.port).toBeGreaterThan(0);
    }
  });

  it('reads the exit IP echo without needing an API key on the server', async () => {
    const echo = await qd.proxies.ipEcho();
    expect(echo.ip).toBeTruthy();
  });

  it('downloads a dataset as CSV and JSON', async () => {
    await expect(qd.datasets.downloadCsv('ds_7a1c22')).resolves.toContain('company');
    const json = await qd.datasets.downloadJson('ds_7a1c22');
    expect(json.rowCount).toBe(json.rows.length);
  });

  it('encodes path parameters', async () => {
    await qd.crawl.get('cr d5/b8', { includeContent: false }).catch(() => undefined);
    expect(mock.requests.at(-1)!.url).toBe('/v1/scraper/crawl/cr%20d5%2Fb8?include_content=false');
  });
});

describe('async jobs (scripted responses)', () => {
  it('crawl.wait follows nextCursor and drains withheld pages', async () => {
    const base = fixture('getCrawl').payload as Record<string, unknown>;
    const views = [
      { ...base, status: 'running', pages: [{ url: 'https://d.example/1', status: 200, depth: 0 }], nextCursor: 1, hasMore: false },
      { ...base, status: 'completed', pages: [{ url: 'https://d.example/2', status: 200, depth: 1 }], nextCursor: 2, hasMore: true },
      { ...base, status: 'completed', pages: [{ url: 'https://d.example/3', status: 200, depth: 1 }], nextCursor: 3, hasMore: false },
    ];
    const { fetch, calls } = fakeFetch((_r, n) => ok(views[n - 1]));
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const job = await client.crawl.wait('cr_1', { pollIntervalMs: 0 });
    expect(job.pages.map((p) => p.url)).toEqual(['https://d.example/1', 'https://d.example/2', 'https://d.example/3']);
    expect(job.hasMore).toBe(false);
    expect(calls.map((c) => c.url.searchParams.get('since'))).toEqual([null, '1', '2']);
  });

  it('batch.items streams items as they finish', async () => {
    const views = [
      { id: 'bt_1', status: 'running', total: 2, completed: 1, failed: 0, items: [{ url: 'https://a', status: 200 }], nextCursor: 1, hasMore: false },
      { id: 'bt_1', status: 'completed', total: 2, completed: 2, failed: 0, items: [{ url: 'https://b', status: 200 }], nextCursor: 2, hasMore: false },
    ];
    const { fetch, calls } = fakeFetch((_r, n) => ok(views[n - 1]));
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const urls: string[] = [];
    for await (const item of client.batch.items('bt_1', { pollIntervalMs: 0 })) urls.push(item.url);
    expect(urls).toEqual(['https://a', 'https://b']);
    expect(calls[0]!.url.searchParams.get('include_content')).toBe('true');
  });

  it('batch.run starts the job then waits for it', async () => {
    const started = fixture('startBatch').payload;
    const done = fixture('getBatch').payload;
    const { fetch, calls } = fakeFetch((_r, n) => (n === 1 ? ok(started) : ok(done)));
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const job = await client.batch.run({ urls: ['https://example.com/a', 'https://example.com/b'] }, { pollIntervalMs: 0 });
    expect(job.status).toBe('completed');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[1]!.url.pathname).toBe(`/v1/scraper/batch/${(started as { id: string }).id}`);
  });

  it('serpBulk.wait times out with JobTimeoutError while the job keeps running', async () => {
    const { fetch } = fakeFetch(() => ok({ id: 'sb_1', status: 'running', query: 'q', total: 3, completed: 0, failed: 0, pages: [], organic: [], nextCursor: 0 }));
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const err = await client.serpBulk.wait('sb_1', { pollIntervalMs: 5, timeoutMs: 20 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobTimeoutError);
    expect((err as JobTimeoutError).lastStatus).toBe('running');
  });

  it('datasets.wait polls in summary mode then reads all rows', async () => {
    const row = (n: number) => ({ fields: { company: `C${n}` }, _source_url: `https://e.example/${n}` });
    const { fetch, calls } = fakeFetch((req) => {
      if (req.url.searchParams.get('mode') === 'summary') return ok({ id: 'ds_1', status: calls.length < 2 ? 'running' : 'completed', row_count: 3 });
      const since = req.url.searchParams.get('since');
      if (since === null) return ok({ id: 'ds_1', status: 'completed', rows: [row(1), row(2)], nextCursor: 2, row_count: 3 });
      if (since === '2') return ok({ id: 'ds_1', status: 'completed', rows: [row(3)], nextCursor: 3, row_count: 3 });
      return ok({ id: 'ds_1', status: 'completed', rows: [], nextCursor: 3, row_count: 3 });
    });
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const job = await client.datasets.wait('ds_1', { pollIntervalMs: 0 });
    expect(job.rows!.map((r) => (r.fields as { company: string }).company)).toEqual(['C1', 'C2', 'C3']);
  });

  it('unlock.batch.wait pages through every result', async () => {
    const result = (n: number) => ({ url: `https://u.example/${n}`, ok: true });
    const { fetch } = fakeFetch((req) => {
      const limit = Number(req.url.searchParams.get('limit'));
      const offset = Number(req.url.searchParams.get('offset') ?? 0);
      const all = Array.from({ length: 150 }, (_, i) => result(i));
      return ok({ batch_id: 'ub_1', status: 'completed', total: 150, completed: 150, ok: 150, blocked: 0, failed: 0, created_at: null, finished_at: null, results: all.slice(offset, offset + limit) });
    });
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const job = await client.unlock.batch.wait('ub_1', { pollIntervalMs: 0 });
    expect(job.results).toHaveLength(150);
  });
});

describe('pagination', () => {
  it('collectors.iterateRuns follows next_cursor', async () => {
    const run = (id: string) => ({ ...(fixture('listCollectorRuns').payload as { runs: object[] }).runs[0], run_id: id });
    const { fetch, calls } = fakeFetch((req) => {
      const cursor = req.url.searchParams.get('cursor');
      if (!cursor) return ok({ runs: [run('a'), run('b')], next_cursor: 'c2' });
      return ok({ runs: [run('c')], next_cursor: null });
    });
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const ids: string[] = [];
    for await (const r of client.collectors.iterateRuns({ limit: 2 })) ids.push(r.run_id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(calls[1]!.url.searchParams.get('cursor')).toBe('c2');
  });

  it('proxies.iterate pages by offset until hasMore is false', async () => {
    const { fetch, calls } = fakeFetch((req) => {
      const offset = Number(req.url.searchParams.get('offset'));
      const proxies = offset === 0 ? [{ orderId: 'o1' }, { orderId: 'o2' }] : [{ orderId: 'o3' }];
      return ok({ proxies, pagination: { total: 3, limit: 2, offset, hasMore: offset === 0 } });
    });
    const client = new QuanticData({ apiKey: TEST_KEY, fetch });
    const ids: string[] = [];
    for await (const p of client.proxies.iterate({ limit: 2, planType: 'residentialpremium' })) ids.push(p.orderId!);
    expect(ids).toEqual(['o1', 'o2', 'o3']);
    expect(calls.map((c) => c.url.searchParams.get('offset'))).toEqual(['0', '2']);
    expect(calls[0]!.url.searchParams.get('planType')).toBe('residentialpremium');
  });
});
