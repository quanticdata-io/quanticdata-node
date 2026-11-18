# quanticdata

Official TypeScript and Node.js SDK for the [QuanticData API](https://quanticdata.io/docs/): scrape any page to Markdown, get search results as JSON, map and crawl sites, run batch jobs, replay requests through the Web Unlocker, run ready-made collectors, build datasets from a prompt, and generate proxy strings for your proxy plans.

[![CI](https://github.com/quanticdata-io/quanticdata-node/actions/workflows/ci.yml/badge.svg)](https://github.com/quanticdata-io/quanticdata-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/quanticdata.svg)](https://www.npmjs.com/package/quanticdata)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

- Typed end to end: request and response types are generated from the public OpenAPI document, so editor completion shows every documented parameter.
- ESM and CommonJS builds, zero runtime dependencies, Node.js 18.17 or later (uses the built-in `fetch`).
- Async jobs handled for you: `crawl.run()`, `batch.run()`, `datasets.run()`, `collectors.run()` start the job and poll it; `crawl.pages()` and `batch.items()` stream results as they finish.
- Pagination helpers (`proxies.iterate()`, `collectors.iterateRuns()`), typed errors per HTTP status, rate-limit headers, timeouts and `AbortSignal` support.
- Safe retries: HTTP 429 is retried with `Retry-After`; connection errors and 5xx are retried on GET and DELETE only, so a billed POST is never sent twice by the SDK.

## Install

```bash
npm install quanticdata
```

## Quickstart

Create an API key on the API keys page of the [QuanticData dashboard](https://app.quanticdata.io/) and export it:

```bash
export QUANTICDATA_API_KEY=qd_live_your_key
```

```ts
import { QuanticData } from 'quanticdata';

const qd = new QuanticData(); // reads QUANTICDATA_API_KEY

// One page as clean Markdown
const page = await qd.scrape({ url: 'https://example.com', format: 'markdown' });
console.log(page.title, page.content.length);

// Search results as JSON
const serp = await qd.search({ query: 'best coffee grinder', country: 'us' });
console.log(serp.organic.map((r) => r.link));
```

CommonJS works the same way:

```js
const { QuanticData } = require('quanticdata');
```

Try it without a key or network: the repository ships a local mock of the API built from the documented examples.

```bash
git clone https://github.com/quanticdata-io/quanticdata-node && cd quanticdata-node
npm ci && npm run build
npm run mock    # prints: QuanticData mock API listening on http://127.0.0.1:4010/v1
# in a second terminal:
QUANTICDATA_API_KEY=qd_test_123 QUANTICDATA_API_BASE=http://127.0.0.1:4010/v1 npx tsx examples/search.ts
```

## Configuration

```ts
const qd = new QuanticData({
  apiKey: process.env.QUANTICDATA_API_KEY, // default: QUANTICDATA_API_KEY
  baseURL: 'https://api.quanticdata.io/v1', // default: QUANTICDATA_API_BASE or this URL
  timeoutMs: 120_000, // per request
  maxRetries: 2, // see "Retries"
  onResponse: (info) => console.log(info.method, info.path, info.status, info.rateLimit?.remaining),
});
```

Authentication is the `Authorization: Bearer qd_live_...` header and nothing else; the SDK never puts the key in a URL.

## What the client covers

| Area | Methods | Endpoints |
| --- | --- | --- |
| Scrape | `scrape`, `estimateCost` | `POST /scraper/extract`, `GET /scraper/cost` |
| Search | `search`, `serpBulk.start/get/cancel/wait/run` | `POST /scraper/serp`, `/scraper/serp/bulk` |
| Map and crawl | `map`, `crawl.start/get/cancel/wait/run/pages` | `POST /scraper/map`, `/scraper/crawl` |
| Batch | `batch.start/get/cancel/wait/run/items` | `/scraper/batch` |
| Web Unlocker | `unlock.request`, `unlock.batch.*`, `unlock.caCertificate` | `/scraper/unlock`, `/scraper/unlock/batch`, `/scraper/unlock/ca` |
| AI | `ai.agent`, `ai.places`, `ai.shopping`, `aiVisibility`, `seoAudit`, `readVideo` | `/scraper/ai`, `/scraper/places-ai`, `/scraper/shopping-ai`, `/scraper/ai-visibility`, `/scraper/seo-audit`, `/scraper/video` |
| Collectors | `collectors.list/get/run/getRun/getRunCsv/waitForRun/listRuns/iterateRuns` | `/scraper/collectors/**` |
| Datasets | `datasets.list/create/get/cancel/wait/run/downloadCsv/downloadJson/rename/deleteRecord` | `/scraper/datasets/**` |
| Parser presets | `parser.generate`, `parser.presets.*` | `/scraper/parser/**` |
| Account | `account.usage/billing/balance/plans/orders` | `/scraper/usage`, `/scraper/billing`, `/public/balance`, `/public/plans`, `/public/orders` |
| Proxies | `proxies.list/iterate/generate/generateUrls/ipInfo/ipEcho/rotate`, `proxies.whitelist.*`, `proxies.rotationLinks.*` | `/public/proxies/**`, `/public/ip-echo` |
| Proxy locations | `locations.countries/states/cities/asns` | `/public/geo/**` |

Anything else in the API (Premium ISP and IPv6 orders, purchases) is reachable through `qd.request(method, path, { query, body })`, which applies the same auth, envelope handling and errors.

## Async jobs

```ts
// Start and wait: every page is collected, following the job's cursor
const crawl = await qd.crawl.run({ url: 'https://docs.example.com', limit: 50, depth: 2 });
console.log(crawl.status, crawl.pages.length);

// Or stream pages while the crawl runs
const job = await qd.crawl.start({ url: 'https://docs.example.com', limit: 50 });
for await (const p of qd.crawl.pages(job.id)) console.log(p.status, p.url);

// Batch scrape with structured extraction
const batch = await qd.batch.run({ urls: ['https://example.com/a', 'https://example.com/b'], extract: { title: 'h1' } });

// Dataset from a prompt, then a CSV export
const ds = await qd.datasets.run({ prompt: 'Car rental companies in Bologna with phone and website' });
const csv = await qd.datasets.downloadCsv(ds.id);
```

Every `wait`/`run` accepts `{ pollIntervalMs, timeoutMs, signal, onProgress }`. When `timeoutMs` passes, a `JobTimeoutError` is thrown and the job keeps running on the server; poll it again later with `get` or `wait`.

## Collectors

```ts
const { collectors } = await qd.collectors.list({ category: 'local' });
const run = await qd.collectors.run('google_maps_places', { query: 'pizza restaurants', location: 'Brooklyn, NY' });
console.log(run.count, run.results?.[0]);

// Long runs: force background processing and poll
const queued = await qd.collectors.run('google_maps_places', { query: 'dentists', location: 'Austin, TX' }, { async: true });
```

The input of each collector is documented in its `input_schema` (`qd.collectors.get(slug)`).

## Proxies

```ts
for await (const plan of qd.proxies.iterate({ active: 'true' })) console.log(plan.orderId, plan.planType);

// Proxy strings generated by the API, parsed into URLs for any HTTP client
const proxies = await qd.proxies.generateUrls({ orderId: 'ord_123', quantity: 5, rotation: 'sticky', country: 'us' });
console.log(proxies[0].url); // http://user-...:pass@host:port
```

Using a proxy URL with `undici` (`npm install undici`):

```ts
import { ProxyAgent, fetch } from 'undici';
const res = await fetch('https://api.quanticdata.io/v1/public/ip-echo', { dispatcher: new ProxyAgent(proxies[0].url) });
console.log(await res.json()); // the exit IP and its location
```

`parseProxyString` and `toProxyUrl` read every format the generate endpoint returns (`user:pass@host:port`, `host:port:user:pass`, `http://...`, `socks5://...`). Targeting (country, city, session) is always applied by the API when it generates the strings.

## Errors

```ts
import { PaymentRequiredError, RateLimitError, QuanticDataError } from 'quanticdata';

try {
  await qd.scrape({ url: 'https://example.com' });
} catch (err) {
  if (err instanceof PaymentRequiredError) console.error('Top up the balance:', err.message);
  else if (err instanceof RateLimitError) console.error('Retry after', err.retryAfterMs, 'ms');
  else if (err instanceof QuanticDataError) console.error(err.status, err.message, err.payload);
  else throw err;
}
```

| Status | Class |
| --- | --- |
| 400 | `BadRequestError` |
| 401 | `AuthenticationError` |
| 402 | `PaymentRequiredError` |
| 403 | `PermissionDeniedError` |
| 404 | `NotFoundError` |
| 409 | `ConflictError` |
| 422 | `UnprocessableEntityError` |
| 429 | `RateLimitError` |
| 503 | `ServiceUnavailableError` |
| other 5xx | `InternalServerError` |
| no response | `APIConnectionError`, `APITimeoutError`, `APIUserAbortError` |

All of them extend `QuanticDataError` with `status`, `message` (the API's own message), `payload`, `code`, `headers` and `rateLimit`.

## Retries

| Case | GET, DELETE | POST, PUT, PATCH |
| --- | --- | --- |
| HTTP 429 | retried, waits `Retry-After` | retried, waits `Retry-After` |
| Connection error, HTTP 500/502/504 | retried with backoff | not retried |
| HTTP 503 (service switched off) | not retried | not retried |

Set `maxRetries: 0` to turn retries off, globally or per call.

## Costs

Data API calls are charged only when they succeed, and billed responses carry `payload.usage`. Prices are on the [pricing page](https://quanticdata.io/pricing/); `qd.account.billing()` returns the prices of your account and `qd.estimateCost()` sizes a call before you send it. The SDK never retries a POST that reached the server.

## Types

All request and response types are exported:

```ts
import type { ScrapeParams, ExtractResult, SerpResult, CrawlJob, CollectorRun, operations } from 'quanticdata';
```

They are generated from `openapi/openapi.json`, a copy of the public spec at `https://quanticdata.io/docs/openapi.json`. `npm run sync-openapi` refreshes it and CI fails if the generated code drifts from the spec.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run build && npm run check:package
npm run examples   # runs every example against the local mock server
```

Tests never call the real API: they replay the documented response examples (`test/fixtures`, generated from the spec) through a fake `fetch` and a local HTTP mock server. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Links

- API reference: https://quanticdata.io/docs/
- OpenAPI: https://quanticdata.io/docs/openapi.json
- Pricing: https://quanticdata.io/pricing/
- Security: [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
