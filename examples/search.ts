// Google results as JSON, then the top three links.
// Run: QUANTICDATA_API_KEY=qd_live_... npx tsx examples/search.ts "best coffee grinder"
import { QuanticData } from 'quanticdata';

const query = process.argv[2] ?? 'best coffee grinder';
const qd = new QuanticData();

const serp = await qd.search({ query, engine: 'google', country: 'us', lang: 'en' });
for (const r of serp.organic.slice(0, 3)) {
  console.log(`${r.rank}. ${r.title}\n   ${r.link}`);
}
