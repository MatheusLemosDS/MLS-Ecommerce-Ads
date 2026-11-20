import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {REVIEWED_COST_SOURCE_PINS,assertReviewedCostSources} from './reviewed-cost-source-invariants.mjs';
import {REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER,normalizeReviewedBusinessMonthSource,assertBusinessMonthFinancialSections} from './reviewed-business-month-source-adapter.mjs';

const root=new URL('../../../',import.meta.url),filename='business-month.mjs',digest=value=>createHash('sha256').update(value).digest('hex'),git=commit=>execFileSync('git',['show',commit+':web/cloudflare/src/'+filename],{cwd:root,encoding:'utf8'}),source=()=>readFileSync(new URL('../src/'+filename,import.meta.url),'utf8'),commercial=()=>git(REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.commercial_commit);
const mutate=(value,before,after)=>{assert.equal(value.split(before).length-1,1,'negative fixture has one exact mutation target');return value.replace(before,after);};

test('frozen retention/recovery adapters normalize all source bytes to main4cf before the unchanged commercial and legacy checks',()=>{
 const current=source(),reviewed=commercial();assert.equal(digest(current),REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.source_sha256);assert.equal(digest(reviewed),'fe688b43dc3d848004477ace9de1b7a70a47951f488b3c06e51d8e50aa96ff63');assert.equal(normalizeReviewedBusinessMonthSource(current,reviewed),reviewed);assertReviewedCostSources();
 assert.deepEqual(REVIEWED_COST_SOURCE_PINS[filename],{legacy:'6208017bbf4cadea28629c2195faf45b6c31f48a811026c33dd489751b043766',commercial:'fe688b43dc3d848004477ace9de1b7a70a47951f488b3c06e51d8e50aa96ff63'});
});

test('monthly DTO and calculation tail remain byte identical across original legacy, actual Live17.3 source, main and the candidate',()=>{
 const reviewed=commercial(),legacy=git('bd01f64d7e290abb259e9c9dc2646496494a87f0'),live=git('ad7f991295ca7b326f0428b5eeb744a88572cdd9');
 for(const candidate of [legacy,live,reviewed,source()])assertBusinessMonthFinancialSections(candidate,reviewed);
 assert.equal(digest(legacy),'6208017bbf4cadea28629c2195faf45b6c31f48a811026c33dd489751b043766');assert.equal(digest(live),'822bbcc382572e96e321e47e7a5a1f67d99c9faacdc9ef156293f96633897eb6');
});

test('unknown imports, extra options and broadened source identity/CAS/retention changes cannot be stripped as reviewed adapters',()=>{
 const current=source(),reviewed=commercial(),mutations=[
  "import './unreviewed-source.mjs';\n"+current,
  mutate(current,'businessMonthSourceRetentionManifest,retainCompletedBusinessMonthSources,businessMonthPublicationSnapshotStatements','businessMonthSourceRetentionManifest,retainCompletedBusinessMonthSources,businessMonthPublicationSnapshotStatements,unreviewedHelper'),
  mutate(current,"source.diagnostic.code==='FINANCE_BUSINESS_RUN_NOT_FOUND'&&source.diagnostic.http===404","source.diagnostic.code==='FINANCE_BUSINESS_RUN_NOT_FOUND'&&source.diagnostic.http===403"),
  mutate(current,"source.diagnostic.code==='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'&&source.diagnostic.http===404&&retention!==null","source.diagnostic.code==='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'&&source.diagnostic.http===404"),
  mutate(current,"const fence=businessMonthCohortRecoveryFence(cohortRecovery);","const fence={sql:'',values:[]};"),
  mutate(current,"const fence=businessMonthSourceRecoveryFence(recovery),writes=[]","const fence={sql:'',values:[]},writes=[]"),
  mutate(current,"{includeVariants:true,...(retention?{retention}:{})}","{includeVariants:true,...(retention?{retention}:{}),unreviewed:true}"),
  mutate(current,"frame.run_id===slot.frame.run_id&&frame.revision<slot.frame.revision","frame.run_id===slot.frame.run_id&&false"),
  mutate(current,"if(frame.status==='COMPLETE'){\n  await retainSources(next","if(frame.status==='COMPLETE'&&false){\n  await retainSources(next"),
  mutate(current,"const actual=await readCompletedBusinessMonth(env,month,{now:()=>updatedAt*1000,snapshot:committed.slice(publicationIndex)})","const actual=next"),
 ];
 for(const changed of mutations){assert.throws(()=>normalizeReviewedBusinessMonthSource(changed,reviewed),/only exact reviewed retention\/recovery source bytes/);assert.throws(()=>assertReviewedCostSources({readSource:name=>name===filename?changed:readFileSync(new URL('../src/'+name,import.meta.url),'utf8')}),/only exact reviewed legacy\/commercial source bytes/);}
});

test('formula and DTO alterations fail direct financial checks before source adapter removal',()=>{
 const current=source(),reviewed=commercial(),dto=mutate(current,"value.schema!=='business_month_v1'","value.schema!=='business_month_unreviewed'"),calculation=mutate(current,'BigInt(payout)-BigInt(production)-BigInt(tax)','BigInt(payout)+BigInt(production)-BigInt(tax)');
 assert.throws(()=>normalizeReviewedBusinessMonthSource(dto,reviewed),/direct monthly DTO is unchanged before adapter removal/);assert.throws(()=>normalizeReviewedBusinessMonthSource(calculation,reviewed),/direct monthly calculations are unchanged before adapter removal/);
 assert.throws(()=>normalizeReviewedBusinessMonthSource(current,reviewed+'\n'),/complete reviewed commercial source remains pinned/);
});
