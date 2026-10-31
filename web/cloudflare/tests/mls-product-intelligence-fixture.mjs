import assert from 'node:assert/strict';
import {completeWorkspaceFrame} from './monthly-workspace-browser-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';

export function productObserverFrame(){
 const frame=completeWorkspaceFrame({review:false});
 const makeVariant=(model_id,quantity,unit_cost_cents)=>({model_id,quantity,exclusive_quantity:quantity,mixed_quantity:0,
  unit_cost_cents,production_cost_cents:quantity*unit_cost_cents,exclusive_production_cost_cents:quantity*unit_cost_cents,
  selling_unit:'SINGLE_GARMENT',size:'P',male_size:null,female_size:null});
 const row={item_id:'301',quantity:257,orders:242,exclusive_orders:242,mixed_orders:0,
  exclusive_payment_covered:242,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,
  known_exclusive_sales_cents:1576639,exclusive_sales_cents:1576639,
  known_exclusive_repass_cents:1109166,exclusive_repass_cents:1109166,
  known_exclusive_tax_cents:0,exclusive_tax_cents:0,known_exclusive_ads_adjustment_cents:1180,exclusive_ads_adjustment_cents:1180,
  known_production_cost_cents:745070,production_cost_cents:745070,
  known_exclusive_production_cost_cents:745070,exclusive_production_cost_cents:745070,
  known_exclusive_after_costs_cents:364096,exclusive_after_costs_cents:364096,
  exclusive_margin_bps:Number(364096n*10000n/1576639n),pending:[],
  variants:[makeVariant('1',256,2900),makeVariant('2',1,2670)]};
 const report={schema:'business_month_products_v1',mixed_orders:0,
  known_mixed_sales_cents:0,known_mixed_repass_cents:0,known_mixed_tax_cents:0,
  known_mixed_ads_adjustment_cents:0,products:[row],tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED'};
 assert.ok(projectBusinessMonthProducts(report,frame),'synthetic observer products must cross the real product contract');
 const result=projectBusinessMonth({...frame,product_summary:report});
 assert.ok(result?.product_summary,'synthetic observer frame must cross the real monthly contract');
 return result;
}
