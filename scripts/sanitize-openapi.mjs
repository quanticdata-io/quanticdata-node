// Turns the public QuanticData OpenAPI document (https://quanticdata.io/docs/openapi.json)
// into the copy vendored in this repository.
//
// The published document also carries platform-side material that API clients do
// not need: internal config references (price keys, tier and brand tables), agent
// checkout flows, header aliases of other services, and money amounts in prose and
// examples. Those are left out here, so the vendored file describes requests and
// responses only. Prices live on https://quanticdata.io/pricing/ and, per account,
// in GET /scraper/billing.
//
// Usage: node scripts/sanitize-openapi.mjs <input.json> <output.json>

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Top-level extensions that point at internal config files. */
const DROP_TOP_LEVEL = ['x-brands', 'x-pricing', 'x-tiers', 'x-excluded', 'x-guides'];
/** Extensions removed wherever they appear. */
const DROP_ANYWHERE = new Set(['x-price-key', 'x-payment-info', 'x-pricing-note', 'per_tier']);
/** Operations that are not part of the customer-facing API surface. */
const DROP_OPERATIONS = new Set(['getMcpTrialConfig', 'getUnlockOffer']);
/** Tags whose operations are left out (agent self-registration and agent checkout). */
const DROP_TAGS = new Set(['Agents']);
/** Markdown sections (by heading) about header aliases of other services. */
const DROP_SECTIONS = /^#{2,4} (Names the proxy reads unchanged|Names to rename)\s*$/;
/** Example keys whose numeric values are amounts of money: zeroed in examples. */
const MONEY_KEY = /(usd|price|cost|amount|balance|fee|spent|budget)/i;

const TEXT_REPLACEMENTS = [
  [/`qd_live_`\/`[a-z]{2}_live_`/g, '`qd_live_`'],
  [/qd_live_\/[a-z]{2}_live_/g, 'qd_live_'],
  // hostnames on other .io domains in examples become documentation hosts
  [/\b([a-z0-9-]+)\.(?!quanticdata\b)[a-z0-9-]+\.io\b/g, (_m, host) => `${host}.example.net`],
  [/\$\d[\d,]*(\.\d+)?/g, '[amount]'],
  [/€ ?\d[\d.,]*/g, '[amount]'],
  [/\d[\d,]*(\.\d+)?( of \d[\d,]*(\.\d+)?)?(?= USD\b)/g, '[amount]'],
  [/pricing\.json/g, 'the price list'],
  [/tiers\.json/g, 'the tier table'],
  [/Same key, same prices\./g, 'Same key.'],
];

const HEADING = /^#{2,4} /;

function dropSections(text) {
  if (!text.includes('#')) return text;
  const groups = [];
  for (const line of text.split('\n')) {
    if (HEADING.test(line) || groups.length === 0) groups.push([line]);
    else groups[groups.length - 1].push(line);
  }
  return groups
    .filter((g) => !DROP_SECTIONS.test(g[0]))
    .flat()
    .join('\n');
}

function rewriteText(value) {
  let out = dropSections(value);
  for (const [re, rep] of TEXT_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

function walk(node, inExample) {
  if (Array.isArray(node)) return node.map((v) => walk(v, inExample));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (DROP_ANYWHERE.has(key)) continue;
      const exampleCtx = inExample || key === 'example' || key === 'examples';
      if (exampleCtx && typeof value === 'number' && MONEY_KEY.test(key)) {
        out[key] = 0;
        continue;
      }
      out[key] = walk(value, exampleCtx);
    }
    return out;
  }
  if (typeof node === 'string') return rewriteText(node);
  return node;
}

export function sanitizeOpenApi(spec) {
  const copy = structuredClone(spec);
  for (const key of DROP_TOP_LEVEL) delete copy[key];
  for (const [path, item] of Object.entries(copy.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (method === 'parameters' || !op || typeof op !== 'object') continue;
      if (DROP_OPERATIONS.has(op.operationId) || (op.tags || []).some((t) => DROP_TAGS.has(t))) {
        delete item[method];
      }
    }
    if (Object.keys(item).filter((k) => k !== 'parameters').length === 0) delete copy.paths[path];
  }
  copy.tags = (copy.tags || []).filter((t) => !DROP_TAGS.has(t.name));
  if (Array.isArray(copy['x-tagGroups'])) {
    copy['x-tagGroups'] = copy['x-tagGroups'].map((g) => ({
      ...g,
      tags: g.tags.filter((t) => !DROP_TAGS.has(t)),
    }));
  }
  if (copy.info && typeof copy.info.description === 'string') {
    copy.info.description =
      copy.info.description
        .split(/(?<=\.) (?=[A-Z])/)
        .filter((s) => !/pricing\.json|tiers\.json|brands\.json|x-price-key/.test(s))
        .join(' ') +
      ' Prices are not part of this document: see https://quanticdata.io/pricing/ and `GET /scraper/billing` for the prices that apply to your account.';
  }
  return walk(copy, false);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node scripts/sanitize-openapi.mjs <input.json> <output.json>');
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(input, 'utf8'));
  const clean = sanitizeOpenApi(spec);
  fs.writeFileSync(output, JSON.stringify(clean, null, 2) + '\n');
  console.log(`wrote ${output} (${Object.keys(spec.paths).length} paths in, ${Object.keys(clean.paths).length} out)`);
}
