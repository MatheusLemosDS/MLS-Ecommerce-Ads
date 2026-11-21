import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {OPERATING_INTEGRATION_REVIEW as review} from './operating-integration-review-fixture.mjs';
import {OPERATING_INCREMENT_MERGE_BASE_COMMIT,OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256,OPERATING_INCREMENT_RELEASE_ID,OPERATING_INCREMENT_ORIGINAL_REVIEW,OPERATING_INCREMENT_ALLOWED_FILES,OPERATING_INCREMENT_FROZEN_FILES,operatingIncrementPriorVerifierMatchesBaseline,historicalProfitPriorVerifierMatchesBaseline,financeCompletionPriorVerifierMatchesBaseline} from '../release_preflight.mjs';
import {APP_RELEASE} from '../../web/cloudflare/src/app-release.mjs';

const root=new URL('../../',import.meta.url),digest=value=>createHash('sha256').update(value).digest('hex');
const git=(commit,file)=>execFileSync('git',['show',commit+':'+file],{cwd:root,encoding:'utf8'});
const section=(source,begin,end)=>{assert.equal(source.split(begin).length,2);assert.equal(source.split(end).length,2);return source.slice(source.indexOf(begin),source.indexOf(end)+end.length);};
const operating=source=>section(source,'// BEGIN OPERATING_INCREMENT_MERGE_V1\n','// END OPERATING_INCREMENT_MERGE_V1\n');
const arrayBlock=source=>section(source,'export const OPERATING_INCREMENT_ALLOWED_FILES=Object.freeze([','\n]);');
const frozenBlock=source=>section(source,'export const OPERATING_INCREMENT_FROZEN_FILES=Object.freeze({','\n});');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)));

test('operating integration targets only the integrated historical main and the separately identified code release',()=>{
 assert.equal(OPERATING_INCREMENT_MERGE_BASE_COMMIT,review.new_base_commit);
 assert.equal(OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256,review.new_base_preflight_sha256);
 assert.equal(OPERATING_INCREMENT_RELEASE_ID,'2026-11-21.3');assert.equal(APP_RELEASE.id,OPERATING_INCREMENT_RELEASE_ID);
 assert.equal(OPERATING_INCREMENT_ORIGINAL_REVIEW.source_commit,review.previous_source_commit);
 assert.equal(OPERATING_INCREMENT_ORIGINAL_REVIEW.section_sha256,review.old_section_sha256);
 assert.equal(OPERATING_INCREMENT_ORIGINAL_REVIEW.base_commit,'dc784188e72c1a35dc014155e23c474b95b17cfe');
 assert.equal(OPERATING_INCREMENT_ORIGINAL_REVIEW.base_preflight_sha256,'c0c8d750a7599e7226462125127f545bfed0f860c6641e329b36a7e108339860');
});

test('nested operating additions restore the complete historical, Finance and original main verifiers exactly',()=>{
 const current=readFileSync(new URL('tools/release_preflight.mjs',root),'utf8'),integrated=git(review.new_base_commit,'tools/release_preflight.mjs');
 assert.equal(digest(integrated),review.new_base_preflight_sha256);assert.equal(operatingIncrementPriorVerifierMatchesBaseline(current,integrated),true);
 const beforeHistorical=git('dc784188e72c1a35dc014155e23c474b95b17cfe','tools/release_preflight.mjs');
 assert.equal(historicalProfitPriorVerifierMatchesBaseline(current,beforeHistorical),true);
 const beforeFinance=git('4cfdf465b2fda58dd27ae693126b7fe1625f69d6','tools/release_preflight.mjs');assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,beforeFinance),true);
 for(const mutate of [s=>s+'\n',s=>s.replace("if(input.baseCommit===HISTORICAL_PROFIT_MERGE_BASE_COMMIT)",'if(false)'),s=>s.replace('if(!validFinanceCompletionCandidate(candidate))','if(false)'),s=>s.replace(' // BEGIN OPERATING_INCREMENT_DISPATCH_V1\n',' // CHANGED OPERATING_INCREMENT_DISPATCH_V1\n')])assert.equal(operatingIncrementPriorVerifierMatchesBaseline(mutate(current),integrated),false);
});

test('the original PR132 verifier functions survive byte-for-byte and only a finite pinned policy-data delta is accepted',()=>{
 const previous=operating(git(review.previous_source_commit,'tools/release_preflight.mjs')),current=operating(readFileSync(new URL('tools/release_preflight.mjs',root),'utf8'));
 assert.equal(digest(previous),review.old_section_sha256);assert.equal(digest(current),review.new_section_sha256);
 // The original executable verifier suffix is untouched. Reconciliation only
 // changes literal review data before its section-marker constants.
 const boundary="const operatingSectionBegin='";assert.equal(current.slice(current.indexOf(boundary)),previous.slice(previous.indexOf(boundary)));
 const metadata="export const OPERATING_INCREMENT_RELEASE_ID='2026-11-21.3';\nexport const OPERATING_INCREMENT_ORIGINAL_REVIEW=Object.freeze({source_commit:'"+review.previous_source_commit+"',base_commit:'dc784188e72c1a35dc014155e23c474b95b17cfe',base_preflight_sha256:'c0c8d750a7599e7226462125127f545bfed0f860c6641e329b36a7e108339860',section_sha256:'"+review.old_section_sha256+"'});\n";
 assert.equal(current.split(metadata).length,2);
 const restored=current.replace(metadata,'').replace("OPERATING_INCREMENT_MERGE_BASE_COMMIT='"+review.new_base_commit+"'","OPERATING_INCREMENT_MERGE_BASE_COMMIT='dc784188e72c1a35dc014155e23c474b95b17cfe'").replace("OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256='"+review.new_base_preflight_sha256+"'","OPERATING_INCREMENT_BASE_PREFLIGHT_SHA256='c0c8d750a7599e7226462125127f545bfed0f860c6641e329b36a7e108339860'").replace(arrayBlock(current),arrayBlock(previous)).replace(frozenBlock(current),frozenBlock(previous));
 assert.equal(restored,previous);
 assert.equal(digest(JSON.stringify(OPERATING_INCREMENT_ALLOWED_FILES)),review.new_allowed_sha256);
 assert.equal(digest(canonical(OPERATING_INCREMENT_FROZEN_FILES)),review.new_frozen_sha256);
});

test('every historical input outside the finite operating diff stays immutable with its exact integrated bytes',()=>{
 for(const filename of review.added_frozen_paths){assert.ok(!OPERATING_INCREMENT_ALLOWED_FILES.includes(filename));assert.equal(digest(readFileSync(new URL(filename,root))),OPERATING_INCREMENT_FROZEN_FILES[filename],filename);}
 for(const [filename,pins] of Object.entries(review.changed_existing_pins)){assert.equal(OPERATING_INCREMENT_FROZEN_FILES[filename],pins.integrated);assert.equal(digest(git(review.new_base_commit,filename)),pins.integrated);assert.notEqual(pins.previous,pins.integrated);}
 const historicalManifest=JSON.parse(readFileSync(new URL('tools/release-historical-profit-candidate.json',root),'utf8'));
 assert.equal(historicalManifest.production_approved,false);assert.equal(historicalManifest.live_authorization,false);assert.equal(historicalManifest.commercial_writes_allowed,false);
});

test('earlier historical preview assertions keep their exact reviewed cutoff with a reversible one-expression fixture adapter',()=>{
 for(const [filename,proof] of Object.entries(review.test_cutoff_adapters)){
  const baseline=git(review.new_base_commit,filename),current=readFileSync(new URL(filename,root),'utf8');
  assert.equal(digest(baseline),proof.baseline_sha256);assert.equal(digest(current),proof.reviewed_sha256);
  assert.equal(baseline.split(proof.original).length,2);assert.equal(current.split(proof.reviewed).length,2);
  assert.equal(current,baseline.replace(proof.original,proof.reviewed));assert.equal(current.replace(proof.reviewed,proof.original),baseline);
 }
});
