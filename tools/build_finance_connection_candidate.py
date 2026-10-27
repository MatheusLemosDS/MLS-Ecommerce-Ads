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
    catalog_names='projectVariantCatalog,projectVariantCatalogRequest,financeCatalogDiagnostic,projectVariantCatalogFailure'
    catalog_bundle='const brazaVariantCatalogFrame = (() => {\n'+catalog+'\nreturn {'+catalog_names+'};\n})();\n'
    catalog_import="import {"+catalog_names+"} from './variant-catalog-frame.mjs';\n"
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
    production=(FINANCE/'src/production-orders-frame.mjs').read_text()
    if re.search(r'^import\b',production,re.M):
        raise SystemExit('Unreviewed production orders frame import; candidate not built.')
    production=re.sub(r'^export\s+', '', production, flags=re.M)
    production_bundle='const brazaProductionOrdersFrame = (() => {\n'+production+'\nreturn {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches};\n})();\n'
    production_import="import {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches} from './production-orders-frame.mjs';\n"
    product_index=(FINANCE/'src/product-index-frame.mjs').read_text()
    if re.search(r'^import\b',product_index,re.M):
        raise SystemExit('Unreviewed product index frame import; candidate not built.')
    product_index=re.sub(r'^export\s+', '', product_index, flags=re.M)
    product_index_names='projectProductIndexRequest,projectProductIndexFrame,productIndexRequestMatches,financeProductIndexDiagnostic'
    product_index_bundle='const brazaProductIndexFrame = (() => {\n'+product_index+'\nreturn {'+product_index_names+'};\n})();\n'
    product_index_import="import {"+product_index_names+"} from './product-index-frame.mjs';\n"
    historical=(FINANCE/'src/historical-variant-evidence-frame.mjs').read_text()
    if re.search(r'^import\b',historical,re.M):
        raise SystemExit('Unreviewed historical evidence frame import; candidate not built.')
    historical=re.sub(r'^export\s+', '', historical, flags=re.M)
    historical_names='projectHistoricalVariantEvidenceRequest,projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches,historicalVariantEvidenceDiagnostic'
    historical_bundle='const brazaHistoricalVariantEvidenceFrame = (() => {\n'+historical+'\nreturn {'+historical_names+'};\n})();\n'
    historical_import="import {"+historical_names+"} from './historical-variant-evidence-frame.mjs';\n"
    reconciliation=(FINANCE/'src/reconciliation-frame.mjs').read_text()
    if re.search(r'^import\b',reconciliation,re.M):
        raise SystemExit('Unreviewed reconciliation frame import; candidate not built.')
    reconciliation=re.sub(r'^export\s+', '', reconciliation, flags=re.M)
    reconciliation_names='projectReconciliationRequest,projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,reconciliationRequestMatches'
    reconciliation_bundle='const brazaReconciliationFrame = (() => {\n'+reconciliation+'\nreturn {'+reconciliation_names+'};\n})();\n'
    reconciliation_import="import {"+reconciliation_names+"} from './reconciliation-frame.mjs';\n"
    escrow_release=(FINANCE/'src/escrow-release-frame.mjs').read_text()
    if re.search(r'^import\b',escrow_release,re.M):
        raise SystemExit('Unreviewed escrow release frame import; candidate not built.')
    escrow_release=re.sub(r'^export\s+', '', escrow_release, flags=re.M)
    escrow_release_names='projectEscrowReleaseRequest,projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,escrowReleaseRequestMatches'
    escrow_release_bundle='const brazaEscrowReleaseFrame = (() => {\n'+escrow_release+'\nreturn {'+escrow_release_names+'};\n})();\n'
    escrow_release_import="import {"+escrow_release_names+"} from './escrow-release-frame.mjs';\n"
    daily=(FINANCE/'src/daily-orders-frame.mjs').read_text()
    if re.search(r'^import\b',daily,re.M):
        raise SystemExit('Unreviewed daily orders frame import; candidate not built.')
    daily=re.sub(r'^export\s+', '', daily, flags=re.M)
    daily_bundle='const brazaDailyOrdersFrame = (() => {\n'+daily+'\nreturn {projectDailyOrdersFrame};\n})();\n'
    daily_import="import {projectDailyOrdersFrame} from './daily-orders-frame.mjs';\n"
    router_source=(FINANCE/'src/auth-router.mjs').read_text()
    if router_source.count(preview_import)!=1 or router_source.count(catalog_import)!=1 or router_source.count(period_import)!=1 or router_source.count(daily_import)!=1 or router_source.count(business_import)!=1 or router_source.count(production_import)!=1 or router_source.count(product_index_import)!=1 or router_source.count(historical_import)!=1 or router_source.count(reconciliation_import)!=1 or router_source.count(escrow_release_import)!=1:
        raise SystemExit('Shared router import not unique; candidate not built.')
    router=re.sub(r'^export\s+', '', router_source.replace(preview_import,'').replace(catalog_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,'').replace(production_import,'').replace(product_index_import,'').replace(historical_import,'').replace(reconciliation_import,'').replace(escrow_release_import,''), flags=re.M)
    if re.search(r'^import\b',router,re.M):
        raise SystemExit('Unreviewed router import; candidate not built.')
    needle='    const url = new URL(request.url);'
    auth=original.decode()
    if auth.count(needle)!=1:
        raise SystemExit('Auth insertion point not unique.')
    addition="\n    if (url.pathname === '/internal/shopee/finance/daily-orders') return brazaFinanceRouter.forwardFinanceDailyOrders(request, env, {validateInternalApp});\n    if (url.pathname.startsWith('/shopee/finance/')) return brazaFinanceRouter.forwardFinanceConnection(request, env);\n    if (url.pathname === '/internal/shopee/finance/payment-sample' || url.pathname === '/internal/shopee/finance/payment-preview' || url.pathname === '/internal/shopee/finance/variant-catalog' || url.pathname === '/internal/shopee/finance/store-period' || url.pathname === '/internal/shopee/finance/business-period' || url.pathname === '/internal/shopee/finance/production-orders' || url.pathname === '/internal/shopee/finance/historical-variant-evidence') return brazaFinanceRouter.forwardFinancePaymentSample(request, env, {validateInternalApp});"
    addition=addition.replace("url.pathname === '/internal/shopee/finance/payment-sample'", "url.pathname === '/internal/shopee/finance/product-index' || url.pathname === '/internal/shopee/finance/payment-sample'")
    addition=addition.replace("url.pathname === '/internal/shopee/finance/product-index'", "url.pathname === '/internal/shopee/finance/reconciliation' || url.pathname === '/internal/shopee/finance/product-index'")
    addition=addition.replace("url.pathname === '/internal/shopee/finance/reconciliation'", "url.pathname === '/internal/shopee/finance/escrow-releases' || url.pathname === '/internal/shopee/finance/reconciliation'")
    auth=auth.replace(needle,needle+addition,1)
    auth+='\n\n'+preview_bundle+catalog_bundle+period_bundle+daily_bundle+business_bundle+production_bundle+product_index_bundle+historical_bundle+reconciliation_bundle+escrow_release_bundle+'\nconst brazaFinanceRouter = (() => {\nconst {'+product_index_names+'}=brazaProductIndexFrame;\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {'+catalog_names+'}=brazaVariantCatalogFrame;\nconst {'+historical_names+'}=brazaHistoricalVariantEvidenceFrame;\nconst {'+reconciliation_names+'}=brazaReconciliationFrame;\nconst {'+escrow_release_names+'}=brazaEscrowReleaseFrame;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\nconst {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches}=brazaProductionOrdersFrame;\n'+router+'\nreturn {forwardFinanceConnection,forwardFinancePaymentSample,forwardFinanceDailyOrders};\n})();\n'
    store=(FINANCE/'src/connection-store.mjs').read_text()
    store=re.sub(r'^export\s+', '', store, flags=re.M)
    worker=(FINANCE/'src/connection-worker.mjs').read_text()
    if worker.count(preview_import)!=1 or worker.count(catalog_import)!=1 or worker.count(period_import)!=1 or worker.count(daily_import)!=1 or worker.count(business_import)!=1 or worker.count(production_import)!=1 or worker.count(product_index_import)!=1 or worker.count(historical_import)!=1 or worker.count(reconciliation_import)!=1 or worker.count(escrow_release_import)!=1:
        raise SystemExit('Shared worker import not unique; candidate not built.')
    worker=worker.replace(preview_import,'').replace(catalog_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,'').replace(production_import,'').replace(product_index_import,'').replace(historical_import,'').replace(reconciliation_import,'').replace(escrow_release_import,'')
    worker=re.sub(r'^import\s+[\s\S]*?\s+from\s+[\'"]\./connection-store\.mjs[\'"];?\s*\n','',worker,count=1)
    if re.search(r'^import\b',worker,re.M):
        raise SystemExit('Unreviewed worker import; candidate not built.')
    bundled=preview_bundle+catalog_bundle+period_bundle+daily_bundle+business_bundle+production_bundle+product_index_bundle+historical_bundle+reconciliation_bundle+escrow_release_bundle+'\nconst {'+product_index_names+'}=brazaProductIndexFrame;\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {'+catalog_names+'}=brazaVariantCatalogFrame;\nconst {'+historical_names+'}=brazaHistoricalVariantEvidenceFrame;\nconst {'+reconciliation_names+'}=brazaReconciliationFrame;\nconst {'+escrow_release_names+'}=brazaEscrowReleaseFrame;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\nconst {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches}=brazaProductionOrdersFrame;\nconst brazaFinanceStore = (() => {\n'+store+'\nreturn {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore};\n})();\nconst {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore}=brazaFinanceStore;\n'+worker
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
