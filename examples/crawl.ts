// Crawl a docs site and stream pages as they finish.
// Run: QUANTICDATA_API_KEY=qd_live_... npx tsx examples/crawl.ts https://docs.example.com
import { QuanticData } from 'quanticdata';

const seed = process.argv[2] ?? 'https://docs.example.com/';
const qd = new QuanticData();

const job = await qd.crawl.start({ url: seed, limit: 20, depth: 2, format: 'markdown' });
console.log(`crawl ${job.id} started`);

for await (const page of qd.crawl.pages(job.id, { pollIntervalMs: 2000 })) {
  console.log(`${page.status} ${page.url} (${page.content?.length ?? 0} chars)`);
}
