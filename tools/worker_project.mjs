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
    'a5b9b028cbe280842c519940dd577e81d3cc6eb4e3f7a0291d54727026feffb1',
    '011af3eed2d86149b2c0217e8bc424e6308f49896160d11e16d93429c9152dbe',
    'f8480ffe86d2469689ac5feb15584cef4ec5e99f351cd09bb4ed668620863c27',
    '4e4ad0bbfb9696e47237dee1f075cd411eccf5bfca2022bd94b51847f85fa449',
    '87d6129aa5fcf42d7a0f6ad0ea9903d27ae9230cb3e6a4a2c3eb214438a6f704',
    'd7de94f0ebc13ee48e49abe72eb7dbd213453f5a8eeda8f726fdc2b8961ea397',
    'e842040c9447714bd76b528f2def5d768b58c13d6402cb8b71ff781050797a22',
    '6d8ada1e928f1d70d265ab6c05a7c95610cb1b0fcbd31380ef8531ae1751f31c',
    '67d153521fe3d4dd43877928bc6cc9b19d4df77ac95e531bd055b5059d9f9911',
  ]}),
  auth: Object.freeze({name: 'brazacommerce-auth', main: '../../dist/auth-worker.mjs', baselineHashes: [
    '45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56',
    'c55d2339b6e227b606e8a55b6cefcc904d95466f238b70f1d2aea74599dbdb7a',
    '28a43b7d610eda4b272a2a7013c7213f966976850f78be3cb0f767adeab3146d',
    'deabe5720315b771d3a5a487b460ea4307f18254a12a5208bc8f9ddc83e2b47f',
    '75ff27a2d7570fd99f5fea70372e83d4837b6a197a8b59626a7e6f2bec66ecdd',
    '0750e39f83bff4127dc967469100382d911da11fa122e030b0516f2d45185c2a',
    '1742d1be9d60ea4e03020e86d5ec52827115b8405a42f776ad614a4e28f04615',
    '5d9e70fe999d9cef0528bfa54d90aabd101089f4ccd6a8cc52925ea2e66bab01',
    'f81ad81c19147fba59bc3cce1767e49cabda27bb0c6bd69708ea19b7153c9227',
    '8edabdd130364fb021f7fa2a7c35f039ed7caaa0180999499ba6d802544092fe',
    '28237949fdf151da9cf668296745b8cf61b72b7c08807476648d19d42a01e3ab',
    '28d20322bc2fa193953567e9a0cbd45f0b0b77763ba856f2a705e69f57fba99c',
  ]}),
  finance: Object.freeze({name: 'brazacommerce-finance', main: '../../dist/finance-worker.mjs', baselineHashes: []}),
});
export const stableJson = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const error = code => Object.assign(new Error(code), {code});
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
