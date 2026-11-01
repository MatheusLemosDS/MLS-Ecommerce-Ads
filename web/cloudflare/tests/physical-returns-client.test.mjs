import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {physicalReturnsBody,PHYSICAL_RETURNS_CSS,PHYSICAL_RETURNS_CLIENT,projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser,compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const caseHash='a'.repeat(64),orderHash='b'.repeat(64),identity={artwork:'Arte 80',color:'Preta',size:'M',garment_type:'ADULT',fit:'MALE',confirmed:true,item_id:null,model_id:null,sku:null};
const manualIdentity={artwork:identity.artwork,color:identity.color,size:identity.size,garment_type:identity.garment_type,fit:identity.fit,confirmed:identity.confirmed};
function fixture(t){
 const env={ADMIN_DB:new D1()},clock={time:Date.parse('2026-11-01T18:00:00Z')},now=()=>clock.time,source={case_hash:caseHash,order_hash:orderHash,status:'REFUND_PAID',checked_at:Math.floor(clock.time/1000)-10,publication_revision:4};
 t.after(()=>env.ADMIN_DB.db.close());
 async function workspace(month='2026-11',{reason=null}={}){return {schema:'physical_returns_workspace_v1',month,checked_at:Math.floor(clock.time/1000),source:reason?{status:'UNAVAILABLE',checked_at:null,cases_total:null,cases_included:0,truncated:false,reason,cases:[]}:{status:'AVAILABLE',checked_at:source.checked_at,cases_total:1,cases_included:1,truncated:false,reason:null,cases:[source]},physical:await readPhysicalReturns(env,{now})};}
 async function mutate(body,month='2026-11'){clock.time+=1000;return mutatePhysicalReturns(env,body,'synthetic-physical-owner',{now,sourceCase:{...source,month}});}
 return {env,clock,now,source,workspace,mutate};
}
function mount(f,{html=null}={}){
 html??=physicalReturnsBody()+'<script>'+PHYSICAL_RETURNS_CLIENT+'</script>';
 const b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaPhysicalReturns='}),calls=[];b.context.crypto=webcrypto;b.context.fixtureClock=f.clock.time;let transport=null;
 b.context.savedPhysical=async(path,body)=>{
  const submitted=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:submitted});if(transport)return transport(path,submitted);
  const month=new URL('https://local.test/'+path).searchParams.get('month');try{if(submitted)await f.mutate(submitted,month);return JSON.stringify(await f.workspace(month));}catch(error){throw Object.assign(new Error('SAFE_HTTP_ERROR'),{status:error.status,code:'ADMIN_API_HTTP_ERROR',apiCode:error.message});}
 };
 b.run(`class PhysicalClock extends Date{constructor(...args){super(...(args.length?args:[fixtureClock]));}static now(){return fixtureClock;}}globalThis.Date=PhysicalClock;globalThis.brazaMonthDashboard={getSnapshot:()=>({month:'2026-11'})};const physicalApi=async(path,body)=>JSON.parse(await savedPhysical(path,body));brazaPhysicalReturns.bootstrapState({phase:'READY'});brazaPhysicalReturns.start({api:physicalApi});`);
 const field=(kind,name)=>b.nodes.get('physicalReturns'+kind+'Form').querySelector('[name="'+name+'"]');
 const fill=(kind,values)=>{for(const [name,value] of Object.entries(values)){const input=field(kind,name);assert.ok(input,kind+'.'+name+' is a real form control');if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.oninput?.();}};
 const submit=kind=>b.nodes.get('physicalReturns'+kind+'Form').onsubmit({preventDefault(){}});
 return {b,calls,field,fill,submit,setTransport:value=>{transport=value;},async open(){b.run('brazaPhysicalReturns.open();');await b.flush();},stop(){b.run('brazaPhysicalReturns.stop();');b.timers.clear();},snapshot(){return JSON.parse(b.run('JSON.stringify(brazaPhysicalReturns.getSnapshot())'));}};
}

test('physical returns has an accessible independent month, positive receipts and explicit unknown valuation',()=>{
 const html=physicalReturnsBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(html,/for="physicalReturnsMonthSelect"/);assert.match(html,/id="physicalReturnsMonthSelect" type="month"/);assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/Custo e impacto no resultado ainda não apurados/);assert.match(html,/total esperado.*ainda não foi confirmado/);assert.doesNotMatch(html,/R\$\s*0/);
 assert.match(PHYSICAL_RETURNS_CSS,/min-height:44px/);assert.match(PHYSICAL_RETURNS_CSS,/max-width:390px/);assert.doesNotMatch(PHYSICAL_RETURNS_CLIENT,/innerHTML\s*=|\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(/);
});

test('workspace projection preserves the global ledger when any saved-source failure is unavailable',async t=>{
 const f=fixture(t),good=await f.workspace();assert.ok(projectPhysicalReturnsWorkspace(good));
 for(const reason of ['SAVED_RETURNS_UNAVAILABLE','SAVED_RETURNS_CONFLICT','SAVED_RETURNS_INCOMPLETE']){const frame=await f.workspace('2026-10',{reason});assert.ok(projectPhysicalReturnsWorkspace(frame));assert.equal(frame.physical.valuation.amount_cents,null);}
 for(const mutate of [v=>v.extra='PRIVATE',v=>v.physical.valuation.amount_cents=0,v=>v.source.cases.push({...v.source.cases[0]}),v=>v.source.cases[0].order_hash='raw-order-number']){const bad=structuredClone(good);mutate(bad);assert.equal(projectPhysicalReturnsWorkspace(bad),null);}
 let reads=0;const bad=structuredClone(good);Object.defineProperty(bad.source,'status',{get(){reads++;throw Error('PRIVATE');}});assert.equal(projectPhysicalReturnsWorkspace(bad),null);assert.equal(reads,0);
});

test('source reads are lazy and month selection stays pinned without changing the financial month',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.snapshot().physical.revision,0);
 await ui.b.run('brazaPhysicalReturns.observe("2026-11")');assert.equal(ui.calls.length,1,'observing the same month cannot create a new read loop');
 ui.b.nodes.get('physicalReturnsMonthSelect').value='2026-10';await ui.b.nodes.get('physicalReturnsMonthSelect').onchange();await ui.b.flush();assert.equal(ui.snapshot().month,'2026-10');assert.equal(ui.b.run('brazaMonthDashboard.getSnapshot().month'),'2026-11');
 await ui.b.run('brazaPhysicalReturns.observe("2026-11")');ui.b.run('brazaPhysicalReturns.open();');await ui.b.flush();assert.equal(ui.snapshot().month,'2026-10');assert.equal(ui.calls.at(-1).path,'returns/physical?month=2026-10');
 ui.b.nodes.get('physicalReturnsMonthSelect').value='2026-12';assert.equal(ui.b.nodes.get('physicalReturnsMonthSelect').onchange(),false);assert.equal(ui.b.nodes.get('physicalReturnsMonthSelect').value,'2026-10');
});

test('manual physical receipts and inspection do not infer quantities or financial value from provider status',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());await ui.open();assert.equal(await ui.b.nodes.get('physicalReturnsRegister').onclick(),true);await ui.b.flush();
 let snapshot=ui.snapshot();assert.equal(snapshot.physical.summary.received_quantity,0,'REFUND_PAID is not a physical receipt');assert.equal(snapshot.physical.cases[0].source.status,'REFUND_PAID');assert.match(ui.b.nodes.get('physicalReturnsCaseFacts').textContent,/Aguardando recebimento/);
 ui.fill('Receive',{receipt_ref:'Pacote 1 - masculina M',quantity:'0'});assert.equal(ui.submit('Receive'),false);assert.equal(ui.calls.filter(call=>call.body?.action==='receive').length,0);
 ui.fill('Receive',{receipt_ref:'Pacote 1 - masculina M',quantity:'3',...manualIdentity});assert.equal(await ui.submit('Receive'),true);await ui.b.flush();snapshot=ui.snapshot();assert.equal(snapshot.physical.summary.active_quantity,3);assert.equal(snapshot.physical.summary.quarantine_quantity,3);assert.equal(snapshot.physical.summary.physically_available_quantity,0);
 ui.fill('Inspect',{resellable:'1',repair:'1',damaged:'0',mismatch:'0',quarantine:'0',reason:'Conferência inicial'});assert.equal(ui.submit('Inspect'),false,'inspection categories must cover the exact immutable received quantity');
 ui.fill('Inspect',{quarantine:'1',artwork:'',confirmed:false});assert.equal(ui.submit('Inspect'),false,'unidentified pieces cannot become reusable');
 ui.fill('Inspect',{...manualIdentity,reason:'Conferência física realizada'});assert.equal(await ui.submit('Inspect'),true);await ui.b.flush();snapshot=ui.snapshot();assert.equal(snapshot.physical.summary.resellable_quantity,1);assert.equal(snapshot.physical.summary.repair_quantity,1);assert.equal(snapshot.physical.summary.quarantine_quantity,1);assert.equal(snapshot.physical.valuation.amount_cents,null);assert.equal(snapshot.physical.external_stock_write_allowed,false);
 ui.fill('Void',{reason:'Quantidade lançada por engano'});assert.equal(await ui.submit('Void'),true);await ui.b.flush();snapshot=ui.snapshot();assert.equal(snapshot.physical.summary.received_quantity,3);assert.equal(snapshot.physical.summary.voided_quantity,3);assert.equal(snapshot.physical.summary.active_quantity,0);assert.equal(snapshot.physical.summary.physically_available_quantity,0);assert.equal(snapshot.physical.cases[0].lines[0].status,'VOID');assert.match(ui.b.nodes.get('physicalReturnsSummary').textContent,/inclui anuladas/);
 assert.ok(ui.calls.every(call=>call.path.startsWith('returns/physical?month=')),'no financial or provider endpoint is part of the physical workflow');
});

test('a lost confirmation retries the identical request and line IDs without receiving the pieces twice',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.b.nodes.get('physicalReturnsRegister').onclick();await ui.b.flush();let lost=true;
 ui.setTransport(async(path,body)=>{const month=new URL('https://local.test/'+path).searchParams.get('month');if(body){await f.mutate(body,month);if(body.action==='receive'&&lost){lost=false;throw Object.assign(new Error('SAFE_TIMEOUT'),{code:'ADMIN_API_TIMEOUT'});}}return JSON.stringify(await f.workspace(month));});
 ui.fill('Receive',{receipt_ref:'Pacote 1 - masculina M',quantity:'2',...manualIdentity});assert.equal(await ui.submit('Receive'),false);assert.equal(ui.b.nodes.get('physicalReturnsRetry').hidden,false);assert.equal(ui.field('Receive','quantity').disabled,true);assert.equal(ui.b.nodes.get('physicalReturnsMonthSelect').disabled,true);
 assert.equal(await ui.b.nodes.get('physicalReturnsRetry').onclick(),true);await ui.b.flush();const calls=ui.calls.filter(call=>call.body?.action==='receive');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);assert.equal(ui.snapshot().physical.summary.received_quantity,2);assert.equal(ui.snapshot().physical.cases[0].lines.length,1);assert.equal(ui.b.nodes.get('physicalReturnsRetry').hidden,true);
});

test('CAS reload retains the complete draft and a specific receipt conflict uses the bounded API code',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.b.nodes.get('physicalReturnsRegister').onclick();await ui.b.flush();
 await f.mutate({revision:1,request_id:webcrypto.randomUUID(),action:'receive',case_hash:caseHash,line_id:webcrypto.randomUUID(),receipt_ref:'Pacote de outra sessão',quantity:1,identity});
 ui.fill('Receive',{receipt_ref:'Meu pacote',quantity:'2',...manualIdentity});assert.equal(await ui.submit('Receive'),false);await ui.b.flush();assert.equal(ui.field('Receive','receipt_ref').value,'Meu pacote');assert.equal(ui.field('Receive','quantity').value,'2');assert.equal(ui.field('Receive','fit').value,'MALE');assert.equal(ui.snapshot().physical.revision,2);
 assert.equal(await ui.submit('Receive'),true);await ui.b.flush();assert.equal(ui.snapshot().physical.summary.active_quantity,3);
 ui.fill('Receive',{receipt_ref:'meu pacote',quantity:'2',...manualIdentity});assert.equal(await ui.submit('Receive'),false);await ui.b.flush();assert.match(ui.b.nodes.get('physicalReturnsStatus').textContent,/identificação de recebimento já está ativa/);assert.equal(ui.snapshot().physical.summary.active_quantity,3);assert.equal(ui.field('Receive','receipt_ref').value,'meu pacote');
});

test('a successful mutation invalidates a delayed stale read and always unlocks Reload',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.b.nodes.get('physicalReturnsRegister').onclick();await ui.b.flush();let release;
 const old=await f.workspace();ui.setTransport(async(path,body)=>{if(body){await f.mutate(body);return JSON.stringify(await f.workspace());}return new Promise(resolve=>{release=()=>resolve(JSON.stringify(old));});});
 const pendingRead=ui.b.nodes.get('physicalReturnsReload').onclick();await ui.b.flush();assert.equal(ui.b.nodes.get('physicalReturnsReload').disabled,true);
 ui.fill('Receive',{receipt_ref:'Pacote durante leitura',quantity:'2',...manualIdentity});assert.equal(await ui.submit('Receive'),true);await ui.b.flush();assert.equal(ui.snapshot().physical.revision,2);assert.equal(ui.b.nodes.get('physicalReturnsReload').disabled,false);
 release();await pendingRead;await ui.b.flush();assert.equal(ui.snapshot().physical.revision,2);assert.equal(ui.snapshot().physical.summary.active_quantity,2);assert.equal(ui.b.nodes.get('physicalReturnsReload').disabled,false);
});

test('logout rejects a deferred source read and clears the visible physical data',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());const saved=await f.workspace();let release;
 ui.setTransport(()=>new Promise(resolve=>{release=()=>resolve(JSON.stringify(saved));}));await ui.open();assert.equal(ui.calls.length,1);ui.stop();release();await ui.b.flush();
 assert.equal(ui.snapshot(),null);assert.match(ui.b.nodes.get('physicalReturnsStatus').textContent,/Sessão encerrada/);assert.equal(ui.b.nodes.get('physicalReturnsSourceCase').textContent,'');assert.equal(ui.b.nodes.get('physicalReturnsSummary').textContent,'');assert.equal(ui.b.nodes.get('physicalReturnsReload').disabled,true);assert.equal(ui.calls.length,1,'a late GET cannot restart the stopped session');
});

test('logout ignores a deferred mutation confirmation without replaying or restoring its form',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.b.nodes.get('physicalReturnsRegister').onclick();await ui.b.flush();let release;
 ui.setTransport(async(path,body)=>{await f.mutate(body);const saved=await f.workspace();return new Promise(resolve=>{release=()=>resolve(JSON.stringify(saved));});});
 ui.fill('Receive',{receipt_ref:'Pacote confirmado antes de sair',quantity:'2',...manualIdentity});const sent=ui.submit('Receive');await ui.b.flush();assert.ok(release);ui.stop();release();assert.equal(await sent,false);await ui.b.flush();
 assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('physicalReturnsReceiveForm').textContent,'');assert.equal(ui.b.nodes.get('physicalReturnsRetry').hidden,true);assert.match(ui.b.nodes.get('physicalReturnsStatus').textContent,/Sessão encerrada/);assert.equal(ui.calls.filter(call=>call.body?.action==='receive').length,1);assert.equal((await f.workspace()).physical.summary.active_quantity,2,'a confirmation arriving after logout cannot hide the already committed local receipt from a later authenticated read');
});

for(const minify of [false,true])test(`generated physical controller retains its frozen projectors and stays passive until opened (minify=${minify})`,async t=>{
 const f=fixture(t),{html}=await compiledOwnerReportPage(minify,{ownerPreview:false}),ui=mount(f,{html});t.after(()=>ui.stop());assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.snapshot().source.cases[0].status,'REFUND_PAID');assert.equal(await ui.b.nodes.get('physicalReturnsRegister').onclick(),true);await ui.b.flush();assert.equal(ui.snapshot().physical.revision,1);assert.equal(ui.snapshot().physical.summary.received_quantity,0);
});
