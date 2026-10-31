import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ESCROW_RELEASES_CLIENT,ESCROW_RELEASES_CSS,escrowReleasesBody,projectMlsReleaseCoverageFollowup} from '../src/escrow-releases-view.mjs';
import {projectBusinessEscrowReleases,projectBusinessEscrowReleaseEvidence} from '../src/business-escrow-releases.mjs';
import {projectBusinessEscrowReleaseCoverage} from '../src/business-escrow-release-coverage.mjs';
import {projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

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
 const ids=[...escrowReleasesBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),context=vm.createContext({serialized:JSON.stringify(value),TextEncoder});
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


function temporalObservation(primary=observation({month:'2026-09'})){
 const sources=primary.cohort.sources.map(source=>({...source,status:'AVAILABLE'}));
 const report={schema:'finance_escrow_release_coverage_v1',cohort_month:'2026-09',through_month:'2026-10',checked_at:stamp-60,status:'IDENTITY_COMPLETE',sources,calendars:[
  {month:'2026-09',status:'COMPLETE',scan_id:scan,cutoff_at:Date.UTC(2026,9,1,3)/1000,source_oldest_at:stamp-800,source_latest_at:stamp-700,observations:1,cohort_observations:1,unique_cohort_orders:1,ambiguous_cohort_orders:0},
  {month:'2026-10',status:'COMPLETE',scan_id:'33333333-3333-4333-8333-333333333333',cutoff_at:stamp-100,source_oldest_at:stamp-500,source_latest_at:stamp-400,observations:1,cohort_observations:1,unique_cohort_orders:1,ambiguous_cohort_orders:0}
 ],coverage:{paid_orders:2,located_orders:2,not_located_orders:0,ambiguous_orders:0,single_orders:2,calendars_total:2,calendars_complete:2,identity_complete_at_cutoff:true},pending:['BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(report));
 const value={schema:'business_escrow_release_coverage_v1',cohort_month:'2026-09',checked_at:stamp,status:'AVAILABLE',report,attempt:{checked_at:stamp-30,status:'SUCCESS',code:null,next_attempt_at:stamp+900}};
 assert.ok(projectBusinessEscrowReleaseCoverage(value,projectEscrowReleaseCoverageFrame));return value;
}
function followup(value,primary=observation({month:'2026-09'}),overrides={}){return projectMlsReleaseCoverageFollowup(value,{month:'2026-09',scope:auditScope(primary),currentMonth:'2026-10',cohortSources:primary.cohort.sources,checkedAt:stamp,...overrides},projectBusinessEscrowReleaseCoverage,projectEscrowReleaseCoverageFrame);}

test('temporal follow-up presents only the exact publication identity and finance observation times',()=>{
 const value=temporalObservation(),result=followup(value);assert.equal(result.state,'CURRENT');assert.equal(result.scope_compatible,true);assert.equal(result.coverage.located_orders,2);assert.equal(result.coverage.not_located_orders,0);assert.deepEqual(result.period,{start_date:'2026-09-01',end_date:'2026-09-15'});assert.equal(result.checked_at,stamp-60);assert.equal(result.attempt.next_attempt_at,stamp+900);assert.equal(Object.hasOwn(result,'remaining_receivable_cents'),false);
 for(const mutate of [v=>v.report.sources[0].source_revision++,v=>v.report.sources[0].start_date='2026-09-02',v=>v.report.sources[0].finance_oldest_at++,v=>v.report.sources[0].finance_latest_at++]){
  const bad=structuredClone(value);mutate(bad);assert.ok(projectBusinessEscrowReleaseCoverage(bad,projectEscrowReleaseCoverageFrame));const rejected=followup(bad);assert.equal(rejected.state,'WAITING');assert.equal(rejected.reason,'PUBLICATION_MISMATCH');assert.equal(rejected.coverage,null);assert.equal(rejected.calendars.length,0);
 }
});

test('an older release calendar remains historical while a failed refresh preserves its real cutoff',()=>{
 const old=temporalObservation();old.report.through_month='2026-09';old.report.calendars.pop();Object.assign(old.report.coverage,{located_orders:1,not_located_orders:1,single_orders:1,calendars_total:1,calendars_complete:1,identity_complete_at_cutoff:false});old.report.status='PARTIAL';old.report.pending.unshift('ORDER_NOT_LOCATED');
 const historical=followup(old);assert.equal(historical.state,'HISTORICAL');assert.equal(historical.through_month,'2026-09');assert.equal(historical.coverage.calendars_total,1);assert.equal(historical.reason,'LATER_CALENDAR_PENDING');
 const failed=temporalObservation();failed.status='PARTIAL_UNAVAILABLE';failed.attempt.status='UNAVAILABLE';failed.attempt.code='FINANCE_ESCROW_RELEASES_TIMEOUT';const retry=followup(failed);assert.equal(retry.state,'RETRY_WAIT');assert.equal(retry.checked_at,stamp-60);assert.equal(retry.coverage.identity_complete_at_cutoff,true);assert.equal(retry.attempt.status,'UNAVAILABLE');
});

test('missing source population is unknown, pending remains empty, and invalid or future evidence is withheld',()=>{
 const partial=temporalObservation();Object.assign(partial.report.sources[0],{status:'MISSING',start_date:null,end_date:null,orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null});Object.assign(partial.report.coverage,{paid_orders:null,not_located_orders:null,identity_complete_at_cutoff:false});partial.report.status='COLLECTING';partial.report.pending.unshift('SOURCE_MISSING');const projected=followup(partial);assert.equal(projected.state,'CURRENT');assert.equal(projected.coverage.paid_orders,null);assert.equal(projected.coverage.not_located_orders,null);
 const pending={schema:'business_escrow_release_coverage_v1',cohort_month:'2026-09',checked_at:stamp,status:'PENDING',report:null,attempt:null};assert.equal(followup(pending).coverage,null);assert.equal(followup(pending).reason,'AWAITING_AUTOMATIC_CHECK');
 const future=temporalObservation();future.checked_at=stamp+61;assert.equal(followup(future).coverage,null);assert.equal(followup({...temporalObservation(),private_token:'PRIVATE'}).coverage,null);
 const selection={get month(){throw Error('PRIVATE');}};assert.doesNotThrow(()=>projectMlsReleaseCoverageFollowup(null,selection,projectBusinessEscrowReleaseCoverage,projectEscrowReleaseCoverageFrame));
 const sameMonth=followup(null,observation({month:'2026-09'}),{currentMonth:'2026-09'});assert.equal(sameMonth.state,'CURRENT_MONTH');assert.equal(sameMonth.coverage,null);
});

test('the temporal presentation helper survives browser serialization without server closure',()=>{
 const value=temporalObservation(),primary=observation({month:'2026-09'}),selection={month:'2026-09',scope:auditScope(primary),currentMonth:'2026-10',cohortSources:primary.cohort.sources,checkedAt:stamp};
 const ctx=vm.createContext({raw:JSON.stringify(value),selected:JSON.stringify(selection)});vm.runInContext(projectEscrowReleaseCoverageFrame.toString()+';'+projectBusinessEscrowReleaseCoverage.toString()+';'+projectMlsReleaseCoverageFollowup.toString()+';globalThis.result=projectMlsReleaseCoverageFollowup(JSON.parse(raw),JSON.parse(selected),projectBusinessEscrowReleaseCoverage,projectEscrowReleaseCoverageFrame);',ctx);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(result)',ctx)),followup(value));
});

test('opening saved release coverage loads once without polling and exposes dates plus a bounded retry action',async()=>{
 const primary=observation({month:'2026-09'}),saved=temporalObservation(primary),b=browser(primary);b.context.savedCoverage=JSON.stringify(saved);b.run('brazaEscrowReleases.start({api});customApi=async path=>path.includes("escrow-release-coverage")?JSON.parse(savedCoverage):JSON.parse(JSON.stringify(current));');
 assert.equal(await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)'),true);assert.equal(b.calls().length,1);assert.doesNotMatch(b.text('Coverage'),/Calendários conferidos/);
 b.run('control("Details").open=true;');assert.equal(await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)'),true);assert.equal(b.calls().length,2);assert.match(b.text('Coverage'),/Último cruzamento salvo/);assert.match(b.text('Coverage'),/Calendários conferidos 2 de 2/);assert.match(b.text('Coverage'),/Ainda não localizados 0/);assert.match(b.text('Coverage'),/Última tentativa automática/);assert.match(b.text('Coverage'),/Próxima conferência programada/);assert.match(b.text('Coverage'),/ciclo de liberação e o recebimento bancário continuam em conferência/);assert.equal(b.run('typeof setTimeout'),'undefined');assert.ok(b.calls().every(row=>row.body===undefined));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 b.run('clock+=60000;customApi=async()=>{throw Error("PRIVATE_PROVIDER_TOKEN");};');assert.equal(await b.run('brazaEscrowReleases.refreshCoverage()'),false);assert.match(b.text('Coverage'),/Não foi possível conferir.*datas e evidências anteriores foram preservadas/);assert.match(b.text('Coverage'),/Calendários conferidos 2 de 2/);assert.doesNotMatch(b.text('Coverage'),/PRIVATE_PROVIDER_TOKEN/);
});

test('late coverage responses cannot cross publication changes or logout and mismatched snapshots never reach agents',async()=>{
 const primary=observation({month:'2026-09'}),saved=temporalObservation(primary),b=browser(primary);b.context.savedCoverage=JSON.stringify(saved);b.run('brazaEscrowReleases.start({api});');await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)');b.run('control("Details").open=true;customApi=()=>new Promise(resolve=>globalThis.finishCoverage=resolve);globalThis.pendingCoverage=brazaEscrowReleases.refreshCoverage();');await Promise.resolve();
 b.run('brazaEscrowReleases.observe("2026-09",null);finishCoverage(JSON.parse(savedCoverage));');assert.equal(await b.run('pendingCoverage'),false);assert.equal(b.run('brazaEscrowReleases.getSnapshot()'),null);assert.doesNotMatch(b.text('Coverage'),/Calendários conferidos/);
 b.run('control("Details").open=false;customApi=null;');await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)');b.run('control("Details").open=true;customApi=()=>new Promise(resolve=>globalThis.finishLogout=resolve);globalThis.pendingLogout=brazaEscrowReleases.refreshCoverage();');await Promise.resolve();b.run('brazaEscrowReleases.stop();finishLogout(JSON.parse(savedCoverage));');assert.equal(await b.run('pendingLogout'),false);assert.equal(b.run('brazaEscrowReleases.getSnapshot()'),null);
 const mismatch=browser(primary),bad=temporalObservation(primary);bad.report.sources[0].source_revision++;mismatch.context.badCoverage=JSON.stringify(bad);mismatch.run('brazaEscrowReleases.start({api});control("Details").open=true;customApi=async path=>path.includes("escrow-release-coverage")?JSON.parse(badCoverage):JSON.parse(JSON.stringify(current));');await mismatch.run('brazaEscrowReleases.observe("2026-09",selectedScope)');assert.match(mismatch.text('Coverage'),/A publicação dos pedidos mudou/);assert.equal(mismatch.run('brazaEscrowReleases.getSnapshot().coverage'),null);assert.doesNotMatch(mismatch.text('Coverage'),/Calendários conferidos/);
});


test('a calendar rollover during a coverage read releases the loading state for the next explicit check',async()=>{
 const primary=observation({month:'2026-09'}),saved=temporalObservation(primary),b=browser(primary);b.context.savedCoverage=JSON.stringify(saved);b.run('brazaEscrowReleases.start({api});');await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)');
 b.run('control("Details").open=true;customApi=()=>new Promise(resolve=>globalThis.finishRollover=resolve);globalThis.pendingRollover=brazaEscrowReleases.refreshCoverage();');await Promise.resolve();b.run('clock=Date.UTC(2026,10,1,15);finishRollover(JSON.parse(savedCoverage));');assert.equal(await b.run('pendingRollover'),false);assert.equal(b.run('control("Coverage").children[0].children[1].disabled'),false);
 b.run('customApi=async()=>JSON.parse(savedCoverage);');assert.equal(await b.run('brazaEscrowReleases.refreshCoverage()'),true);assert.match(b.text('Coverage'),/corte histórico até 10\/2026/);assert.match(b.text('Coverage'),/calendário de 11\/2026 ainda precisa entrar/);assert.equal(b.calls().length,3);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});


test('coverage cannot change the paid population or expected payout while reusing the same source identity',()=>{
 for(const mutate of [v=>v.report.sources[0].orders++,v=>v.report.sources[0].expected_repass_cents++,v=>{v.report.sources[0].paid_orders=1;Object.assign(v.report.coverage,{paid_orders:1,located_orders:1,single_orders:1});}]){
  const value=temporalObservation();mutate(value);assert.ok(projectBusinessEscrowReleaseCoverage(value,projectEscrowReleaseCoverageFrame));const result=followup(value);assert.equal(result.reason,'PUBLICATION_MISMATCH');assert.equal(result.coverage,null);
 }
});

test('a verified empty cohort keeps known zeros even when its saved financial watermark is absent',()=>{
 const primary=observation({month:'2026-09'}),value=temporalObservation(primary);Object.assign(primary.cohort.sources[0],{orders:0,paid_orders:0,expected_repass_cents:0,finance_oldest_at:null,finance_latest_at:null});Object.assign(value.report.sources[0],{orders:0,paid_orders:0,expected_repass_cents:0});
 for(const row of value.report.calendars)Object.assign(row,{observations:0,cohort_observations:0,unique_cohort_orders:0,ambiguous_cohort_orders:0,source_oldest_at:null,source_latest_at:null});Object.assign(value.report.coverage,{paid_orders:0,located_orders:0,not_located_orders:0,single_orders:0});assert.ok(projectBusinessEscrowReleaseCoverage(value,projectEscrowReleaseCoverageFrame));const result=followup(value,primary);assert.equal(result.state,'CURRENT');assert.equal(result.coverage.paid_orders,0);assert.equal(result.coverage.located_orders,0);assert.equal(result.coverage.not_located_orders,0);assert.equal(result.coverage.identity_complete_at_cutoff,true);
});


test('a cached observe waiting for coverage does not report success for another selected month',async()=>{
 const primary=observation({month:'2026-09'}),b=browser(primary);b.context.october=JSON.stringify(observation());b.context.savedCoverage=JSON.stringify(temporalObservation(primary));b.run('brazaEscrowReleases.start({api});');await b.run('brazaEscrowReleases.observe("2026-09",selectedScope)');
 b.run('control("Details").open=true;customApi=path=>path.includes("escrow-release-coverage")?new Promise(resolve=>globalThis.finishCachedCoverage=resolve):JSON.parse(october);globalThis.cachedObserve=brazaEscrowReleases.observe("2026-09",selectedScope);');await Promise.resolve();assert.equal(await b.run('brazaEscrowReleases.observe("2026-10",auditScope(JSON.parse(october)))'),true);const currentScope=b.text('Scope');b.run('finishCachedCoverage(JSON.parse(savedCoverage));');assert.equal(await b.run('cachedObserve'),false);assert.equal(b.text('Scope'),currentScope);assert.equal(b.run('brazaEscrowReleases.getSnapshot().month'),'2026-10');
});


test('the embedded release module stays inert when the host page has no release controls',()=>{
 const lookups=[],context=vm.createContext({document:{getElementById(id){lookups.push(id);throw Error('UNKNOWN_CONTROL:'+id);}},TextEncoder});assert.doesNotThrow(()=>vm.runInContext(ESCROW_RELEASES_CLIENT,context));assert.deepEqual(lookups,[]);assert.equal(vm.runInContext('brazaEscrowReleases.getSnapshot()',context),null);assert.doesNotThrow(()=>vm.runInContext('brazaEscrowReleases.stop()',context));assert.deepEqual(lookups,[]);
});

test('coverage toggles bind lazily once and restart/remount removes the previous stable handler',()=>{
 const b=browser();b.run('globalThis.binding={added:0,removed:0,handlers:[]};control("Details").addEventListener=(type,handler)=>{binding.added++;binding.handlers.push(handler);};control("Details").removeEventListener=(type,handler)=>{binding.removed++;if(handler!==binding.handlers[0])throw Error("HANDLER_CHANGED");};');assert.equal(b.run('binding.added'),0);
 b.run('brazaEscrowReleases.start({api});brazaEscrowReleases.start({api});brazaEscrowReleases.stop();brazaEscrowReleases.start({api});brazaEscrowReleases.start({api:async()=>null});');assert.equal(b.run('binding.added'),1);assert.equal(b.run('binding.removed'),0);assert.equal(b.calls().length,0);
 b.run('const replacement=node();replacement.addEventListener=(type,handler)=>{binding.added++;binding.handlers.push(handler);};controls.set("businessEscrowReleasesDetails",replacement);brazaEscrowReleases.stop();brazaEscrowReleases.start({api});');assert.equal(b.run('binding.added'),2);assert.equal(b.run('binding.removed'),1);assert.equal(b.run('binding.handlers[0]===binding.handlers[1]'),true);assert.equal(b.calls().length,0);
});
