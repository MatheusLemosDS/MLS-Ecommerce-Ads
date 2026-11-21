import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {physicalShirtStockBody,PHYSICAL_SHIRT_STOCK_CSS,PHYSICAL_SHIRT_STOCK_CLIENT,projectPhysicalShirtStockWorkspace} from '../src/physical-shirt-stock-view.mjs';
import {readPhysicalShirtStockWorkspace,mutatePhysicalShirtStockWorkspace} from '../src/physical-shirt-stock.mjs';

const clock=Date.parse('2026-11-20T18:00:00.000Z'),identity={garment_type:'ADULT',fit:'UNISEX',size:'M',color:'Preta',material:null};
const movement=(quantity,reference)=>({quantity,effective_date:'2026-11-20',reference,evidence:'Conferência exclusivamente sintética'});
function fixture(t){
 const env={ADMIN_DB:new D1()},options={now:()=>clock};t.after(()=>env.ADMIN_DB.db.close());
 const read=query=>readPhysicalShirtStockWorkspace(env,query,options);
 const mutate=body=>mutatePhysicalShirtStockWorkspace(env,body,'synthetic-stock-owner',options);
 const command=(operation,variant_id,expected_revision,selection)=>({operation,variant_id,expected_revision,expected_scope:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'},request_id:webcrypto.randomUUID(),confirmed:true,selection});
 return {env,read,mutate,command,async register(value=identity){return mutate(command('register',null,0,value));}};
}
function mount(f){
 const b=ownerReportBrowser(physicalShirtStockBody()+'<script>'+PHYSICAL_SHIRT_STOCK_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaPhysicalShirtStock='}),calls=[];let transport=null;
 b.context.crypto=webcrypto;b.context.fixtureClock=clock;
 b.context.savedStock=async(path,body)=>{
  const input=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:input});if(transport)return transport(path,input);
  try{if(input)return JSON.stringify(await f.mutate(input));const url=new URL('https://synthetic.test/'+path),q=Object.fromEntries(url.searchParams);return JSON.stringify(await f.read({variant_id:q.variant_id||null,cursor:q.cursor||null,history_cursor:q.history_cursor||null}));}
  catch(error){throw Object.assign(new Error('SAFE_HTTP_ERROR'),{status:error.status,apiCode:error.code??error.message});}
 };
 b.run(`class StockClock extends Date{constructor(...args){super(...(args.length?args:[fixtureClock]));}static now(){return fixtureClock;}}globalThis.Date=StockClock;const stockApi=async(path,body)=>JSON.parse(await savedStock(path,body));brazaPhysicalShirtStock.bootstrapState({phase:'READY'});brazaPhysicalShirtStock.start({api:stockApi});`);
 const field=(form,name)=>b.nodes.get('physicalShirtStock'+form+'Form').querySelector('[name="'+name+'"]');
 const fill=(form,values)=>{for(const [name,value]of Object.entries(values)){const input=field(form,name);assert.ok(input,'real control '+form+'.'+name);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.oninput?.();input.onchange?.();}};
 const submit=form=>b.nodes.get('physicalShirtStock'+form+'Form').onsubmit({preventDefault(){}});
 return {b,calls,field,fill,submit,setTransport:value=>{transport=value;},async open(){await b.run('brazaPhysicalShirtStock.open()');await b.flush();},async select(id){const button=b.nodes.get('physicalShirtStockVariants').querySelector('[data-shirt-variant="'+id+'"]');assert.ok(button);await button.onclick();await b.flush();},snapshot(){return JSON.parse(b.run('JSON.stringify(brazaPhysicalShirtStock.getSnapshot())'));},stop(){b.run('brazaPhysicalShirtStock.stop()');b.timers.clear();}};
}

test('physical shirt controls preserve existing tokens, accessible touch targets and explicit unknown valuation',()=>{
 const html=physicalShirtStockBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/Compra aberta não é recebimento/);assert.match(html,/exportar DTF não consome camiseta/);assert.doesNotMatch(html,/R\$\s*0/);
 assert.match(PHYSICAL_SHIRT_STOCK_CSS,/var\(--surface\)/);assert.match(PHYSICAL_SHIRT_STOCK_CSS,/min-height:44px/);assert.match(PHYSICAL_SHIRT_STOCK_CSS,/max-width:390px/);
 assert.doesNotMatch(PHYSICAL_SHIRT_STOCK_CLIENT,/innerHTML\s*=|\bfetch\s*\(|setInterval\s*\(/);
});

test('strict projection accepts actual service frames and rejects fabricated totals, flags and accessor data',async t=>{
 const f=fixture(t),registered=await f.register();assert.ok(projectPhysicalShirtStockWorkspace(registered));assert.equal(registered.variant.physical_usable_quantity,null);
 const frame=await f.read({variant_id:registered.variant.variant_id});assert.ok(projectPhysicalShirtStockWorkspace(frame));assert.ok(projectPhysicalShirtStockWorkspace(projectPhysicalShirtStockWorkspace(frame)),'projected frames stay reusable');
 for(const change of [v=>v.selected.physical_usable_quantity=0,v=>v.valuation.amount_cents=0,v=>v.external_stock_write_allowed=true,v=>v.selected.reserved_quantity=2,v=>v.history.rows[0].scope.store_id='another-store',v=>v.history.rows[0].entity_id='f'.repeat(64)]){const invalid=structuredClone(frame);change(invalid);assert.equal(projectPhysicalShirtStockWorkspace(invalid),null);}
 let getters=0;const invalid=structuredClone(frame);Object.defineProperty(invalid.selected.identity,'color',{enumerable:true,get(){getters++;throw Error('must not execute');}});assert.equal(projectPhysicalShirtStockWorkspace(invalid),null);assert.equal(getters,0);
});

test('opening only reads; registration and explicit initial count keep UNKNOWN distinct from confirmed zero',async t=>{
 const f=fixture(t),ui=mount(f);t.after(()=>ui.stop());assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.ok(ui.calls.every(x=>x.body===undefined));
 ui.fill('Register',{...identity,material:'',confirmed:false});assert.equal(ui.submit('Register'),false);assert.equal(ui.calls.length,1);
 ui.fill('Register',{size:'m',confirmed:true});assert.equal(await ui.submit('Register'),true);await ui.b.flush();let current=ui.snapshot();assert.equal(current.selected.state,'UNKNOWN');assert.equal(current.selected.identity.size,'M');assert.match(ui.b.nodes.get('physicalShirtStockCounts').textContent,/Não conferido/);assert.equal(ui.field('Movement','operation').value,'initial_count');
 ui.fill('Movement',{quantity:'0',reference:'inventário-sintético-zero',evidence:'Contagem manual sintética',confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();current=ui.snapshot();assert.equal(current.selected.state,'CONFIRMED');assert.equal(current.selected.physical_usable_quantity,0);assert.equal(current.valuation.amount_cents,null);assert.equal(ui.field('Movement','operation').value,'receive');
 for(const request of ui.calls.filter(x=>!x.body)){const keys=[...new URL('https://synthetic.test/'+request.path).searchParams.keys()];assert.deepEqual(keys,['variant_id','cursor','history_cursor']);}
 assert.equal(f.env.ADMIN_DB.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND (name LIKE 'financial_%' OR name LIKE '%expense%')").get().n,0);
});

test('actual receipt, reservation, partial release and consumption use separate explicit commands',async t=>{
 const f=fixture(t),registered=await f.register(),id=registered.variant.variant_id;await f.mutate(f.command('initial_count',id,1,movement(5,'initial-five')));const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);
 ui.fill('Movement',{operation:'receive',quantity:'3',reference:'receipt-three',evidence:'Pacote físico conferido',confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();assert.equal(ui.snapshot().selected.free_quantity,8);
 ui.fill('Movement',{operation:'reserve',quantity:'4',demand_ref:'Pedido sintético / componente1',confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();let row=ui.snapshot().selected;assert.equal(row.physical_usable_quantity,8);assert.equal(row.reserved_quantity,4);const reservation=row.reservations[0].reservation_id;
 ui.fill('Movement',{operation:'release',quantity:'1',reservation_id:reservation,reference:'release-one',evidence:'Demanda corrigida',confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();assert.equal(ui.snapshot().selected.reserved_quantity,3);
 ui.fill('Movement',{operation:'consume',quantity:'2',reservation_id:reservation,reference:'consume-two',evidence:'Uso físico confirmado',confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();row=ui.snapshot().selected;assert.equal(row.physical_usable_quantity,6);assert.equal(row.reserved_quantity,1);assert.equal(row.free_quantity,5);assert.equal(row.reservations[0].released_quantity,1);assert.equal(row.reservations[0].consumed_quantity,2);
 assert.ok(ui.calls.every(x=>x.path.startsWith('production/shirt-stock')));for(const post of ui.calls.filter(x=>x.body))assert.deepEqual(post.body.expected_scope,ui.snapshot().scope,'every write binds the workspace that supplied the draft');assert.equal(ui.snapshot().financial_integration_allowed,false);
});

test('lost confirmation retains the exact request and blocks another write until manual retry',async t=>{
 const f=fixture(t),registration=await f.register(),id=registration.variant.variant_id;await f.mutate(f.command('initial_count',id,1,movement(2,'initial-two')));const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);let lost=true;
 ui.setTransport(async(path,body)=>{if(body){const result=await f.mutate(body);if(lost){lost=false;throw Object.assign(new Error('SAFE_TIMEOUT'),{status:504});}return JSON.stringify(result);}const q=Object.fromEntries(new URL('https://synthetic.test/'+path).searchParams);return JSON.stringify(await f.read({variant_id:q.variant_id||null,cursor:q.cursor||null,history_cursor:q.history_cursor||null}));});
 ui.fill('Movement',{quantity:'3',reference:'lost-receipt',evidence:'Pacote de teste',confirmed:true});assert.equal(await ui.submit('Movement'),false);assert.equal(ui.b.nodes.get('physicalShirtStockRetry').hidden,false);assert.equal(ui.field('Movement','quantity').disabled,true);assert.equal(ui.b.nodes.get('physicalShirtStockReload').disabled,true);
 await f.mutate(f.command('receive',id,3,movement(2,'receipt-after-lost-confirmation')));
 assert.equal(await ui.b.nodes.get('physicalShirtStockRetry').onclick(),true);await ui.b.flush();const posts=ui.calls.filter(x=>x.body);assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);assert.equal(ui.snapshot().selected.physical_usable_quantity,7,'replay returns the original result but its follow-up GET must adopt the latest physical facts');assert.equal(ui.snapshot().selected.revision,4);assert.equal(ui.b.nodes.get('physicalShirtStockRetry').hidden,true);
});

test('CAS conflict reloads the actual count while retaining the complete draft for reviewed resubmission',async t=>{
 const f=fixture(t),registration=await f.register(),id=registration.variant.variant_id;await f.mutate(f.command('initial_count',id,1,movement(2,'initial')));const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);
 await f.mutate(f.command('receive',id,2,movement(1,'another-session')));
 ui.fill('Movement',{quantity:'4',reference:'my-package',evidence:'Conferido por mim',confirmed:true});assert.equal(await ui.submit('Movement'),false);await ui.b.flush();assert.equal(ui.snapshot().selected.physical_usable_quantity,3);assert.equal(ui.field('Movement','quantity').value,'4');assert.equal(ui.field('Movement','reference').value,'my-package');assert.equal(ui.field('Movement','evidence').value,'Conferido por mim');assert.match(ui.b.nodes.get('physicalShirtStockStatus').textContent,/rascunho foi preservado/);
 assert.equal(ui.field('Movement','confirmed').checked,false,'a changed source requires explicit renewed confirmation');ui.fill('Movement',{confirmed:true});assert.equal(await ui.submit('Movement'),true);await ui.b.flush();assert.equal(ui.snapshot().selected.physical_usable_quantity,7);
});

test('variant and audit pagination reach records beyond the first page while preserving a movement draft',async t=>{
 const f=fixture(t);for(let n=0;n<31;n++)await f.register({...identity,color:'Cor sintética '+n});const ui=mount(f);t.after(()=>ui.stop());await ui.open();let first=ui.snapshot();assert.equal(first.variants.length,25);const id=first.variants[0].variant_id;await ui.select(id);
 ui.fill('Movement',{quantity:'8',reference:'draft-preserved',evidence:'Contagem em andamento'});await ui.b.nodes.get('physicalShirtStockNext').onclick();await ui.b.flush();assert.equal(ui.snapshot().variants.length,6);assert.equal(ui.snapshot().selected.variant_id,id);assert.equal(ui.field('Movement','quantity').value,'8');await ui.b.nodes.get('physicalShirtStockPrevious').onclick();await ui.b.flush();assert.equal(ui.snapshot().variants.length,25);
 await f.mutate(f.command('initial_count',id,1,movement(0,'initial-zero')));let revision=2;for(let n=0;n<31;n++)revision=(await f.mutate(f.command('receive',id,revision,movement(1,'history-receipt-'+n)))).variant.revision;
 await ui.b.nodes.get('physicalShirtStockReload').onclick();await ui.b.flush();assert.equal(ui.snapshot().history.rows.length,25);assert.equal(ui.b.nodes.get('physicalShirtStockHistoryNext').disabled,false);await ui.b.nodes.get('physicalShirtStockHistoryNext').onclick();await ui.b.flush();assert.equal(ui.snapshot().history.rows.length,8);assert.equal(ui.snapshot().history.rows.at(-1).revision,1);assert.equal(ui.b.nodes.get('physicalShirtStockHistoryNext').disabled,true);assert.match(ui.b.nodes.get('physicalShirtStockHistory').textContent,/Cadastro da variante/);
});

test('forbidden refresh and stopped delayed reads clear private counts, drafts and pending actions',async t=>{
 const f=fixture(t),registration=await f.register(),id=registration.variant.variant_id;await f.mutate(f.command('initial_count',id,1,movement(3,'initial')));const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);ui.fill('Movement',{reference:'private-draft',quantity:'1'});
 ui.setTransport(()=>{throw Object.assign(new Error('PRIVATE_PROVIDER_DETAIL'),{status:403});});assert.equal(await ui.b.nodes.get('physicalShirtStockReload').onclick(),false);await ui.b.flush();assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('physicalShirtStockCounts').textContent,'');assert.equal(ui.b.nodes.get('physicalShirtStockMovementForm').textContent,'');assert.doesNotMatch(ui.b.nodes.get('physicalShirtStockStatus').textContent,/PRIVATE_PROVIDER_DETAIL/);
 const second=mount(f);t.after(()=>second.stop());const saved=await f.read({variant_id:null});let release;second.setTransport(()=>new Promise(resolve=>{release=()=>resolve(JSON.stringify(saved));}));second.b.run('brazaPhysicalShirtStock.open()');await second.b.flush();assert.ok(release);second.stop();release();await second.b.flush();assert.equal(second.snapshot(),null);assert.equal(second.b.nodes.get('physicalShirtStockVariants').textContent,'');assert.match(second.b.nodes.get('physicalShirtStockStatus').textContent,/Sessão encerrada/);
});

test('a stock write binds the last valid workspace scope and a scope rejection clears the old draft without retry',async t=>{
 const f=fixture(t),registration=await f.register(),id=registration.variant.variant_id;await f.mutate(f.command('initial_count',id,1,movement(3,'initial-scope-count')));
 const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);const originalScope=ui.snapshot().scope;
 ui.fill('Movement',{quantity:'2',reference:'old-store-receipt',evidence:'Rascunho da loja anterior',confirmed:true});
 let rejected=0;ui.setTransport(async(path,body)=>{assert.ok(body,'a scope failure cannot automatically adopt another store through a fresh GET');assert.deepEqual(body.expected_scope,originalScope);assert.equal(body.variant_id,id);assert.equal(body.expected_revision,2);rejected++;throw Object.assign(new Error('PRIVATE_CURRENT_STORE'),{status:403,apiCode:'PHYSICAL_SHIRT_STOCK_SCOPE_CHANGED'});});
 assert.equal(await ui.submit('Movement'),false);await ui.b.flush();assert.equal(rejected,1);assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('physicalShirtStockMovementForm').textContent,'');assert.equal(ui.b.nodes.get('physicalShirtStockCounts').textContent,'');assert.equal(ui.b.nodes.get('physicalShirtStockRetry').hidden,true);assert.equal(ui.b.nodes.get('physicalShirtStockReload').disabled,true);assert.doesNotMatch(ui.b.nodes.get('physicalShirtStockStatus').textContent,/PRIVATE_CURRENT_STORE/);
 assert.equal(await ui.b.nodes.get('physicalShirtStockRetry').onclick(),false);assert.equal(rejected,1,'a rejected old-store command is never retried under a new store');
 const current=await f.read({variant_id:id});assert.equal(current.selected.revision,2);assert.equal(current.selected.physical_usable_quantity,3);
});

test('an out-of-order physical date explains the chronology and preserves the entered date without retry',async t=>{
 const f=fixture(t),registration=await f.register(),id=registration.variant.variant_id;await f.mutate(f.command('initial_count',id,1,{...movement(3,'initial-nineteenth'),effective_date:'2026-11-19'}));await f.mutate(f.command('receive',id,2,movement(1,'receipt-twentieth')));
 const ui=mount(f);t.after(()=>ui.stop());await ui.open();await ui.select(id);ui.fill('Movement',{quantity:'2',effective_date:'2026-11-19',reference:'earlier-actual-receipt',evidence:'Fato anterior em conferência',confirmed:true});
 assert.equal(await ui.submit('Movement'),false);await ui.b.flush();assert.match(ui.b.nodes.get('physicalShirtStockStatus').textContent,/A data é anterior ao último movimento/);assert.match(ui.b.nodes.get('physicalShirtStockStatus').textContent,/não altere a data apenas para salvar/);assert.equal(ui.field('Movement','effective_date').value,'2026-11-19');assert.equal(ui.field('Movement','confirmed').checked,false);assert.equal(ui.b.nodes.get('physicalShirtStockRetry').hidden,true);assert.equal(ui.snapshot().selected.revision,3);assert.equal(ui.snapshot().selected.physical_usable_quantity,4);assert.equal(ui.calls.filter(x=>x.body).length,1);
});
