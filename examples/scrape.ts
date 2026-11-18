// Scrape one page to Markdown and pull two fields with CSS selectors.
// Run: QUANTICDATA_API_KEY=qd_live_... npx tsx examples/scrape.ts https://example.com
import { QuanticData } from 'quanticdata';

const url = process.argv[2] ?? 'https://example.com/pricing';
const qd = new QuanticData();

const page = await qd.scrape({
  url,
  format: 'markdown',
  extract: { title: 'h1', price: '.price' },
});

console.log(`# ${page.title ?? page.url} (HTTP ${page.status}, engine ${page.engine ?? 'n/a'})`);
console.log(page.content.slice(0, 500));
console.log('extracted:', page.data);
