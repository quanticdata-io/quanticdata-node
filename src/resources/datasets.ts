import type { HttpClient, RequestOptions } from '../core/http';
import { DATASET_TERMINAL, pollUntilDone, type WaitOptions } from '../core/polling';
import type { DatasetJob, DatasetParams, DatasetRow, DatasetSummary, JobStarted } from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export interface DatasetJsonExport {
  columns: unknown[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export class Datasets {
  constructor(private readonly http: HttpClient) {}

  /** Your recent dataset runs (`GET /scraper/datasets`). */
  async list(options?: CallOptions): Promise<DatasetSummary[]> {
    const payload = await this.http.request<{ datasets?: DatasetSummary[] }>('GET', '/scraper/datasets', options);
    return payload.datasets ?? [];
  }

  /** Starts building a dataset from a prompt (`POST /scraper/datasets`). */
  create(params: DatasetParams, options?: CallOptions): Promise<JobStarted> {
    return this.http.request('POST', '/scraper/datasets', { body: params, ...options });
  }

  /** One poll (`GET /scraper/datasets/{jobId}`). `mode: 'summary'` leaves the rows out. */
  get(jobId: string, query: { since?: number; mode?: 'summary' } = {}, options?: CallOptions): Promise<DatasetJob> {
    return this.http.request('GET', `/scraper/datasets/${encodeURIComponent(jobId)}`, { query, ...options });
  }

  /** Cancels a running dataset job (`DELETE /scraper/datasets/{jobId}`). */
  cancel(jobId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/datasets/${encodeURIComponent(jobId)}`, options);
  }

  /** Downloads the dataset file as CSV text (`GET /scraper/datasets/{jobId}/download?format=csv`). */
  downloadCsv(jobId: string, options?: CallOptions): Promise<string> {
    return this.http.request('GET', `/scraper/datasets/${encodeURIComponent(jobId)}/download`, { query: { format: 'csv' }, ...options });
  }

  /** Downloads the dataset file as JSON (`GET /scraper/datasets/{jobId}/download?format=json`). */
  downloadJson(jobId: string, options?: CallOptions): Promise<DatasetJsonExport> {
    return this.http.request('GET', `/scraper/datasets/${encodeURIComponent(jobId)}/download`, { query: { format: 'json' }, ...options });
  }

  /** Renames a dataset run (`PATCH /scraper/datasets/{jobId}/record`); `null` clears the name. */
  rename(jobId: string, name: string | null, options?: CallOptions): Promise<unknown> {
    return this.http.request('PATCH', `/scraper/datasets/${encodeURIComponent(jobId)}/record`, { body: { name }, ...options });
  }

  /** Deletes a dataset run's stored record (`DELETE /scraper/datasets/{jobId}/record`). */
  deleteRecord(jobId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/datasets/${encodeURIComponent(jobId)}/record`, options);
  }

  /**
   * Polls in summary mode until the job settles, then reads every row
   * (following `nextCursor`) and returns the final job with `rows` filled in.
   */
  async wait(jobId: string, opts: WaitOptions<DatasetJob> = {}): Promise<DatasetJob> {
    await pollUntilDone(
      {
        jobId,
        poll: () => this.get(jobId, { mode: 'summary' }, { signal: opts.signal }),
        isDone: (j) => DATASET_TERMINAL.has(j.status),
        status: (j) => j.status,
      },
      opts,
    );
    const rows: DatasetRow[] = [];
    let job = await this.get(jobId, {}, { signal: opts.signal });
    rows.push(...(job.rows ?? []));
    let since = job.nextCursor;
    while (since !== undefined && (job.rows?.length ?? 0) > 0) {
      const next = await this.get(jobId, { since }, { signal: opts.signal });
      if (!next.rows?.length || next.nextCursor === since) break;
      rows.push(...next.rows);
      job = next;
      since = next.nextCursor;
    }
    return { ...job, rows };
  }

  /** `create` + `wait`. */
  async run(params: DatasetParams, opts: WaitOptions<DatasetJob> = {}): Promise<DatasetJob> {
    const job = await this.create(params, { signal: opts.signal });
    return this.wait(job.id, opts);
  }
}
