import {runFinanceDailyOrders} from './daily-orders.mjs';
import {createFinanceWorker} from './connection-worker.mjs';
import {createFinanceProviderAdapter} from './provider-adapter.mjs';
import {runFinancePaymentSample, runFinancePaymentPreview} from './payment-sample.mjs';
import {runFinanceVariantCatalog} from './variant-catalog.mjs';
import {runFinanceStorePeriod} from './store-period.mjs';
import {runFinanceBusinessPeriod} from './business-period.mjs';
import {runFinanceProductionOrders} from './production-orders.mjs';
import {runFinanceProductIndex} from './product-index.mjs';
import {runFinanceHistoricalVariantEvidence} from './historical-variant-evidence.mjs';
import {runFinanceEscrowReleases,readFinanceEscrowReleaseCoverage} from './escrow-releases.mjs';
import {runFinanceReturnsReconciliation} from './returns-reconciliation.mjs';
import {readFinanceIncomeOverview} from './income-overview.mjs';
import {readFinanceIncomeDetail} from './income-detail.mjs';
import {readOrStepFinancePendingIncomeScan} from './pending-income-scan.mjs';
import {EXTERNAL_CASH_PATH} from './external-cash-frame.mjs';
import {createExternalCashWorker,createExternalCashPeriodWorker} from './external-cash-worker.mjs';
import {readExternalCashWorkspace,previewExternalCashImport,mutateExternalCash} from './external-cash-store.mjs';
import {EXTERNAL_CASH_PERIOD_PATH} from './external-cash-period-frame.mjs';
import {readExternalCashPeriodSummary} from './external-cash-period.mjs';
import {FINANCIAL_SOURCE_PATH} from './financial-source-frame.mjs';
import {createFinancialSourceWorker} from './financial-source-worker.mjs';
import {FINANCIAL_ALLOCATION_PATH,createFinancialAllocationWorker} from './financial-allocation-worker.mjs';
import {FINANCIAL_OBLIGATION_PATH,createFinancialObligationWorker} from './financial-obligation-worker.mjs';

// Deployment entry only. Configuration and FINANCE_CONNECTION_ENABLED='true'
// are still required; importing this entry never makes a provider request.
const financeConnectionWorker=createFinanceWorker({
  paymentSample: runFinancePaymentSample,
  paymentPreview: runFinancePaymentPreview,
  variantCatalog: runFinanceVariantCatalog,
  storePeriod: runFinanceStorePeriod,
  businessPeriod: runFinanceBusinessPeriod,
  dailyOrders: runFinanceDailyOrders,
  productionOrders: runFinanceProductionOrders,
  productIndex: runFinanceProductIndex,
  historicalVariantEvidence: runFinanceHistoricalVariantEvidence,
  reconciliation: runFinanceReturnsReconciliation,
  escrowReleases: runFinanceEscrowReleases,
  escrowReleaseCoverage: readFinanceEscrowReleaseCoverage,
  incomeOverview: readFinanceIncomeOverview,
  incomeDetail: readFinanceIncomeDetail,
  pendingIncomeScan: readOrStepFinancePendingIncomeScan,
  fetchImpl: request => fetch(request),
  adapter: createFinanceProviderAdapter({fetchImpl: request => fetch(request)}),
});

const externalCashWorker=createExternalCashWorker({readWorkspace:readExternalCashWorkspace,previewImport:previewExternalCashImport,mutate:mutateExternalCash});
const externalCashPeriodWorker=createExternalCashPeriodWorker({readPeriodSummary:readExternalCashPeriodSummary});
const financialSourceWorker=createFinancialSourceWorker();
const financialAllocationWorker=createFinancialAllocationWorker();
const financialObligationWorker=createFinancialObligationWorker();
export default {
 async fetch(request,env,ctx){
  let url;try{url=new URL(request.url);}catch{return financeConnectionWorker.fetch(request,env,ctx);}
  if(url.pathname===EXTERNAL_CASH_PATH)return externalCashWorker.fetch(request,env);
  if(url.pathname===EXTERNAL_CASH_PERIOD_PATH)return externalCashPeriodWorker.fetch(request,env);
  if(url.pathname===FINANCIAL_SOURCE_PATH)return financialSourceWorker.fetch(request,env);
  if(url.pathname===FINANCIAL_ALLOCATION_PATH)return financialAllocationWorker.fetch(request,env);
  if(url.pathname===FINANCIAL_OBLIGATION_PATH)return financialObligationWorker.fetch(request,env);
  return financeConnectionWorker.fetch(request,env,ctx);
 },
};
