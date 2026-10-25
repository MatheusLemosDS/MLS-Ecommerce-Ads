import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FinanceConnectionError} from '../src/connection-store.mjs';
import {runFinanceHistoricalVariantEvidence} from '../src/historical-variant-evidence.mjs';
import {projectHistoricalVariantEvidenceRequest,projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches,historicalVariantEvidenceDiagnostic} from '../src/historical-variant-evidence-frame.mjs';

const clock=Date.UTC(2026,9,25,12),stamp=clock/1000,key='fixture-historical-partner-key',access='PRIVATE_HISTORICAL_ACCESS',refresh='PRIVATE_HISTORICAL_REFRESH';
const LIST='/api/v2/order/get_order_list',DETAIL='/api/v2/order/get_order_detail';
const input={start_date:'2026-10-01',end_date:'2026-10-15',item_ids:['22099687396','58218547329','58219210514','999'],cursor:null};
const line=(item='22099687396',model='4',quantity=1,itemName='Camiseta infantil Estrela',modelName='4')=>({item_id:item,model_id:model,model_quantity_purchased:quantity,item_name:itemName,model_name:modelName,model_sku:'PRIVATE_SKU',buyer_username:'PRIVATE_BUYER'});
const row=(serial,index=0,items=[line()])=>({order_sn:serial,order_status:'COMPLETED',create_time:Date.UTC(2026,9,14,12)/1000,update_time:stamp-100,index,item_list:items,buyer_username:'PRIVATE_BUYER',recipient_address:{name:'PRIVATE_CUSTOMER',address:'PRIVATE_ADDRESS'}});
async function fixture(t,rows=[row('PRIVATE_HISTORICAL_ORDER_A',0,[line(),line('58218547329','238814010783',1,'Camiseta adulta Verde','P')]),row('PRIVATE_HISTORICAL_ORDER_B',1,[line('58219210514','219195030703',3,'Camiseta adulta Azul','G1'),line('123','456',1,'PRIVATE_NONTARGET_TITLE','PRIVATE_NONTARGET_MODEL')])]){
 const db=new D1();t.after(()=>db.db.close());let milliseconds=clock;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,41).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key},now=()=>milliseconds;
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:stamp+14400});
 const calls=[],pages=[{ids:rows.map(value=>value.order_sn),more:false,next_cursor:''}];let mutate=null;
 const fetchImpl=async request=>{
  calls.push(request);const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('accept'),'application/json');assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);assert.equal(request.headers.has('x-braza-app-key'),false);assert.equal(request.headers.has('x-braza-finance-router'),false);
  assert.equal(url.searchParams.get('partner_id'),'2049333');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('access_token'),access);assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  let envelope;
  if(url.pathname===LIST){assert.equal(url.searchParams.get('page_size'),'50');assert.equal(url.searchParams.get('order_status'),null);assert.equal(url.searchParams.get('time_range_field'),'create_time');const page=pages.find(value=>(value.cursor||'')===url.searchParams.get('cursor'));assert.ok(page);envelope={error:'',shop_id:1178167501,response:{order_list:page.ids.map(order_sn=>({order_sn,order_status:'CANCELLED'})),more:page.more,next_cursor:page.next_cursor}};}
  else{assert.equal(url.pathname,DETAIL,'only order list/detail may be requested; no Payment or product reads');assert.equal(url.searchParams.get('response_optional_fields'),'item_list');envelope={error:'',shop_id:1178167501,response:{order_list:url.searchParams.get('order_sn_list').split(',').map(serial=>rows.find(value=>value.order_sn===serial))}};}
  const changed=mutate?await mutate(envelope,url):null;return changed instanceof Response?changed:Response.json(changed||envelope);
 };
 return {env,store,rows,calls,pages,now,advance:value=>{milliseconds+=value;},mutate:value=>{mutate=value;},run:(request=input,extra={})=>runFinanceHistoricalVariantEvidence(env,{...request,fetchImpl,now,...extra})};
}
const errorCode=expected=>error=>error instanceof FinanceConnectionError&&error.code===expected;
const variant=(frame,item,model)=>frame.products.find(row=>row.item_id===item)?.variants.find(row=>row.model_id===model);

test('one private historical page retains removed model identities and exact adult/child names without inferring a cost',async t=>{
 const f=await fixture(t),before=await f.store.readTokens(),frame=await f.run();
 assert.ok(projectHistoricalVariantEvidenceFrame(frame));assert.ok(historicalVariantEvidenceRequestMatches(input,frame));assert.equal(f.calls.length,2);assert.deepEqual(await f.store.readTokens(),before);assert.equal(frame.has_more,false);assert.equal(frame.next_cursor,null);assert.equal(frame.evidence_complete,true);assert.deepEqual(frame.omitted,{target_lines:0,target_units:0});
 assert.deepEqual(frame.coverage,{orders_seen:2,target_orders:2,target_lines:3,target_units:5});assert.equal(frame.products.length,4);assert.deepEqual(frame.products.find(row=>row.item_id==='999').variants,[]);
 assert.deepEqual(variant(frame,'22099687396','4').item_names,['Camiseta infantil Estrela']);assert.deepEqual(variant(frame,'58218547329','238814010783').model_names,['P']);assert.deepEqual(variant(frame,'58219210514','219195030703').model_names,['G1']);assert.equal(variant(frame,'58219210514','219195030703').quantity,3);assert.equal(variant(frame,'58218547329','238814010783').conflict,false);
 const serialized=JSON.stringify(frame);for(const secret of ['PRIVATE_',key,access,refresh,'order_sn','order_hash','customer','recipient_address','sku','cost_cents','selling_unit','male_size','female_size'])assert.equal(serialized.includes(secret),false,secret);
 const list=new URL(f.calls[0].url);assert.equal(Number(list.searchParams.get('time_from')),Date.parse('2026-10-01T03:00:00Z')/1000);assert.equal(Number(list.searchParams.get('time_to')),Date.parse('2026-10-16T03:00:00Z')/1000-1);
});

test('incremental opaque cursors read one page per invocation and page completeness does not claim window completeness',async t=>{
 const f=await fixture(t);f.pages.splice(0,1,{ids:[f.rows[0].order_sn],more:true,next_cursor:'opaque-page-two'},{cursor:'opaque-page-two',ids:[f.rows[1].order_sn],more:false,next_cursor:''});
 const first=await f.run();assert.equal(f.calls.length,2);assert.equal(first.has_more,true);assert.equal(first.evidence_complete,true);assert.equal(first.cursor,null);assert.equal(first.next_cursor,'opaque-page-two');assert.equal(first.coverage.orders_seen,1);assert.deepEqual(first.products.find(row=>row.item_id==='58219210514').variants,[]);
 const second=await f.run({...input,cursor:first.next_cursor});assert.equal(f.calls.length,4);assert.equal(second.cursor,'opaque-page-two');assert.equal(second.has_more,false);assert.equal(second.next_cursor,null);assert.equal(second.coverage.target_units,3);assert.ok(historicalVariantEvidenceRequestMatches({...input,cursor:'opaque-page-two'},second));assert.equal(historicalVariantEvidenceRequestMatches(input,second),false);
});

test('conflicting exact names, missing metadata and current statuses remain explicit evidence rather than a guessed variation',async t=>{
 const rows=[row('PRIVATE_ONE',0,[line('22099687396','4',1,'Camiseta infantil Estrela','4')]),row('PRIVATE_TWO',1,[line('22099687396','4',2,'Camiseta infantil Nova','6')]),row('PRIVATE_THREE',2,[line('22099687396','4',1,undefined,undefined)])];
 delete rows[2].item_list[0].item_name;delete rows[2].item_list[0].model_name;rows[1].order_status='CANCELLED';rows[2].order_status='FUTURE_STATUS';
 const f=await fixture(t,rows),frame=await f.run(),found=variant(frame,'22099687396','4');assert.equal(found.conflict,true);assert.deepEqual(found.item_names,['Camiseta infantil Estrela','Camiseta infantil Nova']);assert.deepEqual(found.model_names,['4','6']);assert.equal(found.missing_item_name_lines,1);assert.equal(found.missing_model_name_lines,1);assert.equal(found.line_count,3);assert.equal(found.quantity,4);assert.deepEqual(found.status_counts,[{status:'COMPLETED',line_count:1,quantity:1},{status:'CANCELLED',line_count:1,quantity:2},{status:'UNKNOWN',line_count:1,quantity:1}]);
});

test('requests and frames reject extra scope, duplicate IDs, future/overlong ranges and accessors without invoking them',async t=>{
 for(const value of [{...input,shop_id:1},{...input,item_ids:[]},{...input,item_ids:['1','1']},{...input,item_ids:['1','2','3','4','5','6']},{...input,start_date:'2026-02-30'},{...input,end_date:'2026-10-16'},{...input,cursor:''},{...input,cursor:'x'.repeat(1025)}])assert.equal(projectHistoricalVariantEvidenceRequest(value),null);
 let getters=0;const poisoned={...input};Object.defineProperty(poisoned,'item_ids',{get(){getters++;return ['1'];}});assert.equal(projectHistoricalVariantEvidenceRequest(poisoned),null);assert.equal(getters,0);
 const f=await fixture(t),frame=await f.run();for(const value of [{...frame,token:'PRIVATE'},{...frame,shop_id:1},{...frame,item_ids:['1']},{...frame,has_more:true,next_cursor:null},{...frame,has_more:false,next_cursor:'opaque'}])assert.equal(projectHistoricalVariantEvidenceFrame(value),null);
 const bad=structuredClone(frame);Object.defineProperty(bad.products[0].variants[0],'model_id',{get(){getters++;return '4';}});assert.equal(projectHistoricalVariantEvidenceFrame(bad),null);assert.equal(getters,0);
 const count=f.calls.length;await assert.rejects(f.run({...input,end_date:'2026-10-26'}),errorCode('FINANCE_HISTORICAL_EVIDENCE_REQUEST_INVALID'));assert.equal(f.calls.length,count);
 const context=vm.createContext({TextEncoder,raw:JSON.stringify(frame)});new vm.Script(projectHistoricalVariantEvidenceFrame.toString()+'\nglobalThis.actual=projectHistoricalVariantEvidenceFrame(JSON.parse(raw));').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),frame);
});

test('foreign detail identity, missing rows, dates and malformed target lines fail the page atomically',async t=>{
 for(const mutate of [value=>{value.response.order_list.pop();},value=>{value.response.order_list[0].order_sn='FOREIGN';},value=>{value.response.order_list[0].shop_id=123;},value=>{value.response.order_list[0].create_time=Date.parse('2026-09-01T03:00:00Z')/1000;},value=>{value.response.order_list[0].item_list[0].model_id='01';},value=>{value.response.order_list[0].item_list[0].model_quantity_purchased=0;},value=>{value.response.order_list[0].item_list[0].item_name='PRIVATE\nNAME';}]){
  const f=await fixture(t);f.mutate((value,url)=>{if(url.pathname===DETAIL)mutate(value);});await assert.rejects(f.run());assert.equal(f.calls.length,2);
 }
});

test('provider cursors cannot expose a literal selected order serial or loop the same opaque cursor',async t=>{
 for(const cursor of ['PRIVATE_HISTORICAL_ORDER_A','prefix-PRIVATE_HISTORICAL_ORDER_A-suffix']){const f=await fixture(t);f.pages[0].more=true;f.pages[0].next_cursor=cursor;await assert.rejects(f.run(),errorCode('FINANCE_HISTORICAL_EVIDENCE_CURSOR_INVALID'));assert.equal(f.calls.length,1);}
 const f=await fixture(t);f.pages[0].cursor='opaque';f.pages[0].more=true;f.pages[0].next_cursor='opaque';await assert.rejects(f.run({...input,cursor:'opaque'}),errorCode('FINANCE_HISTORICAL_EVIDENCE_CURSOR_INVALID'));assert.equal(f.calls.length,1);
});

test('source phase failures are finite and cannot turn provider text into evidence or reset the stored tokens',async t=>{
 for(const [path,reply,code,http]of [[LIST,()=>Response.json({error:'error_rate_limit',message:'PRIVATE_PROVIDER_DETAIL'}),'FINANCE_HISTORICAL_EVIDENCE_LIST_RATE_LIMIT',null],[DETAIL,()=>Response.json({error:'PRIVATE_PROVIDER_DETAIL'},{status:503}),'FINANCE_HISTORICAL_EVIDENCE_DETAIL_UPSTREAM_HTTP',503],[DETAIL,()=>new Promise(()=>{}),'FINANCE_HISTORICAL_EVIDENCE_DETAIL_TIMEOUT',null]]){
  const f=await fixture(t),before=await f.store.readTokens();f.mutate((value,url)=>url.pathname===path?reply():value);let caught;try{await f.run(input,{timeoutMs:5});}catch(error){caught=error;}assert.ok(caught);assert.equal(caught.code,code);assert.deepEqual(historicalVariantEvidenceDiagnostic(caught),{code,http});assert.deepEqual(await f.store.readTokens(),before);assert.doesNotMatch(JSON.stringify(historicalVariantEvidenceDiagnostic(caught)),/PRIVATE/);
 }
 assert.deepEqual(historicalVariantEvidenceDiagnostic({code:'PRIVATE_PROVIDER_TOKEN',upstream_status:9999}),{code:'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE',http:null});
});

test('oversized evidence and expired invocation budgets never advance a cursor with a partial page',async t=>{
 const rows=Array.from({length:6},(_,index)=>row('PRIVATE_ORDER_'+index,index,[line('22099687396','4',1,'Camiseta infantil '+index,'4')])),f=await fixture(t,rows);await assert.rejects(f.run(),errorCode('FINANCE_HISTORICAL_EVIDENCE_EVIDENCE_LIMIT'));
 const many=await fixture(t,[row('PRIVATE_MANY',0,Array.from({length:80},(_,index)=>line('22099687396',String(index),1,'Camiseta '+('á'.repeat(480)),'Tamanho '+('G'.repeat(450)))))]);await assert.rejects(many.run(),errorCode('FINANCE_HISTORICAL_EVIDENCE_EVIDENCE_LIMIT'));
 const slow=await fixture(t);slow.mutate((value,url)=>{if(url.pathname===LIST)slow.advance(20000);return value;});await assert.rejects(slow.run(),errorCode('FINANCE_HISTORICAL_EVIDENCE_READ_BUDGET'));assert.equal(slow.calls.length,1);
});

test('the trusted detail reader accepts bounded large provider bodies but never exports unrelated fields or exceeds one MiB',async t=>{
 const f=await fixture(t);f.rows[0].unused_provider_field='PRIVATE'.repeat(12000);let frame=await f.run();assert.ok(projectHistoricalVariantEvidenceFrame(frame));assert.doesNotMatch(JSON.stringify(frame),/PRIVATE/);
 f.rows[0].unused_provider_field='PRIVATE'.repeat(160000);await assert.rejects(f.run(),errorCode('FINANCE_HISTORICAL_EVIDENCE_DETAIL_UPSTREAM_BODY_TOO_LARGE'));
});
