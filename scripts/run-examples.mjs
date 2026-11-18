// Runs every example against the local mock server (no network, no API key
// needed). Used in CI to keep the README and examples working.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const port = 4010 + Math.floor(Math.random() * 500);
const tsxCli = 'node_modules/tsx/dist/cli.mjs';
const server = spawn(process.execPath, [tsxCli, 'test/mock-server.ts'], {
  env: { ...process.env, MOCK_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => (String(d).includes('listening') ? resolve() : undefined));
  server.on('exit', (code) => reject(new Error(`mock server exited with ${code}`)));
});

const env = {
  ...process.env,
  QUANTICDATA_API_KEY: 'qd_test_0000000000000000000000000000000000000000000000000000000000000000',
  QUANTICDATA_API_BASE: `http://127.0.0.1:${port}/v1`,
};
let failed = 0;
for (const file of fs.readdirSync('examples').filter((f) => f.endsWith('.ts'))) {
  const r = spawnSync(process.execPath, [tsxCli, `examples/${file}`], { env, encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} examples/${file}`);
  if (!ok) console.log(r.stdout, r.stderr);
}
server.kill();
process.exit(failed ? 1 : 0);
