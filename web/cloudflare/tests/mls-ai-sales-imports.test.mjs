import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiSalesCsv,exportAiSalesCsv,parseAiSalesJson,parseAiSalesInteger} from '../src/mls-ai-sales-imports.mjs';

test('normalized CSV round trips quotes, commas, CRLF, zero, signed cents and protected spreadsheet strings',()=>{
 const headers=['id','text','amount'];
 const rows=[{id:'first',text:'Olá, "criador"\r\nsegunda linha',amount:0},{id:'second',text:'@public_profile',amount:-125},{id:'third',text:'=HYPERLINK("https://invalid.example")',amount:null},{id:'fourth',text:"'literal",amount:12},{id:'fifth',text:'  +danger',amount:15}];
 const csv=exportAiSalesCsv(rows,headers);
 assert.match(csv,/'@public_profile/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/'  \+danger/);
 const parsed=parseAiSalesCsv('\ufeff'+csv,headers);
 assert.deepEqual(parsed,rows.map(row=>({...row,amount:row.amount===null?'':String(row.amount)})));
 assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed[0]));
});
test('CSV does not accept reordered or duplicate headers, malformed quoting, extra columns or controls',()=>{
 for(const csv of ['id,id\na,b','value,id\na,b','id,value\n"unterminated,b','id,value\n"a"junk,b','id,value\na,b,c','id,value\na\u0000,b'])assert.throws(()=>parseAiSalesCsv(csv,['id','value']),/AI_SALES_/);
 assert.throws(()=>exportAiSalesCsv([{id:'x',private_email:'not-allowed'}],['id']),/ROW_INVALID/);
 const getter={};Object.defineProperty(getter,'id',{enumerable:true,get(){throw Error('must not run');}});assert.throws(()=>exportAiSalesCsv([getter],['id']),/ROW_INVALID/);
 assert.throws(()=>parseAiSalesCsv('id\n'+('x'.repeat(32769)),['id']),/CELL_TOO_LONG/);
});
test('integer import preserves absence and explicit zero and never evaluates formulas or rounds money',()=>{
 assert.equal(parseAiSalesInteger(''),null);assert.equal(parseAiSalesInteger('0'),0);assert.equal(parseAiSalesInteger('-125',{signed:true}),-125);
 for(const value of ['=1+2','1e2','1.20',' 0','01','-0','9007199254740992',undefined])assert.throws(()=>parseAiSalesInteger(value),/INTEGER_INVALID/);
 assert.throws(()=>parseAiSalesInteger('-1'),/INTEGER_INVALID/);
 assert.equal(parseAiSalesJson('{"schema":"test"}').schema,'test');
 for(const value of ['[]','null','{bad}'])assert.throws(()=>parseAiSalesJson(value),/JSON_INVALID/);
});
