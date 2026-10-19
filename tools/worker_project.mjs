import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGETS = Object.freeze({
  app: Object.freeze({name: 'brazacommerce-app', main: '../../dist/app-worker.mjs', baselineHashes: [
    '3b283c66de5e1b8b4041f113f8fda8ef640400d480a8e228b5b5834ffca4a2a7',
    'b1792536a065a76b06886096838340e6c0c2daecbdb51d047bf0e63318e4437a',
    'cd56ad20a6e443c004437a902088faece0a863fd7c120fa16334b6e2e9738ba4',
    '1fa1a79fb5db9430363c89d1ba8b451ccbf49445113cddd85fd47b72db62815f',
    'ba4e8db869b725430a6daf1f82380d18d515d73912df0fe815eea4657ac84c9d',
    '969b752387f1604ee92ceae12fc52e669e80671eb8daf62d402f28890e055799',
    'f6c39049a0e02bf87dbc3719c7b71cae1595b54a4525671cdfcbb4fe1bbbd17a',
  ]}),
  auth: Object.freeze({name: 'brazacommerce-auth', main: '../../dist/auth-worker.mjs', baselineHashes: [
    '45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56',
    'c55d2339b6e227b606e8a55b6cefcc904d95466f238b70f1d2aea74599dbdb7a',
    '28a43b7d610eda4b272a2a7013c7213f966976850f78be3cb0f767adeab3146d',
    'deabe5720315b771d3a5a487b460ea4307f18254a12a5208bc8f9ddc83e2b47f',
  ]}),
  finance: Object.freeze({name: 'brazacommerce-finance', main: '../../dist/finance-worker.mjs', baselineHashes: []}),
});
export const stableJson = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const error = code => Object.assign(new Error(code), {code});
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
