// Run a ready-made collector and export the rows as CSV.
// Run: QUANTICDATA_API_KEY=qd_live_... npx tsx examples/collector.ts
import { QuanticData } from 'quanticdata';

const qd = new QuanticData();

const { collectors } = await qd.collectors.list({ category: 'local' });
console.log('local collectors:', (collectors ?? []).map((c) => c.slug).join(', '));

const run = await qd.collectors.run('google_maps_places', { query: 'pizza restaurants', location: 'Brooklyn, NY' });
console.log(`run ${run.run_id}: ${run.status}, ${run.count} rows`);

const csv = await qd.collectors.getRunCsv(run.run_id);
console.log(csv.split('\n').slice(0, 3).join('\n'));
