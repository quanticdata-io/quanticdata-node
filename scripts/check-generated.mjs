// CI guard: the generated types match openapi/openapi.json, the fixtures match
// the documented examples, and src/version.ts matches package.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let failed = false;
const fail = (msg) => {
  console.error(`check-generated: ${msg}`);
  failed = true;
};

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const versionSrc = fs.readFileSync('src/version.ts', 'utf8');
if (!versionSrc.includes(`'${pkg.version}'`)) fail(`src/version.ts does not match package.json version ${pkg.version}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-gen-'));
const bin = path.join('node_modules', 'openapi-typescript', 'bin', 'cli.js');
execFileSync(process.execPath, [bin, 'openapi/openapi.json', '-o', path.join(tmp, 'openapi.ts'), '--empty-objects-unknown'], { stdio: 'ignore' });
const norm = (s) => s.replace(/\r\n/g, '\n');
if (norm(fs.readFileSync(path.join(tmp, 'openapi.ts'), 'utf8')) !== norm(fs.readFileSync('src/generated/openapi.ts', 'utf8'))) {
  fail('src/generated/openapi.ts is stale: run `npm run generate`');
}

const fixturesTmp = path.join(tmp, 'fixtures');
execFileSync(process.execPath, ['scripts/build-fixtures.mjs', 'openapi/openapi.json', fixturesTmp], { stdio: 'ignore' });
for (const f of fs.readdirSync(fixturesTmp)) {
  const want = norm(fs.readFileSync(path.join(fixturesTmp, f), 'utf8'));
  const have = fs.existsSync(path.join('test/fixtures', f)) ? norm(fs.readFileSync(path.join('test/fixtures', f), 'utf8')) : '';
  if (want !== have) fail(`test/fixtures/${f} is stale: run \`node scripts/build-fixtures.mjs\``);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) process.exit(1);
console.log('check-generated: types, fixtures and version are in sync');
