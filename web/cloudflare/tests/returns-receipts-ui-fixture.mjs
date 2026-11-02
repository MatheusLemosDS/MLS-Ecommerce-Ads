import assert from 'node:assert/strict';
import {returnsOriginalItemsUIFixture} from './returns-original-items-ui-fixture.mjs';
import {projectReturnsReceiptWorkspace} from '../src/returns-receipt-proposal.mjs';
import {projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {projectPhysicalReturnsOriginalItemsWorkspace,projectBusinessOriginalItems} from '../src/business-original-items.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectOriginalItemsFrame} from '../../finance/src/original-items-frame.mjs';

export const checkedReceiptFixture=value=>projectReturnsReceiptWorkspace(value,projectPhysicalReturnsOriginalItemsWorkspace,projectPhysicalReturnsWorkspace,projectBusinessOriginalItems,projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame);

// Synthetic saved evidence, not an owner operation or a provider response.
export function returnsReceiptsUIFixture({withPhoto=false}={}){
 const workspace=returnsOriginalItemsUIFixture(),at=workspace.report.checked_at;
 Object.assign(workspace.report.physical,{revision:0,cases:[],summary:{cases:0,lines:0,received_quantity:0,active_quantity:0,voided_quantity:0,resellable_quantity:0,repair_quantity:0,damaged_quantity:0,mismatch_quantity:0,quarantine_quantity:0,physically_available_quantity:0}});
 const report=workspace.original_items.report.reports[0];
 const cards=workspace.report.source.cases.map((source,index)=>{
  const requested=workspace.original_items.original_items[0].cases.find(row=>row.case_hash===source.case_hash),order=workspace.original_items.original_items[0].orders.find(row=>row.order_hash===source.order_hash),items=[];
  if(requested.state==='AVAILABLE')for(const row of requested.items){
   const paired=index===1,component=(fit,size)=>({artwork:'Universo',color:'Verde',size,garment_type:'ADULT',fit,item_id:row.item_id,model_id:row.model_id,sku:null,quantity:row.quantity});
   items.push({item_id:row.item_id,model_id:row.model_id,requested_quantity:row.quantity,ordered_quantity:order.items.find(item=>item.item_id===row.item_id)?.quantity??null,product_name:paired?'Kit Universo sintético':'Camiseta Universo sintética',model_name:paired?'Masculina M / Feminina G':'Verde / M',selling_unit:paired?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT',components:paired?[component('MALE','M'),component('FEMALE','G')]:[component('UNISEX','M')],unit_cost_cents:paired?3180:1590,current_cost_cents:(paired?3180:1590)*row.quantity,image_url:null,artwork:null});
  }
  return {case_hash:source.case_hash,order_hash:source.order_hash,source_status:source.status,source_checked_at:source.checked_at,receipt_state:'WAITING',data_state:items.length?'READY':'NOT_CAPTURED',pending:items.length?[]:['REQUEST_ITEMS_NOT_CAPTURED'],proposal_hash:String(index+1).repeat(64),can_confirm:items.length>0,requested_refund_cents:report.cases.find(row=>row.case_hash===source.case_hash).requested_refund_cents,items,confirmed_at:null};
 });
 if(withPhoto)cards[0].items[0].image_url='https://down-br.img.susercontent.com/file/mls-synthetic-product-photo';
 const value={schema:'returns_receipt_workspace_v1',month:workspace.report.month,checked_at:at,physical_revision:0,workspace,cards,truncated:false};assert.ok(checkedReceiptFixture(value));return value;
}

// Model a successfully committed server response for UI tests, preserving the
// original financial frame and source evidence. Backend atomicity has separate
// D1 command tests; a test DOM never manufactures these facts itself.
export function receiptFixtureConfirmation(initial,body){
 const value=structuredClone(initial),card=value.cards.find(row=>row.case_hash===body.case_hash),physical=value.workspace.report.physical,at=value.checked_at,problem=body.decision==='PROBLEM';assert.ok(card);assert.equal(body.revision,physical.revision);
 const components=problem?[{quantity:body.quantity,artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',item_id:null,model_id:null,sku:null}]:card.items.flatMap(item=>item.components);
 const lines=components.map((component,index)=>({line_id:`${String(physical.revision+1).padStart(8,'0')}-2222-4222-8222-${String(index+1).padStart(12,'0')}`,receipt_ref:'Recebimento sintético '+(physical.revision+1)+'-'+index,quantity:component.quantity,status:'INSPECTED',identity:{artwork:component.artwork,color:component.color,size:component.size,garment_type:component.garment_type,fit:component.fit,confirmed:!problem,item_id:component.item_id,model_id:component.model_id,sku:component.sku},partition:{resellable:problem?0:component.quantity,repair:problem&&body.condition==='REPAIR'?component.quantity:0,damaged:problem&&body.condition==='DAMAGED'?component.quantity:0,mismatch:problem&&body.condition==='MISMATCH'?component.quantity:0,quarantine:problem&&body.condition==='QUARANTINE'?component.quantity:0},received_at:at,updated_at:at,reason:problem?body.reason:'Conferência sintética',valuation_state:'UNKNOWN',carrying_value_cents:null}));
 const source=value.workspace.report.source.cases.find(row=>row.case_hash===card.case_hash);physical.cases.push({case_hash:card.case_hash,order_hash:card.order_hash,source:{month:value.month,publication_revision:source.publication_revision,status:source.status,checked_at:source.checked_at},registered_at:at,updated_at:at,lines});
 physical.revision++;value.physical_revision=physical.revision;const all=physical.cases.flatMap(row=>row.lines),sum=key=>all.reduce((n,line)=>n+line.partition[key],0),quantity=all.reduce((n,line)=>n+line.quantity,0);physical.summary={cases:physical.cases.length,lines:all.length,received_quantity:quantity,active_quantity:quantity,voided_quantity:0,resellable_quantity:sum('resellable'),repair_quantity:sum('repair'),damaged_quantity:sum('damaged'),mismatch_quantity:sum('mismatch'),quarantine_quantity:sum('quarantine'),physically_available_quantity:sum('resellable')};
 card.receipt_state=problem?'PROBLEM':'RECEIVED';card.confirmed_at=at;card.can_confirm=false;card.pending=[...new Set([...card.pending,'EXISTING_RECEIPT'])];card.data_state=card.pending.includes('REQUEST_ITEMS_NOT_CAPTURED')?'NOT_CAPTURED':'REVIEW_REQUIRED';
 assert.ok(checkedReceiptFixture(value),'synthetic confirmation obeys the same closed browser DTO');return value;
}
