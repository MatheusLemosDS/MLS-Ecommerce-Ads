import {runFinanceDailyOrders} from './daily-orders.mjs';
import {createFinanceWorker} from './connection-worker.mjs';
import {createFinanceProviderAdapter} from './provider-adapter.mjs';
import {runFinancePaymentSample, runFinancePaymentPreview} from './payment-sample.mjs';
import {runFinanceVariantCatalog} from './variant-catalog.mjs';
import {runFinanceStorePeriod} from './store-period.mjs';

// Deployment entry only. Configuration and FINANCE_CONNECTION_ENABLED='true'
// are still required; importing this entry never makes a provider request.
export default createFinanceWorker({
  paymentSample: runFinancePaymentSample,
  paymentPreview: runFinancePaymentPreview,
  variantCatalog: runFinanceVariantCatalog,
  storePeriod: runFinanceStorePeriod,
  dailyOrders: runFinanceDailyOrders,
  fetchImpl: request => fetch(request),
  adapter: createFinanceProviderAdapter({fetchImpl: request => fetch(request)}),
});
