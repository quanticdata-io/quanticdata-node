import { HttpClient, type ClientOptions, type HttpMethod, type RequestOptions } from './core/http';
import { Account } from './resources/account';
import { AI } from './resources/ai';
import { Collectors } from './resources/collectors';
import { Datasets } from './resources/datasets';
import { Batch, Crawl, SerpBulk } from './resources/jobs';
import { Parser } from './resources/parser';
import { Proxies, ProxyLocations } from './resources/proxies';
import { Unlock } from './resources/unlock';
import type {
  AiVisibilityParams,
  AiVisibilityResult,
  CostEstimate,
  CostEstimateQuery,
  ExtractResult,
  MapParams,
  MapResult,
  ScrapeParams,
  SearchParams,
  SeoAuditParams,
  SeoAuditResult,
  SerpResult,
  VideoParams,
  VideoReadResult,
} from './types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

/**
 * Client for the QuanticData API.
 *
 * ```ts
 * import { QuanticData } from 'quanticdata';
 * const qd = new QuanticData(); // reads QUANTICDATA_API_KEY
 * const page = await qd.scrape({ url: 'https://example.com' });
 * console.log(page.content);
 * ```
 */
export class QuanticData {
  /** Low-level transport, for endpoints this version does not wrap yet. */
  readonly http: HttpClient;

  /** Async crawl jobs: `start`, `get`, `cancel`, `wait`, `run`, `pages`. */
  readonly crawl: Crawl;
  /** Async multi-URL scrapes: `start`, `get`, `cancel`, `wait`, `run`, `items`. */
  readonly batch: Batch;
  /** Multi-page search jobs: `start`, `get`, `cancel`, `wait`, `run`. */
  readonly serpBulk: SerpBulk;
  /** Web Unlocker: `request`, `batch`, `caCertificate`. */
  readonly unlock: Unlock;
  /** AI extraction: `agent`, `places`, `shopping`. */
  readonly ai: AI;
  /** Ready-made collectors: catalog, runs, CSV export. */
  readonly collectors: Collectors;
  /** Datasets built from a prompt. */
  readonly datasets: Datasets;
  /** LLM-generated CSS parsers and saved presets. */
  readonly parser: Parser;
  /** Usage, billing, balance, plans and orders. */
  readonly account: Account;
  /** Proxy plans, proxy string generation, whitelist, rotation. */
  readonly proxies: Proxies;
  /** Countries, states, cities and ASNs available per plan type. */
  readonly locations: ProxyLocations;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.crawl = new Crawl(this.http);
    this.batch = new Batch(this.http);
    this.serpBulk = new SerpBulk(this.http);
    this.unlock = new Unlock(this.http);
    this.ai = new AI(this.http);
    this.collectors = new Collectors(this.http);
    this.datasets = new Datasets(this.http);
    this.parser = new Parser(this.http);
    this.account = new Account(this.http);
    this.proxies = new Proxies(this.http);
    this.locations = new ProxyLocations(this.http);
  }

  /** Scrapes one URL to Markdown, HTML or text, with optional structured or AI extraction (`POST /scraper/extract`). */
  scrape(params: ScrapeParams, options?: CallOptions): Promise<ExtractResult> {
    return this.http.request('POST', '/scraper/extract', { body: params, ...options });
  }

  /** Structured search results from Google, Bing or DuckDuckGo (`POST /scraper/serp`). */
  search(params: SearchParams, options?: CallOptions): Promise<SerpResult> {
    return this.http.request('POST', '/scraper/serp', { body: params, ...options });
  }

  /** Discovers a site's URLs from its sitemap and homepage (`POST /scraper/map`). */
  map(params: MapParams, options?: CallOptions): Promise<MapResult> {
    return this.http.request('POST', '/scraper/map', { body: params, ...options });
  }

  /** No-JS vs rendered SEO audit of one URL (`POST /scraper/seo-audit`). */
  seoAudit(params: SeoAuditParams, options?: CallOptions): Promise<SeoAuditResult> {
    return this.http.request('POST', '/scraper/seo-audit', { body: params, ...options });
  }

  /** AI visibility audit (`POST /scraper/ai-visibility`). */
  aiVisibility(params: AiVisibilityParams, options?: CallOptions): Promise<AiVisibilityResult> {
    return this.http.request('POST', '/scraper/ai-visibility', { body: params, ...options });
  }

  /** Reads a YouTube video as a Markdown timeline for a model (`POST /scraper/video`). */
  readVideo(params: VideoParams, options?: CallOptions): Promise<VideoReadResult> {
    return this.http.request('POST', '/scraper/video', { body: params, ...options });
  }

  /** What a call can cost on this account, without running it (`GET /scraper/cost`). Nothing is charged. */
  estimateCost(query: CostEstimateQuery = {}, options?: CallOptions): Promise<CostEstimate> {
    return this.http.request('GET', '/scraper/cost', { query: query as Record<string, string | number | undefined>, ...options });
  }

  /** Sends any request to the API and returns the unwrapped `payload`. */
  request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
    return this.http.request<T>(method, path, options);
  }
}
