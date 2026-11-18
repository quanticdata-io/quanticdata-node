// Extracts the documented response examples of every operation from the
// vendored OpenAPI document into test/fixtures/<operationId>.json.
// The tests and the local mock server replay these: nothing calls the real API.
//
// Usage: node scripts/build-fixtures.mjs [openapi.json] [outDir]
import fs from 'node:fs';
import path from 'node:path';

const specPath = process.argv[2] ?? 'openapi/openapi.json';
const outDir = process.argv[3] ?? 'test/fixtures';
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

function deref(obj) {
  if (!obj || !obj.$ref) return obj;
  return obj.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((acc, k) => acc[k], spec);
}

function exampleOf(content) {
  if (!content) return undefined;
  if (content.example !== undefined) return content.example;
  if (content.examples) {
    const first = Object.values(content.examples)[0];
    return first && 'value' in first ? first.value : undefined;
  }
  return undefined;
}

fs.mkdirSync(outDir, { recursive: true });
let written = 0;
const index = {};
for (const [p, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (method === 'parameters' || !op.operationId) continue;
    const responses = op.responses ?? {};
    const out = { method: method.toUpperCase(), path: p, responses: {} };
    for (const [status, r0] of Object.entries(responses)) {
      const r = deref(r0);
      const content = r?.content ?? {};
      const json = content['application/json'];
      const ex = exampleOf(json);
      if (ex !== undefined) {
        out.responses[status] = { contentType: 'application/json', body: ex };
        continue;
      }
      const textType = Object.keys(content).find((ct) => !ct.includes('json'));
      const textEx = textType ? exampleOf(content[textType]) : undefined;
      if (typeof textEx === 'string') out.responses[status] = { contentType: textType, body: textEx };
    }
    if (Object.keys(out.responses).length === 0) continue;
    fs.writeFileSync(path.join(outDir, `${op.operationId}.json`), JSON.stringify(out, null, 2) + '\n');
    index[op.operationId] = `${out.method} ${p}`;
    written++;
  }
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${written} fixtures to ${outDir}`);
