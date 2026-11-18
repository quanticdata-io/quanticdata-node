import type { HttpClient, RequestOptions } from '../core/http';
import { UNLOCK_BATCH_TERMINAL, pollUntilDone, type WaitOptions } from '../core/polling';
import type { UnlockBatchJob, UnlockBatchParams, UnlockBatchResult, UnlockBatchStarted, UnlockParams, UnlockResult } from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export interface UnlockBatchQuery {
  /** Include each item's body in `results`. */
  includeBody?: boolean;
  offset?: number;
  /** 1 to 100, default 50. */
  limit?: number;
}

export class UnlockBatch {
  constructor(private readonly http: HttpClient) {}

  /** Starts an async unlock of many URLs (`POST /scraper/unlock/batch`). */
  start(params: UnlockBatchParams, options?: CallOptions): Promise<UnlockBatchStarted> {
    return this.http.request('POST', '/scraper/unlock/batch', { body: params, ...options });
  }

  /** One poll with one page of results (`GET /scraper/unlock/batch/{batch_id}`). */
  get(batchId: string, query: UnlockBatchQuery = {}, options?: CallOptions): Promise<UnlockBatchJob> {
    return this.http.request('GET', `/scraper/unlock/batch/${encodeURIComponent(batchId)}`, {
      query: { include: query.includeBody ? 'body' : undefined, offset: query.offset, limit: query.limit },
      ...options,
    });
  }

  /** Cancels a running batch (`DELETE /scraper/unlock/batch/{batch_id}`). */
  cancel(batchId: string, options?: CallOptions): Promise<UnlockBatchJob> {
    return this.http.request('DELETE', `/scraper/unlock/batch/${encodeURIComponent(batchId)}`, options);
  }

  /** Polls until the batch settles, then pages through every result. */
  async wait(batchId: string, opts: WaitOptions<UnlockBatchJob> & { includeBody?: boolean } = {}): Promise<UnlockBatchJob> {
    const settled = await pollUntilDone(
      {
        jobId: batchId,
        poll: () => this.get(batchId, { limit: 1 }, { signal: opts.signal }),
        isDone: (j) => UNLOCK_BATCH_TERMINAL.has(j.status),
        status: (j) => j.status,
      },
      opts,
    );
    const results: UnlockBatchResult[] = [];
    for (let offset = 0; offset < settled.total; ) {
      const page = await this.get(batchId, { offset, limit: 100, includeBody: opts.includeBody }, { signal: opts.signal });
      const chunk = page.results ?? [];
      if (chunk.length === 0) break;
      results.push(...chunk);
      offset += chunk.length;
    }
    return { ...settled, results };
  }

  /** `start` + `wait`. */
  async run(params: UnlockBatchParams, opts: WaitOptions<UnlockBatchJob> & { includeBody?: boolean } = {}): Promise<UnlockBatchJob> {
    const started = await this.start(params, { signal: opts.signal });
    return this.wait(started.batch_id, opts);
  }
}

export class Unlock {
  readonly batch: UnlockBatch;
  constructor(private readonly http: HttpClient) {
    this.batch = new UnlockBatch(http);
  }

  /** Replays one request through the Web Unlocker (`POST /scraper/unlock`). */
  request(params: UnlockParams, options?: CallOptions): Promise<UnlockResult> {
    return this.http.request('POST', '/scraper/unlock', { body: params, ...options });
  }

  /** The unlocker CA certificate, PEM (`GET /scraper/unlock/ca`), for proxy-mode clients that verify TLS. */
  caCertificate(options?: CallOptions): Promise<string> {
    return this.http.request('GET', '/scraper/unlock/ca', { headers: { Accept: 'application/x-pem-file, application/json' }, ...options });
  }
}
