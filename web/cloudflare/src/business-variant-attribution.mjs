import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectBusinessVariantBreakdown,projectBusinessPeriodVariantsFrame} from '../../finance/src/business-variant-attribution.mjs';

const encoder=new TextEncoder();
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
export const BUSINESS_MONTH_VARIANT_ATTRIBUTION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_month_variant_attribution(run_id TEXT PRIMARY KEY NOT NULL,month TEXT NOT NULL,source_revision INTEGER NOT NULL,capture_revision INTEGER NOT NULL,report_checked_at INTEGER NOT NULL,report_hash TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=524288),payload_hash TEXT NOT NULL)`,
];

// A negotiated response is validated before its unchanged legacy frame can be
// committed. Legacy sources remain valid and do not initialize sidecar storage.
export async function unwrapBusinessMonthVariantSource(value){
 const descriptor=Object.getOwnPropertyDescriptor(value??{},'schema');
 if(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.value==='finance_business_period_variants_v1'){
  const projected=await projectBusinessPeriodVariantsFrame(value);
  return projected?{report:projected.report,variant_financials:projected.variant_financials}:null;
 }
 const report=projectBusinessPeriodFrame(value);
 return report?{report,variant_financials:null}:null;
}

// Optional capture happens only after the legacy CAS succeeded. Failure cannot
// roll back a financial frame, repeat its provider request or replace its error.
export async function captureBusinessMonthVariantAttribution(db,month,frame,value,{capture_revision,parent_payload,slot_index}={}){
 try{
  if(!db?.prepare||!db?.batch||!Number.isSafeInteger(capture_revision)||capture_revision<1||capture_revision>2147483647||!Number.isInteger(slot_index)||slot_index<0||slot_index>2||typeof parent_payload!=='string')return false;
  const report=projectBusinessPeriodFrame(frame);if(!report||report.start_date.slice(0,7)!==month)return false;
  const parent=JSON.parse(parent_payload),slot=parent?.slots?.[slot_index],first=month+'-01',slotStart=month+'-'+String(slot_index*15+1).padStart(2,'0');
  if(parent?.start_date!==first||typeof parent.end_date!=='string'||parent.end_date.slice(0,7)!==month||!Number.isFinite(Date.parse(parent.end_date+'T00:00:00Z'))||new Date(parent.end_date+'T00:00:00Z').toISOString().slice(0,10)!==parent.end_date||parent.end_date<report.end_date||!Array.isArray(parent.slots)||parent.slots.length!==Math.ceil(Number(parent.end_date.slice(8))/15)||report.start_date!==slotStart||report.end_date!==month+'-'+String(Math.min(slot_index*15+15,Number(parent.end_date.slice(8)))).padStart(2,'0')||slot?.start_date!==report.start_date||slot.end_date!==report.end_date||slot.frame?.schema!=='business_month_frame_ref_v1'||slot.frame.run_id!==report.run_id||slot.frame.revision!==report.revision)return false;
  const reportRaw=JSON.stringify(report),reportHash=await hash(reportRaw),checked=projectBusinessVariantBreakdown(value,report,reportHash);
  if(!checked)return false;const payload=JSON.stringify(checked),payloadHash=await hash(payload);
  await db.batch(BUSINESS_MONTH_VARIANT_ATTRIBUTION_SCHEMA.map(sql=>db.prepare(sql)));
  // A later slot may commit before this optional capture. Keep the original CAS
  // revision while requiring that the current parent still references this
  // exact slot and byte-identical source; an orphan/replaced row is insufficient.
  const path='$.slots['+slot_index+']',active="EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision>=? AND json_extract(payload,'$.start_date')=? AND substr(json_extract(payload,'$.end_date'),1,7)=? AND json_extract(payload,'$.end_date')>=? AND json_extract(payload,?)=? AND json_extract(payload,?)=? AND json_extract(payload,?)='business_month_frame_ref_v1' AND json_extract(payload,?)=? AND json_extract(payload,?)=?) AND EXISTS(SELECT 1 FROM business_month_frames WHERE month=? AND slot_index=? AND run_id=? AND revision=? AND payload=?)";
  const retained='EXISTS(SELECT 1 FROM business_month_publications p JOIN business_month_publication_frames f ON f.month=p.month AND f.write_token=p.write_token WHERE p.month=? AND p.source_revision>=? AND f.run_id=? AND f.revision=? AND f.payload=?)';
  const result=await db.batch([
   db.prepare('INSERT INTO business_month_variant_attribution(run_id,month,source_revision,capture_revision,report_checked_at,report_hash,payload,payload_hash) SELECT ?,?,?,?,?,?,?,? WHERE ('+active+') OR ('+retained+') ON CONFLICT(run_id) DO UPDATE SET month=excluded.month,source_revision=excluded.source_revision,capture_revision=CASE WHEN business_month_variant_attribution.source_revision=excluded.source_revision THEN MIN(business_month_variant_attribution.capture_revision,excluded.capture_revision) ELSE excluded.capture_revision END,report_checked_at=excluded.report_checked_at,report_hash=excluded.report_hash,payload=excluded.payload,payload_hash=excluded.payload_hash WHERE business_month_variant_attribution.month=excluded.month AND (business_month_variant_attribution.source_revision<excluded.source_revision OR business_month_variant_attribution.source_revision=excluded.source_revision AND business_month_variant_attribution.report_checked_at=excluded.report_checked_at AND business_month_variant_attribution.report_hash=excluded.report_hash AND business_month_variant_attribution.payload_hash=excluded.payload_hash)').bind(report.run_id,month,report.revision,capture_revision,report.checked_at,reportHash,payload,payloadHash,month,capture_revision,first,month,report.end_date,path+'.start_date',report.start_date,path+'.end_date',report.end_date,path+'.frame.schema',path+'.frame.run_id',report.run_id,path+'.frame.revision',report.revision,month,slot_index,report.run_id,report.revision,reportRaw,month,capture_revision,report.run_id,report.revision,reportRaw),
   // Keep every currently referenced active or retained publication source.
   // Unreferenced interim runs cannot accumulate after repeated refreshes.
   db.prepare('DELETE FROM business_month_variant_attribution WHERE run_id NOT IN(SELECT run_id FROM business_month_frames UNION SELECT run_id FROM business_month_publication_frames)'),
  ]);
  return result?.[0]?.meta?.changes===1;
 }catch{return false;}
}

// Browser-safe projection. The monthly frame and publication scope are the
// already canonical objects selected by the same monthly view response.
export function projectBusinessMonthVariantContributions(value,monthlyFrame,auditScope){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const data=(v,keys)=>plain(v)&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const exact=(v,keys)=>data(v,keys)&&Reflect.ownKeys(v).length===keys.length;
 const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const signed=v=>int(v,Number.MIN_SAFE_INTEGER),safe=v=>v>=BigInt(Number.MIN_SAFE_INTEGER)&&v<=BigInt(Number.MAX_SAFE_INTEGER)?Number(v):null;
 const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
 const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const codes=['VARIANT_CAPTURE_INCOMPLETE','VARIANT_CAPTURE_INVALID','SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED','NO_SINGLE_PAIR_ORDERS','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE'];
 const validCodes=v=>list(v,codes.length)&&new Set(v).size===v.length&&v.every(code=>codes.includes(code));
 const sameCodes=(a,b)=>validCodes(a)&&a.length===b.length&&b.every(code=>a.includes(code));
 const money=['sales_cents','repass_cents','tax_cents','ads_adjustment_cents','production_cost_cents','contribution_cents'];
 try{
  if(!data(monthlyFrame,['schema','month','start_date','end_date','checked_at','status','product_summary','result','bindings_revision','costs_revision'])||monthlyFrame.schema!=='business_month_v1'||monthlyFrame.status!=='COMPLETE'||!int(monthlyFrame.checked_at,1,9999999999)||!data(monthlyFrame.result,['pending'])||!list(monthlyFrame.result.pending,30)||!data(monthlyFrame.product_summary,['products'])||!list(monthlyFrame.product_summary.products,3000))return null;
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!exact(auditScope,['publication_revision','start_date','end_date','sources'])||!int(auditScope.publication_revision,1,2147483647)||!day(auditScope.start_date)||!day(auditScope.end_date)||auditScope.start_date.slice(8)!=='01'||auditScope.start_date.slice(0,7)!==monthlyFrame.month||auditScope.end_date.slice(0,7)!==monthlyFrame.month||auditScope.start_date!==monthlyFrame.start_date||auditScope.end_date!==monthlyFrame.end_date||!list(auditScope.sources,3)||auditScope.sources.length!==Math.ceil(Number(auditScope.end_date.slice(8))/15))return null;
  for(const key of ['cost_rules_revision','classification_revision','tax']){const descriptor=Object.getOwnPropertyDescriptor(monthlyFrame,key);if(descriptor&&!Object.hasOwn(descriptor,'value'))return null;}
  const sourceKeys=['publication_revision','bindings_revision','costs_revision','cost_rules_revision','classification_revision'],expectedSource={publication_revision:auditScope.publication_revision,bindings_revision:monthlyFrame.bindings_revision,costs_revision:monthlyFrame.costs_revision,cost_rules_revision:Object.getOwnPropertyDescriptor(monthlyFrame,'cost_rules_revision')?.value??null,classification_revision:Object.getOwnPropertyDescriptor(monthlyFrame,'classification_revision')?.value??null};
  const keys=['schema','month','start_date','end_date','checked_at','state','basis','cost_basis','tax_basis','source','windows','coverage','variants','pending','execution_allowed','net_profit_cents','safe_price_cents'];
  const mei=Object.getOwnPropertyDescriptor(monthlyFrame,'tax')?.value?.regime==='MEI';
  if(!exact(value,keys)||value.schema!=='business_month_variant_contributions_v1'||value.month!==monthlyFrame.month||value.start_date!==monthlyFrame.start_date||value.end_date!==monthlyFrame.end_date||value.checked_at!==monthlyFrame.checked_at||value.basis!=='SINGLE_PAIR_PAID_ORDERS_CURRENT_REFERENCE_NOT_SETTLED'||value.cost_basis!=='CURRENT_REFERENCE_NOT_MANUFACTURING_OR_REUSE_LEDGER'||value.tax_basis!==(mei?'MONTHLY_DAS_NOT_ALLOCATED':'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX')||value.execution_allowed!==false||value.net_profit_cents!==null||value.safe_price_cents!==null||!exact(value.source,sourceKeys)||sourceKeys.some(key=>value.source[key]!==expectedSource[key])||!list(value.windows,3)||value.windows.length!==auditScope.sources.length||!list(value.variants,3000))return null;
  const windows=[],seenSources=new Set();let captured=0;
  for(let i=0;i<value.windows.length;i++){
   const row=value.windows[i],source=auditScope.sources[i];
   const expectedStart=monthlyFrame.month+'-'+String(i*15+1).padStart(2,'0'),expectedEnd=monthlyFrame.month+'-'+String(Math.min(i*15+15,Number(auditScope.end_date.slice(8)))).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seenSources.has(source.run_id)||!int(source.source_revision,1,2147483647)||source.start_date!==expectedStart||source.end_date!==expectedEnd||!exact(row,['run_id','source_revision','start_date','end_date','checked_at','report_hash','capture_revision','state'])||row.run_id!==source.run_id||row.source_revision!==source.source_revision||row.start_date!==source.start_date||row.end_date!==source.end_date||!['CAPTURED','NOT_CAPTURED','INVALID'].includes(row.state))return null;
   seenSources.add(source.run_id);
   if(row.state==='CAPTURED'){if(!int(row.checked_at,1,value.checked_at)||!digest(row.report_hash)||!int(row.capture_revision,1,auditScope.publication_revision))return null;captured++;}
   else if([row.checked_at,row.report_hash,row.capture_revision].some(v=>v!==null))return null;
   windows.push({...row});
  }
  const complete=captured===windows.length,global=monthlyFrame.result.pending.filter(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED'].includes(code)),basePending=[...(!complete?['VARIANT_CAPTURE_INCOMPLETE']:[]),...(windows.some(row=>row.state==='INVALID')?['VARIANT_CAPTURE_INVALID']:[]),...global];
  const expected=new Map();let total=0n;
  for(const product of monthlyFrame.product_summary.products){
   if(!data(product,['item_id','variants'])||!id(product.item_id)||!list(product.variants,3000))return null;
   for(const variant of product.variants){if(!data(variant,['model_id','quantity','unit_cost_cents'])||!id(variant.model_id,true)||!int(variant.quantity,1)||variant.unit_cost_cents!==null&&!int(variant.unit_cost_cents))return null;const key=product.item_id+':'+variant.model_id;if(expected.has(key))return null;expected.set(key,{item_id:product.item_id,model_id:variant.model_id,quantity:variant.quantity,unit_cost_cents:variant.unit_cost_cents});total+=BigInt(variant.quantity);}
  }
  if(expected.size>3000||expected.size!==value.variants.length||safe(total)===null)return null;
  const rows=[],seen=new Set(),allPending=new Set(basePending),countNames=['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'],counts=Object.fromEntries(countNames.map(key=>[key,0]));let assigned=0n,strictCount=0,previous=null,knownSales=0n,knownTax=0n;
  const rowKeys=['item_id','model_id','total_quantity','attributed_quantity','unattributed_quantity','unit_cost_cents','orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown','recorded','strict','pending'];
  for(const row of value.variants){
   if(!exact(row,rowKeys)||!id(row.item_id)||!id(row.model_id,true)||previous&&(compare(previous.item_id,row.item_id)>0||previous.item_id===row.item_id&&compare(previous.model_id,row.model_id)>=0))return null;previous=row;
   const key=row.item_id+':'+row.model_id,reference=expected.get(key);if(!reference||seen.has(key)||row.total_quantity!==reference.quantity||row.unit_cost_cents!==reference.unit_cost_cents||!int(row.attributed_quantity,0,row.total_quantity)||row.unattributed_quantity!==row.total_quantity-row.attributed_quantity||!['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'].every(key=>int(row[key],0,3000))||row.orders!==row.completed+row.ongoing||row.orders!==row.payment_covered+row.payment_missing||row.orders>row.attributed_quantity||row.orders===0&&row.attributed_quantity!==0||row.returns>row.payment_covered||row.returns_unknown<row.payment_missing||row.returns+row.returns_unknown>row.orders||!exact(row.recorded,money)||!exact(row.strict,['state',...money,'margin_bps']))return null;seen.add(key);assigned+=BigInt(row.attributed_quantity);
   const registered=row.recorded;
   for(const name of money)if(registered[name]!==null&&!(['repass_cents','ads_adjustment_cents','contribution_cents'].includes(name)?signed(registered[name]):int(registered[name])))return null;
   if(!captured&&(money.some(name=>registered[name]!==null)||row.attributed_quantity!==0||countNames.some(key=>row[key]!==0))||captured&&['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(name=>registered[name]===null)||captured&&mei&&registered.tax_cents!==0||captured&&row.payment_covered===0&&['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(name=>registered[name]!==0))return null;
   if(captured){
    const n=BigInt(row.payment_covered),bound=n*100000000000000n;
    if(['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(key=>BigInt(registered[key])< -bound||BigInt(registered[key])>bound))return null;
    const difference=BigInt(registered.tax_cents)*10000n-BigInt(registered.sales_cents)*200n;if(!mei&&(difference< -4999n*n||difference>5000n*n))return null;
    knownSales+=BigInt(registered.sales_cents);knownTax+=BigInt(registered.tax_cents);
   }
   for(const key of countNames){counts[key]+=row[key];if(!int(counts[key],0,3000))return null;}
   const production=captured&&row.unit_cost_cents!==null?safe(BigInt(row.attributed_quantity)*BigInt(row.unit_cost_cents)):null;
   if(captured&&row.unit_cost_cents!==null&&production===null||registered.production_cost_cents!==production)return null;
   const coherent=complete&&row.orders>0&&row.payment_missing===0&&row.returns===0&&row.returns_unknown===0&&production!==null;
   const contribution=coherent?safe(BigInt(registered.repass_cents)-BigInt(production)-BigInt(registered.tax_cents)):null;
   if(registered.contribution_cents!==contribution)return null;
   const pending=[...basePending];if(!row.orders)pending.push('NO_SINGLE_PAIR_ORDERS');if(row.payment_missing)pending.push('PAYMENT_INCOMPLETE');if(row.returns+row.returns_unknown)pending.push('RETURNS_NOT_RECONCILED');if(row.unit_cost_cents===null)pending.push('PRODUCTION_COST_INCOMPLETE');if(coherent&&contribution===null)pending.push('ARITHMETIC_UNSAFE');
   let unique=[...new Set(pending)],ready=unique.length===0&&contribution!==null,margin=ready&&registered.sales_cents>0?safe(BigInt(contribution)*10000n/BigInt(registered.sales_cents)):null;
   if(ready&&registered.sales_cents>0&&margin===null){unique.push('ARITHMETIC_UNSAFE');ready=false;}
   if(row.strict.state!==(ready?'AVAILABLE':'BLOCKED')||!sameCodes(row.pending,unique)||money.some(name=>row.strict[name]!==(ready?registered[name]:null))||row.strict.margin_bps!==margin)return null;
   if(ready)strictCount++;for(const code of unique)allPending.add(code);
   rows.push({...Object.fromEntries(rowKeys.filter(key=>!['recorded','strict','pending'].includes(key)).map(key=>[key,row[key]])),recorded:{...registered},strict:{...row.strict},pending:unique});
  }
  if(!data(monthlyFrame,['coverage','known_sales_cents','known_invoice_tax_cents'])||!data(monthlyFrame.coverage,['paid',...countNames.slice(1)])||counts.orders>monthlyFrame.coverage.paid||countNames.slice(1).some(key=>counts[key]>monthlyFrame.coverage[key])||!int(monthlyFrame.known_sales_cents)||knownSales>BigInt(monthlyFrame.known_sales_cents)||!mei&&(!int(monthlyFrame.known_invoice_tax_cents)||knownTax>BigInt(monthlyFrame.known_invoice_tax_cents)))return null;
  const coverage={total_units:Number(total),single_pair_units:safe(assigned),unattributed_units:safe(total-assigned),total_variants:rows.length,strict_variants:strictCount,windows_total:windows.length,windows_captured:captured};
  if(coverage.single_pair_units===null||coverage.unattributed_units===null||!exact(value.coverage,Object.keys(coverage))||Object.keys(coverage).some(key=>value.coverage[key]!==coverage[key])||value.state!==(complete?'AVAILABLE':captured?'PARTIAL':'NOT_CAPTURED')||!sameCodes(value.pending,[...allPending]))return null;
  const output={...Object.fromEntries(keys.filter(key=>!['source','windows','coverage','variants','pending'].includes(key)).map(key=>[key,value[key]])),source:{...expectedSource},windows,coverage,variants:rows,pending:[...allPending]};
  return new TextEncoder().encode(JSON.stringify(output)).byteLength<=2097152?freeze(output):null;
 }catch{return null;}
}

// Captures supplied here have already crossed the asynchronous Finance hash
// projector. This pure aggregation is also used by deterministic QA fixtures.
export function buildBusinessMonthVariantContributions(monthlyFrame,auditScope,sourceFrames,captures,{checked_at=monthlyFrame?.checked_at}={}){
 const safe=v=>v>=BigInt(Number.MIN_SAFE_INTEGER)&&v<=BigInt(Number.MAX_SAFE_INTEGER)?Number(v):null;
 const rawCents=v=>{const match=typeof v==='string'&&/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(v);if(!match)throw Error('RAW');const n=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));return match[1]?-n:n;};
 try{
  if(checked_at!==monthlyFrame.checked_at||!auditScope||!Array.isArray(sourceFrames)||!Array.isArray(captures))return null;
  const frameMap=new Map();for(const raw of sourceFrames){const frame=projectBusinessPeriodFrame(raw);if(!frame||frameMap.has(frame.run_id)||frame.checked_at>checked_at)return null;frameMap.set(frame.run_id,frame);}
  if(frameMap.size!==auditScope.sources.length)return null;
  const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'],totals={coverage:Object.fromEntries(coverageKeys.map(key=>[key,0])),money:[0n,0n,0n,0n],items:new Map()};
  for(const frame of frameMap.values()){
   for(const key of coverageKeys){totals.coverage[key]+=frame.coverage[key];if(!Number.isSafeInteger(totals.coverage[key]))return null;}
   [frame.known_sales_base_raw,frame.known_expected_repass_raw,frame.known_ads_adjustment_raw,frame.invoice_tax.known_tax_raw].forEach((value,i)=>totals.money[i]+=rawCents(value));
   for(const item of frame.items){const key=item.item_id+':'+item.model_id;totals.items.set(key,(totals.items.get(key)||0n)+BigInt(item.quantity));}
  }
  const sourceMei=monthlyFrame.tax?.regime==='MEI';
  if(coverageKeys.some(key=>totals.coverage[key]!==monthlyFrame.coverage[key])||safe(totals.money[0])!==monthlyFrame.known_sales_cents||safe(totals.money[1])!==monthlyFrame.known_expected_repass_cents||monthlyFrame.ads_adjustment_cents!==null&&safe(totals.money[2])!==monthlyFrame.ads_adjustment_cents||!sourceMei&&safe(totals.money[3])!==monthlyFrame.known_invoice_tax_cents)return null;
  let expectedPairs=0;for(const product of monthlyFrame.product_summary.products)for(const variant of product.variants){expectedPairs++;if(totals.items.get(product.item_id+':'+variant.model_id)!==BigInt(variant.quantity))return null;}
  if(totals.items.size!==expectedPairs)return null;
  const windows=[],groups=new Map();let captured=0;
  for(const source of auditScope.sources){
   const frame=frameMap.get(source.run_id);if(!frame||frame.revision!==source.source_revision||frame.start_date!==source.start_date||frame.end_date!==source.end_date||frame.status!=='COMPLETE')return null;
   const matches=captures.filter(row=>row?.frame?.run_id===source.run_id||row?.run_id===source.run_id);let entry=matches.length===1?matches[0]:null,sidecar=null,state=matches.length>1?'INVALID':entry?.state==='INVALID'?'INVALID':'NOT_CAPTURED';
   if(entry&&entry.state!=='INVALID'){
    if(!Number.isSafeInteger(entry.capture_revision)||entry.capture_revision<1||entry.capture_revision>auditScope.publication_revision||JSON.stringify(projectBusinessPeriodFrame(entry.frame))!==JSON.stringify(frame))state='INVALID';
    else{sidecar=projectBusinessVariantBreakdown(entry.variant_financials,frame,entry.variant_financials?.report_hash);state=sidecar?'CAPTURED':'INVALID';}
   }
   windows.push({...source,checked_at:sidecar?frame.checked_at:null,report_hash:sidecar?sidecar.report_hash:null,capture_revision:sidecar?entry.capture_revision:null,state});
   if(!sidecar)continue;captured++;
   for(const row of sidecar.variants){const key=row.item_id+':'+row.model_id;let group=groups.get(key);if(!group){group={quantity:0,orders:0,completed:0,ongoing:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0,money:[0n,0n,0n,0n]};groups.set(key,group);}for(const name of ['quantity','orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown']){group[name]+=row[name];if(!Number.isSafeInteger(group[name]))return null;}['sales_base','expected_repass','invoice_tax','ads_adjustment'].forEach((name,i)=>group.money[i]+=rawCents(row['known_'+name+'_raw']));}
  }
  const complete=captured===windows.length,mei=monthlyFrame.tax?.regime==='MEI',global=monthlyFrame.result.pending.filter(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED'].includes(code)),base=[...(!complete?['VARIANT_CAPTURE_INCOMPLETE']:[]),...(windows.some(row=>row.state==='INVALID')?['VARIANT_CAPTURE_INVALID']:[]),...global],pending=new Set(base),variants=[];
  let total=0n,assigned=0n,strictCount=0;
  for(const product of monthlyFrame.product_summary.products)for(const variant of product.variants){
   const group=groups.get(product.item_id+':'+variant.model_id)||{quantity:0,orders:0,completed:0,ongoing:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0,money:[0n,0n,0n,0n]};
   const amounts=group.money.map(safe);if(amounts.some(v=>v===null)||group.quantity>variant.quantity)return null;
   const production=captured&&variant.unit_cost_cents!==null?safe(BigInt(group.quantity)*BigInt(variant.unit_cost_cents)):null;if(captured&&variant.unit_cost_cents!==null&&production===null)return null;
   const recorded={sales_cents:captured?amounts[0]:null,repass_cents:captured?amounts[1]:null,tax_cents:captured?(mei?0:amounts[2]):null,ads_adjustment_cents:captured?amounts[3]:null,production_cost_cents:production,contribution_cents:null};
   const rowPending=[...base];if(!group.orders)rowPending.push('NO_SINGLE_PAIR_ORDERS');if(group.payment_missing)rowPending.push('PAYMENT_INCOMPLETE');if(group.returns+group.returns_unknown)rowPending.push('RETURNS_NOT_RECONCILED');if(variant.unit_cost_cents===null)rowPending.push('PRODUCTION_COST_INCOMPLETE');
   const coherent=complete&&group.orders>0&&group.payment_missing===0&&group.returns+group.returns_unknown===0&&production!==null;
   if(coherent){recorded.contribution_cents=safe(BigInt(recorded.repass_cents)-BigInt(production)-BigInt(recorded.tax_cents));if(recorded.contribution_cents===null)rowPending.push('ARITHMETIC_UNSAFE');}
   let unique=[...new Set(rowPending)],ready=unique.length===0&&recorded.contribution_cents!==null,margin=ready&&recorded.sales_cents>0?safe(BigInt(recorded.contribution_cents)*10000n/BigInt(recorded.sales_cents)):null;
   if(ready&&recorded.sales_cents>0&&margin===null){unique.push('ARITHMETIC_UNSAFE');ready=false;}
   const strict={state:ready?'AVAILABLE':'BLOCKED',...Object.fromEntries(Object.keys(recorded).map(key=>[key,ready?recorded[key]:null])),margin_bps:margin};
   for(const code of unique)pending.add(code);if(ready)strictCount++;total+=BigInt(variant.quantity);assigned+=BigInt(group.quantity);
   variants.push({item_id:product.item_id,model_id:variant.model_id,total_quantity:variant.quantity,attributed_quantity:group.quantity,unattributed_quantity:variant.quantity-group.quantity,unit_cost_cents:variant.unit_cost_cents,...Object.fromEntries(['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'].map(key=>[key,group[key]])),recorded,strict,pending:unique});
  }
  if(safe(total)===null||safe(assigned)===null)return null;
  const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);variants.sort((a,b)=>compare(a.item_id,b.item_id)||compare(a.model_id,b.model_id));
  const value={schema:'business_month_variant_contributions_v1',month:monthlyFrame.month,start_date:monthlyFrame.start_date,end_date:monthlyFrame.end_date,checked_at,state:complete?'AVAILABLE':captured?'PARTIAL':'NOT_CAPTURED',basis:'SINGLE_PAIR_PAID_ORDERS_CURRENT_REFERENCE_NOT_SETTLED',cost_basis:'CURRENT_REFERENCE_NOT_MANUFACTURING_OR_REUSE_LEDGER',tax_basis:mei?'MONTHLY_DAS_NOT_ALLOCATED':'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX',source:{publication_revision:auditScope.publication_revision,bindings_revision:monthlyFrame.bindings_revision,costs_revision:monthlyFrame.costs_revision,cost_rules_revision:monthlyFrame.cost_rules_revision??null,classification_revision:monthlyFrame.classification_revision??null},windows,coverage:{total_units:Number(total),single_pair_units:Number(assigned),unattributed_units:Number(total-assigned),total_variants:variants.length,strict_variants:strictCount,windows_total:windows.length,windows_captured:captured},variants,pending:[...pending],execution_allowed:false,net_profit_cents:null,safe_price_cents:null};
  return projectBusinessMonthVariantContributions(value,monthlyFrame,auditScope);
 }catch{return null;}
}

export async function readBusinessMonthVariantContributions(env,observed,{now=()=>Date.now()}={}){
 const frame=observed?.display,scope=observed?.audit_scope,frames=observed?.source_frames;
 if(!frame||!scope||!Array.isArray(frames))return null;
 const captures=[];
 try{
  const stamp=Math.floor(now()/1000),db=env?.ADMIN_DB;if(!Number.isSafeInteger(stamp)||stamp<1||frame.checked_at>stamp+60||!db?.prepare)throw Error('CONFIGURATION');
  const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_month_variant_attribution'").first();
  if(exists){
   const rows=(await db.prepare('SELECT run_id,month,source_revision,capture_revision,report_checked_at,report_hash,payload,payload_hash FROM business_month_variant_attribution WHERE month=? AND run_id IN(SELECT value FROM json_each(?))').bind(frame.month,JSON.stringify(scope.sources.map(row=>row.run_id))).all()).results;
   if(!Array.isArray(rows)||rows.length>3)throw Error('ROWS');
   for(const row of rows){
    const source=frames.find(entry=>entry.run_id===row.run_id),invalid=()=>captures.push({run_id:row.run_id,state:'INVALID'});
    try{
     if(!source||row.month!==frame.month||row.source_revision!==source.revision||row.report_checked_at!==source.checked_at||!Number.isSafeInteger(row.capture_revision)||row.capture_revision<1||row.capture_revision>scope.publication_revision||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>524288||typeof row.payload_hash!=='string'||await hash(row.payload)!==row.payload_hash||await hash(JSON.stringify(projectBusinessPeriodFrame(source)))!==row.report_hash)throw Error('BINDING');
     const wrapped=await projectBusinessPeriodVariantsFrame({schema:'finance_business_period_variants_v1',report:source,variant_financials:JSON.parse(row.payload)});if(!wrapped?.variant_financials)throw Error('PAYLOAD');
     captures.push({frame:wrapped.report,variant_financials:wrapped.variant_financials,capture_revision:row.capture_revision});
    }catch{invalid();}
   }
  }
 }catch{captures.length=0;}
 return buildBusinessMonthVariantContributions(frame,scope,frames,captures);
}
