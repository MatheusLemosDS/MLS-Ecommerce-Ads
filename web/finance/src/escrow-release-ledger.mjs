import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';

// Source observations only. payout_raw deliberately has no implied currency,
// cent multiplier, transaction identity, bank receipt or profit semantics.
export const ESCROW_RELEASE_LEDGER_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_scans(scan_id TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,month TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,time_from INTEGER NOT NULL,time_to INTEGER NOT NULL,created_at INTEGER NOT NULL,checked_at INTEGER NOT NULL,window_index INTEGER NOT NULL,page_no INTEGER NOT NULL,pages_read INTEGER NOT NULL,rows_read INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL,last_error TEXT,lease_owner TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_pages(scan_id TEXT NOT NULL,window_index INTEGER NOT NULL,page_no INTEGER NOT NULL,row_count INTEGER NOT NULL,owned_count INTEGER NOT NULL,body_hash TEXT NOT NULL,owned_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(scan_id,window_index,page_no))`,
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_rows(scan_id TEXT NOT NULL,window_index INTEGER NOT NULL,page_no INTEGER NOT NULL,row_index INTEGER NOT NULL,order_hash TEXT NOT NULL,order_sn TEXT NOT NULL,payout_raw TEXT,release_time INTEGER NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(scan_id,window_index,page_no,row_index))`,
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_publications(month TEXT PRIMARY KEY,scan_id TEXT NOT NULL,published_at INTEGER NOT NULL)`,
];
const origin='https://partner.shopeemobile.com',path='/api/v2/payment/get_escrow_list',encoder=new TextEncoder(),ready=new WeakSet();
const identity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id],diagnostics=[null,'PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','REPEATED_PAGE','LIMIT_REACHED'];
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_ESCROW_RELEASE_'+suffix,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const serial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
const localDate=stamp=>dayFormatter.format(new Date(stamp*1000));
function midnight(day){
 // Some historical Brazilian dates began at 01:00. Searching for the first
 // second of the local date avoids oscillating between two offset guesses.
 const target=Date.parse(day+'T00:00:00Z')/1000;let low=target-18*3600,high=target+18*3600;
 while(low<high){const middle=Math.floor((low+high)/2);if(localDate(middle)<day)low=middle+1;else high=middle;}
 if(localDate(low)!==day)fail('CLOCK_INVALID');return low;
}
const advanceDay=(day,count)=>new Date(Date.parse(day+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
function dates(month,stamp){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>localDate(stamp).slice(0,7))fail('REQUEST_INVALID',400);
 const next=new Date(month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 const from=midnight(month+'-01'),to=Math.min(stamp,midnight(next.toISOString().slice(0,10)));return {from,to};
}
function windows(from,to){const result=[];for(let low=from;low<to;){const high=Math.min(to,midnight(advanceDay(localDate(low),7)));if(high<=low||result.length>=6)fail('STORAGE_INVALID');result.push({low,high});low=high;}return result;}
function canonicalDecimal(value){
 if(typeof value!=='string'||value.length>48)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,12}))?$/.exec(value);if(!match||match[3]?.endsWith('0')||match[1]&&/^0(?:\.0+)?$/.test(value.slice(1)))return null;
 if(BigInt(match[2])>1000000000000n||BigInt(match[2])===1000000000000n&&match[3])return null;return value;
}
function providerRaw(value){
 if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));if(!match)return null;
 let digits=(match[2]+(match[3]??'')).replace(/^0+/,'')||'0',scale=(match[3]??'').length-Number(match[4]??0);
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}if(scale>12)return null;
 if(scale>0){digits=digits.padStart(scale+1,'0');digits=digits.slice(0,-scale)+'.'+digits.slice(-scale);digits=digits.replace(/0+$/,'').replace(/\.$/,'');}
 return canonicalDecimal((match[1]&&digits!=='0'?'-':'')+digits);
}
function envelope(value){
 if(!plain(value)||typeof value.error!=='string')fail('INVALID_RESPONSE',502);
 for(const row of [value,...(plain(value.response)?[value.response]:[])])for(const name of ['partner_id','shop_id'])if(Object.hasOwn(row,name)&&row[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502);
 if(value.error!=='')fail(['error_api_permission','error_auth','error_sign','error_partner_id','error_ip'].includes(value.error)?'PERMISSION_DENIED':['error_limit','error_rate_limit'].includes(value.error)?'RATE_LIMIT':'UNAVAILABLE',502);
 if(!plain(value.response))fail('INVALID_RESPONSE',502);return value.response;
}
function classify(error){
 const code=error instanceof FinanceConnectionError?error.code:'';
 if(code==='FINANCE_ESCROW_RELEASE_PERMISSION_DENIED'||error?.upstream_status===403&&['JSON_PERMISSION_REJECTED','JSON_AUTHORIZATION_REJECTED','JSON_SIGNATURE_REJECTED','JSON_PARTNER_REJECTED','JSON_IP_REJECTED'].includes(error.upstream_diagnostic))return 'PERMISSION_DENIED';
 if(code==='FINANCE_ESCROW_RELEASE_RATE_LIMIT'||error?.upstream_status===429)return 'RATE_LIMIT';
 if(code.endsWith('_TIMEOUT')||[408,504].includes(error?.upstream_status))return 'TIMEOUT';
 if(code==='FINANCE_ESCROW_RELEASE_REPEATED_PAGE')return 'REPEATED_PAGE';
 if(['FINANCE_ESCROW_RELEASE_INVALID_RESPONSE','FINANCE_ESCROW_RELEASE_UPSTREAM_INVALID_JSON','FINANCE_ESCROW_RELEASE_UPSTREAM_CONTENT_TYPE','FINANCE_ESCROW_RELEASE_UPSTREAM_BODY_TOO_LARGE'].includes(code))return 'INVALID_RESPONSE';
 return 'UNAVAILABLE';
}
const ownedValue=row=>({row_index:row.row_index,order_hash:row.order_hash,order_sn:row.order_sn,payout_raw:row.payout_raw,release_time:row.release_time});
const pageHash=(scan,page,rows)=>hash(JSON.stringify({scan_id:scan,window_index:page.window_index,page_no:page.page_no,checked_at:page.checked_at,rows:rows.map(ownedValue)}));

async function readState(db,month,stamp){
 const args=[month,...identity],selected=`SELECT scan_id FROM finance_escrow_release_scans WHERE month=? AND partner_id=? AND shop_id=? AND (scan_id=(SELECT scan_id FROM finance_escrow_release_publications WHERE month=?) OR status<>'COMPLETE' AND scan_id=(SELECT scan_id FROM finance_escrow_release_scans WHERE month=? AND partner_id=? AND shop_id=? ORDER BY created_at DESC,scan_id DESC LIMIT 1))`;
 const results=await db.batch([
  db.prepare('SELECT * FROM finance_escrow_release_publications WHERE month=?').bind(month),
  db.prepare('SELECT * FROM finance_escrow_release_scans WHERE month=? AND partner_id=? AND shop_id=? ORDER BY created_at DESC,scan_id DESC LIMIT 4').bind(...args),
  db.prepare('SELECT * FROM finance_escrow_release_pages WHERE scan_id IN('+selected+') ORDER BY scan_id,window_index,page_no').bind(...args,month,...args),
  db.prepare('SELECT * FROM finance_escrow_release_rows WHERE scan_id IN('+selected+') ORDER BY scan_id,window_index,page_no,row_index').bind(...args,month,...args),
 ]);
 const publication=results[0]?.results?.[0],runs=results[1]?.results,pages=results[2]?.results,rows=results[3]?.results;
 if(!Array.isArray(runs)||!Array.isArray(pages)||!Array.isArray(rows)||runs.length>4||pages.length>2400||rows.length>20000)fail('STORAGE_INVALID');
 if(publication&&(!uuid(publication.scan_id)||!integer(publication.published_at,1,stamp+60)))fail('STORAGE_INVALID');
 const latest=runs[0]??null,active=latest&&latest.status!=='COMPLETE'?latest:null,published=publication?runs.find(row=>row.scan_id===publication.scan_id):null;
 if(publication&&!published)fail('STORAGE_INVALID');
 const project=async run=>{
  if(!run)return null;
  const range=dates(month,stamp);if(!uuid(run.scan_id)||run.partner_id!==identity[0]||run.shop_id!==identity[1]||run.month!==month||!integer(run.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(run.status)||run.time_from!==range.from||!integer(run.time_to,run.time_from+1,Math.min(stamp,range.to))||!integer(run.created_at,run.time_to,stamp+60)||!integer(run.checked_at,run.created_at,stamp+60)||!integer(run.window_index,0,6)||!integer(run.page_no,1,201)||!integer(run.pages_read,0,1200)||!integer(run.rows_read,0,10000)||!integer(run.next_attempt_at,0,9999999999)||!diagnostics.includes(run.last_error)||(run.lease_owner===null)!==(run.lease_until===null)||run.lease_owner!==null&&(!uuid(run.lease_owner)||!integer(run.lease_until,1,9999999999)))fail('STORAGE_INVALID');
  const slots=windows(run.time_from,run.time_to),ownPages=pages.filter(row=>row.scan_id===run.scan_id),ownRows=rows.filter(row=>row.scan_id===run.scan_id);if(run.window_index>slots.length||run.status==='COMPLETE'&&run.window_index!==slots.length||run.status==='RUNNING'&&run.window_index>=slots.length||ownPages.length!==run.pages_read||ownRows.length!==run.rows_read)fail('STORAGE_INVALID');
  const counts=new Map();for(const row of ownRows){const slot=slots[row.window_index];if(!slot||!integer(row.page_no,1,200)||!integer(row.row_index,0,99)||!serial(row.order_sn)||!digest(row.order_hash)||row.payout_raw!==null&&canonicalDecimal(row.payout_raw)===null||!integer(row.release_time,slot.low,slot.high-1)||!integer(row.checked_at,run.created_at,run.checked_at)||await hash(row.order_sn)!==row.order_hash)fail('STORAGE_INVALID');counts.set(row.order_hash,(counts.get(row.order_hash)??0)+1);}
  for(const page of ownPages){const slot=slots[page.window_index],pageRows=ownRows.filter(row=>row.window_index===page.window_index&&row.page_no===page.page_no);if(!slot||!integer(page.page_no,1,200)||!integer(page.row_count,0,100)||!integer(page.owned_count,0,page.row_count)||pageRows.length!==page.owned_count||!digest(page.body_hash)||!digest(page.owned_hash)||!integer(page.checked_at,run.created_at,run.checked_at)||pageRows.some(row=>row.checked_at!==page.checked_at||row.row_index>=page.row_count)||await pageHash(run.scan_id,page,pageRows)!==page.owned_hash)fail('STORAGE_INVALID');}
  for(let index=0;index<slots.length;index++){const current=ownPages.filter(row=>row.window_index===index);if(index<run.window_index&&current.length===0||index>run.window_index&&current.length||index===run.window_index&&current.length!==run.page_no-1)fail('STORAGE_INVALID');if(current.some((row,position)=>row.page_no!==position+1))fail('STORAGE_INVALID');}
  const times=ownPages.map(row=>row.checked_at);
  return {scan_id:run.scan_id,revision:run.revision,month,status:run.status,start_date:month+'-01',end_date:localDate(run.time_to-1),time_from:run.time_from,time_to:run.time_to,cutoff_at:run.time_to,created_at:run.created_at,checked_at:run.checked_at,source_checked_at:{oldest_at:times.length?Math.min(...times):null,latest_at:times.length?Math.max(...times):null},progress:{windows_total:slots.length,windows_complete:run.window_index,pages_read:run.pages_read,rows_read:run.rows_read,window_index:run.window_index,page_no:run.page_no},ambiguous_orders:[...counts.values()].filter(value=>value>1).length,diagnostic:run.last_error,next_attempt_at:run.next_attempt_at,rows:ownRows.map(({scan_id,...row})=>row)};
 };
 const publishedValue=await project(published),activeValue=await project(active);
 if(publishedValue&&publishedValue.status!=='COMPLETE'||latest?.status==='COMPLETE'&&latest.scan_id!==publication?.scan_id)fail('STORAGE_INVALID');
 let state='IDLE',code=null,next=0;if(activeValue){code=activeValue.diagnostic;next=activeValue.next_attempt_at;state=activeValue.status==='LIMIT_REACHED'?'LIMIT_REACHED':code==='PERMISSION_DENIED'?'BLOCKED':next>stamp?'RETRY_WAIT':'RUNNING';}
 return {schema:'escrow_release_ledger_v1',month,checked_at:stamp,published:publishedValue,active:activeValue,rows:publishedValue?.rows??activeValue?.rows??[],collection:{state,code,next_attempt_at:next},_run:active,_pages:pages.filter(row=>row.scan_id===active?.scan_id)};
}
const outward=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith('_')));

export async function runEscrowReleaseLedger(env,options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!['operation','month','fetchImpl','now','timeoutMs'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value'))||!['read','step'].includes(options.operation))fail('REQUEST_INVALID',400);
 const {now=()=>Date.now(),fetchImpl,timeoutMs=5000}=options,epoch=()=>{let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);};
 const stamp=epoch(),month=options.month,range=dates(month,stamp),db=env?.FINANCE_DB;
 if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof db?.prepare!=='function'||typeof db?.batch!=='function'||db===env.ADMIN_DB)fail('CONFIGURATION');
 if(!ready.has(db)){await db.batch(ESCROW_RELEASE_LEDGER_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 let state=await readState(db,month,stamp);if(options.operation==='read')return outward(state);
 if(typeof fetchImpl!=='function'||!integer(timeoutMs,5,5000))fail('CONFIGURATION');
 const freshness=month===localDate(stamp).slice(0,7)?300:900;
 if((!state.active||state.active.status==='LIMIT_REACHED'&&state.active.next_attempt_at<=stamp)&&(!state.published||stamp-state.published.created_at>=freshness)&&range.to>range.from){
  const id=crypto.randomUUID(),blocked="SELECT 1 FROM finance_escrow_release_scans WHERE month=? AND partner_id=? AND shop_id=? AND (status='RUNNING' OR status='LIMIT_REACHED' AND next_attempt_at>?)",fresh="SELECT 1 FROM finance_escrow_release_publications p JOIN finance_escrow_release_scans s ON s.scan_id=p.scan_id WHERE p.month=? AND s.partner_id=? AND s.shop_id=? AND s.created_at>?";
  const obsolete=`SELECT scan_id FROM finance_escrow_release_scans WHERE month=? AND partner_id=? AND shop_id=? AND scan_id NOT IN(SELECT scan_id FROM finance_escrow_release_publications WHERE month=?) AND (lease_owner IS NULL OR lease_until<=?) ORDER BY created_at DESC,scan_id DESC LIMIT -1 OFFSET 2`,oldArgs=[month,...identity,month,stamp];
  await db.batch([db.prepare('DELETE FROM finance_escrow_release_rows WHERE scan_id IN('+obsolete+')').bind(...oldArgs),db.prepare('DELETE FROM finance_escrow_release_pages WHERE scan_id IN('+obsolete+')').bind(...oldArgs),db.prepare('DELETE FROM finance_escrow_release_scans WHERE scan_id IN('+obsolete+')').bind(...oldArgs),db.prepare("INSERT INTO finance_escrow_release_scans(scan_id,partner_id,shop_id,month,revision,status,time_from,time_to,created_at,checked_at,window_index,page_no,pages_read,rows_read,next_attempt_at,last_error,lease_owner,lease_until) SELECT ?,?,?,?,1,'RUNNING',?,?,?,?,0,1,0,0,0,NULL,NULL,NULL WHERE NOT EXISTS("+blocked+') AND NOT EXISTS('+fresh+')').bind(id,...identity,month,range.from,range.to,stamp,stamp,month,...identity,stamp,month,...identity,stamp-freshness)]);
  state=await readState(db,month,stamp);
 }
 const run=state._run;if(!run||run.status!=='RUNNING'||run.next_attempt_at>stamp||run.lease_until>stamp)return outward(state);
 const owner=crypto.randomUUID(),leaseUntil=stamp+45,guard="scan_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND lease_owner=? AND lease_until>?",guardArgs=at=>[run.scan_id,...identity,run.revision,owner,at];
 const leased=await db.prepare("UPDATE finance_escrow_release_scans SET lease_owner=?,lease_until=? WHERE scan_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND next_attempt_at<=? AND (lease_owner IS NULL OR lease_until<=?)").bind(owner,leaseUntil,run.scan_id,...identity,run.revision,stamp,stamp).run();if(leased?.meta?.changes!==1)return outward(await readState(db,month,epoch()));
 try{
  const keyText=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof keyText!=='string'||!keyText.length||keyText.length>4096||/[\u0000-\u001f\u007f]/.test(keyText))fail('SIGNING_CONFIGURATION');
  const bytes=encoder.encode(keyText);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
  const remainingTimeout=()=>{const left=(stamp+20-epoch()-3)*1000;if(left<5)fail('UNAVAILABLE');return Math.min(timeoutMs,left);};
  let calls=0;const boundedFetch=async request=>{if(calls>=2||epoch()>=stamp+17)fail('UNAVAILABLE');calls++;return fetchImpl(request);},tokens=await ensureFinanceAccessToken(env,{fetchImpl:boundedFetch,now,timeoutMs:remainingTimeout()});
  const timestamp=epoch();if(tokens.expires_at<=timestamp)fail('UNAVAILABLE');const slot=windows(run.time_from,run.time_to)[run.window_index];if(!slot||run.page_no>200)fail('INVALID_RESPONSE');
  const response=await requestFinanceAuthJson({input:{timestamp},options:{fetchImpl:boundedFetch,now,timeoutMs:remainingTimeout()},prefix:'FINANCE_ESCROW_RELEASE',maximumBodyBytes:1048576,buildRequest:async()=>{
   const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(String(identity[0])+path+timestamp+tokens.access_token+identity[1]))),byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(path,origin);
   for(const [name,value] of Object.entries({partner_id:identity[0],shop_id:identity[1],timestamp,access_token:tokens.access_token,sign:signature,release_time_from:slot.low-1,release_time_to:slot.high,page_size:100,page_no:run.page_no}))url.searchParams.set(name,String(value));return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
  },normalizeResponse:envelope});
  if(!Array.isArray(response.escrow_list)||response.escrow_list.length>100||typeof response.more!=='boolean'||response.more&&response.escrow_list.length===0)fail('INVALID_RESPONSE',502);
  const observed=[];for(const row of response.escrow_list){if(!plain(row)||!serial(row.order_sn)||!integer(row.escrow_release_time,slot.low-1,slot.high)||Object.hasOwn(row,'payout_amount')&&row.payout_amount!==null&&providerRaw(row.payout_amount)===null)fail('INVALID_RESPONSE',502);for(const name of ['partner_id','shop_id'])if(Object.hasOwn(row,name)&&row[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502);if(Object.hasOwn(row,'currency')&&row.currency!=='BRL')fail('INVALID_RESPONSE',502);observed.push({order_sn:row.order_sn,payout_raw:row.payout_amount===null||!Object.hasOwn(row,'payout_amount')?null:providerRaw(row.payout_amount),release_time:row.escrow_release_time});}
  const bodyHash=await hash(JSON.stringify(observed));if(response.more&&observed.length&&state._pages.some(page=>page.window_index===run.window_index&&page.body_hash===bodyHash))fail('REPEATED_PAGE',502);
  const finished=epoch(),owned=[];for(let index=0;index<observed.length;index++){const row=observed[index];if(row.release_time>=slot.low&&row.release_time<slot.high)owned.push({...row,row_index:index,order_hash:await hash(row.order_sn),checked_at:finished,window_index:run.window_index,page_no:run.page_no});}
  if(run.rows_read+owned.length>10000){await db.prepare("UPDATE finance_escrow_release_scans SET status='LIMIT_REACHED',revision=revision+1,checked_at=?,last_error='LIMIT_REACHED',next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE "+guard).bind(finished,finished+1800,...guardArgs(finished)).run();return outward(await readState(db,month,finished));}
  const page={window_index:run.window_index,page_no:run.page_no,checked_at:finished},ownedHash=await pageHash(run.scan_id,page,owned),nextIndex=run.window_index+Number(!response.more),nextPage=response.more?run.page_no+1:1,complete=nextIndex===windows(run.time_from,run.time_to).length,limited=!complete&&response.more&&nextPage>200,status=complete?'COMPLETE':limited?'LIMIT_REACHED':'RUNNING',nextAttempt=limited?finished+1800:0,condition='EXISTS(SELECT 1 FROM finance_escrow_release_scans WHERE '+guard+')',args=guardArgs(finished);
  const writes=owned.map(row=>db.prepare('INSERT INTO finance_escrow_release_rows(scan_id,window_index,page_no,row_index,order_hash,order_sn,payout_raw,release_time,checked_at) SELECT ?,?,?,?,?,?,?,?,? WHERE '+condition).bind(run.scan_id,row.window_index,row.page_no,row.row_index,row.order_hash,row.order_sn,row.payout_raw,row.release_time,row.checked_at,...args));
  writes.push(db.prepare('INSERT INTO finance_escrow_release_pages(scan_id,window_index,page_no,row_count,owned_count,body_hash,owned_hash,checked_at) SELECT ?,?,?,?,?,?,?,? WHERE '+condition).bind(run.scan_id,run.window_index,run.page_no,observed.length,owned.length,bodyHash,ownedHash,finished,...args));
  writes.push(db.prepare('UPDATE finance_escrow_release_scans SET revision=revision+1,status=?,checked_at=?,window_index=?,page_no=?,pages_read=pages_read+1,rows_read=rows_read+?,next_attempt_at=?,last_error=?,lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(status,finished,nextIndex,nextPage,owned.length,nextAttempt,limited?'LIMIT_REACHED':null,...args));
  if(complete)writes.push(db.prepare('INSERT INTO finance_escrow_release_publications(month,scan_id,published_at) SELECT ?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM finance_escrow_release_scans WHERE scan_id=? AND revision=? AND status=\'COMPLETE\') ON CONFLICT(month) DO UPDATE SET scan_id=excluded.scan_id,published_at=excluded.published_at WHERE finance_escrow_release_publications.published_at<=excluded.published_at').bind(month,run.scan_id,finished,run.scan_id,run.revision+1));
  await db.batch(writes);
 }catch(error){const finished=epoch(),code=classify(error),delay=code==='PERMISSION_DENIED'?3600:code==='RATE_LIMIT'||code==='TIMEOUT'?60:code==='REPEATED_PAGE'?900:300;await db.prepare('UPDATE finance_escrow_release_scans SET revision=revision+1,checked_at=?,next_attempt_at=?,last_error=?,lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(finished,finished+delay,code,...guardArgs(finished)).run();}
 return outward(await readState(db,month,epoch()));
}
