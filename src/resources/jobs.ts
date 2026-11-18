import { sleep, type HttpClient, type RequestOptions } from '../core/http';
import { JobTimeoutError } from '../core/errors';
import { JOB_TERMINAL, pollUntilDone, type WaitOptions } from '../core/polling';
import type {
  BatchItem,
  BatchJob,
  BatchParams,
  CrawlJob,
  CrawlPage,
  CrawlParams,
  JobStarted,
  SerpBulkJob,
  SerpBulkParams,
} from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export interface CursorQuery {
  /** Return only entries after this cursor (the previous poll's `nextCursor`). */
  since?: number;
  /** `false` skips page content in the answer (metadata only). */
  includeContent?: boolean;
}

interface CursorJob<E> {
  id: string;
  status: string;
  nextCursor: number;
  hasMore: boolean;
  entries: E[];
}

/**
 * Shared logic of the cursor-paged async jobs (crawl and batch): polls with
 * `since` so every entry is transferred once, then drains entries the API
 * withheld (`hasMore`) after the job settled.
 */
async function* streamCursorJob<J, E>(
  jobId: string,
  get: (since: number | undefined) => Promise<J>,
  view: (job: J) => CursorJob<E>,
  opts: WaitOptions<J>,
  onJob: (job: J) => void,
): AsyncGenerator<E, void, undefined> {
  let since: number | undefined;
  const interval = Math.max(0, opts.pollIntervalMs ?? 2_000);
  const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
  for (;;) {
    const job = await get(since);
    onJob(job);
    opts.onProgress?.(job);
    const v = view(job);
    for (const e of v.entries) yield e;
    const advanced = v.nextCursor !== since;
    since = v.nextCursor;
    const settled = JOB_TERMINAL.has(v.status);
    if (settled && !(v.hasMore && advanced)) return;
    if (settled) continue; // drain withheld entries without waiting
    if (Date.now() + interval > deadline) throw new JobTimeoutError(jobId, v.status, opts.timeoutMs ?? 600_000);
    await sleep(interval, opts.signal);
  }
}

export class Crawl {
  constructor(private readonly http: HttpClient) {}

  /** Starts a crawl (`POST /scraper/crawl`). */
  start(params: CrawlParams, options?: CallOptions): Promise<JobStarted> {
    return this.http.request('POST', '/scraper/crawl', { body: params, ...options });
  }

  /** One poll of a crawl (`GET /scraper/crawl/{jobId}`). */
  get(jobId: string, query: CursorQuery = {}, options?: CallOptions): Promise<CrawlJob> {
    return this.http.request('GET', `/scraper/crawl/${encodeURIComponent(jobId)}`, {
      query: { since: query.since, include_content: query.includeContent === undefined ? undefined : String(query.includeContent) },
      ...options,
    });
  }

  /** Cancels a running crawl (`DELETE /scraper/crawl/{jobId}`). */
  cancel(jobId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/crawl/${encodeURIComponent(jobId)}`, options);
  }

  /** Yields crawled pages as they finish, until the crawl settles. */
  pages(jobId: string, opts: WaitOptions<CrawlJob> & { includeContent?: boolean } = {}): AsyncGenerator<CrawlPage, void, undefined> {
    return streamCursorJob<CrawlJob, CrawlPage>(
      jobId,
      (since) => this.get(jobId, { since, includeContent: opts.includeContent }, { signal: opts.signal }),
      (j) => ({ ...j, entries: j.pages }),
      opts,
      () => undefined,
    );
  }

  /** Polls until the crawl settles and returns the final job with every page collected. */
  async wait(jobId: string, opts: WaitOptions<CrawlJob> & { includeContent?: boolean } = {}): Promise<CrawlJob> {
    let last: CrawlJob | undefined;
    const pages: CrawlPage[] = [];
    const it = streamCursorJob<CrawlJob, CrawlPage>(
      jobId,
      (since) => this.get(jobId, { since, includeContent: opts.includeContent }, { signal: opts.signal }),
      (j) => ({ ...j, entries: j.pages }),
      opts,
      (j) => (last = j),
    );
    for await (const p of it) pages.push(p);
    return { ...(last as CrawlJob), pages, hasMore: false };
  }

  /** `start` + `wait`. */
  async run(params: CrawlParams, opts: WaitOptions<CrawlJob> & { includeContent?: boolean } = {}): Promise<CrawlJob> {
    const job = await this.start(params, { signal: opts.signal });
    return this.wait(job.id, opts);
  }
}

export class Batch {
  constructor(private readonly http: HttpClient) {}

  /** Starts an async scrape of many URLs (`POST /scraper/batch`). */
  start(params: BatchParams, options?: CallOptions): Promise<JobStarted> {
    return this.http.request('POST', '/scraper/batch', { body: params, ...options });
  }

  /** One poll of a batch (`GET /scraper/batch/{jobId}`). Content is included only with `includeContent: true`. */
  get(jobId: string, query: CursorQuery = {}, options?: CallOptions): Promise<BatchJob> {
    return this.http.request('GET', `/scraper/batch/${encodeURIComponent(jobId)}`, {
      query: { since: query.since, include_content: query.includeContent === undefined ? undefined : String(query.includeContent) },
      ...options,
    });
  }

  /** Cancels a running batch (`DELETE /scraper/batch/{jobId}`). */
  cancel(jobId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/batch/${encodeURIComponent(jobId)}`, options);
  }

  /** Yields batch items as they finish, until the batch settles. */
  items(jobId: string, opts: WaitOptions<BatchJob> & { includeContent?: boolean } = {}): AsyncGenerator<BatchItem, void, undefined> {
    return streamCursorJob<BatchJob, BatchItem>(
      jobId,
      (since) => this.get(jobId, { since, includeContent: opts.includeContent ?? true }, { signal: opts.signal }),
      (j) => ({ ...j, entries: j.items }),
      opts,
      () => undefined,
    );
  }

  /** Polls until the batch settles and returns the final job with every item collected (content included by default). */
  async wait(jobId: string, opts: WaitOptions<BatchJob> & { includeContent?: boolean } = {}): Promise<BatchJob> {
    let last: BatchJob | undefined;
    const items: BatchItem[] = [];
    const it = streamCursorJob<BatchJob, BatchItem>(
      jobId,
      (since) => this.get(jobId, { since, includeContent: opts.includeContent ?? true }, { signal: opts.signal }),
      (j) => ({ ...j, entries: j.items }),
      opts,
      (j) => (last = j),
    );
    for await (const item of it) items.push(item);
    return { ...(last as BatchJob), items, hasMore: false };
  }

  /** `start` + `wait`. */
  async run(params: BatchParams, opts: WaitOptions<BatchJob> & { includeContent?: boolean } = {}): Promise<BatchJob> {
    const job = await this.start(params, { signal: opts.signal });
    return this.wait(job.id, opts);
  }
}

export class SerpBulk {
  constructor(private readonly http: HttpClient) {}

  /** Starts a multi-page search job (`POST /scraper/serp/bulk`). */
  start(params: SerpBulkParams, options?: CallOptions): Promise<JobStarted> {
    return this.http.request('POST', '/scraper/serp/bulk', { body: params, ...options });
  }

  /** One poll (`GET /scraper/serp/bulk/{jobId}`). `organic` is merged and re-ranked across pages. */
  get(jobId: string, query: { since?: number } = {}, options?: CallOptions): Promise<SerpBulkJob> {
    return this.http.request('GET', `/scraper/serp/bulk/${encodeURIComponent(jobId)}`, { query: { since: query.since }, ...options });
  }

  /** Cancels a running job (`DELETE /scraper/serp/bulk/{jobId}`). */
  cancel(jobId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/serp/bulk/${encodeURIComponent(jobId)}`, options);
  }

  /** Polls until the job settles and returns its final, merged view. */
  wait(jobId: string, opts: WaitOptions<SerpBulkJob> = {}): Promise<SerpBulkJob> {
    return pollUntilDone(
      { jobId, poll: () => this.get(jobId, {}, { signal: opts.signal }), isDone: (j) => JOB_TERMINAL.has(j.status), status: (j) => j.status },
      opts,
    );
  }

  /** `start` + `wait`. */
  async run(params: SerpBulkParams, opts: WaitOptions<SerpBulkJob> = {}): Promise<SerpBulkJob> {
    const job = await this.start(params, { signal: opts.signal });
    return this.wait(job.id, opts);
  }
}
