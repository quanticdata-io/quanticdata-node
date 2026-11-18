import { describe, expectTypeOf, it } from 'vitest';
import type {
  CollectorRun,
  CrawlJob,
  ExtractResult,
  GenerateProxiesParams,
  PlanType,
  ProxyList,
  ScrapeParams,
  SearchParams,
  SerpResult,
} from '../src';
import { QuanticData } from '../src';

// These assertions are checked by `npm run typecheck` (tsc). They guard against
// the generated OpenAPI types collapsing to `never` or `unknown` after a sync.
describe('public types', () => {
  it('derives request and response shapes from the OpenAPI document', () => {
    expectTypeOf<ScrapeParams['format']>().toEqualTypeOf<'markdown' | 'html' | 'text' | 'raw' | undefined>();
    expectTypeOf<SearchParams['engine']>().toEqualTypeOf<'google' | 'bing' | 'duckduckgo' | undefined>();
    expectTypeOf<ExtractResult['content']>().toEqualTypeOf<string>();
    expectTypeOf<SerpResult['organic'][number]['link']>().toEqualTypeOf<string>();
    expectTypeOf<CrawlJob['status']>().toEqualTypeOf<'running' | 'completed' | 'failed' | 'cancelled'>();
    expectTypeOf<CollectorRun['status']>().toEqualTypeOf<'queued' | 'running' | 'done' | 'failed'>();
    expectTypeOf<GenerateProxiesParams['orderId']>().toEqualTypeOf<string>();
    expectTypeOf<PlanType>().toMatchTypeOf<string>();
    expectTypeOf<NonNullable<ProxyList['pagination']>['hasMore']>().toEqualTypeOf<boolean | undefined>();
  });

  it('types the client methods', () => {
    expectTypeOf(QuanticData.prototype.scrape).returns.toEqualTypeOf<Promise<ExtractResult>>();
    expectTypeOf(QuanticData.prototype.search).parameter(0).toEqualTypeOf<SearchParams>();
  });
});
