"""Build paste-ready Workers, preserving supplied originals."""
from pathlib import Path
import hashlib,json
import re
root=Path(__file__).resolve().parent

def freeze_client_helpers(source, helpers):
    """Embed helper source before Wrangler can rename functions or their closures.

    These named exports use column-zero closing braces. Keep the source as a
    JSON string interpolation so template literals and regular expressions in
    the helper retain their exact spelling inside the browser script.
    """
    for name, filename in helpers.items():
        marker='${'+name+'.toString()}'
        functions=re.findall(r'^export function '+re.escape(name)+r'\([\s\S]*?^\}', (root/'src'/filename).read_text(),flags=re.M)
        if source.count(marker)!=1 or len(functions)!=1:
            raise ValueError('Cannot snapshot browser helper: '+name)
        source=source.replace(marker,'${'+json.dumps(functions[0].removeprefix('export '))+'}',1)
    return source

original=(root/'original/app-worker.mjs').read_text()
admin=(root/'src/admin.mjs').read_text().replace("import {CLIENT} from './admin-client.mjs';\n",'').replace("import {CSS,adminBody,loginBody} from './admin-view.mjs';\n",'')
report=(root/'src/admin-report.mjs').read_text().replace('export function parseReport','function parseReport')
client=report+'\n'+re.sub(r'^import .*\n','',freeze_client_helpers((root/'src/admin-client.mjs').read_text(),{'parseReport':'admin-report.mjs','projectAdsMeasurement':'ads-measurement.mjs','createAdminApiClient':'admin-api-client.mjs','createAdminStartup':'admin-startup.mjs','projectHermesFinancialContext':'hermes-financial-context.mjs'}),flags=re.M).replace('export const CLIENT','const CLIENT')
view=re.sub(r'^import .*\n','',(root/'src/admin-view.mjs').read_text(),flags=re.M).replace('export const CSS','const CSS').replace('export function adminBody','function adminBody').replace('export function loginBody','function loginBody')
month_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-month-view.mjs').read_text(),flags=re.M),flags=re.M)
month_client=re.sub(r'^export ', '', re.sub(r'^import .*\n','',freeze_client_helpers((root/'src/business-month-client.mjs').read_text(),{'projectBusinessMonthView':'business-month-view-state.mjs','buildMonthlyFinancialSummary':'business-month-summary.mjs','projectAdsCalendar':'ads-calendar.mjs','projectBusinessMonthProducts':'business-month-products.mjs','projectBusinessMonth':'business-month.mjs','buildBusinessCheckpoint':'business-checkpoint.mjs','buildAccountDiagnosis':'account-diagnosis.mjs','projectBusinessCostDiagnostics':'business-cost-diagnostics.mjs','projectBusinessCostDiagnosticsEvidence':'business-cost-diagnostics.mjs','projectHistoricalCostPairDiagnostics':'historical-cost-evidence.mjs','projectRecordedBusinessBalance':'business-recorded-balance.mjs','buildRecordedBusinessBalance':'business-recorded-balance.mjs','projectBusinessCostDiagnosticsEvidenceV2':'business-cost-diagnostics.mjs','deriveHistoricalCostComposition':'historical-cost-evidence.mjs','projectHistoricalCostPairDiagnosticsEvidence':'historical-cost-evidence.mjs','projectBackgroundCollectionDiagnostics':'background-collection-diagnostics.mjs'}),flags=re.M),flags=re.M)
automation_workspace=re.sub(r'^export ', '', (root/'src/automation-workspace.mjs').read_text(),flags=re.M)
automation_workspace='const brazaAutomationWorkspaceView = (() => {\n'+automation_workspace+'\nreturn {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT};\n})();\nconst {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT}=brazaAutomationWorkspaceView;\n'
business_sync=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-sync.mjs').read_text(),flags=re.M),flags=re.M)
business_sync='const brazaBusinessSync = (() => {\n'+business_sync+'\nreturn {BUSINESS_SYNC_SCHEMA,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError};\n})();\nconst {BUSINESS_SYNC_SCHEMA,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError}=brazaBusinessSync;\n'
business_products=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-month-products.mjs').read_text(),flags=re.M),flags=re.M)
business_products='const brazaBusinessProducts = (() => {\n'+business_products+'\nreturn {buildBusinessMonthProducts,projectBusinessMonthProducts};\n})();\nconst {buildBusinessMonthProducts,projectBusinessMonthProducts}=brazaBusinessProducts;\n'
cost_rule_learning=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/cost-rule-learning.mjs').read_text(),flags=re.M),flags=re.M)
cost_rule_learning='const brazaCostRuleLearning = (() => {\n'+cost_rule_learning+'\nreturn {costRuleProductLearning};\n})();\nconst {costRuleProductLearning}=brazaCostRuleLearning;\n'
catalog_classification=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/catalog-classification.mjs').read_text(),flags=re.M),flags=re.M)
catalog_classification='const brazaCatalogClassification = (() => {\n'+catalog_classification+'\nreturn {CATALOG_CLASSIFICATION_SCHEMA,CatalogClassificationError,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState,catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame,readCatalogClassificationFence,refreshKnownCatalogClassifications,enqueueSoldCatalogGaps};\n})();\nconst {CATALOG_CLASSIFICATION_SCHEMA,CatalogClassificationError,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState,catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame,readCatalogClassificationFence,refreshKnownCatalogClassifications,enqueueSoldCatalogGaps}=brazaCatalogClassification;\n'
historical_cost_evidence=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/historical-cost-evidence.mjs').read_text(),flags=re.M),flags=re.M)
historical_cost_evidence='const brazaHistoricalCostEvidence = (() => {\n'+historical_cost_evidence+'\nreturn {HISTORICAL_COST_EVIDENCE_SCHEMA,HistoricalCostEvidenceError,readHistoricalCostEvidence,syncHistoricalCostEvidence,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics,historicalCostPairDiagnosticsEvidenceFromSnapshot,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition};\n})();\nconst {HISTORICAL_COST_EVIDENCE_SCHEMA,HistoricalCostEvidenceError,readHistoricalCostEvidence,syncHistoricalCostEvidence,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics,historicalCostPairDiagnosticsEvidenceFromSnapshot,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition}=brazaHistoricalCostEvidence;\n'
historical_cost_orchestration=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/historical-cost-orchestration.mjs').read_text(),flags=re.M),flags=re.M)
historical_cost_orchestration='const brazaHistoricalCostOrchestration = (() => {\n'+historical_cost_orchestration+'\nreturn {BACKGROUND_LANE_SCHEMA,HistoricalCostOrchestrationError,acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates};\n})();\nconst {BACKGROUND_LANE_SCHEMA,HistoricalCostOrchestrationError,acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates}=brazaHistoricalCostOrchestration;\n'
cost_rules=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/cost-rules.mjs').read_text(),flags=re.M),flags=re.M)
cost_rules='const brazaCostRulesStore = (() => {\n'+cost_rules+'\nreturn {COST_RULE_SCHEMA,readCostRules,saveCostRules,assignCostRules,readCostRuleReference,syncCostRuleCatalog,selectCostRuleCandidates,validateCostRules,evaluateCostRules,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference,CostRuleError};\n})();\nconst {COST_RULE_SCHEMA,readCostRules,saveCostRules,assignCostRules,readCostRuleReference,syncCostRuleCatalog,selectCostRuleCandidates,validateCostRules,evaluateCostRules,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference,CostRuleError}=brazaCostRulesStore;\n'
cost_rules_view=re.sub(r'^export ', '', (root/'src/cost-rules-view.mjs').read_text(),flags=re.M)
dtf_layout=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/dtf-layout.mjs').read_text(),flags=re.M),flags=re.M)
dtf_layout='const brazaDtfLayout = (() => {\n'+dtf_layout+'\nreturn {createDtfEngine,normalizeDtfArtKey,parseDtfSku,validateDtfSettings,planDtfLayout,DTF_ENGINE_CLIENT};\n})();\nconst {createDtfEngine,normalizeDtfArtKey,parseDtfSku,validateDtfSettings,planDtfLayout,DTF_ENGINE_CLIENT}=brazaDtfLayout;\n'
dtf_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/dtf-view.mjs').read_text(),flags=re.M),flags=re.M)
dtf_view='const brazaDtfView = (() => {\n'+dtf_view+'\nreturn {DTF_CSS,dtfBody,DTF_CLIENT};\n})();\nconst {DTF_CSS,dtfBody,DTF_CLIENT}=brazaDtfView;\n'
production_dtf=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/production-dtf-store.mjs').read_text(),flags=re.M),flags=re.M)
production_dtf='const brazaProductionDtfStore = (() => {\n'+production_dtf+'\nreturn {PRODUCTION_DTF_SCHEMA,ProductionDtfError,readProductionDtf,saveProductionDtfSettings,syncProductionDtf,prepareProductionDtfBatch,actProductionDtfBatch};\n})();\nconst {PRODUCTION_DTF_SCHEMA,ProductionDtfError,readProductionDtf,saveProductionDtfSettings,syncProductionDtf,prepareProductionDtfBatch,actProductionDtfBatch}=brazaProductionDtfStore;\n'
business_checkpoint=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-checkpoint.mjs').read_text(),flags=re.M),flags=re.M)
business_checkpoint='const brazaBusinessCheckpoint = (() => {\n'+business_checkpoint+'\nreturn {BUSINESS_CHECKPOINT_SCHEMA,buildBusinessCheckpoint,recordBusinessCheckpoint,readBusinessCheckpoints,businessMonthWithCheckpoint,BusinessCheckpointError};\n})();\nconst {BUSINESS_CHECKPOINT_SCHEMA,buildBusinessCheckpoint,recordBusinessCheckpoint,readBusinessCheckpoints,businessMonthWithCheckpoint,BusinessCheckpointError}=brazaBusinessCheckpoint;\n'
def source_namespace(filename, namespace, names, helpers=None):
    raw=(root/'src'/filename).read_text()
    if helpers: raw=freeze_client_helpers(raw,helpers)
    source=re.sub(r'^export ', '', re.sub(r'^import .*\n','',raw,flags=re.M),flags=re.M)
    return 'const '+namespace+' = (() => {\n'+source+'\nreturn {'+names+'};\n})();\nconst {'+names+'}='+namespace+';\n'
reconciliation_frame=source_namespace('../../finance/src/reconciliation-frame.mjs','brazaReconciliationFrame','projectReconciliationRequest,projectReconciliationFrame,reconciliationRequestMatches')
business_reconciliation=source_namespace('business-reconciliation.mjs','brazaBusinessReconciliation','BUSINESS_RECONCILIATION_SCHEMA,BusinessReconciliationError,projectBusinessReconciliation,readBusinessReconciliation,runBusinessReconciliation')
business_reconciliation_view=source_namespace('business-reconciliation-view.mjs','brazaBusinessReconciliationView','BUSINESS_RECONCILIATION_CSS,businessReconciliationBody,BUSINESS_RECONCILIATION_CLIENT',{'projectReconciliationFrame':'../../finance/src/reconciliation-frame.mjs','projectBusinessReconciliation':'business-reconciliation.mjs'})
business_month_ads_history=source_namespace('business-month-ads-history.mjs','brazaBusinessMonthAdsHistory','BUSINESS_MONTH_ADS_HISTORY_SCHEMA,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements')
business_month_publication=source_namespace('business-month-publication.mjs','brazaBusinessMonthPublication','BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth')
business_month_view_state=source_namespace('business-month-view-state.mjs','brazaBusinessMonthViewState','BusinessMonthViewError,buildBusinessMonthView,requestBusinessMonthRefresh,projectBusinessMonthView')
business_month=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-month.mjs').read_text(),flags=re.M),flags=re.M)
business_tax=re.sub(r'^export ', '', (root/'src/business-tax-policy.mjs').read_text(),flags=re.M)
business_month='const brazaBusinessMonth = (() => {\n'+business_tax+'\n'+business_month+'\nreturn {BUSINESS_MONTH_SCHEMA,businessMonth,readBusinessMonthDisplay,projectBusinessMonth,BusinessMonthError,businessMonthClientFrame,readBusinessMonthAdsState,readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError};\n})();\nconst {BUSINESS_MONTH_SCHEMA,businessMonth,readBusinessMonthDisplay,projectBusinessMonth,BusinessMonthError,businessMonthClientFrame,readBusinessMonthAdsState,readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError}=brazaBusinessMonth;\n'
# The financial snapshot uses the same deterministic summaries as the owner page.
hermes_context=''
for filename in ['business-month-summary.mjs','account-diagnosis.mjs','hermes-financial-context.mjs']:
    hermes_context+='\n'+re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src'/filename).read_text(),flags=re.M),flags=re.M)
hermes_context='const brazaHermesFinancialContext = (() => {\n'+hermes_context+'\nreturn {HERMES_FINANCIAL_CONTEXT_SCHEMA,HermesFinancialContextError,prepareHermesFinancialContext,readHermesFinancialContext,buildMonthlyFinancialSummary};\n})();\nconst {HERMES_FINANCIAL_CONTEXT_SCHEMA,HermesFinancialContextError,prepareHermesFinancialContext,readHermesFinancialContext,buildMonthlyFinancialSummary}=brazaHermesFinancialContext;\n'
recorded_business_balance=re.sub(r'^export ', '', (root/'src/business-recorded-balance.mjs').read_text(),flags=re.M)
recorded_business_balance='const brazaRecordedBusinessBalance = (() => {\n'+recorded_business_balance+'\nreturn {buildRecordedBusinessBalance,projectRecordedBusinessBalance};\n})();\nconst {buildRecordedBusinessBalance,projectRecordedBusinessBalance}=brazaRecordedBusinessBalance;\n'
background_collection_diagnostics=re.sub(r'^export ', '', (root/'src/background-collection-diagnostics.mjs').read_text(),flags=re.M)
background_collection_diagnostics='const brazaBackgroundCollectionDiagnostics = (() => {\n'+background_collection_diagnostics+'\nreturn {readBackgroundCollectionDiagnostics,projectBackgroundCollectionDiagnostics};\n})();\nconst {readBackgroundCollectionDiagnostics,projectBackgroundCollectionDiagnostics}=brazaBackgroundCollectionDiagnostics;\n'
business_cost_diagnostics=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-cost-diagnostics.mjs').read_text(),flags=re.M),flags=re.M)
business_cost_diagnostics='const brazaBusinessCostDiagnostics = (() => {\n'+business_cost_diagnostics+'\nreturn {BusinessCostDiagnosticsError,readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2};\n})();\nconst {BusinessCostDiagnosticsError,readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2}=brazaBusinessCostDiagnostics;\n'
operator_cost_corrections=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/operator-cost-corrections.mjs').read_text(),flags=re.M),flags=re.M)
operator_cost_corrections='const brazaOperatorCostCorrections = (() => {\n'+operator_cost_corrections+'\nreturn {OPERATOR_COST_CORRECTIONS_SCHEMA,OperatorCostCorrectionError,applyConfirmedOperatorCostCorrections};\n})();\nconst {OPERATOR_COST_CORRECTIONS_SCHEMA,OperatorCostCorrectionError,applyConfirmedOperatorCostCorrections}=brazaOperatorCostCorrections;\n'
saved_order_items=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/saved-order-items.mjs').read_text(),flags=re.M),flags=re.M)
saved_order_items='const brazaSavedOrderItems = (() => {\n'+saved_order_items+'\nreturn {SAVED_ORDER_ITEMS_SCHEMA,SavedOrderItemsError,saveOrderItemsSnapshot,readOrderItemsSnapshot};\n})();\nconst {SAVED_ORDER_ITEMS_SCHEMA,SavedOrderItemsError,saveOrderItemsSnapshot,readOrderItemsSnapshot}=brazaSavedOrderItems;\n'
product_registry=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/product-registry.mjs').read_text(),flags=re.M),flags=re.M)
product_registry='const brazaProductRegistry = (() => {\n'+product_registry+'\nreturn {PRODUCT_REGISTRY_SCHEMA,ProductRegistryError,readProductRegistry,runProductRegistry,projectProductRegistryFrame};\n})();\nconst {PRODUCT_REGISTRY_SCHEMA,ProductRegistryError,readProductRegistry,runProductRegistry,projectProductRegistryFrame}=brazaProductRegistry;\n'
production_cost_periods=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/production-cost-periods.mjs').read_text(),flags=re.M),flags=re.M)
production_cost_periods='const brazaProductionCostPeriods = (() => {\n'+production_cost_periods+'\nreturn {PRODUCTION_COST_PERIODS_SCHEMA,ProductionCostPeriodsError,productionCostPeriods,captureProductionCostMonth};\n})();\nconst {PRODUCTION_COST_PERIODS_SCHEMA,ProductionCostPeriodsError,productionCostPeriods,captureProductionCostMonth}=brazaProductionCostPeriods;\n'
production_cost_periods_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/production-cost-periods-view.mjs').read_text(),flags=re.M),flags=re.M)
saved_catalog_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',freeze_client_helpers((root/'src/saved-catalog-view.mjs').read_text(),{'projectProductRegistryFrame':'product-registry.mjs'}),flags=re.M),flags=re.M)
ads=re.sub(r'^import .*\n','',(root/'src/admin-ads-today.mjs').read_text(),flags=re.M).replace('export function adsToday','function adsToday')
orders=(root/'src/shop-orders.mjs').read_text().replace('export function shopOrders','function shopOrders')
daily_shop_orders=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/daily-shop-orders.mjs').read_text(),flags=re.M),flags=re.M)
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
variant_catalog_frame='const brazaVariantCatalogFrame = (() => {\n'+variant_catalog_frame+'\nreturn {projectVariantCatalog,projectVariantCatalogRequest,projectProductCostCatalog,projectVariantCatalogFailure,financeCatalogDiagnostic};\n})();\nconst {projectVariantCatalog,projectVariantCatalogRequest,projectProductCostCatalog,projectVariantCatalogFailure,financeCatalogDiagnostic}=brazaVariantCatalogFrame;\n'
historical_variant_frame=re.sub(r'^export ', '', (root.parent/'finance/src/historical-variant-evidence-frame.mjs').read_text(),flags=re.M)
historical_variant_frame='const brazaHistoricalVariantFrame = (() => {\n'+historical_variant_frame+'\nreturn {projectHistoricalVariantEvidenceRequest,projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches,historicalVariantEvidenceDiagnostic};\n})();\nconst {projectHistoricalVariantEvidenceRequest,projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches,historicalVariantEvidenceDiagnostic}=brazaHistoricalVariantFrame;\n'
app_historical_variant=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-historical-variant-evidence.mjs').read_text(),flags=re.M),flags=re.M)
app_historical_variant='const brazaHistoricalVariantAdapter = (() => {\n'+app_historical_variant+'\nreturn {getFinanceHistoricalVariantEvidence};\n})();\nconst {getFinanceHistoricalVariantEvidence}=brazaHistoricalVariantAdapter;\n'
daily_orders_frame=re.sub(r'^export ', '', (root.parent/'finance/src/daily-orders-frame.mjs').read_text(), flags=re.M)
daily_orders_frame='const brazaDailyOrdersFrame = (() => {\n'+daily_orders_frame+'\nreturn {projectDailyOrdersFrame};\n})();\nconst {projectDailyOrdersFrame}=brazaDailyOrdersFrame;\n'
store_period_frame=re.sub(r'^export ', '', (root.parent/'finance/src/store-period-frame.mjs').read_text(), flags=re.M)
store_period_frame='const brazaStorePeriodFrame = (() => {\n'+store_period_frame+'\nreturn {projectStorePeriodRequest,projectStorePeriodFrame};\n})();\nconst {projectStorePeriodRequest,projectStorePeriodFrame}=brazaStorePeriodFrame;\n'
app_store_period=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-store-period.mjs').read_text(),flags=re.M),flags=re.M)
business_period_frame=re.sub(r'^export ', '', (root.parent/'finance/src/business-period-frame.mjs').read_text(), flags=re.M)
business_period_frame='const brazaBusinessPeriodFrame = (() => {\n'+business_period_frame+'\nreturn {projectBusinessPeriodRequest,projectBusinessPeriodFrame};\n})();\nconst {projectBusinessPeriodRequest,projectBusinessPeriodFrame}=brazaBusinessPeriodFrame;\n'
product_index_frame=re.sub(r'^export ', '', (root.parent/'finance/src/product-index-frame.mjs').read_text(),flags=re.M)
product_index_frame='const brazaProductIndexFrame = (() => {\n'+product_index_frame+'\nreturn {PRODUCT_INDEX_STATUSES,projectProductIndexRequest,projectProductIndexFrame,productIndexRequestMatches};\n})();\nconst {PRODUCT_INDEX_STATUSES,projectProductIndexRequest,projectProductIndexFrame,productIndexRequestMatches}=brazaProductIndexFrame;\n'
app_product_index=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-product-index.mjs').read_text(),flags=re.M),flags=re.M)
app_business_period=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-business-period.mjs').read_text(),flags=re.M),flags=re.M)
app_reconciliation=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-reconciliation.mjs').read_text(),flags=re.M),flags=re.M)
production_orders_frame=re.sub(r'^export ', '', (root.parent/'finance/src/production-orders-frame.mjs').read_text(),flags=re.M)
production_orders_frame='const brazaProductionOrdersFrame = (() => {\n'+production_orders_frame+'\nreturn {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches};\n})();\nconst {projectProductionOrdersRequest,projectProductionOrdersFrame,productionOrdersRequestMatches}=brazaProductionOrdersFrame;\n'
app_production_orders=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-production-orders.mjs').read_text(),flags=re.M),flags=re.M)
store_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-summary.mjs').read_text(),flags=re.M),flags=re.M)
store_invoice_tax=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-invoice-tax.mjs').read_text(),flags=re.M),flags=re.M)
store_product_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-product-summary.mjs').read_text(),flags=re.M),flags=re.M)
store_returns_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-returns-summary.mjs').read_text(),flags=re.M),flags=re.M)
ads_measurement=re.sub(r'^export ', '', (root/'src/ads-measurement.mjs').read_text(), flags=re.M)
ads_measurement='const brazaAdsMeasurement = (() => {\n'+ads_measurement+'\nreturn {buildAdsMeasurement,projectAdsMeasurement};\n})();\nconst {buildAdsMeasurement,projectAdsMeasurement}=brazaAdsMeasurement;\n'
ads_measurement_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/ads-measurement-view.mjs').read_text(),flags=re.M), flags=re.M)
ads_period=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/ads-period.mjs').read_text(),flags=re.M), flags=re.M)
ads_calendar=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/ads-calendar.mjs').read_text(),flags=re.M), flags=re.M)
ads_calendar='const brazaAdsCalendar = (() => {\n'+ads_calendar+'\nreturn {projectAdsCalendarRequest,projectAdsCalendar,getAdsCalendar,buildAdsCalendar};\n})();\nconst {projectAdsCalendarRequest,projectAdsCalendar,getAdsCalendar,buildAdsCalendar}=brazaAdsCalendar;\n'
ads_workspace=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/ads-workspace-view.mjs').read_text(),flags=re.M), flags=re.M)
scaling_preparation=re.sub(r'^export ', '', (root/'src/scaling-preparation.mjs').read_text(),flags=re.M)
app_ads_summary=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-ads-summary.mjs').read_text(),flags=re.M), flags=re.M)
store_admin=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/store-admin.mjs').read_text(),flags=re.M),flags=re.M)
variant_sync=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/variant-sync.mjs').read_text(),flags=re.M),flags=re.M)
workspace_navigation=re.sub(r'^export ', '', (root/'src/workspace-navigation.mjs').read_text(), flags=re.M)
shell_navigation=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/shell-navigation.mjs').read_text(),flags=re.M), flags=re.M)
workspace_auth=re.sub(r'^export ', '', (root/'src/unified-auth.mjs').read_text(), flags=re.M)
workspace_auth='const brazaWorkspaceAuth = (() => {\n'+workspace_auth+'\nreturn {readOwnerSession,readWorkspaceSession,handleWorkspaceAuth};\n})();\nconst {readOwnerSession,readWorkspaceSession,handleWorkspaceAuth}=brazaWorkspaceAuth;\n'
theme=re.sub(r'^export ', '', (root/'src/theme.mjs').read_text(), flags=re.M)
ads_presentation=re.sub(r'^export ', '', (root/'src/ads-presentation.mjs').read_text(), flags=re.M)
admin=dtf_layout+'\n'+dtf_view+'\n'+production_dtf+'\n'+cost_rule_learning+'\n'+catalog_classification+'\n'+historical_cost_evidence+'\n'+historical_cost_orchestration+'\n'+cost_rules+'\n'+cost_rules_view+'\n'+business_products+'\n'+business_month_publication+'\n'+business_reconciliation+'\n'+business_reconciliation_view+'\n'+business_month_ads_history+'\n'+business_month+'\n'+business_month_view_state+'\n'+business_checkpoint+'\n'+business_sync+'\n'+hermes_context+'\n'+recorded_business_balance+'\n'+background_collection_diagnostics+'\n'+business_cost_diagnostics+'\n'+saved_order_items+'\n'+product_registry+'\n'+production_cost_periods+'\n'+production_cost_periods_view+'\n'+saved_catalog_view+'\n'+automation_workspace+'\n'+month_view+'\n'+month_client+'\n'+client+'\n'+view+'\n'+ads+'\n'+orders+'\n'+daily_shop_orders+'\n'+items+'\n'+variants+'\n'+observations+'\n'+production_costs+'\n'+operator_cost_corrections+'\n'+store_summary+'\n'+store_invoice_tax+'\n'+store_product_summary+'\n'+store_returns_summary+'\n'+store_admin+'\n'+variant_sync+'\n'+re.sub(r'^import .*\n','',admin,flags=re.M)
admin=admin.replace('export {adminFetch,schedule,scheduledWork,DEFAULTS,SCHEMA,validateSettings,workspaceAuthFetch};','')
needle='    const url = new URL(request.url);'
assert original.count(needle)==1
updated=original.replace(needle,needle+'''\n    if (['/','/login','/admin/login','/logout','/admin/logout'].includes(url.pathname)) return brazaAdmin.workspaceAuthFetch(request, env);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/hermes/')) return brazaAdmin.adminFetch(request, env, {getAdsSummary,getAdsPeriod,getAdsCalendar,getFinanceBusinessPeriod,getShopOrders,getOrderItems,getFinancePaymentSample,getFinancePaymentPreview,getFinanceVariantCatalog,getFinanceStorePeriod,getFinanceProductionOrders,getFinanceProductIndex,getFinanceHistoricalVariantEvidence,getFinanceReconciliation});''',1)
# A valid owner session opens the whole workspace. Review credentials retain
# their existing read-only Ads scope and never satisfy Admin authorization.
needle='''      const authenticated =
        await isAuthenticated(
          request,
          env
        );'''
assert updated.count(needle)==2
updated=updated.replace(needle,'''      const workspaceSession=await readWorkspaceSession(request,env);
      const authenticated=workspaceSession!==null;''',1)
needle='''          url.origin + "/",
          302'''
assert updated.count(needle)==1
updated=updated.replace(needle,'''          url.origin + "/login",
          303''',1)
updated,count=re.subn(r'async function isAuthenticated\([\s\S]*?(?=\nasync function sign\()', 'async function isAuthenticated(request,env){return (await readWorkspaceSession(request,env))!==null;}\n\n',updated,count=1)
assert count==1
needle='''          opportunityDetail
        )'''
assert updated.count(needle)==1
updated=updated.replace(needle,'''          opportunityDetail,
          workspaceSession.role
        )''',1)
needle='''  opportunityDetail
) {'''
assert updated.count(needle)==1
updated=updated.replace(needle,'''  opportunityDetail,
  workspaceRole='review'
) {''',1)
needle='  async fetch(request, env) {'
updated=updated.replace(needle,'''  async scheduled(event, env, ctx) { ctx.waitUntil(brazaAdmin.scheduledWork(env,{getFinanceBusinessPeriod,getAdsCalendar,getFinanceVariantCatalog,getFinanceProductionOrders,getFinanceProductIndex,getFinanceHistoricalVariantEvidence,getFinanceReconciliation})); },\n'''+needle,1)
needle='${navLink(\n  "/dashboard",'
assert updated.count(needle)==1
start=updated.index(needle)
end=updated.index('\n</aside>',start)
updated=updated[:start]+'${shellDesktopNavigation(currentPath,{role:workspaceRole})}\n'+updated[end:]
needle='<div class="app">'
assert updated.count(needle)==1
updated=updated.replace(needle,'${shellMobileNavigation(currentPath,{role:workspaceRole})}\n\n'+needle,1)
needle='\n</style>\n\n</head>\n\n<body>\n\n${shellMobileNavigation(currentPath,{role:workspaceRole})}'
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
# Override account reporting without changing the frozen Auth/gateway source.
for needle,replacement in [
 ('async function getAdsSummary(\n  env\n) {','async function legacyGetAdsSummary(\n  env\n) {'),
 ('function dailyTable(\n  rows\n) {','function legacyDailyTable(\n  rows\n) {'),
]:
    assert updated.count(needle)==1, needle
    updated=updated.replace(needle,replacement,1)
updated+='\nfunction dailyTable(rows){return renderAdsMeasurementDailyTable(rows);}\n'
# Every account ROAS card states whether it uses the provider's one-day value
# or a ratio of the selected period totals. Campaign-level cards are untouched.
needle='${metricCard(\n  "ROAS",'
assert updated.count(needle)==3
updated=updated.replace(needle,'${metricCard(\n  ads.measurement?.total_days===1&&ads.measurement.totals.broad.reported_roas_raw!==null?"ROAS informado · amplo":"ROAS calculado · amplo",')
# The scope component owns the account metrics, with both ROAS definitions.
# Remove duplicate legacy cards rather than displaying the same totals twice.
for name in ['dashboardContent','advertisingContent','performanceContent']:
    pattern=r'(function '+name+r'\([\s\S]*?  return `)\n<div class="cards">[\s\S]*?\n</div>'
    updated,count=re.subn(pattern,r'\1',updated,count=1)
    assert count==1, name
# Campaign and GMV Max summaries have no verified matching period/cutoff.
# A percentage comparing them to the selected account dates would be invented.
needle='function calculateCoverage(\n  ads,\n  campaigns,\n  gms,\n  config\n) {'
assert updated.count(needle)==1
updated=updated.replace(needle,needle+'\n  if(ads.measurement||ads.calendar)return {ready:false,locked:true,reason:"As fontes por campanha ainda não confirmam o mesmo período e horário da conta. A cobertura não foi conciliada."};',1)
# Each section loads its own data. Account/monthly totals belong only to Summary.
needle='''      const [
        shopee,
        ads,
        campaigns,
        gms
      ] =
        await Promise.all([
          getShopeeStatus(env),
          getAdsSummary(env),
          getCampaignSummary(env),
          getGmsItems(env)
        ]);'''
assert updated.count(needle)==1
replacement='''      const routeAliases={'/advertising':'/dashboard','/performance':'/dashboard','/gmv-max':'/campaigns','/opportunities':'/optimization'};
      if(routeAliases[url.pathname]){const target=new URL(url);target.pathname=routeAliases[url.pathname];if(url.pathname==='/gmv-max')target.searchParams.set('view','gmv-max');return Response.redirect(target.toString(),302);}
      const workspaceView=url.searchParams.get('view')==='gmv-max'?'gmv-max':'product';
      const [shopee,ads,campaigns,gms]=await Promise.all([
        getShopeeStatus(env),
        url.pathname==='/dashboard'?getAdsSummary(env,adsMeasurementPageSelection(url)):Promise.resolve({ok:false,connected:false}),
        url.pathname==='/campaigns'&&workspaceView==='product'?getCampaignSummary(env):Promise.resolve({ok:false,campaigns:[]}),
        url.pathname==='/campaigns'&&workspaceView==='gmv-max'?getGmsItems(env):Promise.resolve({ok:false,items:[]})
      ]);
      ads.workspace_view=workspaceView;
      ads.workspace_period_mode=url.searchParams.has('start_date')||url.searchParams.has('end_date')?'dates':'month';'''
updated=updated.replace(needle,replacement,1)
needle='''      if (
        url.pathname ===
        "/opportunities"
      ) {'''
assert updated.count(needle)==1
updated=updated.replace(needle,needle.replace('/opportunities','/optimization'),1)
needle='  return `<!doctype html>\n<html lang="en">'
assert updated.count(needle)==2 # login and protected workspace
start=updated.index('function appPage(')
point=updated.index(needle,start)
insertion='''  const view=ads.workspace_view||'product';
  if(currentPath==='/campaigns'&&view==='gmv-max')content=gmvMaxContent(shopee,gms,config);
  if(currentPath==='/optimization')content=renderScalingPreparation(config,{role:workspaceRole});
  if(currentPath==='/integrations')content=renderWorkspaceConnections(shopee,{role:workspaceRole});
  content=renderAdsWorkspace(currentPath,{role:workspaceRole,periodMode:ads.workspace_period_mode,ads,view,content,opportunityContent:currentPath==='/optimization'?opportunitiesContent(shopee,opportunities,opportunityDetail,config):''});
  const workspaceTitles={'/dashboard':['Anúncios','Investimento, vendas atribuídas e retorno no mês.'],'/campaigns':['Campanhas','Produtos anunciados e desempenho de cada campanha.'],'/optimization':['Automação','Metas e critérios para crescer com margem.'],'/integrations':['Conexões','Acesso aos dados e configurações da operação.']};
  if(workspaceTitles[currentPath])[title,subtitle]=workspaceTitles[currentPath];
'''
updated=updated[:point]+insertion+updated[point:]
output=updated+'\n\n'+theme+'\n'+workspace_auth+'\n'+workspace_navigation+'\n'+ads_presentation+'\n'+shell_navigation+'\n'+orders_diagnostic+'\n'+orders_http+'\n'+app_orders+'\n'+app_items+'\n'+finance_sample_frame+'\n'+finance_preview_frame+'\n'+variant_catalog_frame+'\n'+historical_variant_frame+'\n'+app_historical_variant+'\n'+app_finance_sample+'\n'+daily_orders_frame+'\n'+store_period_frame+'\n'+business_period_frame+'\n'+reconciliation_frame+'\n'+production_orders_frame+'\n'+product_index_frame+'\n'+app_product_index+'\n'+app_production_orders+'\n'+app_store_period+'\n'+app_business_period+'\n'+app_reconciliation+'\n'+ads_measurement+'\n'+ads_measurement_view+'\n'+ads_period+'\n'+ads_calendar+'\n'+app_ads_summary+'\n'+ads_workspace+'\n'+scaling_preparation+'\n\nconst brazaAdmin = (() => {\n'+admin+'\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n'
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
