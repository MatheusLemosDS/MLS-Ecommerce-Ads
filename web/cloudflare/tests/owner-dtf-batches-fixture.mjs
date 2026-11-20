import {D1} from './sqlite-d1.mjs';
import {readProductionDtf,syncProductionDtf,prepareProductionDtfBatch} from '../src/production-dtf-store.mjs';
export async function ownerDtfBatchesFixture(count=125,{artwork={art_key:'synthetic-art',sha256:'a'.repeat(64),pixel_width:4000,pixel_height:2000}}={}){
 const env={ADMIN_DB:new D1()},stamp=Date.UTC(2026,10,14,15),now=()=>stamp,calls=[],orders=Array.from({length:count},(_,i)=>({order_id:'SYNTHETIC_DTF_'+(i+1),status:'READY_TO_SHIP',create_time:stamp/1000-3600,update_time:stamp/1000-100,lines:[{line_key:'201:0',item_id:'201',model_id:'0',sku:'synthetic-art-27',quantity:1,model_name:'M'}]}));
 env.ADMIN_DB.db.exec("CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);INSERT INTO variant_bindings_state VALUES(1,1,'[]','2026-11-14T15:00:00Z')");
 const source=async(_,input)=>{calls.push(input);const selected=input.operation==='verify'?orders.filter(o=>input.order_ids.includes(o.order_id)):orders.filter(o=>o.create_time>=Date.parse(input.start_date+'T00:00:00-03:00')/1000&&o.create_time<Date.parse(input.end_date+'T00:00:00-03:00')/1000+86400);return {schema:'production_orders_v1',shop_id:1178167501,checked_at:stamp/1000,start_date:input.operation==='scan'?input.start_date:null,end_date:input.operation==='scan'?input.end_date:null,complete:true,orders:selected};};
 await readProductionDtf(env);await syncProductionDtf(env,source,{now,force:true});const state=await readProductionDtf(env),ids=[];
 for(let i=0;i<count;i++){const id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),line=state.lines.find(l=>l.order_id===orders[i].order_id);await prepareProductionDtfBatch(env,{request_id:id,unit_keys:[line.unit_key],artworks:[artwork]},source,'synthetic-owner',{now});ids.push(id);}
 return {env,now,source,calls,ids,close:()=>env.ADMIN_DB.db.close()};
}
