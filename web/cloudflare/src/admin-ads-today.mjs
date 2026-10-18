// Same existing dashboard source, scoped to one day; no economic validation inferred.
export function adsToday(summary,day){
 const base={date:day,timezone:'America/Sao_Paulo',day_partial:true,source:'existing_dashboard_ads_summary',currency:'UNKNOWN',monetary_unit:'UNKNOWN',store_total_orders:null};
 if(summary?.ok!==true)return {...base,status:'UNAVAILABLE'};
 if(String(summary.shop?.id)!=='1178167501')return {...base,status:'SHOP_NOT_CONFIRMED'};
 const iso=value=>{if(typeof value!=='string')return null;if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const m=value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:null;};
 const rows=Array.isArray(summary.daily)?summary.daily.filter(row=>iso(row?.date)===day):[];
 if(rows.length!==1)return {...base,status:rows.length?'AMBIGUOUS_DATE':'NO_CURRENT_DAY'};
 const row=rows[0];
 const raw=value=>{if(typeof value==='number')return Number.isFinite(value)&&value>=0?String(value):null;return typeof value==='string'&&/^\d{1,20}(\.\d{1,12})?$/.test(value)?value:null;};
 const count=value=>{const text=raw(value);if(text===null||!/^\d+$/.test(text))return null;const n=Number(text);return Number.isSafeInteger(n)?n:null;};
 return {...base,status:'AVAILABLE',expense_raw:raw(row.expense),direct:{conversions:count(row.direct_order),gmv_raw:raw(row.direct_gmv),roas_raw:raw(row.direct_roas)},broad:{conversions:count(row.broad_order),gmv_raw:raw(row.broad_gmv),roas_raw:raw(row.broad_roas)},source_shop_link:'LEGACY_DECLARED_NOT_INDEPENDENTLY_VERIFIED'};
}
