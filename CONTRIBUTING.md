# Contributing

Thanks for helping improve the QuanticData Node.js SDK.

## Setup

```bash
git clone https://github.com/quanticdata-io/quanticdata-node
cd quanticdata-node
npm ci
```

## Checks

Run these before opening a pull request; CI runs the same ones on Node 18, 20 and 22.

```bash
npm run lint
npm run typecheck
npm test
npm run check:generated   # generated types and fixtures match openapi/openapi.json
npm run build && npm run check:package
npm run examples          # every example runs against the local mock server
```

## Ground rules

- Tests never call the real API and never need an API key. Use the fake `fetch` in `test/helpers.ts` or the local mock server in `test/mock-server.ts`.
- Endpoints, parameters and response fields come from the OpenAPI document. Do not add a method or a parameter that the spec does not describe; open an issue instead.
- `src/generated/openapi.ts` and `test/fixtures/` are generated. Change the spec (`npm run sync-openapi`), never the generated files.
- A method that sends a billed POST must not retry it after the server answered.
- Public API changes need a CHANGELOG entry under "Unreleased".

## Updating to a new API version

```bash
npm run sync-openapi       # downloads https://quanticdata.io/docs/openapi.json, rebuilds fixtures and types
npm run typecheck && npm test
```

Review the diff of `openapi/openapi.json`: new operations get a method, a test and a row in the README table.

## Commit messages and releases

Use clear, imperative commit messages. Releases are tagged `vX.Y.Z`; the release workflow publishes to npm with provenance.
