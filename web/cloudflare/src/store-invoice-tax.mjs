import {projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {StoreSummaryError} from './store-summary.mjs';

const invoiceTaxMoneyBound=100000000000000n;

// The importer has already rounded each order's 2% estimate half up. Convert
// its exact BRL sums to cents without recalculating tax from the period total.
function invoiceTaxMoney(value){
  if(typeof value!=='string'||value.length>32)return null;
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
  if(!match)return null;
  let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
  if(match[1]){if(amount===0n)return null;amount=-amount;}
  return amount< -invoiceTaxMoneyBound||amount>invoiceTaxMoneyBound?null:Number(amount);
}

export function buildStoreInvoiceTax(frame){
  const source=projectStorePeriodFrame(frame);
  if(!source)throw new StoreSummaryError('STORE_INVOICE_TAX_FRAME_INVALID',502);
  if(!Object.hasOwn(source,'invoice_tax'))return null;
  const tax=source.invoice_tax,complete=source.status==='COMPLETE'&&source.diagnostic===null
    &&tax.unavailable_orders===0;
  const base=invoiceTaxMoney(tax.known_base_raw),amount=invoiceTaxMoney(tax.known_tax_raw);
  return {schema:'store_invoice_tax_result_v1',rate_bps:200,basis:tax.basis,rounding:tax.rounding,
    covered_orders:tax.covered_orders,unavailable_orders:tax.unavailable_orders,
    known_base_cents:base,base_cents:complete?base:null,
    known_tax_cents:amount,tax_cents:complete?amount:null};
}
