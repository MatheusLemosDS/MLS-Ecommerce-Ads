import {createFinanceWorker} from './connection-worker.mjs';
import {createFinanceProviderAdapter} from './provider-adapter.mjs';
import {runFinancePaymentSample} from './payment-sample.mjs';

// Deployment entry only. Configuration and FINANCE_CONNECTION_ENABLED='true'
// are still required; importing this entry never makes a provider request.
export default createFinanceWorker({
  paymentSample: runFinancePaymentSample,
  fetchImpl: request => fetch(request),
  adapter: createFinanceProviderAdapter({fetchImpl: request => fetch(request)}),
});
