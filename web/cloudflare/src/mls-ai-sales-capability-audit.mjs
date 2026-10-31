import {AiSalesContractError,readAiSalesRecord,readAiSalesList,validateAiSalesEvidence} from './mls-ai-sales-contracts.mjs';

export const AI_SALES_CAPABILITIES=Object.freeze(['CATALOG_READ','AFFILIATE_SELLER_READ','AFFILIATE_SELLER_MANAGE','CREATOR_GRANT','VIDEO_PUBLISH','SHOP_PRODUCT_ANCHOR']);
/** Evidence of grants is deliberately separate from a live, verified connection. */
export function auditAiSalesCapabilities(raw){
 readAiSalesRecord(raw,['marketplace','shop_ref','evidence','at']);
 if(!['SHOPEE_BR','TIKTOK_SHOP_BR'].includes(raw.marketplace)||typeof raw.shop_ref!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(raw.shop_ref)||!Number.isSafeInteger(raw.at)||raw.at<=0||raw.at>4102444800||!Array.isArray(raw.evidence)||raw.evidence.length>50)throw new AiSalesContractError('AI_SALES_CAPABILITY_INVALID');
 readAiSalesList(raw.evidence,50);
 const rows=[];
 for(const item of raw.evidence){
  readAiSalesRecord(item,['capability','grant_status','expires_at','evidence'],'AI_SALES_CAPABILITY_INVALID');
  if(!AI_SALES_CAPABILITIES.includes(item.capability)||!['UNKNOWN','DENIED','GRANTED'].includes(item.grant_status)||item.expires_at!==null&&(!Number.isSafeInteger(item.expires_at)||item.expires_at<=0||item.expires_at>4102444800))throw new AiSalesContractError('AI_SALES_CAPABILITY_INVALID');
  const e=validateAiSalesEvidence(item.evidence);if(e.marketplace!==raw.marketplace||e.shop_ref!==raw.shop_ref)throw new AiSalesContractError('AI_SALES_CAPABILITY_SCOPE_MISMATCH');
  rows.push({capability:item.capability,grant_status:item.grant_status,expires_at:item.expires_at,evidence:e});
 }
 const capabilities=AI_SALES_CAPABILITIES.map(capability=>{
  const matching=rows.filter(row=>row.capability===capability),states=new Set(matching.map(row=>row.grant_status));
  const conflict=states.has('GRANTED')&&states.has('DENIED');
  const grant=conflict?'CONFLICT':states.has('DENIED')?'DENIED':states.has('GRANTED')?'GRANTED':'UNKNOWN';
  const reasons=['PROVIDER_CONNECTION_NOT_VERIFIED'];
  if(grant!=='GRANTED')reasons.push(conflict?'CONFLICTING_PERMISSION_EVIDENCE':grant==='DENIED'?'PERMISSION_DENIED':'PERMISSION_UNKNOWN');
  if(matching.some(row=>row.evidence.observed_at>raw.at||row.expires_at!==null&&row.expires_at<=raw.at))reasons.push('PERMISSION_EVIDENCE_STALE');
  if(matching.some(row=>row.evidence.status!=='VERIFIED'))reasons.push('PERMISSION_EVIDENCE_UNVERIFIED');
  if(!['CATALOG_READ','AFFILIATE_SELLER_READ','CREATOR_GRANT'].includes(capability))reasons.push('MVP_COMMERCIAL_WRITES_LOCKED');
  return Object.freeze({capability,grant_status:grant,connection:'UNVERIFIED',can_read:false,can_write:false,blocked_reasons:Object.freeze(reasons)});
 });
 return Object.freeze({schema:'mls_ai_sales_capabilities_v1',marketplace:raw.marketplace,shop_ref:raw.shop_ref,checked_at:raw.at,provider_connected:false,capabilities:Object.freeze(capabilities),commercial_writes:false});
}
