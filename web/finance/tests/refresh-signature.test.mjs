import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FinanceConnectionError} from '../src/connection-store.mjs';
import {FINANCE_REFRESH_PATH, signFinanceRefreshRequest} from '../src/refresh-signature.mjs';

// Independently generated with Python hmac.new(key_utf8, base_utf8, hashlib.sha256).
// Every value is a public, artificial fixture; no store/application key is present.
const vectors = [
  {name:'ASCII key', partnerKey:'fixture-signing-key-only', timestamp:1792333333,
    expected:'1d240a3940edf3c7353a5fdccc58617afc0194651e2b38400e736a4254be15b8'},
  {name:'UTF-8 key', partnerKey:'chave-ficticia-çã', timestamp:1792333333,
    expected:'ecebd8d209758793c9ce41c73c778fc23626ad0b40d76bbb77e23c0c59e9b877'},
  {name:'hex-looking key remains text', partnerKey:'616263', timestamp:1792333333,
    expected:'e8f4e84d01b1a8f51fe7478eac10f6ac0ec2f16251e08a3ababd87b8e615def0'},
  {name:'leading zero bytes preserved', partnerKey:'fixture-leading-zero-only', timestamp:1792333672,
    expected:'00176cbc48a7932c2c9dae5fbdaf6d10a1c1d03b3d4b8a771efde534729d36a7'},
];
const safeError = code => error => {
  assert.ok(error instanceof FinanceConnectionError);
  assert.equal(error.message, code);
  assert.equal(error.code, code);
  return true;
};
for (const {name, partnerKey, timestamp, expected} of vectors) {
  test('refresh HMAC agrees with independent Python vector: '+name, async()=>{
    const signature=await signFinanceRefreshRequest({partnerKey,timestamp});
    assert.equal(signature,expected);
    assert.match(signature,/^[0-9a-f]{64}$/);
  });
}
test('signing is confined to the fixed financial identity and refresh path', async()=>{
  assert.equal(FINANCE_REFRESH_PATH,'/api/v2/auth/access_token/get');
  const valid={partnerKey:vectors[0].partnerKey,timestamp:vectors[0].timestamp};
  for(const extra of [{partner_id:2047569},{path:'/api/v2/auth/token/get'},{shop_id:1178167501},{access_token:'fixture-only'},{body:{refresh_token:'fixture-only'}}]) {
    await assert.rejects(signFinanceRefreshRequest({...valid,...extra}),safeError('FINANCE_REFRESH_SIGNING_INPUT_INVALID'));
  }
});
test('invalid timestamp units, strings and noncanonical numeric values are rejected',async()=>{
  for(const timestamp of [undefined,null,false,0,-1,1.5,NaN,Infinity,'1792333333',1792333333000,Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(signFinanceRefreshRequest({partnerKey:vectors[0].partnerKey,timestamp}),safeError('FINANCE_REFRESH_SIGNING_INPUT_INVALID'));
  }
  for(const options of [undefined,null,[],{}, {partnerKey:vectors[0].partnerKey}])await assert.rejects(signFinanceRefreshRequest(options),safeError('FINANCE_REFRESH_SIGNING_INPUT_INVALID'));
});
test('key configuration errors are fixed messages without a copied secret',async()=>{
  for(const partnerKey of [undefined,null,12,[],{},'', 'fixture-private\nkey', 'x'.repeat(4097), 'ç'.repeat(4096)+'a']) {
    await assert.rejects(signFinanceRefreshRequest({partnerKey,timestamp:vectors[0].timestamp}),safeError('FINANCE_REFRESH_SIGNING_KEY_CONFIGURATION'));
  }
});
test('the helper returns only a digest and never sends a request or builds a JSON body',async t=>{
  let requests=0;
  t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('UNEXPECTED_NETWORK');});
  const signature=await signFinanceRefreshRequest({partnerKey:vectors[0].partnerKey,timestamp:vectors[0].timestamp});
  assert.equal(typeof signature,'string');
  assert.equal(signature.length,64);
  assert.equal(requests,0);
});
