import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

const begin=CLIENT.indexOf('async function api('),end=CLIENT.indexOf('\nfunction notice(',begin);
assert.ok(begin>=0&&end>begin);

test('the human API wrapper preserves the fixed source code and HTTP status needed by the monthly diagnostic',async()=>{
 const context=vm.createContext();
 vm.runInContext(`const adminRequest=async()=>{throw Object.assign(Error('Não foi possível concluir a consulta.'),{code:'ADMIN_API_HTTP_ERROR',apiCode:'BUSINESS_MONTH_SOURCE_HTTP_503',status:503});};`+CLIENT.slice(begin,end),context);
 const error=await vm.runInContext("api('finance/business-month',{operation:'step',month:'2026-10'}).catch(error=>error)",context);
 assert.equal(error.code,'ADMIN_API_HTTP_ERROR');assert.equal(error.apiCode,'BUSINESS_MONTH_SOURCE_HTTP_503');assert.equal(error.status,503);assert.equal(error.message,'Não foi possível concluir a consulta.');
});

test('the API wrapper does not remap or lose the identity of a safe transport failure',async()=>{
 const context=vm.createContext();
 vm.runInContext(`const transportFailure=Object.assign(Error('Não foi possível conectar ao painel.'),{code:'ADMIN_API_NETWORK_ERROR',status:null,apiCode:null});const adminRequest=async()=>{throw transportFailure;};`+CLIENT.slice(begin,end),context);
 await vm.runInContext("api('state').catch(error=>{if(error!==transportFailure)throw Error('CHANGED_FAILURE');})",context);
});
