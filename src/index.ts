export { QuanticData } from './client';
export {
  DEFAULT_BASE_URL,
  ENV_API_BASE,
  ENV_API_KEY,
  HttpClient,
  type ClientOptions,
  type HttpMethod,
  type QueryValue,
  type RequestOptions,
  type ResponseInfo,
} from './core/http';
export {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  JobTimeoutError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  QuanticDataError,
  RateLimitError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from './core/errors';
export type { RateLimitInfo } from './core/rate-limit';
export type { WaitOptions } from './core/polling';
export type { CursorQuery } from './resources/jobs';
export type { RunCollectorOptions } from './resources/collectors';
export type { DatasetJsonExport } from './resources/datasets';
export type { UnlockBatchQuery } from './resources/unlock';
export {
  PROXY_STRING_FORMATS,
  ProxyStringError,
  parseProxyString,
  proxyStringToUrl,
  toProxyUrl,
  type ParsedProxy,
  type ProxyProtocol,
} from './proxy-string';
export { VERSION } from './version';
export type * from './types';
