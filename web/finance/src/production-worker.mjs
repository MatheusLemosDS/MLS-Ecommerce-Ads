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

// Deployment entry only. Configuration and FINANCE_CONNECTION_ENABLED='true'
// are still required; importing this entry never makes a provider request.
export default createFinanceWorker({
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
