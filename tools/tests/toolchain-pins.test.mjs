import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
test('reviewed developer toolchain pins patched compatible versions rather than hiding development advisories',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(read('.node-version').trim(),'24.22.3');assert.equal(pkg.packageManager,'npm@11.9.0');assert.equal(pkg.devDependencies.wrangler,'4.153.0');assert.deepEqual(pkg.overrides,{miniflare:{undici:'7.30.2'}});
 assert.equal(lock.packages['node_modules/wrangler'].version,'4.153.0');const clients=Object.entries(lock.packages).filter(([name])=>/(?:^|\/)node_modules\/undici$/.test(name));assert.ok(clients.length);for(const [,entry] of clients)assert.equal(entry.version,'7.30.2');
});
test('Node update keeps the declared npm and every full-suite gate in the existing workflow',()=>{
 const flow=read('.github/workflows/validate.yml');assert.match(flow,/node-version-file: \.node-version/);assert.match(flow,/npm install --global npm@11\.9\.0 --ignore-scripts --no-audit --no-fund/);assert.match(flow,/run: npm ci/);assert.match(flow,/node --test --test-reporter=tap --test-concurrency=3 web\/cloudflare\/tests\/\*\.test\.mjs web\/finance\/tests\/\*\.test\.mjs tools\/tests\/\*\.test\.mjs/);assert.match(flow,/python3 -m unittest/);assert.match(flow,/run: npm run build/);assert.match(flow,/node tools\/release_preflight\.mjs --base=origin\/main/);
});
