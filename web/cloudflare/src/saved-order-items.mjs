import {orderItems} from './order-items.mjs';

// Repricing a saved quantity never needs a provider request. Store only the
// projected aggregate: no buyer, order serial, address or provider credentials.
export const SAVED_ORDER_ITEMS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS saved_order_items(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),through_at TEXT NOT NULL)`,
];
export class SavedOrderItemsError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const ready=new WeakMap();
async function setup(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)throw new SavedOrderItemsError('SAVED_ITEMS_CONFIGURATION');if(!ready.has(db))ready.set(db,db.batch(SAVED_ORDER_ITEMS_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);throw new SavedOrderItemsError('SAVED_ITEMS_STORAGE_UNAVAILABLE');}));await ready.get(db);return db;}
export async function saveOrderItemsSnapshot(env,value,{now=()=>Date.now()}={}){
 const frame=orderItems(value,new Date(now()));if(frame.status!=='AVAILABLE')return false;
 const db=await setup(env),payload=JSON.stringify(frame);if(new TextEncoder().encode(payload).byteLength>1048576)throw new SavedOrderItemsError('SAVED_ITEMS_STORAGE_INVALID');
 const result=await db.prepare('INSERT INTO saved_order_items(id,payload,through_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,through_at=excluded.through_at WHERE julianday(saved_order_items.through_at)<=julianday(excluded.through_at)').bind(payload,frame.through_at).run();
 return result.meta.changes===1;
}
export async function readOrderItemsSnapshot(env,{now=()=>Date.now()}={}){
 const stamp=now();if(!Number.isSafeInteger(stamp)||stamp<1)throw new SavedOrderItemsError('SAVED_ITEMS_CLOCK_INVALID');
 const db=await setup(env),row=await db.prepare('SELECT payload,through_at FROM saved_order_items WHERE id=1').first();
 if(!row)return {...orderItems(null,new Date(stamp)),source_mode:'SAVED',saved_at:null};
 let frame;try{if(typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>1048576||typeof row.through_at!=='string'||!Number.isFinite(Date.parse(row.through_at))||Date.parse(row.through_at)>stamp+60000)throw Error();frame=orderItems(JSON.parse(row.payload),new Date(row.through_at));if(frame.status!=='AVAILABLE'||frame.through_at!==row.through_at)throw Error();}catch{throw new SavedOrderItemsError('SAVED_ITEMS_STORAGE_INVALID');}
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp));
 return {...frame,snapshot_age_seconds:Math.max(0,Math.floor((stamp-Date.parse(row.through_at))/1000)),source_mode:'SAVED',saved_at:row.through_at,previous_day:frame.date!==today};
}
