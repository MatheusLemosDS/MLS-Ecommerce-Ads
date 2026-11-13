import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_POLICY,ACCOUNT_ROLES,roleCapabilities,roleAllowedCapabilities} from '../src/account-policy.mjs';
import {validateAccountPassword,hashAccountPassword,verifyAccountPassword,accountToken,accountDigest,accountEqual,accountEncrypt,accountDecrypt,createAccountTotpSecret,accountTotp,verifyAccountTotp} from '../src/account-crypto.mjs';

const password='Uma frase sintética única 2026 🐙';
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('password policy permits passphrases, Unicode and exact spaces without truncating',()=>{
 assert.equal(validateAccountPassword(password),password);
 assert.equal(validateAccountPassword('  frase longa com espaços  '),'  frase longa com espaços  ');
 assert.equal(validateAccountPassword('🐙🦑🐢🐬🐳🦈🐠🦀🦞🦐🪼🐟🪸🐚🦭'),'🐙🦑🐢🐬🐳🦈🐠🦀🦞🦐🪼🐟🪸🐚🦭');
 assert.throws(()=>validateAccountPassword('a'.repeat(14)),{code:'ACCOUNT_PASSWORD_TOO_SHORT'});
 assert.throws(()=>validateAccountPassword('a'.repeat(129)),{code:'ACCOUNT_PASSWORD_TOO_LONG'});
 assert.throws(()=>validateAccountPassword('123456789012345'),{code:'ACCOUNT_PASSWORD_COMMON'});
 assert.throws(()=>validateAccountPassword('a'.repeat(15)),{code:'ACCOUNT_PASSWORD_COMMON'});
 assert.throws(()=>validateAccountPassword(password,{blockedPasswords:[password.toUpperCase()]}),{code:'ACCOUNT_PASSWORD_COMMON'});
 assert.throws(()=>validateAccountPassword('a'.repeat(15)+'\ud800'),{code:'ACCOUNT_PASSWORD_INVALID'});
 assert.throws(()=>validateAccountPassword('frase longa com\0nulo'),{code:'ACCOUNT_PASSWORD_INVALID'});
});
test('password records use independent salts, production cost and constant-size outputs',async()=>{
 const record=await hashAccountPassword(password);
 assert.match(record,/^\$mls-pbkdf2-sha256\$v=1\$i=600000\$[A-Za-z0-9_-]{43}\$[A-Za-z0-9_-]{43}$/);
 assert.equal(await verifyAccountPassword(password,record),true);
 assert.equal(await verifyAccountPassword(password+'x',record),false);
 const [a,b]=await Promise.all([hashAccountPassword(password,{test:true,iterations:1000}),hashAccountPassword(password,{test:true,iterations:1000})]);
 assert.notEqual(a,b);assert.equal(await verifyAccountPassword(password,a,{test:true}),true);
 assert.equal(await verifyAccountPassword(password,a),false);
 await assert.rejects(hashAccountPassword(password,{iterations:1000}),{code:'ACCOUNT_PASSWORD_KDF_CONFIGURATION'});
 await assert.rejects(hashAccountPassword(password,{test:true,iterations:0}),{code:'ACCOUNT_PASSWORD_KDF_CONFIGURATION'});
 assert.equal(await verifyAccountPassword(password,record.replace('v=1','v=2')),false);
 assert.equal(await verifyAccountPassword(password,record.replace('i=600000','i=9999999999999999')),false);
 assert.equal(await verifyAccountPassword(password,'not a password record'),false);
});
test('password bytes stay exact and Unicode equivalence does not silently change credentials',async()=>{
 const original='Café com uma frase muito longa',normalized=original.normalize('NFD');
 const record=await hashAccountPassword(original,{test:true,iterations:1000});
 assert.equal(await verifyAccountPassword(original,record,{test:true}),true);
 assert.equal(await verifyAccountPassword(normalized,record,{test:true}),false);
 assert.equal(await verifyAccountPassword(' '+original,record,{test:true}),false);
});
test('random tokens and digests use canonical formats and never retain plaintext',async()=>{
 const a=accountToken(),b=accountToken();assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);
 assert.match(await accountDigest(a),/^[a-f0-9]{64}$/);assert.notEqual(await accountDigest(a),a);
 assert.equal(await accountDigest('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(await accountEqual(a,a),true);assert.equal(await accountEqual(a,b),false);assert.equal(await accountEqual(a,null),false);
 assert.throws(()=>accountToken(0),{code:'ACCOUNT_TOKEN_SIZE_INVALID'});
});
test('AES-GCM binds encrypted secrets to the account and purpose, with fresh IVs',async()=>{
 const key=accountToken(),value={secret:'synthetic-mfa-secret'},context={aad:'mfa:user-a'};
 const encrypted=await accountEncrypt(value,key,context),again=await accountEncrypt(value,key,context);
 assert.notEqual(encrypted.iv,again.iv);assert.notEqual(encrypted.ciphertext,again.ciphertext);
 assert.equal(JSON.stringify(encrypted).includes(value.secret),false);
 assert.deepEqual(await accountDecrypt(encrypted,key,context),value);
 await assert.rejects(accountDecrypt(encrypted,key,{aad:'mfa:user-b'}),{code:'ACCOUNT_DECRYPTION_FAILED'});
 await assert.rejects(accountDecrypt(encrypted,accountToken(),context),{code:'ACCOUNT_DECRYPTION_FAILED'});
 const tampered={...encrypted,ciphertext:encrypted.ciphertext.slice(0,-3)+'AAA'};
 await assert.rejects(accountDecrypt(tampered,key,context),{code:'ACCOUNT_DECRYPTION_FAILED'});
 await assert.rejects(accountDecrypt({...encrypted,extra:true},key,context),{code:'ACCOUNT_ENCRYPTED_VALUE_INVALID'});
 await assert.rejects(accountEncrypt(value,'short',context),{code:'ACCOUNT_ENCRYPTION_CONFIGURATION'});
});
test('maintained TOTP library matches RFC6238 and rejects replay counters and invalid challenges',()=>{
 const vectors=[[59000,'94287082'],[1111111109000,'07081804'],[1111111111000,'14050471'],[1234567890000,'89005924'],[2000000000000,'69279037']];
 for(const [now,token]of vectors)assert.equal(accountTotp(secret,{now,digits:8}),token);
 const now=Date.UTC(2026,10,11,12),token=accountTotp(secret,{now}),counter=Math.floor(now/30000);
 assert.equal(verifyAccountTotp(secret,token,{now}),counter);
 assert.equal(verifyAccountTotp(secret,token,{now,afterCounter:counter}),null);
 assert.equal(verifyAccountTotp(secret,token,{now:now+90000}),null);
 assert.equal(verifyAccountTotp(secret,'12345',{now}),null);
 assert.equal(verifyAccountTotp(secret,'abc123',{now}),null);
 assert.throws(()=>verifyAccountTotp(secret,token,{now,window:3}),{code:'ACCOUNT_MFA_POLICY_INVALID'});
 assert.throws(()=>accountTotp(secret,{now:-1}),{code:'ACCOUNT_CLOCK_INVALID'});
 assert.match(createAccountTotpSecret(),/^[A-Z2-7]{32}$/);
 assert.notEqual(createAccountTotpSecret(),createAccountTotpSecret());
});
test('roles preserve ownership separation and do not grant operational users banking or global owner',()=>{
 assert.equal(ACCOUNT_POLICY.sessionAbsoluteSeconds,8*3600);assert.equal(ACCOUNT_POLICY.sessionIdleSeconds,30*60);
 assert.equal(ACCOUNT_POLICY.emailVerificationSeconds,24*3600);assert.equal(ACCOUNT_POLICY.passwordResetSeconds,30*60);assert.equal(ACCOUNT_POLICY.invitationSeconds,7*86400);
 assert.ok(roleCapabilities('OWNER').includes('organization.transfer'));
 assert.ok(!roleCapabilities('ADMIN').includes('organization.transfer'));
 assert.ok(!roleCapabilities('ADMIN').includes('store.connect'));
 assert.ok(roleAllowedCapabilities('ADMIN').includes('store.connect'));
 assert.ok(roleAllowedCapabilities('VIEWER').includes('bank.read'));
 assert.ok(!roleAllowedCapabilities('VIEWER').includes('bank.write'));
 assert.ok(!roleAllowedCapabilities('ADMIN').includes('organization.transfer'));
 assert.ok(roleCapabilities('FINANCE').includes('bank.write'));
 for(const role of ['OPERATIONS','VIEWER'])for(const capability of ['bank.read','bank.write','finance.read','finance.write','costs.write'])assert.ok(!roleCapabilities(role).includes(capability));
 assert.deepEqual(roleCapabilities('owner'),[]);assert.deepEqual(roleCapabilities('review'),[]);assert.deepEqual(roleCapabilities('__proto__'),[]);
 assert.ok(Object.isFrozen(ACCOUNT_ROLES));assert.ok(Object.isFrozen(roleCapabilities('OWNER')));
});
