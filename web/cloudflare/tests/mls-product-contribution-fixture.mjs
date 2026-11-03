import assert from 'node:assert/strict';
import {completeWorkspaceFrame,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';

// Fully synthetic monetary evidence. Product401 has one sold model and an
// additional unsold catalogue model;405 has one sold model in exclusive AND
// mixed orders. The mixed order includes406 and its whole payout stays separate.
export const contributionCases=Object.freeze({
 positive:{item:'401',sales:10000,repass:8000,cost:3180,balance:4820,margin:4820},
 negative:{item:'402',sales:3000,repass:1500,cost:2140,balance:-640,margin:-2133},
 zero:{item:'403',sales:2500,repass:1590,cost:1590,balance:0,margin:0},
 multiple:{item:'404',sales:10000,repass:7500,cost:3730,balance:3770,margin:3770},
 exclusiveAndMixed:{item:'405',sales:15000,repass:11000,cost:6360,balance:4640,margin:3093},
 mixedOnly:{item:'406',mixedPayout:7000},returns:{item:'407',knownCost:1250},missingCost:{item:'408',knownCost:0}
});
const variant=(model_id,exclusive,mixed,cost,kit=false)=>({model_id,quantity:exclusive+mixed,exclusive_quantity:exclusive,mixed_quantity:mixed,
 unit_cost_cents:cost,production_cost_cents:cost===null?null:(exclusive+mixed)*cost,
 exclusive_production_cost_cents:exclusive===0?0:cost===null?null:exclusive*cost,
 selling_unit:cost===null?null:kit?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT',size:cost===null||kit?null:model_id==='2'?'G3':'P',male_size:kit?'P':null,female_size:kit?'P':null});

export function contributionFrame({month='2026-10',costDelta=0,revision=1,stale=false}={}){
 const frame=completeWorkspaceFrame({month,review:false,at:workspaceStamp-40+revision});
 const configurations=[
  ['401',2,0,10000,8000,[variant('1',2,0,1590+costDelta)]],
  ['402',1,0,3000,1500,[variant('1',1,0,2140)]],
  ['403',1,0,2500,1590,[variant('1',1,0,1590)]],
  ['404',2,0,10000,7500,[variant('1',1,0,1590),variant('2',1,0,2140)]],
  ['405',2,1,15000,11000,[variant('1',2,1,3180,true)]],
  ['406',0,1,0,0,[variant('1',0,1,1590)]],
  ['407',1,0,2000,1600,[variant('1',1,0,1250)]],
  ['408',1,0,2000,1500,[variant('1',1,0,null)]]
 ];
 const products=configurations.map(([item_id,exclusive,mixed,sales,repass,variants])=>{
  const knownCost=variants.reduce((total,v)=>total+(v.production_cost_cents??0),0),exclusiveCost=variants.reduce((total,v)=>total+(v.exclusive_production_cost_cents??0),0),complete=variants.every(v=>v.unit_cost_cents!==null),returns=item_id==='407'?1:0;
  const pending=[...(!complete?['PRODUCTION_COST_INCOMPLETE']:[]),...(returns?['RETURNS_NOT_RECONCILED']:[]),...(stale?['SOURCE_UNAVAILABLE']:[]),...(!exclusive?['NO_EXCLUSIVE_ORDERS']:[])];
  const known=exclusive&&complete&&!returns?repass-exclusiveCost:null,after=pending.length?null:known;
  return {item_id,quantity:variants.reduce((total,v)=>total+v.quantity,0),orders:exclusive+mixed,exclusive_orders:exclusive,mixed_orders:mixed,
   exclusive_payment_covered:exclusive,exclusive_payment_missing:0,exclusive_returns:returns,exclusive_returns_unknown:0,
   known_exclusive_sales_cents:sales,exclusive_sales_cents:sales,known_exclusive_repass_cents:repass,exclusive_repass_cents:repass,
   known_exclusive_tax_cents:0,exclusive_tax_cents:0,known_exclusive_ads_adjustment_cents:item_id==='401'?1180:0,exclusive_ads_adjustment_cents:item_id==='401'?1180:0,
   known_production_cost_cents:knownCost,production_cost_cents:complete?knownCost:null,
   known_exclusive_production_cost_cents:exclusiveCost,exclusive_production_cost_cents:complete?exclusiveCost:null,
   known_exclusive_after_costs_cents:known,exclusive_after_costs_cents:after,
   exclusive_margin_bps:after===null||!sales?null:Number(BigInt(after)*10000n/BigInt(sales)),pending,variants};
 });
 const summary={schema:'business_month_products_v1',mixed_orders:1,known_mixed_sales_cents:10000,known_mixed_repass_cents:7000,known_mixed_tax_cents:0,known_mixed_ads_adjustment_cents:0,tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED',products};
 const exclusiveOrders=products.reduce((n,p)=>n+p.exclusive_orders,0),paid=exclusiveOrders+1;
 frame.coverage={orders:paid+3,paid,completed:paid,ongoing:0,cancelled:2,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:paid,payment_missing:0,returns:1,returns_unknown:0};
 frame.sales_cents=frame.known_sales_cents=products.reduce((n,p)=>n+p.known_exclusive_sales_cents,10000);
 frame.expected_repass_cents=frame.known_expected_repass_cents=products.reduce((n,p)=>n+p.known_exclusive_repass_cents,7000);
 frame.known_production_cost_cents=products.reduce((n,p)=>n+p.known_production_cost_cents,0);frame.production_cost_cents=null;
 frame.result.net_estimate_cents=null;frame.result.net_margin_bps=null;
 frame.result.pending=['RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE',...(stale?['FINANCIAL_SOURCE_STALE']:[])];
 if(stale)frame.source_checked_at.finance_oldest_at=frame.checked_at-1000;
 frame.unmapped_variants=[{item_id:'408',model_id:'1',quantity:1}];frame.classification_revision=1;frame.costs_revision+=revision-1;
 assert.ok(projectBusinessMonthProducts(summary,frame),'synthetic contribution ledger crosses the actual product financial contract');
 const result=projectBusinessMonth({...frame,product_summary:summary});assert.ok(result?.product_summary,'synthetic contribution month crosses the actual monthly contract');return result;
}

export function contributionCatalog(){
 const names={'401':'Camiseta sintética positiva','402':'Camiseta sintética negativa','403':'Camiseta sintética equilíbrio','404':'Camiseta sintética duas variações vendidas','405':'Kit sintético exclusivo e misto','406':'Camiseta sintética somente mista','407':'Camiseta sintética com devolução','408':'Camiseta sintética custo pendente'};
 return {schema:'catalog_classification_state_v1',revision:1,enabled:true,counts:{total:8,queued:0,running:0,matched:7,partial:0,review:1,retry_wait:0,due:0},products:Object.entries(names).map(([item_id,product_name])=>({item_id,product_name,status:item_id==='408'?'REVIEW':'MATCHED',reason:item_id==='408'?'OPTION_NOT_RECOGNIZED':null,checked_at:workspaceStamp-80,catalog_fingerprint:'b'.repeat(64),model_count:['401','404'].includes(item_id)?2:1,resolved_count:item_id==='408'?0:['401','404'].includes(item_id)?2:1,next_attempt_at:workspaceStamp+86400,failure_count:0,variants_complete:true,variants:(['401','404'].includes(item_id)?['1','2']:['1']).map(model_id=>({model_id,model_name:item_id==='405'?'Kit P + P':model_id==='2'?'Azul / G3':'Verde / P',reason:item_id==='408'?'OPTION_NOT_RECOGNIZED':null,attributes:[{name:'Cor',value:model_id==='2'?'Azul':'Verde'},{name:'Tamanho',value:item_id==='405'?'P + P':model_id==='2'?'G3':'P'}]}))})),limit:100,offset:0,more:false,next_due_at:workspaceStamp+86400};
}
