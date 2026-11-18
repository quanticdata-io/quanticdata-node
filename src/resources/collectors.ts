import type { HttpClient, RequestOptions } from '../core/http';
import { COLLECTOR_TERMINAL, pollUntilDone, type WaitOptions } from '../core/polling';
import type {
  CollectorCatalogEntry,
  CollectorCategory,
  CollectorList,
  CollectorRun,
  CollectorRunAccepted,
  CollectorRunList,
  CollectorRunsQuery,
} from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export interface RunCollectorOptions extends WaitOptions<CollectorRun> {
  /** Force background processing (the API answers 202 with a `run_id`). Default `false`: short runs answer with their rows. */
  async?: boolean;
  /**
   * When the run is processed in the background, poll it until it settles.
   * Default `true`. With `false`, `run()` returns the queued run as answered.
   */
  wait?: boolean;
}

function isAccepted(p: CollectorRun | CollectorRunAccepted): p is CollectorRunAccepted {
  return typeof p === 'object' && p !== null && 'run_id' in p && !('slug' in p);
}

export class Collectors {
  constructor(private readonly http: HttpClient) {}

  /** Collector catalog (`GET /scraper/collectors`), optionally filtered by category. */
  list(query: { category?: CollectorCategory } = {}, options?: CallOptions): Promise<CollectorList> {
    return this.http.request('GET', '/scraper/collectors', { query, ...options });
  }

  /** One collector with its input and output schema (`GET /scraper/collectors/{slug}`). */
  async get(slug: string, options?: CallOptions): Promise<CollectorCatalogEntry> {
    const payload = await this.http.request<{ collector: CollectorCatalogEntry }>('GET', `/scraper/collectors/${encodeURIComponent(slug)}`, options);
    return payload.collector;
  }

  /**
   * Runs a collector (`POST /scraper/collectors/{slug}/run`) with its input as
   * published in `input_schema`. Background runs are polled until they settle
   * unless `wait: false`.
   */
  async run(slug: string, input: Record<string, unknown>, opts: RunCollectorOptions = {}): Promise<CollectorRun> {
    const body: Record<string, unknown> = { input };
    if (opts.async) body.async = true;
    const payload = await this.http.request<CollectorRun | CollectorRunAccepted>('POST', `/scraper/collectors/${encodeURIComponent(slug)}/run`, {
      body,
      signal: opts.signal,
    });
    if (!isAccepted(payload) && COLLECTOR_TERMINAL.has(payload.status)) return payload;
    const runId = payload.run_id as string;
    if (opts.wait === false) return isAccepted(payload) ? this.getRun(runId, { signal: opts.signal }) : payload;
    return this.waitForRun(runId, opts);
  }

  /** One run with its rows (`GET /scraper/collectors/runs/{runId}`). */
  getRun(runId: string, options?: CallOptions): Promise<CollectorRun> {
    return this.http.request('GET', `/scraper/collectors/runs/${encodeURIComponent(runId)}`, options);
  }

  /** One run's rows as CSV (`GET /scraper/collectors/runs/{runId}?format=csv`). */
  getRunCsv(runId: string, options?: CallOptions): Promise<string> {
    return this.http.request('GET', `/scraper/collectors/runs/${encodeURIComponent(runId)}`, { query: { format: 'csv' }, ...options });
  }

  /** Polls a run until it is `done` or `failed`. */
  waitForRun(runId: string, opts: WaitOptions<CollectorRun> = {}): Promise<CollectorRun> {
    return pollUntilDone(
      {
        jobId: runId,
        poll: () => this.getRun(runId, { signal: opts.signal }),
        isDone: (r) => COLLECTOR_TERMINAL.has(r.status),
        status: (r) => r.status,
      },
      opts,
    );
  }

  /** One page of your runs (`GET /scraper/collectors/runs`). */
  listRuns(query: CollectorRunsQuery = {}, options?: CallOptions): Promise<CollectorRunList> {
    return this.http.request('GET', '/scraper/collectors/runs', { query, ...options });
  }

  /** Iterates over all your runs, following `next_cursor`. */
  async *iterateRuns(query: Omit<CollectorRunsQuery, 'cursor'> = {}, options?: CallOptions): AsyncGenerator<CollectorRun, void, undefined> {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.listRuns({ ...query, cursor }, options);
      for (const run of page.runs ?? []) yield run;
      if (!page.next_cursor || page.next_cursor === cursor) return;
      cursor = page.next_cursor;
    }
  }
}
