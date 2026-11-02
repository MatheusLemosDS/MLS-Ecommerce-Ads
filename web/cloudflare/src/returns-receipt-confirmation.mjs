import {ReturnReceiptError,readReturnReceiptContext,readReturnsReceiptWorkspace} from './returns-receipt-proposal.mjs';
import {readPhysicalReturnReceiptReplay,commitPhysicalReturnReceipt} from './physical-returns.mjs';

export function projectReturnReceiptConfirmation(value){
 try{
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const decision=plain(value)?Object.getOwnPropertyDescriptor(value,'decision')?.value:null,problem=decision==='PROBLEM';
  if(!exact(value,['schema','revision','request_id','case_hash','proposal_hash','decision',...(problem?['quantity','condition','reason']:[])])||value.schema!=='return_receipt_confirmation_v1'||!['RECEIVED_AS_SHOWN','PROBLEM'].includes(decision)||!Number.isSafeInteger(value.revision)||Object.is(value.revision,-0)||value.revision<0||value.revision>2147483644||typeof value.request_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.request_id)||![value.case_hash,value.proposal_hash].every(row=>typeof row==='string'&&/^[a-f0-9]{64}$/.test(row)))return null;
  if(problem&&(!Number.isSafeInteger(value.quantity)||Object.is(value.quantity,-0)||value.quantity<1||value.quantity>10000||!['QUARANTINE','MISMATCH','DAMAGED','REPAIR'].includes(value.condition)||typeof value.reason!=='string'||!value.reason.length||value.reason.length>240||value.reason.trim()!==value.reason||value.reason.normalize('NFC')!==value.reason||/[\u0000-\u001f\u007f-\u009f]/.test(value.reason)))return null;
  return {...value};
 }catch{return null;}
}

export async function confirmReturnsReceipt(env,selection,body,actor,{now=()=>Date.now()}={}){
 const request=projectReturnReceiptConfirmation(body);if(!request)throw new ReturnReceiptError('RETURN_RECEIPT_REQUEST_INVALID',400);
 if(!selection||![Object.prototype,null].includes(Object.getPrototypeOf(selection))||Reflect.ownKeys(selection).length!==1||typeof Object.getOwnPropertyDescriptor(selection,'month')?.value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(selection.month))throw new ReturnReceiptError('RETURN_RECEIPT_REQUEST_INVALID',400);
 const replay=await readPhysicalReturnReceiptReplay(env,request,{now});if(replay)return readReturnsReceiptWorkspace(env,selection,{now});
 const context=await readReturnReceiptContext(env,selection,{now}),plan=context.plans.get(request.case_hash);
 if(!plan)throw new ReturnReceiptError('RETURN_RECEIPT_SOURCE_REQUIRED',409);
 if(context.workspace.physical_revision!==request.revision||plan.card.proposal_hash!==request.proposal_hash)throw new ReturnReceiptError('RETURN_RECEIPT_CHANGED',409);
 if(plan.card.pending.includes('EXISTING_RECEIPT'))throw new ReturnReceiptError('RETURN_RECEIPT_ALREADY_RECORDED',409);
 if(request.decision==='RECEIVED_AS_SHOWN'&&!plan.card.can_confirm)throw new ReturnReceiptError('RETURN_RECEIPT_REVIEW_REQUIRED',409);
 let lines;
 if(request.decision==='RECEIVED_AS_SHOWN'){
  lines=plan.card.items.flatMap(item=>item.components.map(component=>{const {quantity,...identity}=component;return {line_id:crypto.randomUUID(),receipt_ref:'CONF-'+request.request_id+'-'+item.item_id+'-'+item.model_id+'-'+component.fit,quantity,identity:{...identity,confirmed:true},partition:{resellable:quantity,repair:0,damaged:0,mismatch:0,quarantine:0},reason:'Recebimento, identidade, quantidade e condição confirmados pelo proprietário.'};}));
 }else{
  const item=plan.card.items.length===1?plan.card.items[0]:null,identity={artwork:item?'Produto #'+item.item_id:'Solicitação '+request.case_hash.slice(0,12),color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:item?.item_id??null,model_id:item?.model_id??null,sku:null},partition={resellable:0,repair:0,damaged:0,mismatch:0,quarantine:0};partition[{QUARANTINE:'quarantine',MISMATCH:'mismatch',DAMAGED:'damaged',REPAIR:'repair'}[request.condition]]=request.quantity;
  lines=[{line_id:crypto.randomUUID(),receipt_ref:'CONF-'+request.request_id,quantity:request.quantity,identity,partition,reason:request.reason}];
 }
 await commitPhysicalReturnReceipt(env,request,actor,{now,sourceCase:plan.sourceCase,lines,sourceGuard:request.decision==='PROBLEM'?(plan.problemGuard??plan.sourceGuard):plan.sourceGuard});
 return readReturnsReceiptWorkspace(env,selection,{now});
}
