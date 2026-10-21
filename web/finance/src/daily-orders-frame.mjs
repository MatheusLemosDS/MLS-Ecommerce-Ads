// Aggregate-only contract: current order situations never export identifiers,
// merchandise lines, customer data or credentials to the dashboard.
const dailyFrameFields = [
  'schema','shop_id','date','timezone','through_at','day_partial',
  'orders_in_api_window','orders_with_details','sales_orders','cancelled_orders',
  'cancellation_pending_orders','unpaid_orders','other_orders','unknown_status_orders',
  'pagination_complete','pages_read','duplicate_rows','count_basis','source',
];
const dailyFrameGroups = [
  'sales_orders','cancelled_orders','cancellation_pending_orders',
  'unpaid_orders','other_orders','unknown_status_orders',
];
const dailyFrameObject = value => value !== null && typeof value === 'object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const dailyFrameExact = value => dailyFrameObject(value)
  && Reflect.ownKeys(value).length === dailyFrameFields.length
  && dailyFrameFields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const dailyFrameCount = (value,min=0,max=2000) => Number.isSafeInteger(value) && value>=min && value<=max;
const dailyFrameDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value+'T00:00:00Z'))
  && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

// Freshness belongs to the authenticated caller. This pure projector can also
// validate a recorded fixture without silently changing its creation-date day.
export function projectDailyOrdersFrame(value) {
  try {
    if (!dailyFrameExact(value) || value.schema!=='shop_daily_sales_v1'
      || value.shop_id!==1178167501 || value.timezone!=='America/Sao_Paulo'
      || value.day_partial!==true || value.pagination_complete!==true
      || value.count_basis!=='UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS'
      || value.source!=='shopee_get_order_list_and_detail' || !dailyFrameDay(value.date)
      || typeof value.through_at!=='string'
      || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?-03:00$/.test(value.through_at)
      || value.through_at.slice(0,10)!==value.date || !Number.isFinite(Date.parse(value.through_at))
      || !dailyFrameCount(value.orders_in_api_window)
      || value.orders_with_details!==value.orders_in_api_window
      || !dailyFrameGroups.every(key=>dailyFrameCount(value[key],0,value.orders_in_api_window))
      || dailyFrameGroups.reduce((total,key)=>total+value[key],0)!==value.orders_in_api_window
      || !dailyFrameCount(value.pages_read,1,20) || !dailyFrameCount(value.duplicate_rows)
      || value.orders_in_api_window+value.duplicate_rows>value.pages_read*100) return null;
    return Object.fromEntries(dailyFrameFields.map(key=>[key,value[key]]));
  } catch { return null; }
}
