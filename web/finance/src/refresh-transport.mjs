import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {buildFinanceRefreshRequest} from './refresh-request.mjs';
import {normalizeFinanceRefreshResponse} from './refresh-response.mjs';

// Private, injected transport; there is deliberately no default global fetch.
export async function requestFinanceRefresh(input, options = {}) {
  return requestFinanceAuthJson({
    input,
    options,
    prefix: 'FINANCE_REFRESH',
    buildRequest: () => buildFinanceRefreshRequest(input),
    normalizeResponse: (payload, timing) => normalizeFinanceRefreshResponse(payload, {
      ...timing,
      previousRefreshToken: input.refreshToken,
    }),
  });
}
