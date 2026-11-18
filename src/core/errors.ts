import type { RateLimitInfo } from './rate-limit';

export interface QuanticDataErrorInit {
  status?: number;
  payload?: unknown;
  headers?: Headers;
  rateLimit?: RateLimitInfo;
  method?: string;
  path?: string;
  cause?: unknown;
}

/**
 * Base class of every error the SDK throws.
 *
 * `message` is the API's own `message` field when the API answered with the
 * error envelope (`{"type":"error","message":"…","payload":{…}}`).
 */
export class QuanticDataError extends Error {
  /** HTTP status, when a response was received. */
  readonly status: number | undefined;
  /** The error envelope's `payload` (structured detail such as codes, balances, limits). */
  readonly payload: unknown;
  /** Response headers, when a response was received. */
  readonly headers: Headers | undefined;
  /** Rate-limit headers of the response, when present. */
  readonly rateLimit: RateLimitInfo | undefined;
  /** HTTP method of the failed request. */
  readonly method: string | undefined;
  /** API path of the failed request (relative to the base URL). */
  readonly path: string | undefined;

  constructor(message: string, init: QuanticDataErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = new.target.name;
    this.status = init.status;
    this.payload = init.payload;
    this.headers = init.headers;
    this.rateLimit = init.rateLimit;
    this.method = init.method;
    this.path = init.path;
  }

  /** Machine-readable error code from the payload (`payload.code`), when the API sent one. */
  get code(): string | undefined {
    const p = this.payload;
    if (p && typeof p === 'object' && 'code' in p && typeof (p as { code: unknown }).code === 'string') {
      return (p as { code: string }).code;
    }
    return undefined;
  }
}

/** The request could not reach the API (DNS, TCP, TLS, connection reset). */
export class APIConnectionError extends QuanticDataError {}

/** The request took longer than `timeoutMs`. */
export class APITimeoutError extends APIConnectionError {}

/** The request was aborted through the caller's `AbortSignal`. */
export class APIUserAbortError extends QuanticDataError {}

/** HTTP 400: the request was malformed or a parameter was out of range. */
export class BadRequestError extends QuanticDataError {}

/** HTTP 401: missing, disabled, expired or unknown API key, or a banned account. */
export class AuthenticationError extends QuanticDataError {}

/** HTTP 402: the free tier and the balance cannot cover the call. */
export class PaymentRequiredError extends QuanticDataError {}

/** HTTP 403: the key or the plan does not allow this call. */
export class PermissionDeniedError extends QuanticDataError {}

/** HTTP 404: unknown resource (job id, collector slug, order id, ...). */
export class NotFoundError extends QuanticDataError {}

/** HTTP 409: conflict (for example an idempotency key reused with a different body). */
export class ConflictError extends QuanticDataError {}

/** HTTP 422: the input cannot succeed as sent (retrying the same input will not help). */
export class UnprocessableEntityError extends QuanticDataError {}

/** HTTP 429: rate limited. `retryAfterMs` comes from the `Retry-After` header. */
export class RateLimitError extends QuanticDataError {
  readonly retryAfterMs: number | undefined;
  constructor(message: string, init: QuanticDataErrorInit & { retryAfterMs?: number } = {}) {
    super(message, init);
    this.retryAfterMs = init.retryAfterMs;
  }
}

/** HTTP 5xx other than 503. */
export class InternalServerError extends QuanticDataError {}

/** HTTP 503: the service is switched off for the account or temporarily unavailable. */
export class ServiceUnavailableError extends QuanticDataError {}

/** A polled job did not settle within `timeoutMs`. The job keeps running on the server. */
export class JobTimeoutError extends QuanticDataError {
  readonly jobId: string;
  readonly lastStatus: string | undefined;
  constructor(jobId: string, lastStatus: string | undefined, timeoutMs: number) {
    super(`Job ${jobId} did not finish within ${timeoutMs} ms (last status: ${lastStatus ?? 'unknown'}). It keeps running on the server; poll it again later.`);
    this.jobId = jobId;
    this.lastStatus = lastStatus;
  }
}

export function errorForStatus(status: number, message: string, init: QuanticDataErrorInit & { retryAfterMs?: number }): QuanticDataError {
  switch (status) {
    case 400:
      return new BadRequestError(message, init);
    case 401:
      return new AuthenticationError(message, init);
    case 402:
      return new PaymentRequiredError(message, init);
    case 403:
      return new PermissionDeniedError(message, init);
    case 404:
      return new NotFoundError(message, init);
    case 409:
      return new ConflictError(message, init);
    case 422:
      return new UnprocessableEntityError(message, init);
    case 429:
      return new RateLimitError(message, init);
    case 503:
      return new ServiceUnavailableError(message, init);
    default:
      return status >= 500 ? new InternalServerError(message, init) : new QuanticDataError(message, init);
  }
}
