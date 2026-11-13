import {ACCOUNT_POLICY} from './account-policy.mjs';

// This fixed SQL is executed in the same D1 transaction as a domain mutation.
// JSON revision fences make revocation effective even after initial resolution.
export function tenantAuthorizationGuard(principal,capability,now=Date.now()){
 if(principal?.kind!=='account'||!principal.capabilities?.includes(capability)||!Number.isSafeInteger(now))(()=>{throw Object.assign(Error('ACCOUNT_FORBIDDEN'),{code:'ACCOUNT_FORBIDDEN',status:403});})();
 const p=principal,stamp=Math.floor(now/1000),clauses=[
 `EXISTS(SELECT 1 FROM mls_account_records u WHERE u.kind='user' AND u.scope='global' AND u.id=? AND u.revision=? AND json_extract(u.payload,'$.state')='ACTIVE')`,
 `EXISTS(SELECT 1 FROM mls_account_records s WHERE s.kind='session' AND s.scope='global' AND s.id=? AND s.revision=? AND json_extract(s.payload,'$.user_id')=? AND json_extract(s.payload,'$.revoked_at') IS NULL AND json_extract(s.payload,'$.expires_at')>? AND json_extract(s.payload,'$.last_activity_at')+?>? AND json_extract(s.payload,'$.mfa_complete')=1)`,
 `EXISTS(SELECT 1 FROM mls_account_records m WHERE m.kind='membership' AND m.scope=? AND m.id=? AND m.revision=? AND json_extract(m.payload,'$.state')='ACTIVE')`,
 `EXISTS(SELECT 1 FROM mls_account_records o WHERE o.kind='organization' AND o.scope='global' AND o.id=? AND o.revision=? AND json_extract(o.payload,'$.state')='ACTIVE')`,
 ];
 const bindings=[p.userId,p.userRevision,p.sessionId,p.sessionRevision,p.userId,stamp,ACCOUNT_POLICY.sessionIdleSeconds,stamp,p.organizationId,p.membershipId,p.membershipRevision,p.organizationId,p.organizationRevision];
 if(p.storeId){clauses.push(`EXISTS(SELECT 1 FROM mls_account_records t WHERE t.kind='store' AND t.scope=? AND t.id=? AND t.revision=? AND json_extract(t.payload,'$.state')='ACTIVE')`);bindings.push(p.organizationId,p.storeId,p.storeRevision);}
 if(p.legacyCashTenant){clauses.push(`EXISTS(SELECT 1 FROM mls_tenant_migrations x WHERE x.organization_id=? AND x.store_id=? AND x.domain='finance' AND x.state='COMPLETE' AND x.migration_version=1 AND x.legacy_cash_tenant=?)`);bindings.push(p.organizationId,p.storeId,p.legacyCashTenant);}
 return {sql:'INSERT INTO mls_account_guard(ok) SELECT 0 WHERE NOT ('+clauses.join(' AND ')+')',bindings};
}
