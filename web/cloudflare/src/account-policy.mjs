// Account policy is separate from the signed, eight-hour legacy owner/review cookies.
export const ACCOUNT_POLICY = Object.freeze({
 version:1, sessionAbsoluteSeconds:28800, sessionIdleSeconds:1800,
 emailVerificationSeconds:86400, passwordResetSeconds:1800, invitationSeconds:604800,
 reauthSeconds:300, preauthSeconds:300, transferSeconds:1800,
 passwordMin:15, passwordMax:128, passwordIterations:600000,
 passwordHash:'PBKDF2-HMAC-SHA256', passwordSaltBytes:32, passwordHashBytes:32,
 totpPeriodSeconds:30, totpDigits:6, totpWindow:1,
 cookieName:'__Host-mls_account', timezone:'America/Sao_Paulo', currency:'BRL',
 verificationCooldownSeconds:60,mfaEnrollmentSeconds:600,oauthStateSeconds:600,exportSeconds:300,
 abuse:Object.freeze({windowSeconds:900,account:12,origin:60,global:500,invitation:6,invitationActor:30,invitationGlobal:300}),
});
const common=['organization.read','store.read','team.read','catalog.read','orders.read','production.read','returns.read','dtf.read','ads.read','reports.read'];
const owner=[...common,'organization.write','organization.close','organization.transfer','team.invite','team.manage','store.connect','finance.read','finance.write','bank.read','bank.write','costs.read','costs.write','catalog.write','orders.write','production.write','returns.write','dtf.write','audit.read','billing.read','billing.manage'];
const definitions={
 OWNER:{label:'Proprietário',capabilities:owner},
 ADMIN:{label:'Administrador',capabilities:owner.filter(value=>!['organization.close','organization.transfer','billing.manage','store.connect'].includes(value))},
 FINANCE:{label:'Financeiro',capabilities:['organization.read','store.read','finance.read','finance.write','bank.read','bank.write','costs.read','costs.write','catalog.read','orders.read','reports.read','audit.read']},
 OPERATIONS:{label:'Operação',capabilities:['organization.read','store.read','catalog.read','catalog.write','orders.read','orders.write','production.read','production.write','returns.read','returns.write','dtf.read','dtf.write','reports.read']},
 VIEWER:{label:'Consulta',capabilities:['organization.read','store.read']},
};
const extraGrants={
 ADMIN:['store.connect'],
 FINANCE:['billing.read'],
 OPERATIONS:['ads.read','costs.read'],
 VIEWER:['team.read','finance.read','bank.read','costs.read','catalog.read','orders.read','production.read','returns.read','dtf.read','ads.read','reports.read','audit.read','billing.read'],
};
for(const [role,value]of Object.entries(definitions)){
 value.capabilities=Object.freeze([...new Set(value.capabilities)]);
 value.allowedCapabilities=Object.freeze([...new Set([...value.capabilities,...(extraGrants[role]??[])])]);
 Object.freeze(value);
}
export const ACCOUNT_ROLES=Object.freeze(definitions);
const none=Object.freeze([]);
export function roleCapabilities(role){return typeof role==='string'&&Object.hasOwn(ACCOUNT_ROLES,role)?ACCOUNT_ROLES[role].capabilities:none;}
export function roleAllowedCapabilities(role){return typeof role==='string'&&Object.hasOwn(ACCOUNT_ROLES,role)?ACCOUNT_ROLES[role].allowedCapabilities:none;}
