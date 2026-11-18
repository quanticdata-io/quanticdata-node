// Generate sticky residential proxy URLs for an order and print them.
// Run: QUANTICDATA_API_KEY=qd_live_... npx tsx examples/proxies.ts <orderId>
import { QuanticData } from 'quanticdata';

const qd = new QuanticData();

let orderId = process.argv[2];
if (!orderId) {
  for await (const plan of qd.proxies.iterate({ active: 'true' })) {
    console.log(`${plan.orderId}  ${plan.planTypeName ?? plan.planType}  ${plan.bandwidthLeftGB ?? '-'} GB left`);
    orderId ??= plan.orderId;
  }
}
if (!orderId) throw new Error('No active proxy plan on this account.');

const proxies = await qd.proxies.generateUrls({ orderId, quantity: 3, rotation: 'sticky', sessionTime: 10, country: 'us' });
for (const p of proxies) console.log(p.url);
