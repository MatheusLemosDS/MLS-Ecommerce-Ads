import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';

// Pure validation of a shop-scoped refresh response. No transport or persistence.
const MAX_TEXT_LENGTH = 8192;
const MAX_ACCESS_TTL = 4 * 60 * 60;
const MAX_UNIX_SECONDS = 9999999999;
const internalFailures = new WeakSet();
const fail = (code, status = 502) => {
  const error = new FinanceConnectionError(code, status);
  internalFailures.add(error);
  return error;
};
const invalid = () => fail('FINANCE_REFRESH_RESPONSE_INVALID');
const invalidContext = () => fail('FINANCE_REFRESH_RESPONSE_CONTEXT_INVALID', 503);
const isPlainObject = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const ownValue = (object, field, missing = invalid) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw missing();
  return descriptor.value;
};
const isToken = value => typeof value === 'string' && value.length > 0
  && value.length <= MAX_TEXT_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
const isEpoch = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_UNIX_SECONDS;
const isPrivateText = value => typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;

export function normalizeFinanceRefreshResponse(payload, options) {
  try {
    if (!isPlainObject(options)) throw invalidContext();
    const requestedAt = ownValue(options, 'requestedAt', invalidContext);
    const receivedAt = ownValue(options, 'receivedAt', invalidContext);
    const previousRefreshToken = ownValue(options, 'previousRefreshToken', invalidContext);
    if (!isEpoch(requestedAt) || !isEpoch(receivedAt) || receivedAt < requestedAt
      || !isToken(previousRefreshToken)) {
      throw invalidContext();
    }

    if (!isPlainObject(payload)) throw invalid();
    const apiError = ownValue(payload, 'error');
    if (!isPrivateText(apiError)) throw invalid();
    if (apiError !== '') throw fail('FINANCE_REFRESH_API_ERROR');
    for (const field of ['request_id', 'message']) {
      if (!isPrivateText(ownValue(payload, field))) throw invalid();
    }

    // Other identity fields never select a scope or compensate for a missing shop.
    if (ownValue(payload, 'partner_id') !== FINANCE_PROFILE.partner_id
      || ownValue(payload, 'shop_id') !== FINANCE_PROFILE.shop_id) {
      throw fail('FINANCE_REFRESH_IDENTITY_MISMATCH');
    }
    const accessToken = ownValue(payload, 'access_token');
    const refreshToken = ownValue(payload, 'refresh_token');
    const expireIn = ownValue(payload, 'expire_in');
    if (!isToken(accessToken) || !isToken(refreshToken) || !Number.isSafeInteger(expireIn)
      || expireIn < 1 || expireIn > MAX_ACCESS_TTL) throw invalid();
    if (refreshToken === previousRefreshToken) throw fail('FINANCE_REFRESH_TOKEN_NOT_ROTATED');

    // Start at request dispatch: transport latency must never extend validity.
    const expiresAt = requestedAt + expireIn;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= receivedAt) {
      throw fail('FINANCE_REFRESH_RESPONSE_EXPIRED');
    }
    return {access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt};
  } catch (error) {
    if (internalFailures.has(error)) throw error;
    // Malformed objects/accessors must not leak private exception messages either.
    throw invalid();
  }
}
