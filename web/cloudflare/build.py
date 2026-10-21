"""Build paste-ready Workers, preserving supplied originals."""
from pathlib import Path
import hashlib,json
import re
root=Path(__file__).resolve().parent
original=(root/'original/app-worker.mjs').read_text()
admin=(root/'src/admin.mjs').read_text().replace("import {CLIENT} from './admin-client.mjs';\n",'').replace("import {CSS,adminBody,loginBody} from './admin-view.mjs';\n",'')
report=(root/'src/admin-report.mjs').read_text().replace('export function parseReport','function parseReport')
client=report+'\n'+(root/'src/admin-client.mjs').read_text().replace("import {parseReport} from './admin-report.mjs';\n",'').replace('export const CLIENT','const CLIENT')
view=(root/'src/admin-view.mjs').read_text().replace('export const CSS','const CSS').replace('export function adminBody','function adminBody').replace('export function loginBody','function loginBody')
ads=(root/'src/admin-ads-today.mjs').read_text().replace('export function adsToday','function adsToday')
orders=(root/'src/shop-orders.mjs').read_text().replace('export function shopOrders','function shopOrders')
items=(root/'src/order-items.mjs').read_text().replace('export function orderItems','function orderItems')
variants=re.sub(r'^export ', '', (root/'src/variant-bindings.mjs').read_text(), flags=re.M)
observations=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/order-observations.mjs').read_text(),flags=re.M),flags=re.M)
production_costs=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/production-costs.mjs').read_text(),flags=re.M),flags=re.M)
orders_diagnostic=(root/'src/orders-diagnostic.mjs').read_text().replace('export function safeOrdersDiagnostic','function safeOrdersDiagnostic').replace('export function ordersReadDiagnostic','function ordersReadDiagnostic')
orders_http=(root/'src/orders-http.mjs').read_text().replace("import {safeOrdersDiagnostic} from './orders-diagnostic.mjs';\n",'').replace('export async function boundedOrdersRead','async function boundedOrdersRead')
app_orders=(root/'src/app-shop-orders.mjs').read_text().replace("import {boundedOrdersRead} from './orders-http.mjs';\n",'').replace("import {ordersReadDiagnostic} from './orders-diagnostic.mjs';\n",'').replace('export async function getShopOrders','async function getShopOrders')
app_items=re.sub(r'^import .*\n','',(root/'src/app-order-items.mjs').read_text(),flags=re.M).replace('export async function getOrderItems','async function getOrderItems')
finance_sample_frame=re.sub(r'^export ', '', (root/'src/finance-sample-frame.mjs').read_text(), flags=re.M)
app_finance_sample=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-finance-sample.mjs').read_text(),flags=re.M),flags=re.M)
finance_preview_frame=re.sub(r'^export ', '', (root.parent/'finance/src/payment-preview-frame.mjs').read_text(), flags=re.M)
finance_preview_frame='const brazaFinancePreviewFrame = (() => {\n'+finance_preview_frame+'\nreturn {projectFinancePaymentPreview};\n})();\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\n'
variant_catalog_frame=re.sub(r'^export ', '', (root.parent/'finance/src/variant-catalog-frame.mjs').read_text(), flags=re.M)
variant_catalog_frame='const brazaVariantCatalogFrame = (() => {\n'+variant_catalog_frame+'\nreturn {projectVariantCatalog,projectVariantCatalogRequest};\n})();\nconst {projectVariantCatalog,projectVariantCatalogRequest}=brazaVariantCatalogFrame;\n'
store_period_frame=re.sub(r'^export ', '', (root.parent/'finance/src/store-period-frame.mjs').read_text(), flags=re.M)
store_period_frame='const brazaStorePeriodFrame = (() => {\n'+store_period_frame+'\nreturn {projectStorePeriodRequest,projectStorePeriodFrame};\n})();\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\n'
app_store_period=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-store-period.mjs').read_text(),flags=re.M),flags=re.M)
store_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-summary.mjs').read_text(),flags=re.M),flags=re.M)
store_invoice_tax=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-invoice-tax.mjs').read_text(),flags=re.M),flags=re.M)
store_product_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-product-summary.mjs').read_text(),flags=re.M),flags=re.M)
store_returns_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-returns-summary.mjs').read_text(),flags=re.M),flags=re.M)
ads_period=re.sub(r'^export ', '', (root/'src/ads-period.mjs').read_text(), flags=re.M)
store_admin=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-admin.mjs').read_text(),flags=re.M),flags=re.M)
variant_sync=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/variant-sync.mjs').read_text(),flags=re.M),flags=re.M)
shell_navigation=re.sub(r'^export ', '', (root/'src/shell-navigation.mjs').read_text(), flags=re.M)
theme=re.sub(r'^export ', '', (root/'src/theme.mjs').read_text(), flags=re.M)
ads_presentation=re.sub(r'^export ', '', (root/'src/ads-presentation.mjs').read_text(), flags=re.M)
admin=client+'\n'+view+'\n'+ads+'\n'+orders+'\n'+items+'\n'+variants+'\n'+observations+'\n'+production_costs+'\n'+store_summary+'\n'+store_invoice_tax+'\n'+store_product_summary+'\n'+store_returns_summary+'\n'+store_admin+'\n'+variant_sync+'\n'+re.sub(r'^import .*\n','',admin,flags=re.M)
admin=admin.replace('export {adminFetch,schedule,DEFAULTS,SCHEMA,validateSettings};','')
needle='    const url = new URL(request.url);'
assert original.count(needle)==1
updated=original.replace(needle,needle+'''\n    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/hermes/')) return brazaAdmin.adminFetch(request, env, {getAdsSummary,getAdsPeriod,getShopOrders,getOrderItems,getFinancePaymentSample,getFinancePaymentPreview,getFinanceVariantCatalog,getFinanceStorePeriod});''',1)
needle='  async fetch(request, env) {'
updated=updated.replace(needle,'''  async scheduled(event, env, ctx) { ctx.waitUntil(brazaAdmin.schedule(env)); },\n'''+needle,1)
needle='${navLink(\n  "/dashboard",'
assert updated.count(needle)==1
updated=updated.replace(needle,'${navLink("/admin", "Administração", currentPath)}\n\n'+needle,1)
needle='<div class="app">'
assert updated.count(needle)==1
updated=updated.replace(needle,'${shellMobileNavigation(currentPath)}\n\n'+needle,1)
needle='\n</style>\n\n</head>\n\n<body>\n\n${shellMobileNavigation(currentPath)}'
assert updated.count(needle)==1
updated=updated.replace(needle,'\n${SHELL_NAVIGATION_CSS}'+needle,1)
needle='  return new Response(\n    content,'
assert updated.count(needle)==1
updated=updated.replace(needle,"  return new Response(\n    enhanceAdsPageHtml(content).replace('</head>',BRAZA_THEME_HEAD+'<style>'+BRAZA_THEME_CSS+'</style></head>'),",1)
needle='"style-src \'unsafe-inline\'; " +'
assert updated.count(needle)==1
updated=updated.replace(needle,needle+'\n          "script-src \'self\' \'unsafe-inline\'; " +',1)
# Formatting unknown display values as zero would make absent metrics look real.
# Keep numerical business-policy helpers intact and guard presentation only.
for name in ['money','integer','percent','percentNumber','formatRoas']:
    needle='function '+name+'(\n  value\n) {'
    assert updated.count(needle)==1
    updated=updated.replace(needle,needle+'\n  if(value===null||value===undefined||typeof value===\'boolean\'||(typeof value===\'string\'&&!value.trim())||!Number.isFinite(Number(value)))return "—";',1)
output=updated+'\n\n'+theme+'\n'+ads_presentation+'\n'+shell_navigation+'\n'+orders_diagnostic+'\n'+orders_http+'\n'+app_orders+'\n'+app_items+'\n'+finance_sample_frame+'\n'+finance_preview_frame+'\n'+variant_catalog_frame+'\n'+app_finance_sample+'\n'+store_period_frame+'\n'+app_store_period+'\n'+ads_period+'\n\nconst brazaAdmin = (() => {\n'+admin+'\nreturn {adminFetch,schedule};\n})();\n'
(root/'app-worker.mjs').write_text(output)
auth_original=(root/'original/auth-worker.mjs').read_text()
needle='    const url = new URL(request.url);'
assert auth_original.count(needle)==1
auth_updated=auth_original.replace(needle,needle+'''\n    if (url.pathname === '/internal/shopee/orders/summary') return brazaShopOrders.authShopOrders(request, env, {validateInternalApp,gatewayOrdersRead:env=>brazaShopOrders.gatewayShopOrders(env,normalizeGatewayUrl)});
    if (url.pathname === '/internal/shopee/orders/items') return brazaOrderItems.authOrderItems(request, env, {validateInternalApp,gatewayOrderItemsRead:env=>brazaOrderItems.gatewayOrderItems(env,normalizeGatewayUrl)});''',1)
auth_orders=(root/'src/auth-shop-orders.mjs').read_text().replace("import {shopOrders} from './shop-orders.mjs';\n",'').replace("import {boundedOrdersRead} from './orders-http.mjs';\n",'').replace("import {ordersReadDiagnostic} from './orders-diagnostic.mjs';\n",'').replace('export async function authShopOrders','async function authShopOrders').replace('export async function gatewayShopOrders','async function gatewayShopOrders')
auth_output=auth_updated+'\n\nconst brazaShopOrders = (() => {\n'+orders_diagnostic+'\n'+orders_http+'\n'+orders+'\n'+auth_orders+'\nreturn {authShopOrders,gatewayShopOrders};\n})();\n'
auth_items=re.sub(r'^import .*\n','',(root/'src/auth-order-items.mjs').read_text(),flags=re.M).replace('export async function authOrderItems','async function authOrderItems').replace('export async function gatewayOrderItems','async function gatewayOrderItems')
auth_output+='\n\nconst brazaOrderItems = (() => {\n'+orders_diagnostic+'\n'+orders_http+'\n'+items+'\n'+auth_items+'\nreturn {authOrderItems,gatewayOrderItems};\n})();\n'
(root/'auth-worker.mjs').write_text(auth_output)
(root/'schema.sql').write_text('''-- Use only the dedicated ADMIN_DB binding. Existing gateway DB is separate.\n'''+ ';\n'.join(__import__('re').findall(r'`(CREATE TABLE IF NOT EXISTS .*?)`',admin))+ ';\n')
(root/'manifest.json').write_text(json.dumps({'app_original_sha256':hashlib.sha256((root/'original/app-worker.mjs').read_bytes()).hexdigest(),'auth_original_sha256':hashlib.sha256((root/'original/auth-worker.mjs').read_bytes()).hexdigest(),'app_updated_sha256':hashlib.sha256(output.encode()).hexdigest(),'auth_updated_sha256':hashlib.sha256(auth_output.encode()).hexdigest(),'auth_modified':True,'deployment':'NOT_DEPLOYED','ads_execution':'LOCKED'},indent=2)+'\n')
print('Built app-worker.mjs:',len(output.encode()),'bytes; auth-worker.mjs:',len(auth_output.encode()),'bytes')
