import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ESCROW_RELEASES_CLIENT,ESCROW_RELEASES_CSS,escrowReleasesBody} from '../src/escrow-releases-view.mjs';
import {projectBusinessEscrowReleases,projectBusinessEscrowReleaseEvidence} from '../src/business-escrow-releases.mjs';
import {projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame} from '../../finance/src/escrow-release-frame.mjs';

const clock=Date.UTC(2026,9,25,15),stamp=clock/1000;
const uuid='11111111-1111-4111-8111-111111111111',scan='22222222-2222-4222-8222-222222222222';
function observation({month='2026-10',release=12000,revision=2,partial=false,ambiguous=false}={}){
 const from=Date.parse(month+'-01T03:00:00Z')/1000,nextMonth=new Date(month+'-01T03:00:00Z');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);const cutoff=Math.min(stamp-600,nextMonth.getTime()/1000),windows=Math.ceil((cutoff-from)/(7*86400));
 const source={run_id:uuid,source_revision:revision,start_date:month+'-01',end_date:month+'-15',status:'AVAILABLE',orders:2,paid_orders:2,finance_oldest_at:stamp-1500,finance_latest_at:stamp-1400,expected_repass_cents:10000};
 const report={schema:'finance_escrow_releases_v1',month,checked_at:stamp-120,status:partial||ambiguous?'PARTIAL':'CHECKED',sources:[source],calendar:{scan_id:scan,status:partial?'RUNNING':'COMPLETE',from_at:from,end_before_at:cutoff,cutoff_at:cutoff,source_oldest_at:stamp-500,source_latest_at:stamp-400,observations:ambiguous?3:2,unique_orders:2,ambiguous_orders:ambiguous?1:0,verified_orders:ambiguous?1:2,unverified_orders:ambiguous?1:0,known_verified_release_cents:ambiguous?5000:release,total_release_cents:partial||ambiguous?null:release},collection:{scan_id:scan,status:partial?'RUNNING':'COMPLETE',cutoff_at:cutoff,windows_total:windows,windows_complete:partial?2:windows,pages_read:partial?2:windows,observations:ambiguous?3:2,next_attempt_at:stamp+900,diagnostic:null},matching:{status:'AVAILABLE',paid_orders:2,located_paid_orders:ambiguous?1:2,unlocated_paid_orders:0,ambiguous_paid_orders:ambiguous?1:0,verified_paid_orders:ambiguous?1:2,known_expected_located_cents:ambiguous?5000:10000,expected_located_cents:ambiguous?5000:10000,known_verified_release_cents:ambiguous?5000:release,verified_release_cents:partial?null:ambiguous?5000:release,comparison_difference_cents:partial?null:ambiguous?0:release-10000,outside_cohort_orders:0},pending:[...(partial?['RELEASES_COLLECTING']:[]),...(ambiguous?['RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','MATCHING_INCOMPLETE']:[]),'BANK_RECEIPT_NOT_VERIFIED'],basis:'RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'};
 const cohort={publication_revision:7,start_date:source.start_date,end_date:source.end_date,sources:[{run_id:uuid,source_revision:revision,start_date:source.start_date,end_date:source.end_date,orders:2,paid_orders:2,finance_oldest_at:source.finance_oldest_at,finance_latest_at:source.finance_latest_at,expected_repass_cents:10000}]};
 const value={schema:'business_escrow_releases_v1',month,checked_at:stamp,status:partial||ambiguous?'PARTIAL':'CHECKED',cohort,report,attempt:{checked_at:stamp-100,status:'SUCCESS',code:null,next_attempt_at:stamp+900}};
 assert.ok(projectEscrowReleaseFrame(report),'valid release fixture');assert.ok(projectBusinessEscrowReleases(value,projectEscrowReleaseFrame),'valid owner fixture');return value;
}
function evidenceObservation(){
 const legacy=observation({release:12000}),hashA='a'.repeat(64),hashB='b'.repeat(64),report=legacy.report;
 report.status='PARTIAL';Object.assign(report.calendar,{observations:1,unique_orders:1,verified_orders:1,unverified_orders:0,known_verified_release_cents:6000,total_release_cents:6000});report.collection.observations=1;
 Object.assign(report.matching,{paid_orders:2,located_paid_orders:1,unlocated_paid_orders:1,ambiguous_paid_orders:0,verified_paid_orders:1,known_expected_located_cents:5000,expected_located_cents:5000,known_verified_release_cents:6000,verified_release_cents:6000,comparison_difference_cents:1000,outside_cohort_orders:0});report.pending=['MATCHING_INCOMPLETE','BANK_RECEIPT_NOT_VERIFIED'];legacy.status='PARTIAL';
 const orders={schema:'finance_escrow_release_orders_v1',summary:{known_paid_orders:2,located_orders:1,ambiguous_orders:0,verified_orders:1,unverified_orders:0,not_located_orders:1,adjusted_orders:1,after_adjustment_known_orders:2,known_after_adjustment_cents:11000,not_located_after_adjustment_known_orders:1,known_not_located_after_adjustment_cents:5000},rows:[
  {order_hash:hashA,state:'VERIFIED',reference_count:1,release_time:stamp-600,financial_checked_at:stamp-1400,release_checked_at:stamp-400,base_repass_cents:5000,adjustment_cents:1000,after_adjustment_repass_cents:6000,release_cents:6000,comparison_basis:'AFTER_ADJUSTMENT',difference_from_base_cents:1000},
  {order_hash:hashB,state:'NOT_LOCATED',reference_count:0,release_time:null,financial_checked_at:stamp-1400,release_checked_at:null,base_repass_cents:5000,adjustment_cents:0,after_adjustment_repass_cents:5000,release_cents:null,comparison_basis:null,difference_from_base_cents:null}
 ],truncation:{truncated:false,orders_total:2,orders_included:2},basis:'PAID_ORDER_COHORT_RELEASE_MATCHING_NOT_BANK_RECEIPT'};
 const finance={schema:'finance_escrow_releases_v2',report,orders};assert.ok(projectEscrowReleaseEvidenceFrame(finance,projectEscrowReleaseFrame));
 const value={schema:'business_escrow_releases_v2',report:legacy,orders};assert.ok(projectBusinessEscrowReleaseEvidence(value,{projectBusiness:projectBusinessEscrowReleases,projectFrame:projectEscrowReleaseFrame,projectEvidenceFrame:projectEscrowReleaseEvidenceFrame}));return value;
}
function auditScope(value){const cohort=value.cohort;return cohort===null?null:{publication_revision:cohort.publication_revision,start_date:cohort.start_date,end_date:cohort.end_date,sources:cohort.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))};}
function browser(value=observation()){
 const ids=[...escrowReleasesBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),context=vm.createContext({serialized:JSON.stringify(value)});
 vm.runInContext(`${auditScope.toString()}let clock=${clock};class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;function node(tag='div'){return {tag,textContent:'',className:'',dataset:{},hidden:false,open:false,children:[],append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];}};}const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,node()]));const document={hidden:false,getElementById:id=>controls.get(id),createElement:tag=>node(tag)};const text=node=>node.textContent+node.children.map(text).join(' '),control=name=>controls.get('businessEscrowReleases'+name);let current=JSON.parse(serialized),selectedScope=auditScope(current.schema==='business_escrow_releases_v2'?current.report:current),customApi=null;const calls=[];const api=async(path,body)=>{calls.push({path,body});return customApi?customApi(path,body):JSON.parse(JSON.stringify(current));};const financialNet={textContent:'R$ 2.250,13'};`+ESCROW_RELEASES_CLIENT,context);
 const run=code=>vm.runInContext(code,context);
 return {context,run,text:name=>run('text(control('+JSON.stringify(name)+'))'),calls:()=>JSON.parse(run('JSON.stringify(calls)')),load(value){context.serialized=JSON.stringify(value);run('current=JSON.parse(serialized);');}};
}

 test('the collapsed release section distinguishes release dates, order dates and comparable values without altering the net',async()=>{
 const body=escrowReleasesBody();assert.match(body,/Liberações da Shopee/);assert.doesNotMatch(body,/<details[^>]*\bopen\b/);assert.match(ESCROW_RELEASES_CSS,/@media\(max-width:640px\)/);
 const b=browser();assert.equal(b.run('brazaEscrowReleases.start({api})'),true);assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);
 assert.equal(b.run('control("Details").open'),false);assert.match(b.text('Scope'),/Liberações de.*Fonte consultada de/);assert.match(b.text('Cohort'),/Pedidos criados de 01\/10\/2026 a 15\/10\/2026.*Financeiro consultado/);
 assert.match(b.text('Metrics'),/Valor liberado conferido.*120,00/);assert.match(b.text('Matching'),/Repasse previsto dos pedidos localizados:.*100,00.*Liberações com valor compatível:.*120,00.*Diferença no conjunto comparável:.*20,00/);
 assert.match(body,/não são somados nem descontados novamente/);assert.match(body,/recebimento no banco/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.deepEqual(b.calls(),[{path:'finance/escrow-releases?month=2026-10&evidence=orders-v1'}]);
 });

 test('a partial calendar displays only explicitly verified partial values and preserves its collection coverage',async()=>{
 const b=browser(observation({partial:true}));b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');
 assert.match(b.text('Status'),/calendário ainda está parcial.*2 de 4/);assert.match(b.text('Metrics'),/Valor conferido de 2 pedido.*120,00.*Valor parcial/);assert.doesNotMatch(b.text('Metrics'),/Valor liberado conferido.*120,00/);assert.match(b.text('Matching'),/Liberações com valor compatível:.*120,00.*parcial/);assert.doesNotMatch(b.text('Matching'),/Diferença no conjunto comparável/);
 assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 });

 test('repeated order releases stay ambiguous and never turn the comparable subset into a full calendar total',async()=>{
 const b=browser(observation({ambiguous:true}));b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');
 assert.match(b.text('Metrics'),/Valor conferido de 1 pedido.*50,00.*Valor parcial/);assert.doesNotMatch(b.text('Metrics'),/Valor liberado conferido.*50,00/);assert.match(b.text('Notice'),/mais de uma ocorrência.*total permanece em conferência/);assert.match(b.text('Matching'),/1 pedido.*mais de uma ocorrência/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 });

 test('unlocated and outside-cohort orders are not labelled unpaid or assigned to another month',async()=>{
 const value=observation(),r=value.report;r.calendar.observations=3;r.collection.observations=3;r.calendar.unique_orders=3;r.calendar.unverified_orders=1;r.calendar.total_release_cents=null;r.matching.paid_orders=3;r.matching.unlocated_paid_orders=1;r.matching.outside_cohort_orders=1;r.sources[0].orders=3;r.sources[0].paid_orders=3;r.sources[0].expected_repass_cents=15000;value.cohort.sources[0].orders=3;value.cohort.sources[0].paid_orders=3;value.cohort.sources[0].expected_repass_cents=15000;r.status='PARTIAL';r.pending.push('RELEASE_AMOUNT_UNVERIFIED','MATCHING_INCOMPLETE');value.status='PARTIAL';assert.ok(projectBusinessEscrowReleases(value,projectEscrowReleaseFrame));
 const b=browser(value);b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Matching'),/Sem liberação localizada neste período: 1 pedido/);assert.match(b.text('Matching'),/Fora do conjunto de pedidos pagos deste resumo: 1 pedido/);assert.doesNotMatch(b.text('Matching'),/não recebidos|não pagos|outros meses/);
 });

 test('coalesced passive reads retain good values and original source times after a failed refresh',async()=>{
 const b=browser();b.run('brazaEscrowReleases.start({api});customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.first=brazaEscrowReleases.observe("2026-10",selectedScope);globalThis.second=brazaEscrowReleases.observe("2026-10",selectedScope);');assert.equal(b.run('first===second'),true);await Promise.resolve();assert.equal(b.calls().length,1);b.run('finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('first'),true);const dates=b.text('Scope');
 for(let i=0;i<3;i++)assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;customApi=async()=>{throw Error("PRIVATE_PROVIDER_TOKEN");};');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),false);assert.match(b.text('Status'),/valores conferidos e suas datas foram preservados/);assert.equal(b.text('Scope'),dates);assert.match(b.text('Metrics'),/120,00/);assert.doesNotMatch(b.text('Status'),/PRIVATE_PROVIDER_TOKEN/);assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/escrow-releases?month=2026-10&evidence=orders-v1'));assert.equal(b.run('typeof setTimeout'),'undefined');
 });

 test('a new same-month cohort invalidates prior values and ignores its older in-flight response',async()=>{
 const b=browser(),next=observation({revision:3,release:14000});b.context.nextObservation=JSON.stringify(next);b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');
 b.run('clock+=60000;let requestCount=0;customApi=()=>new Promise(resolve=>{if(++requestCount===1)globalThis.finishOld=resolve;else globalThis.finishNew=resolve;});globalThis.old=brazaEscrowReleases.observe("2026-10",selectedScope);');await Promise.resolve();b.run('globalThis.newer=brazaEscrowReleases.observe("2026-10",auditScope(JSON.parse(nextObservation)));');assert.equal(b.text('Matching'),'');await Promise.resolve();b.run('finishNew(JSON.parse(nextObservation));');assert.equal(await b.run('newer'),true);const display=b.text('Metrics');assert.match(display,/140,00/);b.run('finishOld(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('old'),false);assert.equal(b.text('Metrics'),display);assert.equal(b.calls().length,3);
 });

 test('hidden, stopped and malformed observations cannot launch source work or restore untrusted values',async()=>{
 const b=browser();b.run('brazaEscrowReleases.start({api});document.hidden=true;');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),false);assert.equal(b.calls().length,0);b.run('document.hidden=false;customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.waiting=brazaEscrowReleases.observe("2026-10",selectedScope);');await Promise.resolve();b.run('brazaEscrowReleases.stop();finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false);assert.equal(b.text('Matching'),'');
 b.run('brazaEscrowReleases.start({api});customApi=async()=>({...JSON.parse(JSON.stringify(current)),access_token:"PRIVATE"});');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),false);assert.equal(b.text('Matching'),'');assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.ok(b.calls().every(call=>call.body===undefined));
 });

 test('an initial month without a published cohort or source report remains pending instead of displaying a zero release total',async()=>{
 const value={schema:'business_escrow_releases_v1',month:'2026-10',checked_at:stamp,status:'COLLECTING',cohort:null,report:null,attempt:null};assert.ok(projectBusinessEscrowReleases(value,projectEscrowReleaseFrame));
 const b=browser(value);b.run('brazaEscrowReleases.start({api})');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),false);assert.equal(b.run('control("Metrics").hidden'),true);assert.match(b.text('Status'),/Aguardando um resumo publicado/);assert.equal(b.text('Matching'),'');assert.doesNotMatch(b.text('Metrics'),/0,00/);assert.equal(b.calls().length,0);
 });


 test('unverified amounts and missing cohort evidence never become a BRL zero or an assertion of nonreceipt',async()=>{
 const value=observation(),r=value.report;r.calendar.verified_orders=0;r.calendar.unverified_orders=2;r.calendar.known_verified_release_cents=0;r.calendar.total_release_cents=null;r.matching.verified_paid_orders=0;r.matching.known_verified_release_cents=0;r.matching.verified_release_cents=null;r.matching.comparison_difference_cents=null;r.status='PARTIAL';r.pending.push('RELEASE_AMOUNT_UNVERIFIED','MATCHING_INCOMPLETE');value.status='PARTIAL';assert.ok(projectBusinessEscrowReleases(value,projectEscrowReleaseFrame));
 const b=browser(value);b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/Valor liberado conferido Em conferência/);assert.doesNotMatch(b.text('Metrics'),/0,00/);assert.match(b.text('Matching'),/Repasse previsto dos pedidos localizados:.*100,00/);assert.match(b.text('Matching'),/Liberações com valor compatível: Em conferência/);
 const missing=structuredClone(value),m=missing.report;m.sources=m.sources.map(source=>({run_id:source.run_id,source_revision:source.source_revision,status:'MISSING',start_date:null,end_date:null,orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null}));m.matching={status:'SOURCE_MISSING',paid_orders:null,located_paid_orders:0,unlocated_paid_orders:null,ambiguous_paid_orders:0,verified_paid_orders:0,known_expected_located_cents:0,expected_located_cents:null,known_verified_release_cents:0,verified_release_cents:null,comparison_difference_cents:null,outside_cohort_orders:null};m.pending=['SOURCE_MISSING','MATCHING_INCOMPLETE','RELEASE_AMOUNT_UNVERIFIED','BANK_RECEIPT_NOT_VERIFIED'];assert.ok(projectBusinessEscrowReleases(missing,projectEscrowReleaseFrame));b.load(missing);b.run('clock+=60000;');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/Vínculo pendente/);assert.match(b.text('Matching'),/Repasse previsto dos pedidos localizados: Não informado/);assert.match(b.text('Matching'),/Sem liberação localizada neste período: Vínculo ainda incompleto/);assert.match(b.text('Notice'),/Falta recuperar parte da evidência/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 });

 test('only a complete explicitly empty calendar exposes a known zero release total',async()=>{
 const empty=observation(),r=empty.report;r.calendar.observations=0;r.calendar.unique_orders=0;r.calendar.verified_orders=0;r.calendar.unverified_orders=0;r.calendar.known_verified_release_cents=0;r.calendar.total_release_cents=0;r.collection.observations=0;r.matching={status:'AVAILABLE',paid_orders:2,located_paid_orders:0,unlocated_paid_orders:2,ambiguous_paid_orders:0,verified_paid_orders:0,known_expected_located_cents:0,expected_located_cents:0,known_verified_release_cents:0,verified_release_cents:0,comparison_difference_cents:0,outside_cohort_orders:0};r.status='PARTIAL';r.pending=['MATCHING_INCOMPLETE','BANK_RECEIPT_NOT_VERIFIED'];empty.status='PARTIAL';assert.ok(projectBusinessEscrowReleases(empty,projectEscrowReleaseFrame));
 const b=browser(empty);b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/Valor liberado conferido.*0,00/);assert.match(b.text('Matching'),/Sem liberação localizada neste período: 2 pedido/);assert.doesNotMatch(b.text('Matching'),/Diferença no conjunto comparável/);
 const partial=structuredClone(empty);partial.report.calendar.status='RUNNING';partial.report.calendar.total_release_cents=null;partial.report.collection.status='RUNNING';partial.report.collection.windows_complete=2;partial.report.collection.pages_read=2;partial.report.matching.verified_release_cents=null;partial.report.matching.comparison_difference_cents=null;partial.report.pending.push('RELEASES_COLLECTING');assert.ok(projectBusinessEscrowReleases(partial,projectEscrowReleaseFrame));b.load(partial);b.run('clock+=60000;');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/Valor liberado conferido Em conferência/);assert.doesNotMatch(b.text('Metrics'),/0,00/);assert.match(b.text('Matching'),/Aguardando a localização dos pedidos/);
 });


 test('source amounts retain their last cent when a valid signed integer exceeds decimal Number formatting precision',async()=>{
 const b=browser(observation({release:Number.MAX_SAFE_INTEGER}));b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/90\.071\.992\.547\.409,91/);assert.match(b.text('Matching'),/90\.071\.992\.547\.409,91/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 });

 test('a completed calendar keeps its own cutoff and values while a newer collection is still running',async()=>{
 const value=observation(),report=value.report;report.checked_at=stamp-30;report.collection={...report.collection,scan_id:'33333333-3333-4333-8333-333333333333',status:'RUNNING',cutoff_at:stamp-60,windows_complete:2,pages_read:2,observations:3};assert.ok(projectBusinessEscrowReleases(value,projectEscrowReleaseFrame));
 const b=browser(value);b.run('brazaEscrowReleases.start({api})');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.match(b.text('Status'),/última consulta completa.*Nova consulta em andamento.*2 de 4/);assert.match(b.text('Metrics'),/Valor liberado conferido.*120,00/);const originalScope=b.text('Scope');
 const failed=structuredClone(value);failed.checked_at=stamp+60;failed.attempt={checked_at:stamp+60,status:'UNAVAILABLE',code:'FINANCE_ESCROW_RELEASES_TIMEOUT',next_attempt_at:stamp+360};failed.status='PARTIAL';assert.ok(projectBusinessEscrowReleases(failed,projectEscrowReleaseFrame));b.load(failed);b.run('clock+=60000;');await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)');assert.equal(b.text('Scope'),originalScope);assert.match(b.text('Metrics'),/120,00/);assert.match(b.text('Notice'),/datas originais/);
 });


 test('a late response from a different month cannot replace its selected calendar or order-cohort dates',async()=>{
 const b=browser(),september=observation({month:'2026-09'});b.context.september=JSON.stringify(september);b.run('brazaEscrowReleases.start({api});customApi=path=>path.includes("2026-10")?new Promise(resolve=>globalThis.finishOctober=resolve):JSON.parse(september);globalThis.october=brazaEscrowReleases.observe("2026-10",selectedScope);');await Promise.resolve();assert.equal(await b.run('brazaEscrowReleases.observe("2026-09",auditScope(JSON.parse(september)))'),true);const scope=b.text('Scope'),cohort=b.text('Cohort');assert.match(cohort,/01\/09\/2026 a 15\/09\/2026/);b.run('finishOctober(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('october'),false);assert.equal(b.text('Scope'),scope);assert.equal(b.text('Cohort'),cohort);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 });

 test('a valid release report from a different publication or source is refused even when every date, count and total matches',async()=>{
 for(const change of ['publication','run','revision']){
  const expected=observation(),received=structuredClone(expected);
  if(change==='publication')received.cohort.publication_revision++;
  if(change==='run'){received.cohort.sources[0].run_id='44444444-4444-4444-8444-444444444444';received.report.sources[0].run_id=received.cohort.sources[0].run_id;}
  if(change==='revision'){received.cohort.sources[0].source_revision++;received.report.sources[0].source_revision++;}
  assert.ok(projectBusinessEscrowReleases(received,projectEscrowReleaseFrame));
  const b=browser(expected);b.load(received);b.run('brazaEscrowReleases.start({api})');
  assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),false,change);
  assert.equal(b.text('Matching'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.equal(b.calls().length,1);
 }
 });

 test('suspending the published scope clears values, discards a late response and resumes only the exact published cohort',async()=>{
 const b=browser();b.run('brazaEscrowReleases.start({api})');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/120,00/);
 b.run('clock+=60000;customApi=()=>new Promise(resolve=>globalThis.finishPending=resolve);globalThis.waiting=brazaEscrowReleases.observe("2026-10",selectedScope);');await Promise.resolve();const requests=b.calls().length;
 assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",null)'),false);assert.equal(b.text('Matching'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.match(b.text('Status'),/Aguardando um resumo publicado/);
 b.run('finishPending(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false);assert.equal(b.text('Matching'),'');
 for(const scope of ['undefined','{}','"cohort-1"','{...selectedScope,publication_revision:0}','{...selectedScope,private_token:"PRIVATE"}'])assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",'+scope+')'),false);
 assert.equal(b.calls().length,requests);b.run('customApi=null;');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/120,00/);assert.equal(b.calls().length,requests+1);
 });

test('hidden tabs invalidate replaced or suspended publications before an older release response can finish',async()=>{
 for(const change of ['replacement','suspension']){
  const b=browser(),next=observation();next.cohort.publication_revision++;
  b.context.nextObservation=JSON.stringify(next);b.run('brazaEscrowReleases.start({api})');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);
  b.run('clock+=60000;customApi=()=>new Promise(resolve=>globalThis.finishOld=resolve);globalThis.waiting=brazaEscrowReleases.observe("2026-10",selectedScope);');await Promise.resolve();assert.equal(b.calls().length,2);
  b.run('document.hidden=true;');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",'+(change==='replacement'?'auditScope(JSON.parse(nextObservation))':'null')+')'),false);
  assert.equal(b.text('Matching'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.equal(b.calls().length,2);
  b.run('finishOld(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false,change);assert.equal(b.text('Matching'),'');
  b.run('document.hidden=false;customApi=null;'+(change==='replacement'?'current=JSON.parse(nextObservation);selectedScope=auditScope(current);':''));
  assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/120,00/);assert.equal(b.calls().length,3);
 }
});

test('order-level release evidence shows adjustment, verified release and saved refund side-by-side without calling it receivable',async()=>{
 const value=evidenceObservation(),b=browser(value),hash='a'.repeat(64);
 b.run(`globalThis.brazaReconciliation={getSnapshot:()=>({month:"2026-10",scope_key:JSON.stringify(selectedScope),report:{reports:[{cases:[{order_hash:"${hash}",status:"ACCEPTED",requested_refund_cents:1000}],truncation:{truncated:false}}]},money:[{money:{payouts:[{order_hash:"${hash}",after_adjustment_repass_cents:6000}]}}]})};`);
 b.run('brazaEscrowReleases.start({api})');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);
 const text=b.text('Orders');assert.match(text,/Conciliação por pedido/);assert.match(text,/Repasse-base.*50,00/);assert.match(text,/Ajuste informado.*10,00/);assert.match(text,/Repasse após ajuste.*60,00/);assert.match(text,/Valor liberado conferido.*60,00/);assert.match(text,/ACCEPTED/);assert.match(text,/subtotal.*10,00/);assert.match(text,/não é “valor a receber”/i);assert.match(text,/não significa falta de pagamento/i);
 assert.doesNotMatch(text,/PRIVATE|order_sn/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 assert.deepEqual(b.calls(),[{path:'finance/escrow-releases?month=2026-10&evidence=orders-v1'}]);
});

test('legacy release payload remains compatible when the v2 sidecar is unavailable',async()=>{
 const b=browser(observation());b.run('brazaEscrowReleases.start({api})');assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",selectedScope)'),true);assert.equal(b.run('control("Orders").hidden'),true);assert.match(b.text('Metrics'),/120,00/);
});
