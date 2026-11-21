import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {projectProductionMaterialAvailability as project} from '../src/production-material-availability.mjs';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';
import {materialFixture} from './production-material-fixture.mjs';
import {readProductionDtf} from '../src/production-dtf-store.mjs';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {DTF_ENGINE_CLIENT} from '../src/dtf-layout.mjs';

const now=Date.parse('2026-11-21T12:00:00.000Z');
const hash=letter=>letter.repeat(64);
function workspace(){return {
 schema:'production_material_workspace_v1',scope:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'},planning_date:'2026-11-21',checked_at:new Date(now).toISOString(),fence_hash:hash('a'),
 source_vector:{schema:'production_material_source_vector_v1',orders_hash:hash('b'),operational_heads_hash:hash('c'),manufacturing_hash:hash('d')},
 coverage:{orders_complete:true,stock_complete:true,suppliers_complete:true,purchases_complete:true,manufacturing_complete:true,source_integrity_verified:true,provider_completeness:'NOT_PROVEN',basis:'SAVED_LOCAL_SOURCES_ONLY'},
 orders:[{source_key:hash('1'),source_hash:hash('2'),line_source_hash:hash('3'),commercial_quantity:2,group_revision:1,material_state:'RESERVED',components:[{variant_id:'shirt-M-black',quantity_per_unit:1,required_quantity:2,reserved_quantity:2,consumed_quantity:0,shortage_quantity:0},{variant_id:'shirt-G-white',quantity_per_unit:1,required_quantity:2,reserved_quantity:2,consumed_quantity:0,shortage_quantity:0}]}]
};}

test('material source absence remains unknown; it never becomes empty stock or a financial amount',()=>{
 const value=project(null,{now});assert.equal(value.state,'UNKNOWN');assert.equal(value.orders_count,null);assert.equal(value.known_shortage_pieces,null);assert.equal(value.required_pieces,null);assert.deepEqual(value.rows,[]);assert.equal(value.provider_completeness,'NOT_PROVEN');
});

test('a reserved numbered kit preserves commercial and physical quantities and exact source identity',()=>{
 const input=workspace(),copy=structuredClone(input),value=project(input,{now});
 assert.equal(value.source_valid,true);assert.equal(value.orders_count,1);assert.equal(value.required_pieces,4);assert.equal(value.reserved_orders,1);assert.equal(value.rows[0].commercial_quantity,2);assert.equal(value.rows[0].fully_reserved,true);assert.equal(value.rows[0].line_source_hash,hash('3'));assert.equal(value.known_shortage_pieces,0);
 assert.deepEqual(input,copy,'projection never changes operational facts');assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.rows[0].components));
});

test('partial pagination stays partial while an independently proven reservation may be shown',()=>{
 const input=workspace();input.coverage.orders_complete=false;input.coverage.purchases_complete=false;
 const value=project(input,{now});assert.equal(value.state,'PARTIAL');assert.equal(value.local_records_complete,false);assert.equal(value.provider_completeness,'NOT_PROVEN');assert.equal(value.rows[0].fully_reserved,true);assert.equal(value.orders_count,1);
});

test('unknown compositions and partial or already-consumed stock cannot release the DTF selection',()=>{
 const missing=workspace();missing.orders[0].material_state='UNKNOWN';missing.orders[0].components=[];
 const value=project(missing,{now});assert.equal(value.required_pieces,null);assert.equal(value.unknown_orders,1);assert.equal(value.rows[0].fully_reserved,false);
 for(const change of [row=>row.components[0].reserved_quantity=1,row=>{row.components[0].reserved_quantity=1;row.components[0].consumed_quantity=1;},row=>row.group_revision=0]){
  const input=workspace();change(input.orders[0]);assert.equal(project(input,{now}).rows[0].fully_reserved,false);
 }
});

test('stale, future, other-day and other-store material sources are rejected without leaking counts',()=>{
 for(const [change,options,reason] of [
  [value=>value.checked_at=new Date(now-300001).toISOString(),{},'SOURCE_STALE'],
  [value=>value.checked_at=new Date(now+5001).toISOString(),{},'SOURCE_STALE'],
  [value=>value.scope.store_id='another-store',{},'SCOPE_MISMATCH'],
  [()=>{},{planning_date:'2026-11-22'},'PLANNING_DATE_MISMATCH']
 ]){const input=workspace();change(input);const result=project(input,{now,...options});assert.equal(result.source_valid,false);assert.equal(result.reason,reason);assert.equal(result.orders_count,null);assert.deepEqual(result.rows,[]);}
 const input=workspace();input.scope={organization_id:'company-A',store_id:'store-B'};
 assert.equal(project(input,{now,expected_scope:input.scope}).source_valid,true);
});

test('duplicate source rows, unsafe arithmetic and unproved source integrity fail closed',()=>{
 const cases=[
  input=>input.orders.push(structuredClone(input.orders[0])),
  input=>input.orders[0].commercial_quantity=-0,
  input=>input.orders[0].components[0].quantity_per_unit=2,
  input=>input.orders[0].components.push(structuredClone(input.orders[0].components[0])),
  input=>input.orders[0].components[0].required_quantity='2',
  input=>input.orders[0].components[0].shortage_quantity=-1,
  input=>{input.orders[0].components[0].required_quantity=Number.MAX_SAFE_INTEGER;input.orders[0].components[1].required_quantity=1;},
  input=>input.coverage.source_integrity_verified=false,
  input=>input.coverage.provider_completeness='COMPLETE',
  input=>input.source_vector.orders_hash='not-a-proof'
 ];
 for(const change of cases){const input=workspace();change(input);const result=project(input,{now});assert.equal(result.source_valid,false);assert.equal(result.reserved_orders,null);}
});

test('supplied aggregate claims do not override the operational rows',()=>{
 const input=workspace();input.reserved_orders=999;input.purchase_total_cents=999999;input.orders[0].buyer_name='not-an-agent-field';
 const result=project(input,{now});assert.equal(result.reserved_orders,1);assert.equal(Object.hasOwn(result,'purchase_total_cents'),false);assert.equal(JSON.stringify(result).includes('buyer_name'),false);
});

test('Hermes and the three specialists consult the same physical sources without changing financial contracts',()=>{
 const input=workspace();input.orders[0].material_state='SHORTAGE';input.orders[0].components[0].reserved_quantity=0;input.orders[0].components[0].shortage_quantity=2;
 const options={projectMaterials:project},baseline=buildMlsAgentRegistry({now:now/1000},options),value=buildMlsAgentRegistry({now:now/1000,materials:input},options);
 assert.deepEqual(value.day,baseline.day);assert.deepEqual(value.month,baseline.month);assert.equal(value.agents.length,6);assert.equal(value.mode,'OBSERVER');assert.equal(value.sources.materials.fence_hash,input.fence_hash);assert.equal(Object.hasOwn(value.sources.materials,'rows'),false);
 assert.ok(value.priorities.some(row=>row.code==='MATERIAL_SHORTAGE'&&row.href==='/admin?tab=agent-production#productionMaterialsDetails'));
 for(const agent of [value.hermes,...value.agents.filter(row=>['finance','products','production'].includes(row.id))]){assert.match(agent.message,/Materiais em 2026-11-21/);assert.equal(agent.material_source_href,'/admin?tab=agent-production#productionMaterialsDetails');assert.equal(agent.mode,'OBSERVER');}
 assert.match(value.agents.find(row=>row.id==='finance').message,/não são uma nova dedução do lucro/);
 assert.equal(JSON.stringify(value).includes('buyer_name'),false);
});

test('an invalid materials source opens a read-only verification priority instead of inventing a shortage',()=>{
 const input=workspace();input.scope.store_id='other';const value=buildMlsAgentRegistry({now:now/1000,materials:input},{projectMaterials:project});
 assert.equal(value.sources.materials,null);assert.ok(value.priorities.some(row=>row.code==='MATERIAL_SOURCE_UNAVAILABLE'));assert.equal(value.priorities.some(row=>row.code==='MATERIAL_SHORTAGE'),false);assert.equal(value.day.net_cents,null);
});

test('real D1 kit reservations match the real DTF line and an explicit release prevents preparation without another DTF write',async t=>{
 const f=materialFixture(t),a=await f.seedStock({size:'M',color:'Preto',count:6}),b=await f.seedStock({size:'G',color:'Branco',count:6}),order=await f.seedOrder({quantity:2,sku:'arte-20+outra-20'});
 await f.map(order,[{variant_id:a.variant_id,quantity_per_unit:1},{variant_id:b.variant_id,quantity_per_unit:1}]);await f.reserve(order.source_key);
 let materials=await f.read();const queue=await readProductionDtf(f.env),line=queue.lines.find(row=>row.unit_key===order.source_key),available=project(materials,{now:f.options.now(),expected_scope:f.scope}),physical=available.rows.find(row=>row.source_key===line.unit_key);
 assert.equal(available.source_valid,true);assert.equal(physical.material_state,'RESERVED');assert.equal(physical.fully_reserved,true);assert.equal(physical.line_source_hash,line.source_revision);assert.equal(physical.commercial_quantity,line.quantity);assert.equal(physical.components.length,2);assert.equal(available.required_pieces,4);

 // Exercise the actual emitted DTF selector, with its source reads backed by
 // this same SQLite/D1 fixture. Only canvas/IndexedDB are synthetic browser IO.
 const calls=[],draws=[],blob=new Blob(['synthetic-material-dtf-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
 const arts=['arte','outra'].map(art_key=>({art_key,sha256,pixel_width:4000,pixel_height:2001,blob}));
 class Element{constructor(){this.children=[];this.dataset={};this.value='';this.checked=false;this.disabled=false;this.textContent='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}setAttribute(){} }
 const elements=new Map([...dtfBody().matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
 for(const [name,value]of Object.entries({FilmWidth:'57',MaxLength:'50',Gap:'5',Margin:'5',Dpi:'300',Rotate:'false'}))elements.get('dtf'+name).value=value;
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction(){return{objectStore(){return{getAll(){const result={};queueMicrotask(()=>{result.result=arts;result.onsuccess?.();});return result;}};}};},close(){}};request.onsuccess?.();});return request;}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[f.options.now()]));}static now(){return f.options.now();}}
 const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,createElement(tag){const element=new Element();if(tag==='canvas'){element.getContext=()=>({save(){},restore(){},translate(){},rotate(){},drawImage(...args){draws.push(args);}});}return element;},body:new Element(),documentElement:{dataset:{activePanel:'overview'}},visibilityState:'visible',addEventListener(){}},Date:FixedDate,indexedDB,Blob,Uint8Array,DataView,TextEncoder,TextDecoder,URL,URLSearchParams,crypto:webcrypto,createImageBitmap:async()=>({width:4000,height:2001,close(){}}),setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},queueMicrotask});
 const parse=vm.runInContext('JSON.parse',context);let refreshes=0;
 context.brazaProductionMaterials={getSnapshot:()=>parse(JSON.stringify(materials)),async refresh(options){assert.equal(options.allowHidden,true);refreshes++;materials=await f.read();return true;}};
 vm.runInContext(DTF_ENGINE_CLIENT,context);vm.runInContext(DTF_CLIENT,context);
 const api=async(path,body)=>{calls.push({path,body});assert.equal(path,'production','a physically stale selection must not call the DTF batch POST');assert.equal(body,undefined);return parse(JSON.stringify(await readProductionDtf(f.env)));};
 await context.brazaDtfWorkspace.start({api});t.after(()=>context.brazaDtfWorkspace.stop());
 const el=name=>elements.get('dtf'+name);
 assert.equal(await el('SelectMaterials').onclick(),true);assert.equal(el('SelectedCount').textContent,'2');assert.equal(refreshes,1);assert.match(el('Queue').children[0].children[1].children.at(-1).textContent,/Camisetas: Reservadas/);
 await el('PreviewButton').onclick();assert.equal(draws.length,4);assert.equal(el('Prepare').disabled,false);
 const dtfState=()=>({batches:f.db.db.prepare('SELECT COUNT(*) AS n FROM production_dtf_batches').get().n,reservations:f.db.db.prepare('SELECT COUNT(*) AS n FROM production_dtf_reservations').get().n,audit:f.db.db.prepare('SELECT COUNT(*) AS n FROM production_dtf_audit').get().n});
 const beforeDtf=dtfState(),view=await f.read(),reserved=view.orders.find(row=>row.source_key===order.source_key);
 await f.mutate(f.command('release_order',{source_key:reserved.source_key,source_hash:reserved.source_hash,fence_hash:view.fence_hash,evidence:'Liberação física sintética explícita antes da preparação DTF'},reserved.group_revision));
 const released=project(await f.read(),{now:f.options.now(),expected_scope:f.scope});assert.equal(released.rows[0].material_state,'AVAILABLE_TO_RESERVE');assert.equal(released.rows[0].fully_reserved,false);
 await el('Prepare').onclick();assert.equal(refreshes,2);assert.deepEqual(calls.map(row=>row.path),['production']);assert.match(el('Status').textContent,/fonte física mudou/);assert.deepEqual(dtfState(),beforeDtf,'physical release does not reserve, print, export or consume DTF');
 const physicalAfter=await f.read();assert.ok(physicalAfter.stock.variants.every(row=>row.reserved_quantity===0&&row.physical_usable_quantity===6));
});
