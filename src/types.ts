/**
 * Public types. Request and response shapes are derived from the vendored
 * OpenAPI document (`openapi/openapi.json`) by `npm run generate`; nothing here
 * is written by hand except the aliases.
 */
import type { components, operations } from './generated/openapi';

export type { components, operations, paths } from './generated/openapi';

type Schemas = components['schemas'];
type OperationId = keyof operations;

/** JSON request body of an operation. */
export type RequestBody<K extends OperationId> = operations[K] extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Query parameters of an operation. */
export type QueryParams<K extends OperationId> = operations[K] extends { parameters: { query?: infer Q } }
  ? NonNullable<Q>
  : never;

/** Unwrapped `payload` of an operation's JSON response for a given status. */
export type ResponsePayload<K extends OperationId, S extends number = 200> = operations[K]['responses'] extends Record<
  S,
  { content: { 'application/json': infer R } }
>
  ? R extends { payload?: infer P }
    ? P
    : R
  : never;

// ---- Shared ---------------------------------------------------------------
export type Usage = Schemas['Usage'];
export type Geo = Schemas['Geo'];
export type GeoValue = Schemas['GeoValue'];
export type JobStarted = Schemas['JobStarted'];
export type ExtractSchema = Schemas['ExtractSchema'];
export type PageAction = Schemas['PageAction'];

// ---- Scrape, search, map, crawl, batch ------------------------------------
export type ScrapeParams = RequestBody<'scrapeUrl'>;
export type ExtractResult = Schemas['ExtractResult'];
export type PageMetadata = Schemas['PageMetadata'];
export type CostEstimateQuery = QueryParams<'estimateScraperCost'>;
export type CostEstimate = ResponsePayload<'estimateScraperCost'>;

export type SearchParams = RequestBody<'searchSerp'>;
export type SerpResult = Schemas['SerpResult'];
export type OrganicResult = Schemas['OrganicResult'];
export type SerpBulkParams = RequestBody<'startSerpBulk'>;
export type SerpBulkJob = Schemas['SerpBulkJob'];

export type MapParams = RequestBody<'mapSite'>;
export type MapResult = Schemas['MapResult'];

export type CrawlParams = RequestBody<'startCrawl'>;
export type CrawlJob = Schemas['CrawlJob'];
export type CrawlPage = Schemas['CrawlPage'];

export type BatchParams = RequestBody<'startBatch'>;
export type BatchJob = Schemas['BatchJob'];
export type BatchItem = Schemas['BatchItem'];

// ---- Web Unlocker -----------------------------------------------------------
export type UnlockParams = RequestBody<'unlockRequest'>;
export type UnlockResult = Schemas['UnlockResult'];
export type UnlockBatchParams = RequestBody<'startUnlockBatch'>;
export type UnlockBatchStarted = Schemas['UnlockBatchStarted'];
export type UnlockBatchJob = Schemas['UnlockBatchJob'];
export type UnlockBatchResult = Schemas['UnlockBatchResult'];

// ---- AI, SEO, video ---------------------------------------------------------
export type AiAgentParams = RequestBody<'aiAgent'>;
export type AiAgentResult = Schemas['AiAgentResult'];
export type AiPlacesParams = RequestBody<'aiPlacesFinder'>;
export type AiShoppingParams = RequestBody<'aiShoppingFinder'>;
export type AiFinderResult = Schemas['AiFinderResult'];
export type AiVisibilityParams = RequestBody<'aiVisibilityAudit'>;
export type AiVisibilityResult = Schemas['AiVisibilityResult'];
export type SeoAuditParams = RequestBody<'seoAudit'>;
export type SeoAuditResult = Schemas['SeoAuditResult'];
export type VideoParams = RequestBody<'readVideo'>;
export type VideoReadResult = Schemas['VideoReadResult'];

// ---- Collectors, datasets, parser presets ------------------------------------
export type CollectorCategory = NonNullable<QueryParams<'listCollectors'>['category']>;
export type CollectorCatalogEntry = Schemas['CollectorCatalogEntry'];
export type CollectorList = ResponsePayload<'listCollectors'>;
export type CollectorRun = Schemas['CollectorRun'];
export type CollectorRunAccepted = ResponsePayload<'runCollector', 202>;
export type CollectorRunList = ResponsePayload<'listCollectorRuns'>;
export type CollectorRunsQuery = QueryParams<'listCollectorRuns'>;

export type DatasetParams = RequestBody<'createDataset'>;
export type DatasetJob = Schemas['DatasetJob'];
export type DatasetSummary = Schemas['DatasetSummary'];
export type DatasetRow = NonNullable<DatasetJob['rows']>[number];

export type GenerateParserParams = RequestBody<'generateParser'>;
export type GenerateParserResult = Schemas['GenerateParserResult'];
export type ParserPreset = Schemas['ParserPreset'];
export type CreateParserPresetParams = RequestBody<'createParserPreset'>;
export type UpdateParserPresetParams = RequestBody<'updateParserPreset'>;
export type HealResult = Schemas['HealResult'];
export type PresetStatsView = Schemas['PresetStatsView'];

// ---- Account ----------------------------------------------------------------
export type UsageReport = ResponsePayload<'getUsage'>;
export type UsageDay = Schemas['UsageDay'];
export type BillingStatus = Schemas['BillingStatus'];
export type Balance = Schemas['Balance'];

// ---- Proxies ------------------------------------------------------------------
export type PlanType = NonNullable<QueryParams<'listProxies'>['planType']>;
export type ProxyPlan = Schemas['ProxyPlan'];
export type ProxyListQuery = QueryParams<'listProxies'>;
export type ProxyList = ResponsePayload<'listProxies'>;
export type GenerateProxiesParams = RequestBody<'generateProxies'>;
export type GeneratedProxies = Schemas['GeneratedProxies'];
export type ProxyStringFormat = NonNullable<GenerateProxiesParams['format']>;
export type IpInfo = Schemas['IpInfo'];
export type IpEcho = Schemas['CloudflareLocation'];
export type WhitelistAddParams = RequestBody<'addWhitelistIp'>;
export type WhitelistRemoveParams = RequestBody<'removeWhitelistIp'>;
export type RotateParams = RequestBody<'rotateProxySession'>;
export type RotationResult = Schemas['RotationResult'];
export type RotationLink = Schemas['RotationLink'];
export type CreateRotationLinksParams = RequestBody<'createRotationLinks'>;

export type GeoCountry = Schemas['GeoCountry'];
export type GeoState = Schemas['GeoState'];
export type GeoCity = Schemas['GeoCity'];
export type GeoAsn = Schemas['GeoAsn'];

export type Plan = Schemas['Plan'];
export type Order = Schemas['Order'];
