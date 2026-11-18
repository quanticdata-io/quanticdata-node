// Refreshes openapi/openapi.json from the public QuanticData docs and rebuilds
// the test fixtures. Run `npm run sync-openapi` (it also regenerates the types),
// then review the diff: new operations need a method in src/ and a test.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sanitizeOpenApi } from './sanitize-openapi.mjs';

const SOURCE = process.env.QUANTICDATA_OPENAPI_URL ?? 'https://quanticdata.io/docs/openapi.json';

const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
if (!res.ok) {
  console.error(`GET ${SOURCE} answered HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();
const clean = sanitizeOpenApi(spec);
fs.writeFileSync('openapi/openapi.json', JSON.stringify(clean, null, 2) + '\n');
console.log(`openapi/openapi.json: version ${clean.info.version}, ${Object.keys(clean.paths).length} paths`);
execFileSync(process.execPath, ['scripts/build-fixtures.mjs'], { stdio: 'inherit' });
