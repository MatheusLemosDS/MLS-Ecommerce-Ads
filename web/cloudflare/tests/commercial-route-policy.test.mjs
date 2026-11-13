import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ACCOUNT_ROLES,roleAllowedCapabilities} from '../src/account-policy.mjs';
import {COMMERCIAL_OPERATIONAL_ROUTES,commercialRoutePolicy,commercialRouteCapabilities,commercialRouteCapability,commercialRouteAllowed,commercialCapabilitiesAllowed,commercialTabAllowed,commercialAllowedTabs} from '../src/commercial-route-policy.mjs';

const origin='https://commercial-route.invalid';
function request(path,{method='GET',body,headers={}}={}){return new Request(origin+path,{method,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers}});}
const principal=(role,capabilities=ACCOUNT_ROLES[role].capabilities)=>({kind:'account',role,capabilities:[...capabilities],active:true});
const read=async(path,options)=>commercialRouteCapabilities(request(path,options));

test('every literal operational route in the active router has an explicit policy entry',async()=>{
 const source=await readFile(new URL('../src/admin.mjs',import.meta.url),'utf8');
 const literals=[...new Set([...source.matchAll(/['"](\/api\/admin\/[^'"?]*)['"]/g)].map(match=>match[1]))].filter(path=>!['/api/admin/','/api/admin/production/','/api/admin/order-observations/'].includes(path));
 assert.ok(literals.length>=60,'inventory must examine the complete operational router');
 for(const path of literals)assert.ok(COMMERCIAL_OPERATIONAL_ROUTES.includes(path),'unclassified route: '+path);
 const baseline=JSON.parse(await readFile(new URL('../../../docs/v4/baseline-active-inventory.json',import.meta.url),'utf8'));
 const existing=new Set(literals);let inspected=0;
 for(const row of baseline.endpoint_literal_sites){const path=row.endpoint_literal?.split('?')[0];if(existing.has(path)){assert.ok(COMMERCIAL_OPERATIONAL_ROUTES.includes(path),path);inspected++;}}
 assert.ok(inspected>=60,'the policy is cross-checked against the frozen pre-change endpoint inventory');
 assert.ok(COMMERCIAL_OPERATIONAL_ROUTES.includes('/api/admin/production/batches/action'),'dynamic DTF suffixes are enumerated explicitly');
});

test('all emitted requirements exist in account-policy rather than invented administrator grants',async()=>{
 const known=new Set(Object.values(ACCOUNT_ROLES).flatMap(value=>value.allowedCapabilities));
 for(const path of COMMERCIAL_OPERATIONAL_ROUTES){let mapped=0;for(const method of ['GET','POST']){
  const body=path==='/api/admin/finance/external-cash'?{operation:'import'}:{operation:'read'};
  const policy=await commercialRoutePolicy(request(path,{method,...(method==='POST'?{body}:{})}));if(!policy)continue;mapped++;
  assert.equal(policy.capability,policy.capabilities[0]);assert.ok(Object.isFrozen(policy));assert.ok(Object.isFrozen(policy.capabilities));assert.equal(new Set(policy.capabilities).size,policy.capabilities.length);for(const capability of policy.capabilities)assert.ok(known.has(capability),capability);
 }assert.ok(mapped>0,'known route has no supported method: '+path);}
});

test('unknown routes, methods and path substitutions fail closed without prefix escalation',async()=>{
 for(const path of ['/api/admin','/api/admin/','/api/admin/finance/new-action','/api/admin/production/new-action','/api/admin/returns/new-action','/api/admin/cost-rules/','/api/account/me','/api/admin/order-observations/not-a-hash','/api/admin/jobs/not-a-uuid/financial-context','/api/admin/%66inance/business-month','/api/admin/finance%2fbusiness-month'])assert.equal(await read(path),null,path);
 for(const method of ['HEAD','PUT','PATCH','DELETE','OPTIONS'])assert.equal(await read('/api/admin/production',{method}),null,method);
 assert.equal(await commercialRouteCapability(request('/api/admin/finance/business-month'),'/api/admin/bootstrap'),null);
 assert.equal(await commercialRouteCapability(null),null);
 assert.equal(await commercialRouteAllowed(principal('OWNER'),request('/api/admin/finance/unknown')),false);
});

test('the two dynamic source-detail routes require canonical identifiers and exact suffixes',async()=>{
 assert.deepEqual(await read('/api/admin/order-observations/'+'a'.repeat(64)),['orders.read','costs.read']);
 assert.deepEqual(await read('/api/admin/jobs/11111111-1111-4111-8111-111111111111/financial-context'),['finance.read']);
 for(const path of ['/api/admin/order-observations/'+'a'.repeat(63),'/api/admin/order-observations/'+'A'.repeat(64),'/api/admin/order-observations/'+'a'.repeat(64)+'/extra','/api/admin/jobs/'+'-'.repeat(36)+'/financial-context','/api/admin/jobs/11111111-1111-4111-8111-111111111111/financial-context/extra'])assert.equal(await read(path),null,path);
});

test('GET versus POST policy preserves independent reads and internal mutations',async()=>{
 for(const [path,readCap,writeCap] of [
  ['order-operations','orders.read','orders.write'],['production-costs','costs.read','costs.write'],['cost-rules','costs.read','costs.write'],['variant-bindings','costs.read','costs.write'],['tax-policy','finance.read','finance.write'],['returns/physical','returns.read','returns.write'],['production/incurred','production.read','production.write'],['production/coverage','production.read','production.write'],['production/weekly-closing','production.read','production.write'],['returns/manufacturing-links','returns.read','returns.write'],['returns/receipts','returns.read','returns.write'],['ai-sales/workspace','catalog.read','catalog.write'],['jobs','finance.read','finance.write'],['finance/expense-ledger','finance.read','finance.write'],
 ]){assert.equal(await commercialRouteCapability(request('/api/admin/'+path)),readCap,path);assert.equal(await commercialRouteCapability(request('/api/admin/'+path,{method:'POST',body:{}})),writeCap,path);}
 assert.deepEqual(await read('/api/admin/production'),['dtf.read']);for(const suffix of ['settings','sync','batches','batches/action'])assert.deepEqual(await read('/api/admin/production/'+suffix,{method:'POST',body:{}}),['dtf.write']);
 assert.equal((await commercialRoutePolicy(request('/api/admin/production-costs/confirmed-references'))).mutating,true);assert.equal(await commercialRouteCapability(request('/api/admin/production-costs/confirmed-references')),'costs.write');
});

test('body operation selectors cannot disguise writes as read permissions and do not consume the real body',async()=>{
 for(const [path,reads,writes,readCap,writeCap] of [
  ['finance/business-month',['read'],['start','step','ads','expenses'],'finance.read','finance.write'],
  ['finance/store-period',['read'],['start','step'],'finance.read','finance.write'],
  ['production-costs/periods',['read'],['start','step'],'costs.read','costs.write'],
  ['finance/external-cash',['preview'],['import','match','unlink'],'bank.read','bank.write'],
 ]){
  for(const operation of [...reads,...writes]){const req=request('/api/admin/'+path,{method:'POST',body:{operation}}),policy=await commercialRoutePolicy(req);assert.equal(policy.capability,reads.includes(operation)?readCap:writeCap,path+':'+operation);assert.equal(policy.mutating,writes.includes(operation));assert.equal(req.bodyUsed,false);assert.deepEqual(await req.json(),{operation});}
  for(const body of [{},{operation:'unknown'},{operation:['read']},{operation:null},{action:'read'},[],null])assert.equal(await read('/api/admin/'+path,{method:'POST',body:JSON.stringify(body)}),null,path+':'+JSON.stringify(body));
 }
 assert.equal(await read('/api/admin/finance/external-cash',{method:'POST',body:{operation:'read'}}),null,'this legacy endpoint rejects POST read even if the private source has one');
 for(const options of [{body:'{'},{body:'{"operation":"read"}',headers:{'content-type':'text/plain'}},{body:'{"operation":"read"}',headers:{'content-length':'not-a-number'}},{body:JSON.stringify({operation:'read',padding:'x'.repeat(600)})}])assert.equal(await read('/api/admin/finance/business-month',{method:'POST',...options}),null);
});

test('optional financial and cost detail selectors only add requirements, never remove them',async()=>{
 assert.deepEqual(await read('/api/admin/returns/physical?month=2026-11'),['returns.read']);
 for(const query of ['evidence=original-items-v1','evidence=unknown','evidence=','evidence=a&evidence=b'])assert.deepEqual(await read('/api/admin/returns/physical?month=2026-11&'+query),['returns.read','finance.read']);
 assert.deepEqual(await read('/api/admin/product-registry'),['catalog.read']);assert.deepEqual(await read('/api/admin/product-registry?item_id=1000'),['catalog.read','costs.read']);
});

test('composite reports and return queues cannot leak finance to OPERATIONS or a reports-only VIEWER',async()=>{
 const operations=principal('OPERATIONS'),reportsOnly=principal('VIEWER',['store.read','reports.read']);
 assert.deepEqual(await read('/api/admin/reports/weekly?week_end=2026-11-13'),['reports.read','finance.read','bank.read','costs.read']);
 for(const p of [operations,reportsOnly])for(const path of ['/api/admin/reports/weekly?week_end=2026-11-13','/api/admin/finance/business-month-view?month=2026-11','/api/admin/returns/receipts?month=2026-11','/api/admin/live','/api/admin/agents/learning?month=2026-11','/api/admin/ai-sales/workspace'])assert.equal(await commercialRouteAllowed(p,request(path)),false,path);
 assert.equal(commercialTabAllowed(operations,'overview'),true);assert.equal(commercialTabAllowed(operations,'agents'),true);assert.equal(commercialTabAllowed(operations,'weekly-report'),false);assert.equal(commercialTabAllowed(reportsOnly,'reports'),false);
 assert.equal(await commercialRouteAllowed(operations,request('/api/admin/order-operations')),true);assert.equal(await commercialRouteAllowed(operations,request('/api/admin/production')),true);assert.equal(await commercialRouteAllowed(operations,request('/api/admin/returns/physical?month=2026-11')),true);
 assert.equal(await commercialRouteAllowed(principal('FINANCE'),request('/api/admin/reports/weekly?week_end=2026-11-13')),true);
});

test('every closed composite requires each of its domains, even when its primary capability is granted',async()=>{
 let composites=0;
 for(const path of [...COMMERCIAL_OPERATIONAL_ROUTES,'/api/admin/returns/physical?month=2026-11&evidence=original-items-v1','/api/admin/product-registry?item_id=1000','/api/admin/order-observations/'+'b'.repeat(64)]){
  for(const method of ['GET','POST']){
   const options=method==='POST'?{method,body:{operation:path.endsWith('/external-cash')?'import':'read'}}:{};
   const required=await read(path,options);if(!required||required.length<2)continue;composites++;
   assert.equal(await commercialRouteAllowed(principal('OWNER',required),request(path,options)),true,path);
   for(const missing of required){const remaining=required.filter(capability=>capability!==missing);assert.equal(await commercialRouteAllowed(principal('OWNER',remaining),request(path,options)),false,path+' must independently require '+missing);}
  }
 }
 assert.ok(composites>=20,'cover the full closed composite inventory, including write responses');
 const operations=principal('OPERATIONS'),withCosts=principal('OPERATIONS',[...ACCOUNT_ROLES.OPERATIONS.capabilities,'costs.read']);
 for(const path of ['/api/admin/production/coverage','/api/admin/production/weekly-closing','/api/admin/production/proposal','/api/admin/production/incurred','/api/admin/returns/manufacturing-links','/api/admin/catalog-classification','/api/admin/order-items','/api/admin/order-observations']){
  assert.equal(await commercialRouteAllowed(operations,request(path)),false,path+' must not disclose costs by default');
  assert.equal(await commercialRouteAllowed(withCosts,request(path)),true,path+' accepts an owner-granted cost read permission');
 }
 assert.equal(commercialTabAllowed(withCosts,'agent-production'),true);assert.equal(await commercialRouteAllowed(withCosts,request('/api/admin/finance/business-month-view')),false);
 assert.equal(commercialTabAllowed(withCosts,'ai-sales'),false);assert.equal(await commercialRouteAllowed(withCosts,request('/api/admin/ai-sales/workspace')),false);
 assert.equal(await commercialRouteAllowed(principal('VIEWER',['audit.read']),request('/api/admin/audit')),false,'the legacy audit payload contains financial settings and cannot be redacted implicitly');
});

test('server-resolved explicit grants work within each role ceiling without role-name owner promotion',async()=>{
 const viewer=principal('VIEWER',['organization.read','store.read','finance.read','bank.read','costs.read','reports.read']);assert.equal(await commercialRouteAllowed(viewer,request('/api/admin/reports/weekly')),true);assert.equal(commercialTabAllowed(viewer,'weekly-report'),true);assert.equal(await commercialRouteAllowed(viewer,request('/api/admin/tax-policy',{method:'POST',body:{}})),false);
 assert.equal(commercialTabAllowed({...principal('OWNER'),capabilities:[]},'overview'),false);assert.equal(await commercialRouteAllowed({...principal('OWNER'),capabilities:[]},request('/api/admin/production-costs',{method:'POST',body:{}})),false);
 const escalated=principal('OPERATIONS',[...ACCOUNT_ROLES.OPERATIONS.capabilities,'finance.read']);assert.equal(await commercialRouteAllowed(escalated,request('/api/admin/finance/business-month')),false,'a capability above the role ceiling cannot be promoted by the operational request');
 assert.equal(commercialCapabilitiesAllowed(principal('OWNER'),[]),false);assert.equal(commercialCapabilitiesAllowed(principal('OWNER'),['invented.permission']),false);
 for(const p of [null,{},principal('INVALID',[]),{...viewer,active:false},{...viewer,status:'SUSPENDED'},{...viewer,role:'owner'},{...viewer,kind:'legacy'}])assert.equal(commercialCapabilitiesAllowed(p,['finance.read']),false);
});

test('untrusted headers and desired account/store selection never determine a module capability',async()=>{
 const headers={'x-role':'OWNER','x-tenant':'other','x-mls-context':'other','x-mls-capability':'finance.write','x-mls-organization-id':'other','x-mls-store-id':'other'};
 assert.equal(await commercialRouteAllowed(principal('OPERATIONS'),request('/api/admin/finance/business-month?role=OWNER&store_id=other',{headers})),false);
 assert.equal(await commercialRouteCapability(request('/api/admin/order-operations?organization_id=other',{headers})),'orders.read');
 assert.equal(await commercialRouteCapability(request('/api/admin/finance/business-month',{method:'POST',body:{operation:'expenses',role:'VIEWER',capability:'finance.read'},headers})),'finance.write');
});

test('tabs and aliases have explicit domain policy while old owner/review navigation retains its own authorization',()=>{
 const owner=principal('OWNER');for(const tab of ['overview','agents','weekly-report','reports','order-operations','orders','production','agent-production','products','agent-products','margins','costs','agent-finance','finance','agent-ads','ads','agent-returns','returns','agent-auditor','history','ai-sales','hermes','agent-hermes','roadmap'])assert.equal(commercialTabAllowed(owner,tab),true,tab);
 for(const tab of [undefined,null,'unknown','../overview','OVERVIEW'])assert.equal(commercialTabAllowed(owner,tab),false,String(tab));
 assert.deepEqual(commercialAllowedTabs(principal('VIEWER')),['overview','agents','roadmap']);assert.ok(Object.isFrozen(commercialAllowedTabs(owner)));
 assert.equal(commercialTabAllowed({role:'owner'},'overview'),true);assert.equal(commercialTabAllowed({role:'review'},'agent-ads'),true);assert.equal(commercialTabAllowed({kind:'account',role:'owner',capabilities:['finance.read']},'overview'),false);
 assert.equal(commercialTabAllowed(null,'overview'),false);assert.equal(commercialTabAllowed({role:'guest'},'overview'),false);
});
