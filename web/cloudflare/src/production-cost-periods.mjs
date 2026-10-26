import {businessMonth} from './business-month.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {productionCostReference,validateProductionCosts} from './production-costs.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference} from './cost-rules.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {projectProductionOrdersFrame,productionOrdersRequestMatches} from '../../finance/src/production-orders-frame.mjs';

export class ProductionCostPeriodsError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new ProductionCostPeriodsError(code,status);};
export const PRODUCTION_COST_PERIODS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS production_cost_week_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=1048576),source_checked_at INTEGER,lease_token TEXT,lease_until INTEGER,last_error TEXT)`,
 `INSERT OR IGNORE INTO production_cost_week_state(id,revision) VALUES(1,0)`,
 `CREATE TABLE IF NOT EXISTS production_cost_month_quantities(month TEXT PRIMARY KEY NOT NULL,end_date TEXT NOT NULL,source_checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576))`,
];
const ready=new WeakMap(),encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const date=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
// Keep parity with Finance businessSalesStatuses; excluded statuses never gain a price.
const paidStatuses=new Set(['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING']);
const day=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
const safe=value=>value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
function clock(now){let value;try{value=now();}catch{fail('PRODUCTION_COST_PERIODS_CLOCK_INVALID');}if(!int(value,1,9999999999999))fail('PRODUCTION_COST_PERIODS_CLOCK_INVALID');return Math.floor(value/1000);}
function range(stamp){const end=day(stamp),at=new Date(end+'T12:00:00Z'),offset=(at.getUTCDay()+6)%7;at.setUTCDate(at.getUTCDate()-offset);return {start_date:at.toISOString().slice(0,10),end_date:end};}
async function setup(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('PRODUCTION_COST_PERIODS_CONFIGURATION');if(!ready.has(db))ready.set(db,db.batch(PRODUCTION_COST_PERIODS_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('PRODUCTION_COST_PERIODS_STORAGE_UNAVAILABLE');}));await ready.get(db);return db;}
function stored(row,stamp){
 if(!row||!int(row.revision,0,2147483646)||row.lease_token!==null&&(typeof row.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.lease_token))||(row.lease_token===null)!==(row.lease_until===null)||row.lease_until!==null&&!int(row.lease_until,1,9999999999)||row.last_error!==null&&!['SOURCE_UNAVAILABLE','SOURCE_INVALID'].includes(row.last_error))fail('PRODUCTION_COST_PERIODS_STORAGE_INVALID');
 if(row.payload===null){if(row.source_checked_at!==null)fail('PRODUCTION_COST_PERIODS_STORAGE_INVALID');return null;}
 let frame;try{if(typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>1048576)throw Error();frame=projectProductionOrdersFrame(JSON.parse(row.payload));}catch{}
 if(!frame||frame.start_date===null||frame.checked_at!==row.source_checked_at||frame.checked_at>stamp+60)fail('PRODUCTION_COST_PERIODS_STORAGE_INVALID');return frame;
}
function empty(period,start_date,end_date,stamp){return {period,start_date,end_date,state:'UNAVAILABLE',source_start_date:null,source_end_date:null,source_checked_at:null,calculated_at:stamp,production_cost_cents:null,known_production_cost_cents:null,coverage:{orders:0,eligible_orders:0,excluded_cancelled:0,excluded_cancel_pending:0,excluded_unpaid:0,review_orders:0,total_units:null,known_units:null,pending_units:0,pending_variants:0},versions:null,pending:['SOURCE_MISSING'],sync_state:'IDLE',days:[]};}
async function prices(db,items,stamp){
 const grouped=new Map();for(const item of items){const key=item.item_id+':'+item.model_id,old=grouped.get(key);const quantity=(old?.quantity||0)+item.quantity;if(!int(quantity,1))fail('PRODUCTION_COST_PERIODS_ARITHMETIC_UNSAFE');grouped.set(key,{item_id:item.item_id,model_id:item.model_id,quantity});}
 const entries=[...grouped.values()],queries=[db.prepare('SELECT revision,payload FROM variant_bindings_state WHERE id=1'),db.prepare('SELECT revision,payload FROM production_costs_state WHERE id=1')],sections=[];
 for(let index=0;index<Math.max(1,entries.length);index+=1000){const part=entries.slice(index,index+1000),ids=[...new Set(part.map(row=>row.item_id))],rules=costRuleSnapshotQueries(db,ids),classes=catalogClassificationQueries(db,ids,part);sections.push({part,start:queries.length,rules:rules.length,classes:classes.length});queries.push(...rules,...classes);}
 const snapshot=await db.batch(queries),b=snapshot[0]?.results?.[0],c=snapshot[1]?.results?.[0];if(!b||!c||!int(b.revision,1,2147483647)||!int(c.revision,1,2147483647))fail('PRODUCTION_COST_PERIODS_COSTS_UNAVAILABLE');
 const bindings={revision:b.revision,bindings:validateVariantBindings(JSON.parse(b.payload))},costs={revision:c.revision,values:validateProductionCosts(JSON.parse(c.payload))},units=new Map();let versions=null;
 for(const section of sections){const rule=costRuleReferenceFromSnapshot(snapshot.slice(section.start,section.start+section.rules),{now:()=>stamp*1000}),classification=catalogClassificationsFromSnapshot(snapshot.slice(section.start+section.rules,section.start+section.rules+section.classes)),automatic=mergeCatalogCostReference(rule,classification),current={bindings:b.revision,costs:c.revision,cost_rules:rule.revision,classifications:classification.revision};if(versions&&JSON.stringify(versions)!==JSON.stringify(current))fail('PRODUCTION_COST_PERIODS_COSTS_UNAVAILABLE');versions=current;
  const reference=productionCostReference({status:'AVAILABLE',rows:section.part.map(row=>({...row,quantity:1}))},bindings,costs,automatic);for(const row of reference.variants)units.set(row.item_id+':'+row.model_id,row.unit_cost_cents);
 }
 return {units,versions};
}
async function weekly(db,row,stamp){
 const current=range(stamp),result=empty('WEEK',current.start_date,current.end_date,stamp),frame=stored(row,stamp);result.sync_state=row.lease_token&&row.lease_until>stamp?'RUNNING':'IDLE';
 if(!frame||frame.start_date!==current.start_date){if(row.last_error!==null)result.pending.push('SOURCE_UNAVAILABLE');return result;}
 result.source_start_date=frame.start_date;result.source_end_date=frame.end_date;result.source_checked_at=frame.checked_at;result.pending=[];
 if(frame.end_date!==current.end_date)result.pending.push('PERIOD_INCOMPLETE');if(stamp-frame.checked_at>900)result.pending.push('SOURCE_STALE');if(row.last_error!==null)result.pending.push('SOURCE_UNAVAILABLE');
 const coverage=result.coverage,lines=[],days=new Map();let units=0n,missingLines=false;
 const getDay=value=>{if(!days.has(value))days.set(value,{date:value,eligible_orders:0,total_units:0,known_units:0,pending_units:0,known_production_cost_cents:0,production_cost_cents:null,_lines:[],_missing:false});return days.get(value);};
 for(let at=Date.parse(current.start_date+'T12:00:00Z');at<=Date.parse(current.end_date+'T12:00:00Z');at+=86400000)getDay(new Date(at).toISOString().slice(0,10));
 for(const order of frame.orders){coverage.orders++;if(order.status==='CANCELLED'){coverage.excluded_cancelled++;continue;}if(order.status==='IN_CANCEL'){coverage.excluded_cancel_pending++;continue;}if(order.status==='UNPAID'){coverage.excluded_unpaid++;continue;}if(!paidStatuses.has(order.status)){coverage.review_orders++;continue;}
  coverage.eligible_orders++;const slot=getDay(day(order.create_time));slot.eligible_orders++;if(!order.lines.length){missingLines=true;slot._missing=true;continue;}
  for(const line of order.lines){lines.push(line);slot._lines.push(line);units+=BigInt(line.quantity);slot.total_units+=line.quantity;}
 }
 if(coverage.excluded_cancel_pending+coverage.review_orders>0)result.pending.push('STATUS_REVIEW_REQUIRED');if(missingLines)result.pending.push('ORDER_LINES_MISSING');
 coverage.total_units=missingLines?null:safe(units);if(coverage.total_units===null&&!missingLines)result.pending.push('ARITHMETIC_UNSAFE');
 try{
  const reference=await prices(db,lines,stamp);result.versions=reference.versions;let known=0n,knownUnits=0n,pendingUnits=0n;const unmapped=new Set();
  for(const slot of days.values()){let cost=0n,mapped=0n,missing=0n;for(const line of slot._lines){const unit=reference.units.get(line.item_id+':'+line.model_id);if(unit===null||unit===undefined){missing+=BigInt(line.quantity);unmapped.add(line.item_id+':'+line.model_id);}else{cost+=BigInt(unit)*BigInt(line.quantity);mapped+=BigInt(line.quantity);}}
   slot.known_production_cost_cents=safe(cost);slot.known_units=safe(mapped);slot.pending_units=safe(missing);slot.total_units=slot._missing?null:slot.total_units;slot.production_cost_cents=!slot._missing&&missing===0n?slot.known_production_cost_cents:null;known+=cost;knownUnits+=mapped;pendingUnits+=missing;delete slot._lines;delete slot._missing;
  }
  result.known_production_cost_cents=safe(known);coverage.known_units=safe(knownUnits);coverage.pending_units=safe(pendingUnits);coverage.pending_variants=unmapped.size;
  if(coverage.pending_units>0)result.pending.push('PRODUCTION_COST_INCOMPLETE');if([result.known_production_cost_cents,coverage.known_units,coverage.pending_units].some(value=>value===null)){result.pending.push('ARITHMETIC_UNSAFE');if(coverage.pending_units===null)coverage.pending_units=0;}
 }catch(error){result.pending.push(error instanceof ProductionCostPeriodsError&&error.message==='PRODUCTION_COST_PERIODS_ARITHMETIC_UNSAFE'?'ARITHMETIC_UNSAFE':'COSTS_UNAVAILABLE');coverage.known_units=0;coverage.pending_units=safe(units)??0;coverage.pending_variants=new Set(lines.map(line=>line.item_id+':'+line.model_id)).size;for(const slot of days.values()){slot.known_production_cost_cents=null;slot.known_units=0;slot.pending_units=slot._lines.reduce((sum,line)=>sum+line.quantity,0);slot.production_cost_cents=null;delete slot._lines;delete slot._missing;}}
 result.days=[...days.values()];result.pending=[...new Set(result.pending)];result.state=result.pending.length?'PARTIAL':'COMPLETE';result.production_cost_cents=result.state==='COMPLETE'?result.known_production_cost_cents:null;if(result.state!=='COMPLETE')for(const slot of result.days)slot.production_cost_cents=null;return result;
}
const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
function monthQuantities(value,month,stamp){
 if(!exact(value,['schema','start_date','end_date','source_checked_at','coverage','items'])||value.schema!=='production_month_quantities_v1'||value.start_date!==month+'-01'||!date(value.end_date)||value.end_date.slice(0,7)!==month||value.end_date>day(stamp)||!int(value.source_checked_at,1,stamp+60)||!exact(value.coverage,coverageKeys)||!coverageKeys.every(key=>int(value.coverage[key],0,3000))||!Array.isArray(value.items)||value.items.length>3000)return null;
 const c=value.coverage;if(c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)return null;
 const seen=new Set();let quantity=0n;for(const row of value.items){if(!exact(row,['item_id','model_id','quantity'])||typeof row.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(row.item_id)||typeof row.model_id!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(row.model_id)||!int(row.quantity,1)||seen.has(row.item_id+':'+row.model_id))return null;seen.add(row.item_id+':'+row.model_id);quantity+=BigInt(row.quantity);}
 if(safe(quantity)===null||(c.paid===0?value.items.length!==0:quantity<BigInt(c.paid)))return null;return value;
}
async function captureMonth(db,month,stamp){
 let snapshot;try{snapshot=await db.batch([db.prepare('SELECT payload FROM business_month_runs WHERE month=?').bind(month),db.prepare('SELECT slot_index,run_id,revision,payload FROM business_month_frames WHERE month=?').bind(month)]);}catch{return false;}
 const raw=snapshot[0]?.results?.[0]?.payload;if(typeof raw!=='string')return false;
 try{
  const run=JSON.parse(raw);if(!exact(run,['start_date','end_date','slots'])||run.start_date!==month+'-01'||!date(run.end_date)||run.end_date.slice(0,7)!==month||!Array.isArray(run.slots)||run.slots.length<1||run.slots.length>3)return false;
  const frames=[],storedFrames=new Map(snapshot[1].results.map(row=>[row.slot_index,row]));
  for(let index=0;index<run.slots.length;index++){const slot=run.slots[index];if(!exact(slot,['start_date','end_date','frame'])||slot.start_date!==month+'-'+String(index*15+1).padStart(2,'0')||slot.end_date!==month+'-'+String(Math.min(Number(run.end_date.slice(8)),index*15+15)).padStart(2,'0'))return false;
   let value=slot.frame;const reference=value?.schema==='business_month_frame_ref_v1'?value:null;if(reference){if(!exact(reference,['schema','run_id','revision']))return false;const row=storedFrames.get(index);if(!row||row.run_id!==value.run_id||row.revision!==value.revision)return false;value=JSON.parse(row.payload);}
   const frame=projectBusinessPeriodFrame(value);if(!frame||reference&&(frame.run_id!==reference.run_id||frame.revision!==reference.revision)||frame.status!=='COMPLETE'||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+60)return false;frames.push(frame);
  }
  if(frames.length!==Math.ceil(Number(run.end_date.slice(8))/15))return false;
  const items=new Map(),coverage=Object.fromEntries(coverageKeys.map(key=>[key,0]));for(const frame of frames){for(const key of coverageKeys)coverage[key]+=frame.coverage[key];for(const row of frame.items){const key=row.item_id+':'+row.model_id,quantity=(items.get(key)?.quantity||0)+row.quantity;if(!int(quantity,1))return false;items.set(key,{item_id:row.item_id,model_id:row.model_id,quantity});}}
  const value=monthQuantities({schema:'production_month_quantities_v1',start_date:run.start_date,end_date:run.end_date,source_checked_at:Math.min(...frames.map(frame=>frame.source_checked_at?.oldest_at??frame.cutoff_at)),coverage,items:[...items.values()]},month,stamp);if(!value)return false;
  const payload=JSON.stringify(value);if(encoder.encode(payload).byteLength>1048576)return false;
  // Repeated local reads preserve the same cohort without rewriting its row.
  await db.prepare('INSERT INTO production_cost_month_quantities(month,end_date,source_checked_at,payload) VALUES(?,?,?,?) ON CONFLICT(month) DO UPDATE SET end_date=excluded.end_date,source_checked_at=excluded.source_checked_at,payload=excluded.payload WHERE excluded.end_date>=production_cost_month_quantities.end_date AND excluded.source_checked_at>=production_cost_month_quantities.source_checked_at AND (excluded.end_date<>production_cost_month_quantities.end_date OR excluded.source_checked_at<>production_cost_month_quantities.source_checked_at OR excluded.payload<>production_cost_month_quantities.payload)').bind(month,value.end_date,value.source_checked_at,payload).run();return true;
 }catch{return false;}
}
export async function captureProductionCostMonth(env,month,{now=()=>Date.now()}={}){
 const stamp=clock(now);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>day(stamp).slice(0,7))fail('PRODUCTION_COST_PERIODS_REQUEST_INVALID',400);return captureMonth(await setup(env),month,stamp);
}
async function monthly(env,db,month,stamp,now){
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10),result=empty('MONTH',month+'-01',month===day(stamp).slice(0,7)?day(stamp):end,stamp);
 // Save quantities before the normal monthly reader rotates its current-day
 // run. A newly RUNNING frame must never erase a proven prior-day cohort.
 await captureMonth(db,month,stamp);let frame=null;try{frame=await businessMonth(env,{operation:'read',month},{},{now});if(frame.status==='COMPLETE')await captureMonth(db,month,stamp);}catch{}
 const row=await db.prepare('SELECT payload FROM production_cost_month_quantities WHERE month=?').bind(month).first();let saved=null;try{if(row)saved=monthQuantities(JSON.parse(row.payload),month,stamp);}catch{}
 if(row&&!saved)fail('PRODUCTION_COST_PERIODS_STORAGE_INVALID');
 if(!saved){
  if(!frame||frame.source_checked_at?.finance_oldest_at===null)return result;
  result.source_start_date=frame.start_date;result.source_end_date=frame.end_date;result.source_checked_at=frame.source_checked_at?.finance_oldest_at??frame.checked_at;result.known_production_cost_cents=frame.known_production_cost_cents;result.pending=['PERIOD_INCOMPLETE'];result.state='PARTIAL';if(frame.production_cost_cents===null)result.pending.push('PRODUCTION_COST_INCOMPLETE');return result;
 }
 result.source_start_date=saved.start_date;result.source_end_date=saved.end_date;result.source_checked_at=saved.source_checked_at;result.pending=[];
 if(saved.end_date!==result.end_date||frame?.status!=='COMPLETE')result.pending.push('PERIOD_INCOMPLETE');if(stamp-saved.source_checked_at>900)result.pending.push('SOURCE_STALE');const c=saved.coverage;
 const total=safe(saved.items.reduce((sum,row)=>sum+BigInt(row.quantity),0n));result.coverage={orders:c.orders,eligible_orders:c.paid,excluded_cancelled:c.cancelled,excluded_cancel_pending:c.cancel_pending,excluded_unpaid:c.unpaid,review_orders:c.other+c.unknown,total_units:total,known_units:null,pending_units:0,pending_variants:0};
 if(c.cancel_pending+c.other+c.unknown>0)result.pending.push('STATUS_REVIEW_REQUIRED');if(frame?.result.pending.includes('SOURCE_UNAVAILABLE'))result.pending.push('SOURCE_UNAVAILABLE');
 try{const reference=await prices(db,saved.items,stamp);result.versions=reference.versions;let known=0n,knownUnits=0n,pendingUnits=0n,pendingVariants=0;for(const item of saved.items){const unit=reference.units.get(item.item_id+':'+item.model_id);if(unit===null||unit===undefined){pendingUnits+=BigInt(item.quantity);pendingVariants++;}else{known+=BigInt(unit)*BigInt(item.quantity);knownUnits+=BigInt(item.quantity);}}
  result.known_production_cost_cents=safe(known);result.coverage.known_units=safe(knownUnits);result.coverage.pending_units=safe(pendingUnits);result.coverage.pending_variants=pendingVariants;if(pendingUnits>0n)result.pending.push('PRODUCTION_COST_INCOMPLETE');if([total,result.known_production_cost_cents,result.coverage.known_units,result.coverage.pending_units].some(value=>value===null)){result.pending.push('ARITHMETIC_UNSAFE');if(result.coverage.pending_units===null)result.coverage.pending_units=0;}
 }catch{result.pending.push('COSTS_UNAVAILABLE');result.coverage.known_units=0;result.coverage.pending_units=total??0;result.coverage.pending_variants=saved.items.length;}
 result.pending=[...new Set(result.pending)];result.state=result.pending.length?'PARTIAL':'COMPLETE';result.production_cost_cents=result.state==='COMPLETE'?result.known_production_cost_cents:null;return result;
}

async function sync(db,env,getSource,stamp,now){
 const token=crypto.randomUUID(),held=await db.prepare('UPDATE production_cost_week_state SET revision=revision+1,lease_token=?,lease_until=? WHERE id=1 AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?)').bind(token,stamp+120,stamp).run();if(held.meta.changes!==1)return;
 try{
  const selection={operation:'scan',...range(stamp)};let raw;try{if(typeof getSource!=='function')throw Error();raw=await getSource(env,selection);}catch{fail('PRODUCTION_COST_PERIODS_SOURCE_UNAVAILABLE');}
  const frame=projectProductionOrdersFrame(raw),finished=clock(now);if(!frame||!productionOrdersRequestMatches(selection,frame)||frame.checked_at>finished+10||finished-frame.checked_at>120)fail('PRODUCTION_COST_PERIODS_SOURCE_INVALID');
  const before=await db.prepare('SELECT * FROM production_cost_week_state WHERE id=1').first(),old=stored(before,finished);if(old&&old.start_date===frame.start_date&&(frame.checked_at<old.checked_at||frame.orders.some(order=>{const previous=old.orders.find(row=>row.order_id===order.order_id);return previous&&order.update_time<previous.update_time;})))fail('PRODUCTION_COST_PERIODS_SOURCE_INVALID');
  await db.prepare('UPDATE production_cost_week_state SET payload=?,source_checked_at=?,last_error=NULL WHERE id=1 AND lease_token=? AND lease_until>? AND (source_checked_at IS NULL OR source_checked_at<=?)').bind(JSON.stringify(frame),frame.checked_at,token,finished,frame.checked_at).run();
 }catch(error){const code=error instanceof ProductionCostPeriodsError&&error.message==='PRODUCTION_COST_PERIODS_SOURCE_INVALID'?'SOURCE_INVALID':'SOURCE_UNAVAILABLE';await db.prepare('UPDATE production_cost_week_state SET last_error=? WHERE id=1 AND lease_token=?').bind(code,token).run();}
 finally{await db.prepare('UPDATE production_cost_week_state SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(token).run();}
}
export async function productionCostPeriods(env,input,services={},options={}){
 if(!exact(input,['operation','month'])||!['read','sync'].includes(input.operation)||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||input.month<'2000-01'||typeof options.now!=='undefined'&&typeof options.now!=='function')fail('PRODUCTION_COST_PERIODS_REQUEST_INVALID',400);
 const now=options.now||(()=>Date.now()),stamp=clock(now);if(input.month>day(stamp).slice(0,7))fail('PRODUCTION_COST_PERIODS_REQUEST_INVALID',400);const db=await setup(env);if(input.operation==='sync')await sync(db,env,services.getFinanceProductionOrders,stamp,now);
 const completed=clock(now),row=await db.prepare('SELECT * FROM production_cost_week_state WHERE id=1').first();return {schema:'production_cost_periods_v1',reference_month:input.month,checked_at:completed,currency:'BRL',basis:'CURRENT_REGISTERED_COSTS_PAID_CREATE_DATE',weekly:await weekly(db,row,completed),monthly:await monthly(env,db,input.month,completed,now)};
}
