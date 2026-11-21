import {D1} from './sqlite-d1.mjs';
import {financialDigest} from '../src/financial-event-ledger.mjs';
import {readMaterialNeedsWorkspace,mutateMaterialNeedsWorkspace} from '../src/production-material-workspace.mjs';
import {mutatePhysicalShirtStockWorkspace} from '../src/physical-shirt-stock.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';

export function materialFixture(t){
 const db=new D1();t?.after(()=>db.db.close());let time=Date.parse('2026-11-21T12:00:00.000Z');
 const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'},env={ADMIN_DB:db},options={now:()=>time},planning_date='2026-11-21';
 const f={db,env,scope,options,planning_date,setNow:value=>{time=Date.parse(value);},read:()=>readMaterialNeedsWorkspace(env,{planning_date},options),mutate:body=>mutateMaterialNeedsWorkspace(env,body,'synthetic-owner',options)};
 f.command=(action,selection={},expected_revision=0)=>({action,request_id:crypto.randomUUID(),expected_scope:{...scope},expected_revision,confirmed:true,planning_date,...selection});
 f.seedStock=async({size='M',color='Preto',fit='UNISEX',garment_type='ADULT',material=null,count=10}={})=>{
  const base={request_id:crypto.randomUUID(),confirmed:true,expected_scope:{...scope}},first=await mutatePhysicalShirtStockWorkspace(env,{...base,operation:'register',variant_id:null,expected_revision:0,selection:{garment_type,fit,size,color,material}},'synthetic-owner',options);
  if(count===null)return first.variant;
  const result=await mutatePhysicalShirtStockWorkspace(env,{...base,request_id:crypto.randomUUID(),operation:'initial_count',variant_id:first.variant.variant_id,expected_revision:1,selection:{quantity:count,effective_date:planning_date,evidence:'Contagem inicial sintética explícita',reference:'opening-'+first.variant.variant_id.slice(0,16)}},'synthetic-owner',options);return result.variant;
 };
 f.seedOrder=async({order_id='SYNTHETIC-ORDER-1',item_id='100',model_id='200',quantity=2,sku='ARTE-20',model_name='M / Preto',status='READY_TO_SHIP'}={})=>{
  db.db.exec(`CREATE TABLE IF NOT EXISTS production_dtf_orders(order_id TEXT PRIMARY KEY,status TEXT NOT NULL,create_time INTEGER NOT NULL,update_time INTEGER NOT NULL,checked_at INTEGER NOT NULL,source_hash TEXT NOT NULL);CREATE TABLE IF NOT EXISTS production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,line_key TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,missing INTEGER NOT NULL DEFAULT 0,produced_batch_id TEXT);`);
  const line_key=item_id+':'+model_id,source_key=await financialDigest(JSON.stringify([order_id,line_key])),payload=JSON.stringify({item_id,model_id,sku,quantity,model_name,requires_pair:false}),line_source_hash=await financialDigest(payload),order_source_hash=await financialDigest(['synthetic-order',order_id,status]),stamp=Math.floor(time/1000);
  db.db.prepare('INSERT OR REPLACE INTO production_dtf_orders VALUES(?,?,?,?,?,?)').run(order_id,status,stamp,stamp,stamp,order_source_hash);
  db.db.prepare('INSERT OR REPLACE INTO production_dtf_lines VALUES(?,?,?,?,?,?,0,NULL)').run(source_key,order_id,line_key,payload,line_source_hash,stamp);
  return (await f.read()).orders.find(r=>r.source_key===source_key);
 };
 f.map=async(order,components)=>f.mutate(f.command('save_mapping',{item_id:order.item_id,model_id:order.model_id,components,evidence:'Composição física sintética conferida'}));
 f.reserve=async(source_key)=>{const view=await f.read(),order=view.orders.find(o=>o.source_key===source_key);return f.mutate(f.command('reserve_order',{source_key,source_hash:order.source_hash,fence_hash:view.fence_hash,evidence:'Reserva sintética das peças conferidas'},order.group_revision));};
 f.seedManufacturing=async(order,variant,{quantity=1,produced_date=planning_date}={})=>{
  const before=await readIncurredProduction(env,options),record_id=crypto.randomUUID(),trustedSource={kind:'SAVED_DTF_ORDER_LINE',key:order.source_key,hash:order.source_hash,checked_at:Math.floor(Date.parse(order.source_checked_at)/1000),order_hash:order.order_hash,order_status:order.status,selling_quantity:order.commercial_quantity};
  await mutateIncurredProduction(env,{revision:before.revision,request_id:crypto.randomUUID(),action:'record',record_id,production_ref:'synthetic-manufacture-'+record_id,replaces_record_id:null,produced_date,quantity,identity:{artwork:'Arte sintética',color:variant.identity.color,size:variant.identity.size,garment_type:variant.identity.garment_type,fit:variant.identity.fit,confirmed:true,item_id:order.item_id,model_id:order.model_id,sku:order.sku},source:{kind:'SAVED_DTF_ORDER_LINE',key:order.source_key,hash:order.source_hash},cost:{unit_cost_cents:null,reference:null},evidence:'Fabricação sintética fisicamente confirmada',confirmed:true},'synthetic-owner',{...options,trustedSource});
  return record_id;
 };
 return f;
}
