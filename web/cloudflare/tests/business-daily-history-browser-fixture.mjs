import {COST_DEFAULTS} from '../src/production-costs.mjs';

// Explicit synthetic pre-sale facts for browser scenarios: each sold fixture
// identity was manually confirmed as one P garment, and its declared cost was
// R$15.90 before this month. These prices do not derive from a current subtotal.
// Each invocation resets an independent synthetic scenario, never a real store.
export function installSyntheticPreSaleCostHistory(f,{knownBindings=true}={}){
 const db=f.env.ADMIN_DB.db,at='2026-09-01T12:00:00.000Z',actor='synthetic-pre-sale-owner';
 const snapshots=[['production_costs',JSON.stringify(COST_DEFAULTS)],['production_cost_rules',JSON.stringify({rules:[]})],['variant_bindings',JSON.stringify(knownBindings?Array.from({length:120},(_,index)=>({item_id:String(f.item(index)),model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true})):[])]];
 for(const [prefix,payload]of snapshots){db.prepare('DELETE FROM '+prefix+'_audit').run();db.prepare('UPDATE '+prefix+'_state SET revision=1,payload=?,updated_at=? WHERE id=1').run(payload,at);db.prepare('INSERT INTO '+prefix+'_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(payload,actor,at);}
}
