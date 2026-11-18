import { JobTimeoutError } from './errors';
import { sleep } from './http';

export interface WaitOptions<T = unknown> {
  /** Delay between polls in milliseconds. Default 2000. */
  pollIntervalMs?: number;
  /** Give up after this many milliseconds (the job keeps running on the server). Default 600000 (10 minutes). */
  timeoutMs?: number;
  /** Abort polling. */
  signal?: AbortSignal;
  /** Called with every polled view of the job. */
  onProgress?: (job: T) => void;
}

export interface PollSpec<T> {
  jobId: string;
  poll: () => Promise<T>;
  isDone: (job: T) => boolean;
  status: (job: T) => string | undefined;
}

/** Polls `poll()` until `isDone` holds, honouring the interval, timeout and abort signal. */
export async function pollUntilDone<T>(spec: PollSpec<T>, opts: WaitOptions<T> = {}): Promise<T> {
  const interval = Math.max(0, opts.pollIntervalMs ?? 2_000);
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await spec.poll();
    opts.onProgress?.(job);
    if (spec.isDone(job)) return job;
    if (Date.now() + interval > deadline) throw new JobTimeoutError(spec.jobId, spec.status(job), timeoutMs);
    await sleep(interval, opts.signal);
  }
}

export const JOB_TERMINAL = new Set(['completed', 'failed', 'cancelled']);
export const DATASET_TERMINAL = new Set(['completed', 'failed', 'cancelled', 'budget_reached', 'expired']);
export const COLLECTOR_TERMINAL = new Set(['done', 'failed']);
export const UNLOCK_BATCH_TERMINAL = new Set(['completed', 'cancelled']);
