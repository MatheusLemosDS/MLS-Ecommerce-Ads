"""Build isolated, offline-only financial connection candidates; never overwrite v11."""
from pathlib import Path
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[1]
FINANCE=ROOT/'web/finance'
AUTH_SHA='45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56'

def digest(value):
    return hashlib.sha256(value).hexdigest()

def build():
    original=(ROOT/'web/cloudflare/auth-worker.mjs').read_bytes()
    if digest(original)!=AUTH_SHA:
        raise SystemExit('Current Auth differs from the reviewed v9 baseline; candidate not built.')
    # The preview projection is a self-contained, reviewed module shared by all
    # three Workers. Strip only its explicit import; refuse additional imports.
    preview=(FINANCE/'src/payment-preview-frame.mjs').read_text()
    if re.search(r'^import\b',preview,re.M):
        raise SystemExit('Unreviewed preview frame import; candidate not built.')
    preview=re.sub(r'^export\s+', '', preview, flags=re.M)
    preview_bundle='const brazaFinancePreviewFrame = (() => {\n'+preview+'\nreturn {projectFinancePaymentPreview};\n})();\n'
    preview_import="import {projectFinancePaymentPreview} from './payment-preview-frame.mjs';\n"
    catalog=(FINANCE/'src/variant-catalog-frame.mjs').read_text()
    if re.search(r'^import\b',catalog,re.M):
        raise SystemExit('Unreviewed catalog frame import; candidate not built.')
    catalog=re.sub(r'^export\s+', '', catalog, flags=re.M)
    catalog_bundle='const brazaVariantCatalogFrame = (() => {\n'+catalog+'\nreturn {projectVariantCatalog,projectVariantCatalogRequest};\n})();\n'
    catalog_import="import {projectVariantCatalog,projectVariantCatalogRequest} from './variant-catalog-frame.mjs';\n"
    period=(FINANCE/'src/store-period-frame.mjs').read_text()
    if re.search(r'^import\b',period,re.M):
        raise SystemExit('Unreviewed store period frame import; candidate not built.')
    period=re.sub(r'^export\s+', '', period, flags=re.M)
    period_bundle='const brazaStorePeriodFrame = (() => {\n'+period+'\nreturn {projectStorePeriodRequest,projectStorePeriodFrame};\n})();\n'
    period_import="import {projectStorePeriodRequest,projectStorePeriodFrame} from './store-period-frame.mjs';\n"
    business=(FINANCE/'src/business-period-frame.mjs').read_text()
    if re.search(r'^import\b',business,re.M):
        raise SystemExit('Unreviewed business period frame import; candidate not built.')
    business=re.sub(r'^export\s+', '', business, flags=re.M)
    business_bundle='const brazaBusinessPeriodFrame = (() => {\n'+business+'\nreturn {projectBusinessPeriodRequest,projectBusinessPeriodFrame};\n})();\n'
    business_import="import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from './business-period-frame.mjs';\n"
    daily=(FINANCE/'src/daily-orders-frame.mjs').read_text()
    if re.search(r'^import\b',daily,re.M):
        raise SystemExit('Unreviewed daily orders frame import; candidate not built.')
    daily=re.sub(r'^export\s+', '', daily, flags=re.M)
    daily_bundle='const brazaDailyOrdersFrame = (() => {\n'+daily+'\nreturn {projectDailyOrdersFrame};\n})();\n'
    daily_import="import {projectDailyOrdersFrame} from './daily-orders-frame.mjs';\n"
    router_source=(FINANCE/'src/auth-router.mjs').read_text()
    if router_source.count(preview_import)!=1 or router_source.count(catalog_import)!=1 or router_source.count(period_import)!=1 or router_source.count(daily_import)!=1 or router_source.count(business_import)!=1:
        raise SystemExit('Shared router import not unique; candidate not built.')
    router=re.sub(r'^export\s+', '', router_source.replace(preview_import,'').replace(catalog_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,''), flags=re.M)
    if re.search(r'^import\b',router,re.M):
        raise SystemExit('Unreviewed router import; candidate not built.')
    needle='    const url = new URL(request.url);'
    auth=original.decode()
    if auth.count(needle)!=1:
        raise SystemExit('Auth insertion point not unique.')
    addition="\n    if (url.pathname === '/internal/shopee/finance/daily-orders') return brazaFinanceRouter.forwardFinanceDailyOrders(request, env, {validateInternalApp});\n    if (url.pathname.startsWith('/shopee/finance/')) return brazaFinanceRouter.forwardFinanceConnection(request, env);\n    if (url.pathname === '/internal/shopee/finance/payment-sample' || url.pathname === '/internal/shopee/finance/payment-preview' || url.pathname === '/internal/shopee/finance/variant-catalog' || url.pathname === '/internal/shopee/finance/store-period' || url.pathname === '/internal/shopee/finance/business-period') return brazaFinanceRouter.forwardFinancePaymentSample(request, env, {validateInternalApp});"
    auth=auth.replace(needle,needle+addition,1)
    auth+='\n\n'+preview_bundle+catalog_bundle+period_bundle+daily_bundle+business_bundle+'\nconst brazaFinanceRouter = (() => {\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {projectVariantCatalog,projectVariantCatalogRequest}=brazaVariantCatalogFrame;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\n'+router+'\nreturn {forwardFinanceConnection,forwardFinancePaymentSample,forwardFinanceDailyOrders};\n})();\n'
    store=(FINANCE/'src/connection-store.mjs').read_text()
    store=re.sub(r'^export\s+', '', store, flags=re.M)
    worker=(FINANCE/'src/connection-worker.mjs').read_text()
    if worker.count(preview_import)!=1 or worker.count(catalog_import)!=1 or worker.count(period_import)!=1 or worker.count(daily_import)!=1 or worker.count(business_import)!=1:
        raise SystemExit('Shared worker import not unique; candidate not built.')
    worker=worker.replace(preview_import,'').replace(catalog_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,'')
    worker=re.sub(r'^import\s+[\s\S]*?\s+from\s+[\'"]\./connection-store\.mjs[\'"];?\s*\n','',worker,count=1)
    if re.search(r'^import\b',worker,re.M):
        raise SystemExit('Unreviewed worker import; candidate not built.')
    bundled=preview_bundle+catalog_bundle+period_bundle+daily_bundle+business_bundle+'\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {projectVariantCatalog,projectVariantCatalogRequest}=brazaVariantCatalogFrame;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\nconst brazaFinanceStore = (() => {\n'+store+'\nreturn {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore};\n})();\nconst {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore}=brazaFinanceStore;\n'+worker
    candidate=FINANCE/'candidate'
    candidate.mkdir(exist_ok=True)
    (candidate/'auth-worker.mjs').write_text(auth)
    (candidate/'finance-worker.mjs').write_text(bundled)
    manifest={
        'status':'OFFLINE_CANDIDATE_NOT_FOR_PRODUCTION',
        'activation':'BASE_WITHOUT_PROVIDER_ADAPTER_USE_LIVE_DELIVERY',
        'partner_id':2049333,'shop_id':1178167501,
        'auth_baseline_sha256':AUTH_SHA,
        'auth_candidate_sha256':digest(auth.encode()),
        'finance_candidate_sha256':digest(bundled.encode()),
        'production_deployed':False,'ads_execution':'LOCKED',
        'provider_adapter_enabled':False,
    }
    (candidate/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest))

if __name__=='__main__':
    build()
