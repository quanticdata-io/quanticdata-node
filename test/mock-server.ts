/**
 * Local stand-in for the QuanticData API, built from the documented response
 * examples in test/fixtures (generated from openapi/openapi.json).
 *
 * - `npm run mock` starts it on http://127.0.0.1:4010/v1 for the README quickstart and examples.
 * - The test suite starts it on a random port.
 *
 * It checks the Bearer key shape, routes by method and path template, and
 * answers with the documented example. It never forwards anything to the real API.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface FixtureResponse {
  contentType: string;
  body: unknown;
}
interface Fixture {
  method: string;
  path: string;
  responses: Record<string, FixtureResponse>;
}
interface Route {
  operationId: string;
  method: string;
  regex: RegExp;
  fixture: Fixture;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
  operationId: string | undefined;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(here, 'fixtures');

export function loadRoutes(dir: string = FIXTURES_DIR): Route[] {
  const routes: Route[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Fixture;
    const pattern = fixture.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+');
    routes.push({ operationId: file.replace(/\.json$/, ''), method: fixture.method, regex: new RegExp(`^${pattern}$`), fixture });
  }
  // Literal segments win over templated ones (e.g. /collectors/runs before /collectors/{slug}).
  const params = (r: Route) => (r.fixture.path.match(/\{/g) ?? []).length;
  routes.sort((a, b) => params(a) - params(b));
  return routes;
}

function successStatus(f: Fixture): string {
  for (const s of ['200', '201', '202']) if (f.responses[s]) return s;
  return Object.keys(f.responses)[0] ?? '200';
}

const KEY = /^Bearer (qd|qp)_(live|test)_[A-Za-z0-9]+$/;
const NO_AUTH = new Set(['getIpEcho', 'getUnlockStatus', 'useRotationLink', 'useRotationLinkPost']);

export interface MockServer {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

export async function startMockServer(port = 0, host = '127.0.0.1'): Promise<MockServer> {
  const routes = loadRoutes();
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const apiPath = url.pathname.replace(/^\/v1/, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      const route = routes.find((r) => r.method === req.method && r.regex.test(apiPath));
      requests.push({ method: req.method ?? 'GET', url: url.pathname + url.search, headers: req.headers, body, operationId: route?.operationId });

      const send = (status: number, contentType: string, payload: unknown) => {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        res.writeHead(status, {
          'Content-Type': contentType,
          'X-RateLimit-Limit': '1000',
          'X-RateLimit-Remaining': '999',
          'X-RateLimit-Reset': '3600',
        });
        res.end(text);
      };

      if (!route) {
        send(404, 'application/json', { type: 'error', message: `No route for ${req.method} ${apiPath} in the mock server` });
        return;
      }
      if (!NO_AUTH.has(route.operationId) && !KEY.test(String(req.headers.authorization ?? ''))) {
        const unauthorized = route.fixture.responses['401'];
        send(401, 'application/json', unauthorized?.body ?? { type: 'error', message: 'Unauthorized' });
        return;
      }
      let status = successStatus(route.fixture);
      if (route.operationId === 'getCollectorRun' && url.searchParams.get('format') === 'csv') {
        send(200, 'text/csv', 'name,address\nExample Pizza,1 Example St\n');
        return;
      }
      if (route.operationId === 'downloadDataset' && url.searchParams.get('format') !== 'json') {
        send(200, 'text/csv', 'company,_source_url\nBologna Rent,https://example.it/contatti\n');
        return;
      }
      if (route.operationId === 'runCollector' && body && typeof body === 'object' && (body as { async?: boolean }).async) status = '202';
      const r = route.fixture.responses[status]!;
      send(Number(status), r.contentType, r.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    url: `http://${host}:${actualPort}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.MOCK_PORT ?? 4010);
  startMockServer(port).then((s) => {
    console.log(`QuanticData mock API listening on ${s.url}`);
    console.log(`export QUANTICDATA_API_BASE=${s.url}`);
  });
}
