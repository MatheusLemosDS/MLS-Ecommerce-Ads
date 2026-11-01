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
month_client=re.sub(r'^export ', '', re.sub(r'^import .*\n','',freeze_client_helpers((root/'src/business-month-client.mjs').read_text(),{'projectMissionAdsSnapshot':'mls-ads-performance.mjs','projectDailyBusinessSummary':'business-daily-summary.mjs','projectBusinessMonthAuditScope':'business-month-view-state.mjs','projectBusinessMonthView':'business-month-view-state.mjs','buildMonthlyFinancialSummary':'business-month-summary.mjs','projectAdsCalendar':'ads-calendar.mjs','projectBusinessMonthProducts':'business-month-products.mjs','projectBusinessMonth':'business-month.mjs','buildBusinessCheckpoint':'business-checkpoint.mjs','buildAccountDiagnosis':'account-diagnosis.mjs','projectBusinessCostDiagnostics':'business-cost-diagnostics.mjs','projectBusinessCostDiagnosticsEvidence':'business-cost-diagnostics.mjs','projectHistoricalCostPairDiagnostics':'historical-cost-evidence.mjs','projectRecordedBusinessBalance':'business-recorded-balance.mjs','buildRecordedBusinessBalance':'business-recorded-balance.mjs','projectBusinessCostDiagnosticsEvidenceV2':'business-cost-diagnostics.mjs','projectBusinessCostDiagnosticsEvidenceV3':'business-cost-diagnostics.mjs','deriveHistoricalCostComposition':'historical-cost-evidence.mjs','projectHistoricalCostPairDiagnosticsEvidence':'historical-cost-evidence.mjs','projectBackgroundCollectionDiagnostics':'background-collection-diagnostics.mjs','projectExpenseSchedule':'expense-schedule.mjs','buildMlsProductIntelligence':'mls-product-intelligence.mjs','simulateMlsPricingScenario':'mls-product-intelligence.mjs'}),flags=re.M),flags=re.M)
automation_workspace=re.sub(r'^export ', '', (root/'src/automation-workspace.mjs').read_text(),flags=re.M)
automation_workspace='const brazaAutomationWorkspaceView = (() => {\n'+automation_workspace+'\nreturn {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT};\n})();\nconst {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT}=brazaAutomationWorkspaceView;\n'
business_sync=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-sync.mjs').read_text(),flags=re.M),flags=re.M)
business_sync='const brazaBusinessSync = (() => {\n'+business_sync+'\nreturn {BUSINESS_SYNC_SCHEMA,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError};\n})();\nconst {BUSINESS_SYNC_SCHEMA,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError}=brazaBusinessSync;\n'
business_history_sync=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-history-sync.mjs').read_text(),flags=re.M),flags=re.M)
business_history_sync='const brazaBusinessHistorySync = (() => {\n'+business_history_sync+'\nreturn {BUSINESS_HISTORY_SYNC_SCHEMA,runBusinessHistorySync,BusinessHistorySyncError};\n})();\nconst {BUSINESS_HISTORY_SYNC_SCHEMA,runBusinessHistorySync,BusinessHistorySyncError}=brazaBusinessHistorySync;\n'
business_products=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-month-products.mjs').read_text(),flags=re.M),flags=re.M)
business_products='const brazaBusinessProducts = (() => {\n'+business_products+'\nreturn {buildBusinessMonthProducts,projectBusinessMonthProducts};\n})();\nconst {buildBusinessMonthProducts,projectBusinessMonthProducts}=brazaBusinessProducts;\n'
cost_rule_learning=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/cost-rule-learning.mjs').read_text(),flags=re.M),flags=re.M)
cost_rule_learning='const brazaCostRuleLearning = (() => {\n'+cost_rule_learning+'\nreturn {costRuleProductLearning};\n})();\nconst {costRuleProductLearning}=brazaCostRuleLearning;\n'
catalog_classification=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/catalog-classification.mjs').read_text(),flags=re.M),flags=re.M)
catalog_classification='const brazaCatalogClassification = (() => {\n'+catalog_classification+'\nreturn {CATALOG_CLASSIFICATION_SCHEMA,CatalogClassificationError,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState,catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame,readCatalogClassificationFence,refreshKnownCatalogClassifications,enqueueSoldCatalogGaps};\n})();\nconst {CATALOG_CLASSIFICATION_SCHEMA,CatalogClassificationError,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState,catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame,readCatalogClassificationFence,refreshKnownCatalogClassifications,enqueueSoldCatalogGaps}=brazaCatalogClassification;\n'
historical_cost_evidence=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/historical-cost-evidence.mjs').read_text(),flags=re.M),flags=re.M)
historical_cost_evidence='const brazaHistoricalCostEvidence = (() => {\n'+historical_cost_evidence+'\nreturn {HISTORICAL_COST_EVIDENCE_SCHEMA,HistoricalCostEvidenceError,readHistoricalCostEvidence,syncHistoricalCostEvidence,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics,historicalCostPairDiagnosticsEvidenceFromSnapshot,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition};\n})();\nconst {HISTORICAL_COST_EVIDENCE_SCHEMA,HistoricalCostEvidenceError,readHistoricalCostEvidence,syncHistoricalCostEvidence,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics,historicalCostPairDiagnosticsEvidenceFromSnapshot,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition}=brazaHistoricalCostEvidence;\n'
historical_cost_orchestration=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/historical-cost-orchestration.mjs').read_text(),flags=re.M),flags=re.M)
historical_cost_orchestration='const brazaHistoricalCostOrchestration = (() => {\n'+historical_cost_orchestration+'\nreturn {BACKGROUND_LANE_SCHEMA,HistoricalCostOrchestrationError,acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates,runBackgroundHistoryWork};\n})();\nconst {BACKGROUND_LANE_SCHEMA,HistoricalCostOrchestrationError,acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates,runBackgroundHistoryWork}=brazaHistoricalCostOrchestration;\n'
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
expense_ledger=source_namespace('expense-ledger.mjs','brazaExpenseLedgerStore','EXPENSE_LEDGER_SCHEMA,ExpenseLedgerError,projectExpenseLedger,readExpenseLedger,mutateExpenseLedger')
expense_schedule=source_namespace('expense-schedule.mjs','mlsExpenseSchedule','projectExpenseSchedule,buildExpenseSchedule')
expense_ledger_view=source_namespace('expense-ledger-view.mjs','brazaExpenseLedgerView','EXPENSE_LEDGER_CSS,expenseLedgerBody,EXPENSE_LEDGER_CLIENT',{'projectExpenseLedger':'expense-ledger.mjs'})
escrow_release_frame=source_namespace('../../finance/src/escrow-release-frame.mjs','brazaEscrowReleaseFrame','projectEscrowReleaseRequest,projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageRequest,projectEscrowReleaseCoverageFrame,escrowReleaseRequestMatches,escrowReleaseCoverageRequestMatches')
income_overview_frame=source_namespace('../../finance/src/income-overview-frame.mjs','brazaIncomeOverviewFrame','projectIncomeOverviewFrame')
income_detail_frame=source_namespace('../../finance/src/income-detail-frame.mjs','brazaIncomeDetailFrame','projectIncomeDetailFrame')
pending_income_frame=source_namespace('../../finance/src/pending-income-frame.mjs','brazaPendingIncomeFrame','projectPendingIncomeScanRequest,projectPendingIncomeScanFrame')
income_detail_diagnostic=source_namespace('../../finance/src/income-detail-diagnostic.mjs','brazaIncomeDetailDiagnostic','projectIncomeDetailDiagnostic,incomeDetailFailureDiagnostic')
business_escrow_releases=source_namespace('business-escrow-releases.mjs','brazaBusinessEscrowReleases','BUSINESS_ESCROW_RELEASES_SCHEMA,BusinessEscrowReleasesError,projectBusinessEscrowReleases,projectBusinessEscrowReleaseEvidence,readBusinessEscrowReleases,readBusinessEscrowReleaseEvidence,runBusinessEscrowReleases')
business_escrow_release_coverage=source_namespace('business-escrow-release-coverage.mjs','brazaBusinessEscrowReleaseCoverage','BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA,BusinessEscrowReleaseCoverageError,projectBusinessEscrowReleaseCoverage,readBusinessEscrowReleaseCoverage,runBusinessEscrowReleaseCoverage')
business_income_overview=source_namespace('business-income-overview.mjs','brazaBusinessIncomeOverview','BUSINESS_INCOME_OVERVIEW_SCHEMA,BusinessIncomeOverviewError,projectBusinessIncomeOverview,readBusinessIncomeOverview,runBusinessIncomeOverview')
business_income_detail=source_namespace('business-income-detail.mjs','brazaBusinessIncomeDetail','BUSINESS_INCOME_DETAIL_SCHEMA,BusinessIncomeDetailError,projectBusinessIncomeDetail,readBusinessIncomeDetail,readBusinessIncomeDetailDiagnostic,runBusinessIncomeDetail')
business_pending_income_scan=source_namespace('business-pending-income-scan.mjs','brazaBusinessPendingIncomeScan','BUSINESS_PENDING_INCOME_SCAN_SCHEMA,BusinessPendingIncomeScanError,projectBusinessPendingIncomeScan,readBusinessPendingIncomeScan,runBusinessPendingIncomeScan')
business_historical_release_calendars=source_namespace('business-historical-release-calendars.mjs','brazaBusinessHistoricalReleaseCalendars','selectBusinessHistoricalReleaseCalendar')
financial_audit_orchestration=source_namespace('financial-audit-orchestration.mjs','brazaFinancialAuditOrchestration','FINANCIAL_AUDIT_SCHEMA,FinancialAuditOrchestrationError,runBusinessFinancialAudits')
escrow_releases_view=source_namespace('escrow-releases-view.mjs','brazaEscrowReleasesView','ESCROW_RELEASES_CSS,escrowReleasesBody,ESCROW_RELEASES_CLIENT',{'projectMlsReleaseCoverageFollowup':'escrow-releases-view.mjs','projectEscrowReleaseFrame':'../../finance/src/escrow-release-frame.mjs','projectEscrowReleaseEvidenceFrame':'../../finance/src/escrow-release-frame.mjs','projectEscrowReleaseCoverageFrame':'../../finance/src/escrow-release-frame.mjs','projectBusinessEscrowReleases':'business-escrow-releases.mjs','projectBusinessEscrowReleaseEvidence':'business-escrow-releases.mjs','projectBusinessEscrowReleaseCoverage':'business-escrow-release-coverage.mjs','projectBusinessMonthAuditScope':'business-month-view-state.mjs'})
reconciliation_frame=source_namespace('../../finance/src/reconciliation-frame.mjs','brazaReconciliationFrame','projectReconciliationRequest,projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame,reconciliationRequestMatches')
business_reconciliation=source_namespace('business-reconciliation.mjs','brazaBusinessReconciliation','BUSINESS_RECONCILIATION_SCHEMA,BusinessReconciliationError,projectBusinessReconciliation,projectBusinessReconciliationEvidence,projectBusinessReconciliationMoney,readBusinessReconciliation,readBusinessReconciliationEvidence,readBusinessReconciliationMoney,runBusinessReconciliation')
business_historical_returns=source_namespace('business-historical-returns.mjs','brazaBusinessHistoricalReturns','BUSINESS_HISTORICAL_RETURNS_SCHEMA,BusinessHistoricalReturnsError,selectBusinessHistoricalReturns,readBusinessHistoricalReturnsEligibility,runBusinessHistoricalReturns')
business_adjusted_balance=source_namespace('business-adjusted-balance.mjs','brazaBusinessAdjustedBalance','buildAdjustedBusinessBalance')
business_financial_closeout=source_namespace('business-financial-closeout.mjs','brazaBusinessFinancialCloseout','buildBusinessFinancialCloseout,projectBusinessFinancialCloseout')
financial_closeout_view=source_namespace('financial-closeout-view.mjs','brazaFinancialCloseoutView','FINANCIAL_CLOSEOUT_CSS,financialCloseoutBody,FINANCIAL_CLOSEOUT_CLIENT',{'projectBusinessFinancialCloseout':'business-financial-closeout.mjs','projectBusinessMonthAuditScope':'business-month-view-state.mjs'})
business_reconciliation_view=source_namespace('business-reconciliation-view.mjs','brazaBusinessReconciliationView','BUSINESS_RECONCILIATION_CSS,businessReconciliationBody,BUSINESS_RECONCILIATION_CLIENT',{'projectReconciliationFrame':'../../finance/src/reconciliation-frame.mjs','projectReconciliationEvidenceFrame':'../../finance/src/reconciliation-frame.mjs','projectReconciliationMoneyFrame':'../../finance/src/reconciliation-frame.mjs','projectBusinessReconciliation':'business-reconciliation.mjs','projectBusinessReconciliationEvidence':'business-reconciliation.mjs','projectBusinessReconciliationMoney':'business-reconciliation.mjs','projectBusinessMonthAuditScope':'business-month-view-state.mjs','projectAdsCalendar':'ads-calendar.mjs','projectBusinessMonthProducts':'business-month-products.mjs','projectBusinessMonth':'business-month.mjs','buildMonthlyFinancialSummary':'business-month-summary.mjs','buildAdjustedBusinessBalance':'business-adjusted-balance.mjs'})
business_month_ads_history=source_namespace('business-month-ads-history.mjs','brazaBusinessMonthAdsHistory','BUSINESS_MONTH_ADS_HISTORY_SCHEMA,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements')
business_month_publication=source_namespace('business-month-publication.mjs','brazaBusinessMonthPublication','BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth')
agent_learning_report=source_namespace('mls-agent-learning-report.mjs','mlsAgentLearningReport','createMlsAgentLearningReport')
agent_learning=source_namespace('mls-agent-learning.mjs','mlsAgentLearningStore','MLS_AGENT_LEARNING_SCHEMA,MlsAgentLearningError,recordMlsAgentLearningObservation,readMlsAgentLearning')
daily_profit_presentation=source_namespace('daily-profit-presentation.mjs','mlsDailyProfitPresentation','projectDailyProfitPresentation')
business_daily_summary=source_namespace('business-daily-summary.mjs','brazaDailyBusinessSummary','buildDailyBusinessSummary,projectDailyBusinessSummary')
business_day_view=source_namespace('business-day-view.mjs','brazaBusinessDayView','BUSINESS_DAY_CSS,businessDayBody,BUSINESS_DAY_CLIENT',{'projectDailyBusinessSummary':'business-daily-summary.mjs','projectDailyProfitPresentation':'daily-profit-presentation.mjs'})
income_overview_client=source_namespace('income-overview-client.mjs','brazaIncomeOverviewClient','INCOME_OVERVIEW_CLIENT',{'projectIncomeOverviewFrame':'../../finance/src/income-overview-frame.mjs','projectBusinessIncomeOverview':'business-income-overview.mjs','projectIncomeDetailFrame':'../../finance/src/income-detail-frame.mjs','projectBusinessIncomeDetail':'business-income-detail.mjs','projectPendingIncomeScanFrame':'../../finance/src/pending-income-frame.mjs','projectBusinessPendingIncomeScan':'business-pending-income-scan.mjs'})
agent_art=source_namespace('mls-agent-art.mjs','mlsAgentArt','MLS_AGENT_ROBOT_SVG,MLS_COMMAND_GLOBE_SVG')
agent_workspace_layout=source_namespace('mls-agent-workspace-layout.mjs','mlsAgentWorkspaceLayout','MLS_AGENT_WORKSPACE_CSS')
agent_registry=source_namespace('agent-registry.mjs','mlsAgentRegistryCore','buildPendingIncomeAudit,buildMlsAgentRegistry')
agent_learning_view=source_namespace('mls-agent-learning-view.mjs','mlsAgentLearningView','MLS_AGENT_LEARNING_CSS,MLS_AGENT_LEARNING_CLIENT,mlsAgentLearningBody',{'projectMlsAgentLearningView':'mls-agent-learning-view.mjs'})
mission_view=source_namespace('mission-control.mjs','mlsMissionView','MISSION_CSS,MISSION_TRENDS_CSS,MISSION_CLIENT,MISSION_TRENDS_CLIENT,MISSION_AGENTS,missionWorkspacesBody,missionTrendPanelBody',{'projectMissionRoasChart':'mls-ads-performance.mjs','compareMissionRoas':'mls-ads-performance.mjs','createMlsVerifiedCharts':'mls-verified-charts.mjs','createMlsChartInteractions':'mls-chart-interactions.mjs','projectMlsMissionChart':'mls-chart-adapters.mjs','projectMlsSpecialistChart':'mission-control.mjs'})
agent_registry_view=source_namespace('agent-registry-view.mjs','mlsAgentRegistryView','COMMAND_CENTER_CSS,commandCenterBody,pendingIncomeBody,AGENT_REGISTRY_CLIENT',{'buildPendingIncomeAudit':'agent-registry.mjs','buildMlsAgentRegistry':'agent-registry.mjs','projectMlsSettlementEvidence':'mls-settlement-evidence.mjs','createMlsReturnsInsights':'mls-returns-insights.mjs'})
business_month_view_state=source_namespace('business-month-view-state.mjs','brazaBusinessMonthViewState','BusinessMonthViewError,buildBusinessMonthView,requestBusinessMonthRefresh,projectBusinessMonthView,projectBusinessMonthAuditScope')
business_month=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-month.mjs').read_text(),flags=re.M),flags=re.M)
business_tax=re.sub(r'^export ', '', (root/'src/business-tax-policy.mjs').read_text(),flags=re.M)
business_month='const brazaBusinessMonth = (() => {\n'+business_tax+'\n'+business_month+'\nreturn {BUSINESS_MONTH_SCHEMA,businessMonth,readBusinessMonthDisplay,projectBusinessMonth,BusinessMonthError,businessMonthClientFrame,readBusinessMonthAdsState,readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError};\n})();\nconst {BUSINESS_MONTH_SCHEMA,businessMonth,readBusinessMonthDisplay,projectBusinessMonth,BusinessMonthError,businessMonthClientFrame,readBusinessMonthAdsState,readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError}=brazaBusinessMonth;\n'
# The financial snapshot uses the same deterministic summaries as the owner page.
hermes_context=''
for filename in ['business-month-summary.mjs','account-diagnosis.mjs','hermes-financial-context.mjs']:
    hermes_context+='\n'+re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src'/filename).read_text(),flags=re.M),flags=re.M)
hermes_context='const brazaHermesFinancialContext = (() => {\n'+hermes_context+'\nreturn {HERMES_FINANCIAL_CONTEXT_SCHEMA,HermesFinancialContextError,prepareHermesFinancialContext,readHermesFinancialContext,applyHermesLearningEvidence,buildMonthlyFinancialSummary};\n})();\nconst {HERMES_FINANCIAL_CONTEXT_SCHEMA,HermesFinancialContextError,prepareHermesFinancialContext,readHermesFinancialContext,applyHermesLearningEvidence,buildMonthlyFinancialSummary}=brazaHermesFinancialContext;\n'
recorded_business_balance=re.sub(r'^export ', '', (root/'src/business-recorded-balance.mjs').read_text(),flags=re.M)
recorded_business_balance='const brazaRecordedBusinessBalance = (() => {\n'+recorded_business_balance+'\nreturn {buildRecordedBusinessBalance,projectRecordedBusinessBalance};\n})();\nconst {buildRecordedBusinessBalance,projectRecordedBusinessBalance}=brazaRecordedBusinessBalance;\n'
background_collection_diagnostics=re.sub(r'^export ', '', (root/'src/background-collection-diagnostics.mjs').read_text(),flags=re.M)
background_collection_diagnostics='const brazaBackgroundCollectionDiagnostics = (() => {\n'+background_collection_diagnostics+'\nreturn {readBackgroundCollectionDiagnostics,projectBackgroundCollectionDiagnostics};\n})();\nconst {readBackgroundCollectionDiagnostics,projectBackgroundCollectionDiagnostics}=brazaBackgroundCollectionDiagnostics;\n'
business_cost_diagnostics=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/business-cost-diagnostics.mjs').read_text(),flags=re.M),flags=re.M)
business_cost_diagnostics='const brazaBusinessCostDiagnostics = (() => {\n'+business_cost_diagnostics+'\nreturn {BusinessCostDiagnosticsError,readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2,readBusinessCostDiagnosticsEvidenceV3};\n})();\nconst {BusinessCostDiagnosticsError,readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2,readBusinessCostDiagnosticsEvidenceV3}=brazaBusinessCostDiagnostics;\n'
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

# The single source of truth is the offline planner; inject inside a private browser IIFE.
listing_factory_core=re.sub(r'^export ', '', (root/'src/mls-listing-factory-planner.mjs').read_text(),flags=re.M)
assert chr(96) not in listing_factory_core and chr(36)+'{' not in listing_factory_core and '</script' not in listing_factory_core.lower()
listing_factory_view=(root/'src/mls-listing-factory-view.mjs').read_text()
assert listing_factory_view.count('/*__MLS_LISTING_FACTORY_CORE__*/')==1
listing_factory_view=listing_factory_view.replace('/*__MLS_LISTING_FACTORY_CORE__*/',listing_factory_core,1)
listing_factory_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',listing_factory_view,flags=re.M),flags=re.M)
listing_factory_view='const mlsListingFactoryView=(()=>{\n'+listing_factory_view+'\nreturn {MLS_LISTING_FACTORY_CSS,mlsListingFactoryBody,MLS_LISTING_FACTORY_CLIENT};\n})();\nconst {MLS_LISTING_FACTORY_CSS,mlsListingFactoryBody,MLS_LISTING_FACTORY_CLIENT}=mlsListingFactoryView;\n'
# Browser AI Sales runs only behind its independent exact owner opt-in.
# Isolate each module: generic helper names must never collide across domains.
def build_ai_sales_browser_core():
    parts=[]
    registry_functions=re.findall(r'^export function projectProductRegistryFrame\([\s\S]*?^\}', (root/'src/product-registry.mjs').read_text(),flags=re.M)
    assert len(registry_functions)==1
    registry_function=registry_functions[0].removeprefix('export ')
    parts.append('modules["product-registry.mjs"]={projectProductRegistryFrame:'+registry_function+'};')
    filenames=['mls-ai-sales-contracts.mjs','mls-ai-sales-imports.mjs',
        'mls-ai-sales-campaign-planner.mjs','mls-ai-sales-profitability-gate.mjs',
        'mls-ai-sales-capability-audit.mjs','mls-ai-sales-catalog.mjs',
        'mls-ai-sales-affiliates.mjs','mls-ai-sales-performance.mjs']
    names=[]
    for filename in filenames:
        source=(root/'src'/filename).read_text()
        exports=re.findall(r'^export (?:async )?(?:function|class|const) ([A-Za-z_$][A-Za-z0-9_$]*)',source,flags=re.M)
        assert exports and len(exports)==len(set(exports)),filename
        assert not set(names).intersection(exports),filename
        names.extend(exports)
        def replace_import(match):
            dependencies=match.group(1).strip()
            dependency=match.group(2)
            assert dependency in ['product-registry.mjs']+filenames[:filenames.index(filename)],dependency
            return 'const {'+dependencies+'}=modules['+json.dumps(dependency)+'];'
        source=re.sub(r"^import \{([^}]+)\} from './([^']+)';",replace_import,source,flags=re.M)
        source=re.sub(r'^export ', '',source,flags=re.M)
        assert not re.search(r'^import |^export ',source,flags=re.M),filename
        parts.append('modules['+json.dumps(filename)+']=(()=>{\n'+source+'\nreturn {'+','.join(exports)+'};})();')
    # JSON interpolation preserves template literals/regexes through minification.
    return 'const MlsAiSalesCore=(()=>{const modules=Object.create(null);\n'+'\n'.join(parts)+'\nreturn Object.freeze(Object.assign({},'+','.join('modules['+json.dumps(f)+']' for f in filenames)+'));})();'
ai_sales_view=(root/'src/mls-ai-sales-view.mjs').read_text()
assert ai_sales_view.count('/*__MLS_AI_SALES_CORE__*/')==1
ai_sales_core=build_ai_sales_browser_core()
assert '</script' not in ai_sales_core.lower()
ai_sales_view=ai_sales_view.replace('/*__MLS_AI_SALES_CORE__*/','${'+json.dumps(ai_sales_core)+'}',1)
ai_sales_view=re.sub(r'^export ', '', re.sub(r'^import .*\n','',ai_sales_view,flags=re.M),flags=re.M)
ai_sales_view='const mlsAiSalesView=(()=>{\n'+ai_sales_view+'\nreturn {MLS_AI_SALES_CSS,mlsAiSalesBody,MLS_AI_SALES_CLIENT};\n})();\nconst {MLS_AI_SALES_CSS,mlsAiSalesBody,MLS_AI_SALES_CLIENT}=mlsAiSalesView;\n'
# The saved draft is validated by the same pure contracts on the server.
# Keep its helpers private rather than exposing generic validator names to Admin.
ai_sales_store=(root/'src/mls-ai-sales-workspace-store.mjs').read_text()
def replace_ai_store_import(match):
    dependencies, filename=match.group(1),match.group(2)
    assert filename.startswith('mls-ai-sales-') and filename.endswith('.mjs'),filename
    exports=set(re.findall(r'^export (?:async )?(?:function|class|const) ([A-Za-z_$][A-Za-z0-9_$]*)',(root/'src'/filename).read_text(),flags=re.M))
    assert all(name.strip() in exports for name in dependencies.split(',')),filename
    return 'const {'+dependencies+'}=MlsAiSalesCore;'
ai_sales_store=re.sub(r"^import \{([^}]+)\} from './([^']+)';",replace_ai_store_import,ai_sales_store,flags=re.M)
ai_sales_store=re.sub(r'^export ', '',ai_sales_store,flags=re.M)
assert not re.search(r'^import |^export ',ai_sales_store,flags=re.M)
ai_sales_store_exports='AI_SALES_WORKSPACE_STORE_SCHEMA,AiSalesWorkspaceStoreError,normalizeAiSalesWorkspaceDraft,readAiSalesWorkspace,saveAiSalesWorkspace'
ai_sales_store='const mlsAiSalesWorkspaceStore=(()=>{\n'+ai_sales_core+'\n'+ai_sales_store+'\nreturn {'+ai_sales_store_exports+'};\n})();\nconst {'+ai_sales_store_exports+'}=mlsAiSalesWorkspaceStore;\n'
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
app_escrow_releases=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-escrow-releases.mjs').read_text(),flags=re.M),flags=re.M)
app_income_overview=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-income-overview.mjs').read_text(),flags=re.M),flags=re.M)
app_income_detail=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-income-detail.mjs').read_text(),flags=re.M),flags=re.M)
app_pending_income_scan=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/app-pending-income-scan.mjs').read_text(),flags=re.M),flags=re.M)
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
# Shared approved design is explicitly injected into the legacy paste-ready App bundle.
# Keep one source in the outer scope before Ads and Admin (imports are stripped).
approved_design=re.sub(r'^export ', '', re.sub(r'^import .*\n','',(root/'src/approved-design-system.mjs').read_text(),flags=re.M), flags=re.M)
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
admin=dtf_layout+'\n'+dtf_view+'\n'+production_dtf+'\n'+cost_rule_learning+'\n'+catalog_classification+'\n'+historical_cost_evidence+'\n'+historical_cost_orchestration+'\n'+cost_rules+'\n'+cost_rules_view+'\n'+expense_ledger+'\n'+expense_schedule+'\n'+expense_ledger_view+'\n'+business_products+'\n'+business_month_publication+'\n'+business_reconciliation+'\n'+business_historical_returns+'\n'+business_escrow_releases+'\n'+business_escrow_release_coverage+'\n'+business_income_overview+'\n'+business_income_detail+'\n'+business_pending_income_scan+'\n'+business_historical_release_calendars+'\n'+financial_audit_orchestration+'\n'+escrow_releases_view+'\n'+business_adjusted_balance+'\n'+business_financial_closeout+'\n'+financial_closeout_view+'\n'+business_reconciliation_view+'\n'+business_month_ads_history+'\n'+business_month+'\n'+agent_learning_report+'\n'+agent_learning+'\n'+daily_profit_presentation+'\n'+business_daily_summary+'\n'+business_month_view_state+'\n'+business_checkpoint+'\n'+business_sync+'\n'+business_history_sync+'\n'+hermes_context+'\n'+recorded_business_balance+'\n'+background_collection_diagnostics+'\n'+business_cost_diagnostics+'\n'+saved_order_items+'\n'+product_registry+'\n'+production_cost_periods+'\n'+production_cost_periods_view+'\n'+saved_catalog_view+'\n'+listing_factory_view+'\n'+ai_sales_view+'\n'+ai_sales_store+'\n'+automation_workspace+'\n'+business_day_view+'\n'+income_overview_client+'\n'+agent_art+'\n'+agent_registry+'\n'+agent_learning_view+'\n'+mission_view+'\n'+agent_registry_view+'\n'+month_view+'\n'+month_client+'\n'+client+'\n'+view+'\n'+ads+'\n'+orders+'\n'+daily_shop_orders+'\n'+items+'\n'+variants+'\n'+observations+'\n'+production_costs+'\n'+operator_cost_corrections+'\n'+store_summary+'\n'+store_invoice_tax+'\n'+store_product_summary+'\n'+store_returns_summary+'\n'+store_admin+'\n'+variant_sync+'\n'+re.sub(r'^import .*\n','',admin,flags=re.M)
admin=admin.replace('export {adminFetch,schedule,scheduledWork,DEFAULTS,SCHEMA,validateSettings,workspaceAuthFetch};','')
needle='    const url = new URL(request.url);'
assert original.count(needle)==1
updated=original.replace(needle,needle+'''\n    if (['/','/login','/admin/login','/logout','/admin/logout'].includes(url.pathname)) return brazaAdmin.workspaceAuthFetch(request, env);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/hermes/')) return brazaAdmin.adminFetch(request, env, {getAdsSummary,getAdsPeriod,getAdsCalendar,getFinanceBusinessPeriod,getShopOrders,getOrderItems,getFinancePaymentSample,getFinancePaymentPreview,getFinanceVariantCatalog,getFinanceStorePeriod,getFinanceProductionOrders,getFinanceProductIndex,getFinanceHistoricalVariantEvidence,getFinanceReconciliation,getFinanceEscrowReleases,getFinanceEscrowReleaseCoverage,getFinanceIncomeOverview,getFinanceIncomeDetail,getFinancePendingIncomeScan});''',1)
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
updated=updated.replace(needle,'''  async scheduled(event, env, ctx) { ctx.waitUntil(brazaAdmin.scheduledWork(env,{getFinanceBusinessPeriod,getAdsCalendar,getFinanceVariantCatalog,getFinanceProductionOrders,getFinanceProductIndex,getFinanceHistoricalVariantEvidence,getFinanceReconciliation,getFinanceEscrowReleases,getFinanceEscrowReleaseCoverage,getFinanceIncomeOverview,getFinanceIncomeDetail,getFinancePendingIncomeScan})); },\n'''+needle,1)
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
output=updated+'\n\n'+theme+'\n'+workspace_auth+'\n'+workspace_navigation+'\n'+ads_presentation+'\n'+shell_navigation+'\n'+orders_diagnostic+'\n'+orders_http+'\n'+app_orders+'\n'+app_items+'\n'+finance_sample_frame+'\n'+finance_preview_frame+'\n'+variant_catalog_frame+'\n'+historical_variant_frame+'\n'+app_historical_variant+'\n'+app_finance_sample+'\n'+daily_orders_frame+'\n'+store_period_frame+'\n'+business_period_frame+'\n' +reconciliation_frame+'\n'+escrow_release_frame+'\n'+income_overview_frame+'\n'+income_detail_frame+'\n'+pending_income_frame+'\n'+income_detail_diagnostic+'\n'+production_orders_frame+'\n'+product_index_frame+'\n'+app_product_index+'\n'+app_production_orders+'\n'+app_store_period+'\n'+app_business_period+'\n' +app_reconciliation+'\n'+app_escrow_releases+'\n'+app_income_overview+'\n'+app_income_detail+'\n'+app_pending_income_scan+'\n'+ads_measurement+'\n'+ads_measurement_view+'\n'+ads_period+'\n'+ads_calendar+'\n'+app_ads_summary+'\n'+agent_workspace_layout+'\n'+approved_design+'\n'+ads_workspace+'\n'+scaling_preparation+'\n\nconst brazaAdmin = (() => {\n'+admin+'\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n'
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
