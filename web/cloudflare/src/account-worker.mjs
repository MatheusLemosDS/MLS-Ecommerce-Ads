import {ACCOUNT_POLICY} from './account-policy.mjs';
import {AccountError,accountFail} from './account-store.mjs';
import {ACCOUNT_COOKIE,createAccountService,resolveAccountSession,resolveCommercialPrincipal,requireAccount,publicAccountUser} from './account-service.mjs';
import {createAccountOrganizations} from './account-organizations.mjs';

const accountHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
export function accountSessionCookie(token,{clear=false}={}){return ACCOUNT_COOKIE+'='+(clear?'':token)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(clear?0:ACCOUNT_POLICY.sessionAbsoluteSeconds);}
function response(value,status=200){const headers=new Headers(accountHeaders),body={...value};if(body.token){headers.append('set-cookie',accountSessionCookie(body.token));delete body.token;}if(body.logged_out||body.login_required||body.requested&&body.purged===false){headers.append('set-cookie',accountSessionCookie('',{clear:true}));}return new Response(JSON.stringify(body),{status,headers});}
async function body(request,fields){
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')||''))accountFail('ACCOUNT_JSON_REQUIRED',415);
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>16384))accountFail('ACCOUNT_BODY_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)accountFail('ACCOUNT_BODY_REQUIRED');let size=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384)accountFail('ACCOUNT_BODY_TOO_LARGE',413);chunks.push(value);}}finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{accountFail('ACCOUNT_JSON_INVALID');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))accountFail('ACCOUNT_INPUT_INVALID');return value;
}
function origin(request,options){const expected=options.publicOrigin??new URL(request.url).origin;if(request.headers.get('origin')!==expected)accountFail('ACCOUNT_ORIGIN_REJECTED',403);}
function csrf(request,ctx){if(!ctx||request.headers.get('x-csrf-token')!==ctx.csrf)accountFail('ACCOUNT_CSRF_REJECTED',403);}
function method(request,allowed){if(!allowed.includes(request.method))accountFail('ACCOUNT_METHOD_NOT_ALLOWED',405);}
function safeSession(ctx){return {id:ctx.session.id,current:true,created_at:ctx.session.created_at,last_activity_at:ctx.session.last_activity_at,expires_at:ctx.session.expires_at,mfa_complete:ctx.session.mfa_complete};}
async function accountDispatch(request,env,options={}){
 const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/account/')&&path!=='/api/companies'&&!path.startsWith('/api/companies/'))return null;
 const correlation=crypto.randomUUID();try{
  if(url.search||url.hash)accountFail('ACCOUNT_REQUEST_INVALID');
  const service=await createAccountService(env,options),companies=await createAccountOrganizations(service,env,options),ctx=await resolveAccountSession(request,env,options),write=!['GET','HEAD'].includes(request.method),source=typeof options.originKey==='function'?await options.originKey(request):request.headers.get('cf-connecting-ip')??'unknown';
  if(write)origin(request,options);
  const post=async(fields,{active=true,mfa=true,authenticated=true}={})=>{method(request,['POST']);if(authenticated){requireAccount(ctx,{active,mfa});csrf(request,ctx);}return body(request,fields);};
  const read=()=>{method(request,['GET']);requireAccount(ctx);};
  if(path==='/api/account/register')return response(await service.register(await post(['name','email','password'],{authenticated:false}),source),202);
  if(path==='/api/account/login')return response(await service.login(await post(['email','password'],{authenticated:false}),source));
  if(path==='/api/account/password-reset/request')return response(await service.requestReset(await post(['email'],{authenticated:false}),source),202);
  if(path==='/api/account/password-reset/confirm')return response(await service.confirmReset(await post(['token','password'],{authenticated:false})));
  if(path==='/api/account/email-verification/confirm'){const input=await post(['token'],{authenticated:false});if(ctx)csrf(request,ctx);return response(await service.confirmVerification(input,ctx));}
  if(path==='/api/account/session'){method(request,['GET']);requireAccount(ctx,{active:false,mfa:false});return response({user:ctx.user,session:safeSession(ctx),csrf:ctx.csrf,context:{organization_id:ctx.session.organization_id,store_id:ctx.session.store_id}});}
  if(path==='/api/account/logout'){await post([],{active:false,mfa:false});return response(await service.logout(ctx));}
  if(path==='/api/account/email-verification/request'){await post([],{active:false});return response(await service.requestVerification(ctx,source),202);}
  if(path==='/api/account/profile'){method(request,['GET','PATCH']);requireAccount(ctx);if(request.method==='GET')return response({user:ctx.user});csrf(request,ctx);return response(await service.profile(ctx,await body(request,['revision','name','preferences','new_email'])));}
  if(path==='/api/account/reauth'){const input=await post(['password','code','recovery_code'],{mfa:false});return response(await service.reauthenticate(ctx,{...input,origin:source}));}
  if(path==='/api/account/password/change')return response(await service.changePassword(ctx,await post(['current_password','password'])));
  if(path==='/api/account/security'){read();return response({mfa_enabled:ctx.user.mfa_enabled,policy:ACCOUNT_POLICY});}
  if(path==='/api/account/mfa/enroll'){await post([]);return response(await service.enrollMfa(ctx));}
  if(path==='/api/account/mfa/confirm')return response(await service.confirmMfa(ctx,await post(['code'])));
  if(path==='/api/account/mfa/challenge')return response(await service.challenge(ctx,await post(['code','recovery_code'],{mfa:false})));
  if(path==='/api/account/mfa/disable')return response(await service.disableMfa(ctx,await post(['code','recovery_code'])));
  if(path==='/api/account/mfa/recovery-codes')return response(await service.regenerateRecovery(ctx,await post(['code','recovery_code'])));
  if(path==='/api/account/sessions'){read();return response(await service.sessions(ctx));}
  if(path==='/api/account/sessions/revoke-others'){await post([]);return response(await service.revokeSession(ctx,null,true));}
  let match;if((match=/^\/api\/account\/sessions\/([-a-zA-Z0-9_]+)\/revoke$/.exec(path))){await post([]);const result=await service.revokeSession(ctx,match[1]);return response(result.current?{...result,logged_out:true}:result);}
  if(path==='/api/account/security/events'){read();return response(await service.securityEvents(ctx));}
  if(path==='/api/account/invitations/accept')return response(await companies.accept(ctx,await post(['token','confirmed'])));
  if(path==='/api/account/notifications'){read();return response(await companies.notifications(ctx));}
  if((match=/^\/api\/account\/notifications\/([-a-zA-Z0-9_]+)\/read$/.exec(path))){await post([]);return response(await companies.readNotification(ctx,match[1]));}
  if(path==='/api/account/exports')return response(await companies.export(ctx,await post(['confirmed','organization_id'])),201);
  if((match=/^\/api\/account\/exports\/([-a-zA-Z0-9_]+)$/.exec(path))){read();const result=response(await companies.downloadExport(ctx,match[1]));result.headers.set('content-disposition','attachment; filename="mls-export.json"');return result;}
  if(path==='/api/account/deletion-request')return response(await companies.deleteAccount(ctx,await post(['confirmed'])),202);
  if(path==='/api/account/help'){read();const support=typeof env.ACCOUNT_SUPPORT_URL==='string'&&/^https:\/\//.test(env.ACCOUNT_SUPPORT_URL)?{available:true,url:env.ACCOUNT_SUPPORT_URL}:{available:false,reason:'SUPPORT_CHANNEL_NOT_CONFIGURED'};return response({areas:[{name:'Conta e segurança',path:'/account/security'},{name:'Empresa e equipe',path:'/companies'},{name:'Fontes e estimativas',path:'/admin?tab=weekly-report'}],support,correlation});}
  if(path==='/api/companies'){method(request,['GET','POST']);requireAccount(ctx);if(request.method==='GET')return response(await companies.list(ctx));csrf(request,ctx);return response(await companies.create(ctx,await body(request,['name','confirmed','request_id'])),201);}
  if((match=/^\/api\/companies\/([-a-zA-Z0-9_]+)(?:\/(.*))?$/.exec(path))){
   const [,id,tail='']=match;requireAccount(ctx);
   if(!tail){method(request,['GET','PATCH']);if(request.method==='GET')return response(await companies.get(ctx,id));csrf(request,ctx);return response(await companies.update(ctx,id,await body(request,['revision','name','currency','timezone','country'])));}
   if(tail==='select'){const input=await post(['store_id']);return response(await companies.select(ctx,id,input.store_id??null));}
   if(tail==='onboarding'){read();return response(await companies.onboarding(ctx,id));}
   if(tail==='team'){read();return response(await companies.team(ctx,id));}
   if(tail==='invitations')return response(await companies.invite(ctx,id,await post(['email','role','store_ids','capabilities','confirmed','request_id'])),201);
   let sub;if((sub=/^invitations\/([-a-zA-Z0-9_]+)\/(revoke|resend)$/.exec(tail)))return response(await companies.invitationAction(ctx,id,sub[1],await post(['revision','confirmed']),sub[2]));
   if((sub=/^members\/([-a-zA-Z0-9_]+)$/.exec(tail))){method(request,['PATCH']);csrf(request,ctx);return response(await companies.updateMember(ctx,id,sub[1],await body(request,['revision','confirmed','role','store_ids','capabilities','remove'])));}
   if(tail==='leave')return response(await companies.leave(ctx,id,await post(['confirmed'])));
   if(tail==='ownership-transfer')return response(await companies.transfer(ctx,id,await post(['revision','user_id','confirmed'])),201);
   if((sub=/^ownership-transfer\/([-a-zA-Z0-9_]+)\/accept$/.exec(tail)))return response(await companies.acceptTransfer(ctx,id,sub[1],await post(['confirmed'])));
   if(tail==='stores'){method(request,['GET','POST']);if(request.method==='GET')return response(await companies.stores(ctx,id));csrf(request,ctx);return response(await companies.createStore(ctx,id,await body(request,['name','platform','confirmed','request_id'])),201);}
   if((sub=/^stores\/([-a-zA-Z0-9_]+)\/connect$/.exec(tail)))return response(await companies.connectStore(ctx,id,sub[1],await post(['confirmed'])));
   if(tail==='billing'){read();return response(await companies.billing(ctx,id));}
   if(tail==='audit'){read();return response(await companies.audit(ctx,id));}
   if(tail==='closure-request')return response(await companies.closeCompany(ctx,id,await post(['revision','confirmed'])),202);
  }
  accountFail('ACCOUNT_NOT_FOUND',404);
 }catch(error){const code=error instanceof AccountError?error.code:typeof error?.code==='string'&&/^ACCOUNT_[A-Z_]+$/.test(error.code)?error.code:'ACCOUNT_UNAVAILABLE',status=error instanceof AccountError?error.status:Number.isInteger(error?.status)?error.status:503;const result=response({error:code,correlation},[400,401,403,404,405,409,413,415,429,503].includes(status)?status:503);if(status===429)result.headers.set('retry-after','60');return result;}
}
async function accountRequestFinished(result,request,options){if(result&&typeof options.logger==='function'){const path=new URL(request.url).pathname;const record={request_id:crypto.randomUUID(),area:path.startsWith('/api/companies')?'companies':'account',method:request.method,status:result.status};if(result.status>=400){try{const data=await result.clone().json();if(typeof data?.error==='string'&&/^ACCOUNT_[A-Z_]+$/.test(data.error))record.error=data.error;}catch{}}try{await options.logger(record);}catch{}}return result;}
export async function handleAccountRequest(request,env,options={}){
 const result=await accountDispatch(request,env,options);if(!result||!result.ok||request.method!=='GET')return accountRequestFinished(result,request,options);
 try{const ctx=await resolveAccountSession(request,env,{...options,touch:false});requireAccount(ctx,{active:false,mfa:false});
  const match=/^\/api\/companies\/([-a-zA-Z0-9_]+)(?:\/(.*))?$/.exec(new URL(request.url).pathname);if(match){const tail=match[2]??'',capability=tail==='billing'?'billing.read':tail==='audit'?'audit.read':tail==='team'?'team.read':tail==='stores'?'store.read':'organization.read';await resolveCommercialPrincipal(request,env,{...options,touch:false,organizationId:match[1],capability});}
  return accountRequestFinished(result,request,options);
 }catch(error){try{await result.body?.cancel();}catch{}return accountRequestFinished(response({error:error instanceof AccountError?error.code:'ACCOUNT_UNAVAILABLE'},error instanceof AccountError?error.status:503),request,options);}
}
