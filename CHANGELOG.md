# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Typed wrappers for Premium ISP and IPv6 orders (reachable today through `client.request`).
- Webhook signature helpers, once the API documents a signing scheme.

## [0.1.0] - 2026-11-18

### Added

- `QuanticData` client with typed methods for scrape, search, map, crawl, batch, SERP bulk, Web Unlocker (single and batch), AI agent and finders, AI visibility, SEO audit, video, collectors, datasets, parser presets, account, proxies and proxy locations.
- Request and response types generated from the public OpenAPI document (`openapi/openapi.json`, spec version 2026-11-11).
- Job helpers: `wait`, `run`, `crawl.pages()`, `batch.items()` with cursor handling, timeouts and `AbortSignal`.
- Pagination helpers `proxies.iterate()` and `collectors.iterateRuns()`.
- Typed errors per HTTP status, rate-limit headers, `onResponse` hook.
- Retries for 429 on every method and for connection errors and 500/502/504 on GET/DELETE only.
- Proxy string helpers `parseProxyString`, `toProxyUrl`, `proxyStringToUrl` and `proxies.generateUrls()`.
- ESM and CommonJS builds with type declarations.
- Local mock server built from the documented examples, used by the tests and the examples.

[Unreleased]: https://github.com/quanticdata-io/quanticdata-node/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/quanticdata-io/quanticdata-node/releases/tag/v0.1.0
