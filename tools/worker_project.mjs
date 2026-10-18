import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGETS = Object.freeze({
  app: Object.freeze({name: 'brazacommerce-app', main: '../../dist/app-worker.mjs', baselineHashes: [
    '3b283c66de5e1b8b4041f113f8fda8ef640400d480a8e228b5b5834ffca4a2a7',
    'b1792536a065a76b06886096838340e6c0c2daecbdb51d047bf0e63318e4437a',
    'cd56ad20a6e443c004437a902088faece0a863fd7c120fa16334b6e2e9738ba4',
  ]}),
  auth: Object.freeze({name: 'brazacommerce-auth', main: '../../dist/auth-worker.mjs', baselineHashes: [
    '45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56',
    'c55d2339b6e227b606e8a55b6cefcc904d95466f238b70f1d2aea74599dbdb7a',
  ]}),
  finance: Object.freeze({name: 'brazacommerce-finance', main: '../../dist/finance-worker.mjs', baselineHashes: []}),
});
export const stableJson = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const error = code => Object.assign(new Error(code), {code});
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
