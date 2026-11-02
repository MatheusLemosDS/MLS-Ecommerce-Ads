import {readPhysicalReturnsOriginalItemsWorkspace} from './physical-returns-workspace.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {validateProductionCosts,productionCostReference} from './production-costs.mjs';
import {validateCostRules,evaluateCostRules,mergeCatalogCostReference} from './cost-rules.mjs';
import {parseDtfSku} from './dtf-layout.mjs';
import {readSavedCatalogMedia} from './saved-catalog-media.mjs';

export class ReturnReceiptError extends Error{constructor(code,status=400){super(code);this.status=status;}}
const fail=(code,status=400)=>{throw new ReturnReceiptError('RETURN_RECEIPT_'+code,status);};
const encoder=new TextEncoder(),hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const norm=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
const safeText=(value,max=120)=>typeof value==='string'&&value.trim().length>0&&value.trim().normalize('NFC').length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)?value.trim().normalize('NFC'):null;
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));

// This closed browser DTO contains no provider serials or mutable ledger facts.
export function projectReturnsReceiptWorkspace(value,projectPhysicalOriginal,projectPhysicalWorkspace,projectBusinessOriginal,projectBusiness,projectFrame,projectOriginal){
 try{
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const list=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(rows,String(i))||{},'value')).every(Boolean);
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
  const hash=row=>typeof row==='string'&&/^[a-f0-9]{64}$/.test(row),id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
  const text=(row,max)=>typeof row==='string'&&row.length>0&&row.length<=max&&row.trim()===row&&row.normalize('NFC')===row&&!/[\u0000-\u001f\u007f-\u009f]/.test(row),money=row=>row===null||int(row);
  if(!exact(value,['schema','month','checked_at','physical_revision','workspace','cards','truncated'])||value.schema!=='returns_receipt_workspace_v1'||!int(value.checked_at,1,9999999999)||!int(value.physical_revision,0,2147483645)||typeof value.truncated!=='boolean'||!list(value.cards,120)||typeof projectPhysicalOriginal!=='function')return null;
  const workspace=projectPhysicalOriginal(value.workspace,projectPhysicalWorkspace,projectBusinessOriginal,projectBusiness,projectFrame,projectOriginal);if(!workspace||workspace.report.month!==value.month||workspace.report.physical.revision!==value.physical_revision||workspace.report.checked_at>value.checked_at)return null;
  const codes=['REQUEST_ITEMS_NOT_CAPTURED','CATALOG_NOT_CAPTURED','CATALOG_CHANGED','COMPOSITION_REQUIRED','IDENTITY_REQUIRED','QUANTITY_CONFLICT','EXISTING_RECEIPT','DTF_CONFLICT','ARITHMETIC_UNSAFE','SOURCE_UNAVAILABLE'],seen=new Set(),cards=[];
  if(value.cards.length!==workspace.report.source.cases.length)return null;
  for(const card of value.cards){
   if(!exact(card,['case_hash','order_hash','source_status','source_checked_at','receipt_state','data_state','pending','proposal_hash','can_confirm','requested_refund_cents','items','confirmed_at'])||!hash(card.case_hash)||seen.has(card.case_hash)||!hash(card.order_hash)||!hash(card.proposal_hash)||!['WAITING','RECEIVED','PROBLEM'].includes(card.receipt_state)||!['READY','REVIEW_REQUIRED','NOT_CAPTURED'].includes(card.data_state)||!list(card.pending,codes.length)||new Set(card.pending).size!==card.pending.length||!card.pending.every(code=>codes.includes(code))||typeof card.can_confirm!=='boolean'||!money(card.requested_refund_cents)||!list(card.items,1000)||card.confirmed_at!==null&&!int(card.confirmed_at,1,value.checked_at))return null;
   const source=workspace.report.source.cases.find(row=>row.case_hash===card.case_hash);if(!source||source.order_hash!==card.order_hash||source.status!==card.source_status||source.checked_at!==card.source_checked_at||card.can_confirm!==(card.data_state==='READY'&&card.receipt_state==='WAITING')||card.data_state==='READY'&&card.pending.length||card.data_state==='READY'&&!card.items.length)return null;
   const record=workspace.report.physical.cases.find(row=>row.case_hash===card.case_hash),active=record?.lines.filter(row=>row.status!=='VOID')??[],state=active.length?(active.every(row=>row.status==='INSPECTED'&&row.partition.resellable===row.quantity)?'RECEIVED':'PROBLEM'):'WAITING';
   if(card.receipt_state!==state||card.confirmed_at!==(active.length?Math.max(...active.map(row=>row.updated_at)):null)||card.pending.includes('EXISTING_RECEIPT')!==(active.length>0)||card.data_state!==(card.pending.includes('REQUEST_ITEMS_NOT_CAPTURED')?'NOT_CAPTURED':card.pending.length?'REVIEW_REQUIRED':'READY'))return null;
   const pairs=new Set();for(const item of card.items){
    if(!exact(item,['item_id','model_id','requested_quantity','ordered_quantity','product_name','model_name','selling_unit','components','unit_cost_cents','current_cost_cents','image_url','artwork'])||!id(item.item_id)||!id(item.model_id,true)||pairs.has(item.item_id+':'+item.model_id)||!int(item.requested_quantity,1,1000000000000)||item.ordered_quantity!==null&&!int(item.ordered_quantity,1,1000000000000)||!text(item.product_name,512)||!text(item.model_name,512)||!['SINGLE_GARMENT','ONE_MALE_ONE_FEMALE_KIT','UNKNOWN'].includes(item.selling_unit)||!list(item.components,2)||!money(item.unit_cost_cents)||!money(item.current_cost_cents))return null;
    pairs.add(item.item_id+':'+item.model_id);if(item.unit_cost_cents!==null&&(BigInt(item.unit_cost_cents)*BigInt(item.requested_quantity)>BigInt(Number.MAX_SAFE_INTEGER)||item.current_cost_cents!==Number(BigInt(item.unit_cost_cents)*BigInt(item.requested_quantity)))||item.unit_cost_cents===null&&item.current_cost_cents!==null)return null;
    if(item.image_url!==null){try{const url=new URL(item.image_url);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.href!==item.image_url||!(/^down(?:-[a-z0-9]+)*\.img\.susercontent\.com$/.test(url.hostname)||['cf.shopee.com.br','cf.shopee.com'].includes(url.hostname))||!url.pathname.startsWith('/file/'))return null;}catch{return null;}}
    if(item.artwork!==null&&(!exact(item.artwork,['art_key','sha256'])||!text(item.artwork.art_key,120)||item.artwork.sha256!==null&&!hash(item.artwork.sha256)))return null;
    for(const component of item.components)if(!exact(component,['artwork','color','size','garment_type','fit','item_id','model_id','sku','quantity'])||!text(component.artwork,120)||!text(component.color,80)||!text(component.size,16)||!['ADULT','CHILD'].includes(component.garment_type)||!['UNISEX','MALE','FEMALE'].includes(component.fit)||component.item_id!==item.item_id||component.model_id!==item.model_id||component.sku!==null&&!text(component.sku,128)||!int(component.quantity,1,10000)||component.quantity!==item.requested_quantity||(component.garment_type==='ADULT'?!['P','M','G','GG','G1','G2','G3'].includes(component.size):!['2','4','6','8','10','12','14','16'].includes(component.size)))return null;
    if(card.data_state==='READY'&&(item.components.length!==(item.selling_unit==='SINGLE_GARMENT'?1:item.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'?2:0)||item.selling_unit==='UNKNOWN'||item.ordered_quantity===null||item.requested_quantity>item.ordered_quantity||item.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'&&(!item.components.every(row=>row.garment_type==='ADULT')||item.components[0].fit!=='MALE'||item.components[1].fit!=='FEMALE')))return null;
   }
   seen.add(card.case_hash);cards.push(JSON.parse(JSON.stringify(card)));
  }
  const result={schema:value.schema,month:value.month,checked_at:value.checked_at,physical_revision:value.physical_revision,workspace,cards,truncated:value.truncated};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=2097152?result:null;
 }catch{return null;}
}

async function matchingData(env,ids,pairs,now){
 const db=env.ADMIN_DB,names=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(row=>row.name)),guards=[],addGuard=(sql,args,item_id=null)=>guards.push({sql,args,item_id});
 // Each proof uses the exact bytes that produced the proposal, including
 // absence. A single JSON binding per scoped table keeps D1's parameter limit
 // independent of the number of variants. These private values never enter
 // the response or audit payload.
 const rowsGuard=(table,columns,rows,item_id=null,where=null,extra={})=>{
  const scope=where??(item_id===null?'1':"x.item_id=json_extract(s.value,'$.item_id')"),match=columns.map(column=>"x."+column+" IS json_extract(r.value,'$."+column+"')").join(' AND '),snapshot=JSON.stringify([{item_id,rows,...extra}]);
  addGuard("NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE (SELECT COUNT(*) FROM "+table+" x WHERE "+scope+")<>json_array_length(s.value,'$.rows') OR EXISTS(SELECT 1 FROM json_each(s.value,'$.rows') r WHERE NOT EXISTS(SELECT 1 FROM "+table+" x WHERE "+match+')))',[snapshot],item_id);
 };
 let classification={revision:1,bindings:[],products:[],variants:[]},bindings={revision:1,bindings:[]},costs=null,rules=null,catalogs=[];
 if(['catalog_classification_state','catalog_classification_jobs','catalog_classification_variants','catalog_classification_changes'].every(name=>names.has(name))){try{
  const snapshot=await db.batch(catalogClassificationQueries(db,ids,pairs));classification=catalogClassificationsFromSnapshot(snapshot);
  const raw=snapshot.slice(1).flatMap(row=>row.results??[]);
  for(const item_id of ids){
   rowsGuard('catalog_classification_jobs',['item_id','status','product_name','reason','checked_at','catalog_fingerprint','source_hash','model_count','resolved_count'],raw.filter(row=>row.item_id===item_id&&Object.hasOwn(row,'status')),item_id);
   rowsGuard('catalog_classification_variants',['item_id','model_id','payload'],raw.filter(row=>row.item_id===item_id&&Object.hasOwn(row,'payload')),item_id,"x.item_id=json_extract(s.value,'$.item_id') AND x.model_id IN(SELECT value FROM json_each(s.value,'$.model_ids'))",{model_ids:pairs.filter(row=>row.item_id===item_id).map(row=>row.model_id)});
   rowsGuard('catalog_classification_changes',['item_id','change_token','changed_at'],raw.filter(row=>row.item_id===item_id&&Object.hasOwn(row,'changed_at')),item_id);
  }
 }catch{}}
 for(const table of ['variant_bindings_state','production_costs_state','production_cost_rules_state']){
  if(!names.has(table)){addGuard("NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?)",[table]);continue;}
  try{const row=await db.prepare('SELECT revision,payload FROM '+table+' WHERE id=1').first();if(!row){addGuard('NOT EXISTS(SELECT 1 FROM '+table+' WHERE id=1)',[]);continue;}addGuard('EXISTS(SELECT 1 FROM '+table+' WHERE id=1 AND revision=? AND payload=?)',[row.revision,row.payload]);if(table==='variant_bindings_state')bindings={revision:row.revision,bindings:validateVariantBindings(JSON.parse(row.payload))};else if(table==='production_costs_state')costs={revision:row.revision,values:validateProductionCosts(JSON.parse(row.payload))};else rules={revision:row.revision,values:validateCostRules(JSON.parse(row.payload))};}catch{addGuard('0',[]);}
 }
 if(names.has('production_cost_catalog')&&ids.length){try{catalogs=(await db.prepare('SELECT item_id,catalog_fingerprint,payload,checked_at FROM production_cost_catalog WHERE item_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()).results;for(const item_id of ids)rowsGuard('production_cost_catalog',['item_id','catalog_fingerprint','payload','checked_at'],catalogs.filter(row=>row.item_id===item_id),item_id);}catch{addGuard('0',[]);}}
 const automatic=[];if(rules)for(const row of catalogs)try{const product=classification.products.find(value=>value.item_id===row.item_id);if(product?.catalog_fingerprint===row.catalog_fingerprint&&product.checked_at===row.checked_at&&product.reason!=='CATALOG_METADATA_CHANGED')automatic.push(...evaluateCostRules(rules.values,row.item_id,JSON.parse(row.payload)));}catch{}
 const reference=mergeCatalogCostReference({revision:rules?.revision??1,variants:automatic,restricted_item_ids:[],learning:[]},classification);
 const dtf=[];let dtfIncomplete=false;if(names.has('production_dtf_lines')){try{const rows=(await db.prepare("SELECT unit_key,order_id,payload,source_hash,produced_batch_id,missing FROM production_dtf_lines WHERE json_extract(payload,'$.item_id') IN(SELECT value FROM json_each(?)) LIMIT 1001").bind(JSON.stringify(ids)).all()).results;if(rows.length<=1000){rowsGuard('production_dtf_lines',['unit_key','order_id','payload','source_hash','produced_batch_id','missing'],rows,null,"json_extract(x.payload,'$.item_id') IN(SELECT value FROM json_each(s.value,'$.item_ids'))",{item_ids:ids});for(const row of rows){try{const data=JSON.parse(row.payload);if(row.missing===0&&row.source_hash===await hash(row.payload))dtf.push({...row,...data,order_hash:await hash(row.order_id)});}catch{}}}else{dtfIncomplete=true;addGuard('0',[]);}}catch{dtfIncomplete=true;addGuard('0',[]);}}else addGuard("NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='production_dtf_lines')",[]);
 let media={products:[]};try{
  const rows=names.has('catalog_product_media')?(await db.prepare('SELECT item_id,catalog_fingerprint,checked_at,payload,payload_hash FROM catalog_product_media WHERE item_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()).results:[];
  if(names.has('catalog_product_media'))for(const item_id of ids)rowsGuard('catalog_product_media',['item_id','catalog_fingerprint','checked_at','payload','payload_hash'],rows.filter(row=>row.item_id===item_id),item_id);else addGuard("NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_product_media')",[]);
  media=await readSavedCatalogMedia(env,ids,{now});
  // The optional reader uses its own snapshot. Only show the photo if that
  // observation matches the bytes fenced above.
  media.products=media.products.map(entry=>{const raw=rows.find(row=>row.item_id===entry.item_id);let photo=null;try{photo=JSON.parse(raw?.payload);}catch{}return photo&&photo.image_url===entry.image_url&&raw.checked_at===entry.source_checked_at&&raw.catalog_fingerprint===entry.catalog_fingerprint?entry:{...entry,state:'NOT_CAPTURED',image_url:null};});
 }catch{addGuard('0',[]);}
 return {classification,bindings,costs,reference,dtf,dtfIncomplete,media,guards};
}
function colorFor(name,attributes){const exact=attributes.filter(row=>['cor','color','colour'].includes(norm(row.name)));if(exact.length===1)return safeText(exact[0].value,80);if(exact.length)return null;const colors=[...new Set((norm(name).match(/\b(preto|preta|branco|branca|amarelo|amarela|verde|azul|vermelho|vermelha|rosa|roxo|roxa|cinza|bege|marrom|laranja)\b/g)||[]))];return colors.length===1?colors[0]:null;}
function componentsFor(item,product,variant,binding,sku){
 const attrs=variant?.attributes??[],color=colorFor(product?.product_name,attrs),title=norm(product?.product_name),artwork=safeText(sku?.art_key??'Produto #'+item.item_id),common={artwork,color,item_id:item.item_id,model_id:item.model_id,sku:sku?.sku??null,quantity:item.quantity};
 if(!artwork||!color||!int(item.quantity,1,10000)||product?.reason==='CATALOG_METADATA_CHANGED'||variant?.reason==='CATALOG_METADATA_CHANGED')return {selling_unit:'UNKNOWN',components:[]};
 if(binding?.selling_unit==='ONE_MALE_ONE_FEMALE_KIT')return {selling_unit:binding.selling_unit,components:[{...common,size:binding.male_size,garment_type:'ADULT',fit:'MALE'},{...common,size:binding.female_size,garment_type:'ADULT',fit:'FEMALE'}]};
 const sizes=attrs.filter(row=>['tamanho','tamanho infantil','tamanho da crianca','tam','size'].includes(norm(row.name))),child=/\b(infantil|kids|crianca)\b/.test(title),size=child&&sizes.length===1?sizes[0].value.trim():binding?.selling_unit==='SINGLE_GARMENT'?binding.size:null;
 const fit=/\b(unissex|unisex)\b/.test(title)||child&&/\bmenino\b/.test(title)&&/\bmenina\b/.test(title)?'UNISEX':/\b(feminina|feminino|mulher|menina)\b/.test(title)?'FEMALE':/\b(masculina|masculino|homem|menino)\b/.test(title)?'MALE':null;
 if(!size||!fit||(child?!['2','4','6','8','10','12','14','16'].includes(size):!['P','M','G','GG','G1','G2','G3'].includes(size)))return {selling_unit:'UNKNOWN',components:[]};
 return {selling_unit:'SINGLE_GARMENT',components:[{...common,size,garment_type:child?'CHILD':'ADULT',fit}]};
}

export async function readReturnReceiptContext(env,input,{now=()=>Date.now()}={}){
 const stamp=Math.floor(now()/1000);if(!int(stamp,1,9999999999))fail('CLOCK_INVALID',503);
 const workspace=await readPhysicalReturnsOriginalItemsWorkspace(env,input,{now:()=>stamp*1000}),source=workspace.report.source,physical=workspace.report.physical,original=workspace.original_items;
 const requested=(original?.original_items??[]).flatMap(frame=>frame.cases.flatMap(row=>row.items)),ids=[...new Set(requested.map(item=>item.item_id))].slice(0,90),pairs=[...new Map(requested.filter(row=>ids.includes(row.item_id)).map(row=>[row.item_id+':'+row.model_id,{item_id:row.item_id,model_id:row.model_id}])).values()],data=await matchingData(env,ids,pairs,()=>stamp*1000),cards=[],plans=new Map(),bindingMap=new Map(data.classification.bindings.map(row=>[row.item_id+':'+row.model_id,row]));
 let publication=null,legacyRows=[],itemRows=[];try{publication=await env.ADMIN_DB.prepare('SELECT source_revision,write_token,payload FROM business_month_publications WHERE month=?').bind(input.month).first();const runIds=(original?.report.reports??[]).map(row=>row.run_id);if(runIds.length){legacyRows=(await env.ADMIN_DB.prepare('SELECT run_id,source_revision,checked_at,payload FROM business_reconciliation_reports WHERE run_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(runIds)).all()).results;try{itemRows=(await env.ADMIN_DB.prepare('SELECT run_id,source_revision,publication_revision,report_checked_at,report_hash,payload,payload_hash FROM business_reconciliation_original_items WHERE run_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(runIds)).all()).results;}catch{}}}catch{}
 for(const row of data.bindings.bindings)if(row.operator_confirmed||!bindingMap.has(row.item_id+':'+row.model_id))bindingMap.set(row.item_id+':'+row.model_id,row);
 for(const selected of source.cases){
  const pending=[],record=physical.cases.find(row=>row.case_hash===selected.case_hash),active=record?.lines.filter(row=>row.status!=='VOID')??[],receipt_state=active.length?(active.every(row=>row.status==='INSPECTED'&&row.partition.resellable===row.quantity)?'RECEIVED':'PROBLEM'):'WAITING';
  const legacy=original?.report.reports.find(row=>row.cases.some(item=>item.case_hash===selected.case_hash)),evidence=original?.original_items.find(row=>row.run_id===legacy?.run_id),returned=evidence?.cases.find(row=>row.case_hash===selected.case_hash),order=evidence?.orders.find(row=>row.order_hash===selected.order_hash),items=[];
  if(returned?.state!=='AVAILABLE')pending.push('REQUEST_ITEMS_NOT_CAPTURED');if(active.length)pending.push('EXISTING_RECEIPT');if(data.dtfIncomplete)pending.push('DTF_CONFLICT');if(data.guards.some(row=>row.sql==='0'))pending.push('SOURCE_UNAVAILABLE');
  for(const requested of returned?.state==='AVAILABLE'?returned.items:[]){
   const product=data.classification.products.find(row=>row.item_id===requested.item_id),variant=data.classification.variants.find(row=>row.item_id===requested.item_id&&row.model_id===requested.model_id),binding=bindingMap.get(requested.item_id+':'+requested.model_id),ordered=order?.state==='AVAILABLE'?order.items.find(row=>row.item_id===requested.item_id&&row.model_id===requested.model_id)?.quantity??null:null;
   if(!product||!variant)pending.push('CATALOG_NOT_CAPTURED');if(product?.reason==='CATALOG_METADATA_CHANGED')pending.push('CATALOG_CHANGED');if(ordered===null||requested.quantity>ordered)pending.push('QUANTITY_CONFLICT');
   const matches=data.dtf.filter(row=>row.order_hash===selected.order_hash&&row.item_id===requested.item_id&&row.model_id===requested.model_id),skus=[...new Set(matches.map(row=>row.sku))];let artwork=null,sku=null;
   if(skus.length>1)pending.push('DTF_CONFLICT');else if(skus.length===1){try{const parts=parseDtfSku(skus[0]),art=parts.length===1?safeText(parts[0].art_key,120):null,savedSku=safeText(skus[0],128);if(!savedSku||parts.length===1&&!art)throw Error();if(art)artwork={art_key:art,sha256:null};sku={sku:savedSku,art_key:art??(parts.length?'Produto #'+requested.item_id:'Sem estampa')};}catch{pending.push('DTF_CONFLICT');}}
   const composition=componentsFor(requested,product,variant,binding,sku);if(!composition.components.length)pending.push('IDENTITY_REQUIRED');
   let unit=null,total=null;try{if(data.costs){const result=productionCostReference({status:'AVAILABLE',rows:[requested]},data.bindings,data.costs,data.reference).variants[0];unit=result.unit_cost_cents;total=result.production_cost_cents;}}catch{}
   const pieces=composition.components.reduce((n,row)=>n+row.quantity,0);if(pieces>10000||items.reduce((n,row)=>n+row.components.length,0)+composition.components.length>50)pending.push('ARITHMETIC_UNSAFE');
   if(ordered!==null){const previous=physical.cases.filter(row=>row.order_hash===selected.order_hash&&row.case_hash!==selected.case_hash).flatMap(row=>row.lines).filter(row=>row.status!=='VOID'),unidentified=previous.some(row=>row.identity.item_id===null||row.identity.item_id===requested.item_id&&row.identity.model_id===null),used=previous.filter(row=>row.identity.item_id===requested.item_id&&row.identity.model_id===requested.model_id).reduce((n,row)=>n+row.quantity,0);if(unidentified||BigInt(used)+BigInt(pieces)>BigInt(ordered)*BigInt(composition.components.length||1))pending.push('QUANTITY_CONFLICT');}
   items.push({item_id:requested.item_id,model_id:requested.model_id,requested_quantity:requested.quantity,ordered_quantity:ordered,product_name:safeText(product?.product_name,512)??'Produto #'+requested.item_id,model_name:safeText(variant?.model_name,512)??'Variação #'+requested.model_id,...composition,unit_cost_cents:unit,current_cost_cents:total,image_url:data.media.products.find(row=>row.item_id===requested.item_id)?.image_url??null,artwork});
  }
  if(items.length>10)pending.push('COMPOSITION_REQUIRED');
  const unique=[...new Set(pending)],data_state=unique.includes('REQUEST_ITEMS_NOT_CAPTURED')?'NOT_CAPTURED':unique.length?'REVIEW_REQUIRED':'READY',requested_refund_cents=legacy?.cases.find(row=>row.case_hash===selected.case_hash)?.requested_refund_cents??null;
  const card={case_hash:selected.case_hash,order_hash:selected.order_hash,source_status:selected.status,source_checked_at:selected.checked_at,receipt_state,data_state,pending:unique,proposal_hash:null,can_confirm:data_state==='READY'&&receipt_state==='WAITING',requested_refund_cents,items,confirmed_at:active.length?Math.max(...active.map(row=>row.updated_at)):null};
  const proposal_hash=await hash(JSON.stringify({selected,original:evidence??null,items,requested_refund_cents,physical_revision:physical.revision}));card.proposal_hash=proposal_hash;cards.push(card);
  const sourceCase={...selected,month:input.month},financial=[];
  let publicationMatches=false;try{const expected={start_date:original.report.start_date,end_date:original.report.end_date,slots:original.report.sources.map(row=>({start_date:row.start_date,end_date:row.end_date,frame:{schema:'business_month_publication_frame_ref_v1',run_id:row.run_id,revision:row.source_revision}}))};publicationMatches=publication.source_revision===selected.publication_revision&&publication.source_revision===original.report.source_revision&&same(JSON.parse(publication.payload),expected);}catch{}
  if(publicationMatches)financial.push({sql:'EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=? AND payload=?)',args:[input.month,publication.source_revision,publication.write_token,publication.payload]});else financial.push({sql:'0',args:[]});
  // The raw fence read happens after the parsed workspace read. Prove they
  // are the same observation; otherwise a concurrent collector could fence B
  // while the owner was shown A.
  const saved=legacyRows.find(row=>row.run_id===legacy?.run_id);let savedMatches=false;try{const raw=JSON.parse(saved.payload);savedMatches=saved.source_revision===legacy.source_revision&&saved.checked_at===legacy.checked_at&&same(raw.schema==='finance_reconciliation_v1'?raw:raw.report,legacy);}catch{}
  if(savedMatches)financial.push({sql:'EXISTS(SELECT 1 FROM business_reconciliation_reports WHERE run_id=? AND source_revision=? AND checked_at=? AND payload=?)',args:[saved.run_id,saved.source_revision,saved.checked_at,saved.payload]});
  else financial.push({sql:'0',args:[]});
  const captured=itemRows.find(row=>row.run_id===legacy?.run_id);if(evidence){let capturedMatches=false;try{capturedMatches=captured.source_revision===evidence.source_revision&&captured.report_checked_at===legacy.checked_at&&int(captured.publication_revision,1,selected.publication_revision)&&captured.report_hash===await hash(saved.payload)&&captured.payload_hash===await hash(captured.payload)&&same(JSON.parse(captured.payload),evidence);}catch{}if(!capturedMatches)fail('CHANGED',409);financial.push({sql:'EXISTS(SELECT 1 FROM business_reconciliation_original_items WHERE run_id=? AND source_revision=? AND publication_revision=? AND report_checked_at=? AND report_hash=? AND payload=? AND payload_hash=?)',args:[captured.run_id,captured.source_revision,captured.publication_revision,captured.report_checked_at,captured.report_hash,captured.payload,captured.payload_hash]});}
  if(legacy&&(!publicationMatches||!savedMatches))fail('CHANGED',409);
  const cardIds=new Set(items.map(row=>row.item_id)),conditions=[...financial,...data.guards.filter(row=>row.item_id===null||cardIds.has(row.item_id))],guard=rows=>({sql:rows.map(row=>'('+row.sql+')').join(' AND '),args:rows.flatMap(row=>row.args)});
  plans.set(selected.case_hash,{card,sourceCase,sourceGuard:guard(conditions),problemGuard:guard(financial)});
 }
 const result={schema:'returns_receipt_workspace_v1',month:input.month,checked_at:Math.max(stamp,workspace.report.checked_at),physical_revision:physical.revision,workspace,cards,truncated:source.truncated};
 if(encoder.encode(JSON.stringify(result)).byteLength>2097152)fail('LIMIT',503);return {workspace:result,plans};
}
export async function readReturnsReceiptWorkspace(env,input,options={}){return (await readReturnReceiptContext(env,input,options)).workspace;}
