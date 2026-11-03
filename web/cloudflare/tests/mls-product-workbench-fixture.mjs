import assert from 'node:assert/strict';
import {completeWorkspaceFrame,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';

const variant=(model_id,quantity,cost,{kit=false}={})=>({model_id,quantity,exclusive_quantity:quantity,mixed_quantity:0,
 unit_cost_cents:cost,production_cost_cents:quantity*cost,exclusive_production_cost_cents:quantity*cost,
 selling_unit:kit?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT',size:kit?null:'P',male_size:kit?'P':null,female_size:kit?'P':null});

// All amounts and identifiers are synthetic. Every fixture crosses the real
// monthly and per-product contracts before a browser is allowed to consume it.
export function m3ProductFrame({month='2026-10',costDelta=0,revision=1,review=false}={}){
 const frame=completeWorkspaceFrame({month,review:false,at:workspaceStamp-30+revision});
 const products=[];let salesLeft=frame.known_sales_cents,payoutLeft=frame.known_expected_repass_cents;
 for(let index=0;index<25;index++){
  const quantity=index===0?30:index===24?20:9,orders=index===0?15:quantity;
  const variants=index===24?[variant('1',19,2900),variant('2',1,2670)]:[variant('1',quantity,2900+(index===0?costDelta:0),{kit:index===0})];
  const cost=variants.reduce((sum,row)=>sum+row.production_cost_cents,0);
  const sales=index===24?salesLeft:quantity*6000;
  const payout=index===24?payoutLeft:index===3?10000:quantity*4200;
  salesLeft-=sales;payoutLeft-=payout;
  const after=payout-cost,returns=review&&index===0?1:0;
  products.push({item_id:String(301+index),quantity,orders,exclusive_orders:orders,mixed_orders:0,
   exclusive_payment_covered:orders,exclusive_payment_missing:0,exclusive_returns:returns,exclusive_returns_unknown:0,
   known_exclusive_sales_cents:sales,exclusive_sales_cents:sales,
   known_exclusive_repass_cents:payout,exclusive_repass_cents:payout,
   known_exclusive_tax_cents:0,exclusive_tax_cents:0,
   known_exclusive_ads_adjustment_cents:index===0?1180:0,exclusive_ads_adjustment_cents:index===0?1180:0,
   known_production_cost_cents:cost,production_cost_cents:cost,
   known_exclusive_production_cost_cents:cost,exclusive_production_cost_cents:cost,
   known_exclusive_after_costs_cents:returns?null:after,exclusive_after_costs_cents:returns?null:after,
   exclusive_margin_bps:returns?null:Number(BigInt(after)*10000n/BigInt(sales)),
   pending:returns?['RETURNS_NOT_RECONCILED']:[],variants});
 }
 const delta=costDelta*30;
 frame.known_production_cost_cents+=delta;frame.production_cost_cents+=delta;
 frame.costs_revision+=revision-1;frame.classification_revision=1;
 frame.result.net_estimate_cents-=delta;
 frame.result.net_margin_bps=Number(BigInt(frame.result.net_estimate_cents)*10000n/BigInt(frame.known_sales_cents));
 if(review){frame.coverage.returns=1;frame.result.pending=['RETURNS_NOT_RECONCILED'];frame.result.net_estimate_cents=null;frame.result.net_margin_bps=null;}
 const report={schema:'business_month_products_v1',mixed_orders:0,
  known_mixed_sales_cents:0,known_mixed_repass_cents:0,known_mixed_tax_cents:0,known_mixed_ads_adjustment_cents:0,
  tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED',products};
 assert.ok(projectBusinessMonthProducts(report,frame),'synthetic M3 report must pass the actual financial product contract');
 const result=projectBusinessMonth({...frame,product_summary:report});
 assert.ok(result?.product_summary,'synthetic M3 month must pass the actual monthly contract');return result;
}

export function m3MixedFrame(){
 const frame=completeWorkspaceFrame({review:false});
 frame.coverage={orders:51,paid:1,completed:1,ongoing:0,cancelled:47,cancel_pending:0,unpaid:3,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0};
 frame.sales_cents=frame.known_sales_cents=10000;frame.expected_repass_cents=frame.known_expected_repass_cents=7000;
 frame.production_cost_cents=frame.known_production_cost_cents=5800;frame.classification_revision=1;
 frame.result.net_estimate_cents=7000-5800-8605-131658+1180;
 frame.result.net_margin_bps=Number(BigInt(frame.result.net_estimate_cents)*10000n/10000n);
 const products=['301','302'].map(item_id=>({item_id,quantity:1,orders:1,exclusive_orders:0,mixed_orders:1,
  exclusive_payment_covered:0,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,
  known_exclusive_sales_cents:0,exclusive_sales_cents:0,known_exclusive_repass_cents:0,exclusive_repass_cents:0,
  known_exclusive_tax_cents:0,exclusive_tax_cents:0,known_exclusive_ads_adjustment_cents:0,exclusive_ads_adjustment_cents:0,
  known_production_cost_cents:2900,production_cost_cents:2900,known_exclusive_production_cost_cents:0,exclusive_production_cost_cents:0,
  known_exclusive_after_costs_cents:null,exclusive_after_costs_cents:null,exclusive_margin_bps:null,pending:['NO_EXCLUSIVE_ORDERS'],
  variants:[{...variant('1',1,2900),exclusive_quantity:0,mixed_quantity:1,exclusive_production_cost_cents:0}]}));
 const report={schema:'business_month_products_v1',mixed_orders:1,known_mixed_sales_cents:10000,known_mixed_repass_cents:7000,known_mixed_tax_cents:0,known_mixed_ads_adjustment_cents:1180,tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED',products};
 assert.ok(projectBusinessMonthProducts(report,frame),'mixed synthetic report must preserve the unallocated monetary bucket');
 const result=projectBusinessMonth({...frame,product_summary:report});assert.ok(result);return result;
}

export function m3CatalogState({ids=Array.from({length:25},(_,index)=>String(301+index)),metadataRevision=1}={}){
 const products=ids.map((item_id,index)=>({item_id,
  product_name:item_id==='301'?'Kit Universo sintético — duas camisetas':item_id==='303'?'Camiseta <img src=x onerror=alert(1)> sintética':'Camiseta sintética '+item_id,
  status:'MATCHED',reason:null,checked_at:workspaceStamp-60+metadataRevision,
  catalog_fingerprint:'a'.repeat(64),model_count:item_id==='325'?2:1,resolved_count:item_id==='325'?2:1,
  next_attempt_at:workspaceStamp+86400,failure_count:0,variants_complete:true,
  variants:(item_id==='325'?['1','2']:['1']).map(model_id=>({model_id,model_name:item_id==='301'?'Kit P / P':model_id==='2'?'Azul / G':'Verde / P',reason:null,attributes:[{name:'Cor',value:model_id==='2'?'Azul':'Verde'},{name:'Tamanho',value:item_id==='301'?'P + P':model_id==='2'?'G':'P'}]}))}));
 return {schema:'catalog_classification_state_v1',revision:1,enabled:true,
  counts:{total:25,queued:0,running:0,matched:25,partial:0,review:0,retry_wait:0,due:0},
  products,limit:100,offset:0,more:false,next_due_at:workspaceStamp+86400};
}

export function m3CatalogLabels(){return m3CatalogState().products.map(({item_id,product_name,variants})=>({item_id,product_name,variants:variants.map(({model_id,model_name,attributes})=>({model_id,model_name,attributes}))}));}
