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
    catalog_media=(FINANCE/'src/catalog-media-frame.mjs').read_text()
    if re.search(r'^import\b',catalog_media,re.M):
        raise SystemExit('Unreviewed catalog media frame import; candidate not built.')
    catalog_media=re.sub(r'^export\s+', '', catalog_media, flags=re.M)
    catalog_media_names='projectCatalogMediaFrame'
    catalog_media_bundle='const brazaCatalogMediaFrame = (() => {\n'+catalog_media+'\nreturn {'+catalog_media_names+'};\n})();\n'
    catalog_media_import="import {"+catalog_media_names+"} from './catalog-media-frame.mjs';\n"
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
    business_variants=(FINANCE/'src/business-variant-attribution.mjs').read_text()
    variant_period_import="import {projectBusinessPeriodFrame} from './business-period-frame.mjs';\n"
    if business_variants.count(variant_period_import)!=1 or re.search(r'^import\b',business_variants.replace(variant_period_import,''),re.M):
        raise SystemExit('Unreviewed business variant import; candidate not built.')
    business_variants=re.sub(r'^export\s+', '', business_variants.replace(variant_period_import,''), flags=re.M)
    business_variants_names='projectBusinessVariantBreakdown,buildBusinessVariantBreakdown,projectBusinessPeriodVariantsFrame,buildBusinessPeriodVariantsFrame'
    business_variants_bundle='const brazaBusinessPeriodVariants = (() => {\nconst {projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\n'+business_variants+'\nreturn {'+business_variants_names+'};\n})();\n'
    business_variants_import="import {projectBusinessPeriodVariantsFrame} from './business-variant-attribution.mjs';\n"
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
    original_items=(FINANCE/'src/original-items-frame.mjs').read_text()
    if re.search(r'^import\b',original_items,re.M):
        raise SystemExit('Unreviewed original items frame import; candidate not built.')
    original_items=re.sub(r'^export\s+', '', original_items, flags=re.M)
    original_items_names='projectOriginalItemsFrame,projectReconciliationOriginalItemsFrame'
    original_items_bundle='const brazaOriginalItemsFrame = (() => {\n'+original_items+'\nreturn {'+original_items_names+'};\n})();\n'
    original_items_import="import {"+original_items_names+"} from './original-items-frame.mjs';\n"
    escrow_release=(FINANCE/'src/escrow-release-frame.mjs').read_text()
    if re.search(r'^import\b',escrow_release,re.M):
        raise SystemExit('Unreviewed escrow release frame import; candidate not built.')
    escrow_release=re.sub(r'^export\s+', '', escrow_release, flags=re.M)
    escrow_release_names='projectEscrowReleaseRequest,projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageRequest,projectEscrowReleaseCoverageFrame,escrowReleaseRequestMatches,escrowReleaseCoverageRequestMatches'
    escrow_release_bundle='const brazaEscrowReleaseFrame = (() => {\n'+escrow_release+'\nreturn {'+escrow_release_names+'};\n})();\n'
    escrow_release_import="import {"+escrow_release_names+"} from './escrow-release-frame.mjs';\n"
    income_overview=(FINANCE/'src/income-overview-frame.mjs').read_text()
    if re.search(r'^import\b',income_overview,re.M):
        raise SystemExit('Unreviewed income overview frame import; candidate not built.')
    income_overview=re.sub(r'^export\s+', '', income_overview, flags=re.M)
    income_overview_names='projectIncomeOverviewFrame'
    income_overview_bundle='const brazaIncomeOverviewFrame = (() => {\n'+income_overview+'\nreturn {'+income_overview_names+'};\n})();\n'
    income_overview_import="import {"+income_overview_names+"} from './income-overview-frame.mjs';\n"
    income_detail=(FINANCE/'src/income-detail-frame.mjs').read_text()
    if re.search(r'^import\b',income_detail,re.M):
        raise SystemExit('Unreviewed income detail frame import; candidate not built.')
    income_detail=re.sub(r'^export\s+', '', income_detail, flags=re.M)
    income_detail_names='projectIncomeDetailFrame'
    income_detail_bundle='const brazaIncomeDetailFrame = (() => {\n'+income_detail+'\nreturn {'+income_detail_names+'};\n})();\n'
    income_detail_import="import {"+income_detail_names+"} from './income-detail-frame.mjs';\n"
    pending_income=(FINANCE/'src/pending-income-frame.mjs').read_text()
    pending_detail_import="import {projectIncomeDetailFrame} from './income-detail-frame.mjs';\n"
    if pending_income.count(pending_detail_import)!=1:
        raise SystemExit('Unreviewed Pending scan frame import; candidate not built.')
    pending_income=pending_income.replace(pending_detail_import,'')
    if re.search(r'^import\b',pending_income,re.M):
        raise SystemExit('Unreviewed Pending scan frame import; candidate not built.')
    pending_income=re.sub(r'^export\s+', '', pending_income, flags=re.M)
    pending_income_names='projectPendingIncomeScanRequest,projectPendingIncomeScanFrame'
    pending_income_bundle='const brazaPendingIncomeFrame = (() => {\nconst {projectIncomeDetailFrame}=brazaIncomeDetailFrame;\n'+pending_income+'\nreturn {'+pending_income_names+'};\n})();\n'
    pending_income_import="import {"+pending_income_names+"} from './pending-income-frame.mjs';\n"
    income_diagnostic=(FINANCE/'src/income-detail-diagnostic.mjs').read_text()
    if re.search(r'^import\b',income_diagnostic,re.M):
        raise SystemExit('Unreviewed income detail diagnostic import; candidate not built.')
    income_diagnostic=re.sub(r'^export\s+', '', income_diagnostic, flags=re.M)
    income_diagnostic_names='projectIncomeDetailDiagnostic,incomeDetailFailureDiagnostic'
    income_diagnostic_bundle='const brazaIncomeDetailDiagnostic = (() => {\n'+income_diagnostic+'\nreturn {'+income_diagnostic_names+'};\n})();\n'
    income_diagnostic_import="import {"+income_diagnostic_names+"} from './income-detail-diagnostic.mjs';\n"
    daily=(FINANCE/'src/daily-orders-frame.mjs').read_text()
    if re.search(r'^import\b',daily,re.M):
        raise SystemExit('Unreviewed daily orders frame import; candidate not built.')
    daily=re.sub(r'^export\s+', '', daily, flags=re.M)
    daily_bundle='const brazaDailyOrdersFrame = (() => {\n'+daily+'\nreturn {projectDailyOrdersFrame};\n})();\n'
    daily_import="import {projectDailyOrdersFrame} from './daily-orders-frame.mjs';\n"
    external_cash=(FINANCE/'src/external-cash-frame.mjs').read_text()
    if re.search(r'^import\b',external_cash,re.M):
        raise SystemExit('Unreviewed external cash frame import; candidate not built.')
    external_cash=re.sub(r'^export\s+', '', external_cash, flags=re.M)
    external_cash_names='EXTERNAL_CASH_PATH,EXTERNAL_CASH_REQUEST_MAXIMUM,EXTERNAL_CASH_RESPONSE_MAXIMUM,projectExternalCashRequest,projectExternalCashResponse,externalCashResponseMatches,projectExternalCashError,externalCashErrorStatus'
    external_cash_bundle='const brazaExternalCashFrame = (() => {\n'+external_cash+'\nreturn {'+external_cash_names+'};\n})();\n'
    external_cash_import="import {"+external_cash_names+"} from './external-cash-frame.mjs';\n"
    cash_period=(FINANCE/'src/external-cash-period-frame.mjs').read_text()
    if re.search(r'^import\b',cash_period,re.M):
        raise SystemExit('Unreviewed cash period frame import; candidate not built.')
    cash_period=re.sub(r'^export\s+', '', cash_period, flags=re.M)
    cash_period_names='EXTERNAL_CASH_PERIOD_PATH,EXTERNAL_CASH_PERIOD_REQUEST_MAXIMUM,EXTERNAL_CASH_PERIOD_RESPONSE_MAXIMUM,projectExternalCashPeriodRequest,projectExternalCashPeriodResponse,externalCashPeriodResponseMatches'
    cash_period_bundle='const brazaExternalCashPeriodFrame = (() => {\n'+cash_period+'\nreturn {'+cash_period_names+'};\n})();\n'
    cash_period_import="import {"+cash_period_names+"} from './external-cash-period-frame.mjs';\n"
    router_source=(FINANCE/'src/auth-router.mjs').read_text()
    if router_source.count(external_cash_import)!=1:
        raise SystemExit('External cash router import not unique; candidate not built.')
    router_source=router_source.replace(external_cash_import,'')
    if router_source.count(cash_period_import)!=1:
        raise SystemExit('Cash period router import not unique; candidate not built.')
    router_source=router_source.replace(cash_period_import,'')
    if router_source.count(preview_import)!=1 or router_source.count(catalog_import)!=1 or router_source.count(catalog_media_import)!=1 or router_source.count(period_import)!=1 or router_source.count(daily_import)!=1 or router_source.count(business_import)!=1 or router_source.count(business_variants_import)!=1 or router_source.count(production_import)!=1 or router_source.count(product_index_import)!=1 or router_source.count(historical_import)!=1 or router_source.count(reconciliation_import)!=1 or router_source.count(original_items_import)!=1 or router_source.count(escrow_release_import)!=1 or router_source.count(income_overview_import)!=1 or router_source.count(income_detail_import)!=1 or router_source.count(income_diagnostic_import)!=1 or router_source.count(pending_income_import)!=1:
        raise SystemExit('Shared router import not unique; candidate not built.')
    router=re.sub(r'^export\s+', '', router_source.replace(preview_import,'').replace(catalog_import,'').replace(catalog_media_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,'').replace(business_variants_import,'').replace(production_import,'').replace(product_index_import,'').replace(historical_import,'').replace(reconciliation_import,'').replace(original_items_import,'').replace(escrow_release_import,'').replace(income_overview_import,'').replace(income_detail_import,'').replace(income_diagnostic_import,'').replace(pending_income_import,''), flags=re.M)
    if re.search(r'^import\b',router,re.M):
        raise SystemExit('Unreviewed router import; candidate not built.')
    needle='    const url = new URL(request.url);'
    auth=original.decode()
    if auth.count(needle)!=1:
        raise SystemExit('Auth insertion point not unique.')
    addition="\n    if (url.pathname === '/internal/shopee/finance/daily-orders') return brazaFinanceRouter.forwardFinanceDailyOrders(request, env, {validateInternalApp});\n    if (url.pathname.startsWith('/shopee/finance/')) return brazaFinanceRouter.forwardFinanceConnection(request, env);\n    if (url.pathname === '/internal/shopee/finance/payment-sample' || url.pathname === '/internal/shopee/finance/payment-preview' || url.pathname === '/internal/shopee/finance/variant-catalog' || url.pathname === '/internal/shopee/finance/store-period' || url.pathname === '/internal/shopee/finance/business-period' || url.pathname === '/internal/shopee/finance/production-orders' || url.pathname === '/internal/shopee/finance/historical-variant-evidence') return brazaFinanceRouter.forwardFinancePaymentSample(request, env, {validateInternalApp});"
    addition=addition.replace("url.pathname === '/internal/shopee/finance/payment-sample'", "url.pathname === '/internal/shopee/finance/product-index' || url.pathname === '/internal/shopee/finance/payment-sample'")
    addition=addition.replace("url.pathname === '/internal/shopee/finance/product-index'", "url.pathname === '/internal/shopee/finance/reconciliation' || url.pathname === '/internal/shopee/finance/product-index'")
    addition=addition.replace("url.pathname === '/internal/shopee/finance/reconciliation'", "url.pathname === '/internal/shopee/finance/escrow-releases' || url.pathname === '/internal/shopee/finance/income-overview' || url.pathname === '/internal/shopee/finance/income-detail' || url.pathname === '/internal/shopee/finance/reconciliation'")
    auth=auth.replace(needle,needle+addition,1)
    auth=auth.replace(needle,needle+"\n    if (url.pathname === '/internal/finance/external-cash-v1') return brazaFinanceRouter.forwardExternalCash(request, env, {validateInternalApp});\n    if (url.pathname === '/internal/finance/external-cash-period-v1') return brazaFinanceRouter.forwardExternalCashPeriod(request, env, {validateInternalApp});",1)
    auth+='\n\n'+external_cash_bundle+'\nconst {'+external_cash_names+'}=brazaExternalCashFrame;\n'
    auth+='\n'+cash_period_bundle+'\nconst {'+cash_period_names+'}=brazaExternalCashPeriodFrame;\n'
    auth+='\n\n'+preview_bundle+catalog_bundle+catalog_media_bundle+period_bundle+daily_bundle+business_bundle+business_variants_bundle+production_bundle+product_index_bundle+historical_bundle+reconciliation_bundle+original_items_bundle+escrow_release_bundle+income_overview_bundle+income_detail_bundle+pending_income_bundle+income_diagnostic_bundle+'\nconst brazaFinanceRouter = (() => {\nconst {'+pending_income_names+'}=brazaPendingIncomeFrame;\nconst {'+product_index_names+'}=brazaProductIndexFrame;\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {'+catalog_names+'}=brazaVariantCatalogFrame;\nconst {'+catalog_media_names+'}=brazaCatalogMediaFrame;\nconst {'+historical_names+'}=brazaHistoricalVariantEvidenceFrame;\nconst {'+reconciliation_names+'}=brazaReconciliationFrame;\nconst {'+original_items_names+'}=brazaOriginalItemsFrame;\nconst {'+escrow_release_names+'}=brazaEscrowReleaseFrame;\nconst {'+income_overview_names+'}=brazaIncomeOverviewFrame;\nconst {'+income_detail_names+'}=brazaIncomeDetailFrame;\nconst {'+income_diagnostic_names+'}=brazaIncomeDetailDiagnostic;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\nconst {projectBusinessPeriodVariantsFrame}=brazaBusinessPeriodVariants;\nconst {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches}=brazaProductionOrdersFrame;\n'+router+'\nreturn {forwardFinanceConnection,forwardFinancePaymentSample,forwardFinanceDailyOrders};\n})();\n'
    store=(FINANCE/'src/connection-store.mjs').read_text()
    old_router_exports='return {forwardFinanceConnection,forwardFinancePaymentSample,forwardFinanceDailyOrders};'
    if auth.count(old_router_exports)!=1:
        raise SystemExit('Finance router exports not unique; candidate not built.')
    auth=auth.replace(old_router_exports,'return {forwardFinanceConnection,forwardFinancePaymentSample,forwardFinanceDailyOrders,forwardExternalCash,forwardExternalCashPeriod};',1)
    store=re.sub(r'^export\s+', '', store, flags=re.M)
    worker=(FINANCE/'src/connection-worker.mjs').read_text()
    if worker.count(preview_import)!=1 or worker.count(catalog_import)!=1 or worker.count(catalog_media_import)!=1 or worker.count(period_import)!=1 or worker.count(daily_import)!=1 or worker.count(business_import)!=1 or worker.count(business_variants_import)!=1 or worker.count(production_import)!=1 or worker.count(product_index_import)!=1 or worker.count(historical_import)!=1 or worker.count(reconciliation_import)!=1 or worker.count(original_items_import)!=1 or worker.count(escrow_release_import)!=1 or worker.count(income_overview_import)!=1 or worker.count(income_detail_import)!=1 or worker.count(income_diagnostic_import)!=1 or worker.count(pending_income_import)!=1:
        raise SystemExit('Shared worker import not unique; candidate not built.')
    worker=worker.replace(preview_import,'').replace(catalog_import,'').replace(catalog_media_import,'').replace(period_import,'').replace(daily_import,'').replace(business_import,'').replace(business_variants_import,'').replace(production_import,'').replace(product_index_import,'').replace(historical_import,'').replace(reconciliation_import,'').replace(original_items_import,'').replace(escrow_release_import,'').replace(income_overview_import,'').replace(income_detail_import,'').replace(income_diagnostic_import,'').replace(pending_income_import,'')
    worker=re.sub(r'^import\s+[\s\S]*?\s+from\s+[\'"]\./connection-store\.mjs[\'"];?\s*\n','',worker,count=1)
    if re.search(r'^import\b',worker,re.M):
        raise SystemExit('Unreviewed worker import; candidate not built.')
    bundled=preview_bundle+catalog_bundle+catalog_media_bundle+period_bundle+daily_bundle+business_bundle+business_variants_bundle+production_bundle+product_index_bundle+historical_bundle+reconciliation_bundle+original_items_bundle+escrow_release_bundle+income_overview_bundle+income_detail_bundle+pending_income_bundle+income_diagnostic_bundle+'\nconst {'+income_detail_names+'}=brazaIncomeDetailFrame;\nconst {'+pending_income_names+'}=brazaPendingIncomeFrame;\nconst {'+income_diagnostic_names+'}=brazaIncomeDetailDiagnostic;\nconst {'+product_index_names+'}=brazaProductIndexFrame;\nconst {projectFinancePaymentPreview}=brazaFinancePreviewFrame;\nconst {'+catalog_names+'}=brazaVariantCatalogFrame;\nconst {'+catalog_media_names+'}=brazaCatalogMediaFrame;\nconst {'+historical_names+'}=brazaHistoricalVariantEvidenceFrame;\nconst {'+reconciliation_names+'}=brazaReconciliationFrame;\nconst {'+original_items_names+'}=brazaOriginalItemsFrame;\nconst {'+escrow_release_names+'}=brazaEscrowReleaseFrame;\nconst {'+income_overview_names+'}=brazaIncomeOverviewFrame;\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\nconst {projectBusinessPeriodVariantsFrame}=brazaBusinessPeriodVariants;\nconst {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches}=brazaProductionOrdersFrame;\nconst brazaFinanceStore = (() => {\n'+store+'\nreturn {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore};\n})();\nconst {FINANCE_PROFILE,FinanceConnectionError,createFinanceStore}=brazaFinanceStore;\n'+worker
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
