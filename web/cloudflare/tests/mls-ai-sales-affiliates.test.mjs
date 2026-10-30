import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiSalesAffiliateWorkspace,validateAiSalesAffiliateWorkspace,upsertAiSalesAffiliateCreator,removeAiSalesAffiliateCreator,draftAiSalesAffiliateProposal,approveAiSalesAffiliateProposal,importAiSalesAffiliateWorkspace,exportAiSalesAffiliateWorkspace,importAiSalesAffiliateCreators,exportAiSalesAffiliateCreators} from '../src/mls-ai-sales-affiliates.mjs';
import {salesAt as at,salesEvidence,salesPricedProduct} from './mls-ai-sales-domain-fixture.mjs';

const creator=(patch={})=>({schema:'mls_ai_sales_creator_v1',internal_creator_id:'creator-test',provider:'SHOPEE_BR',shop_ref:'fixture-shop',approved_handle:'@creator_test',consent_evidence:salesEvidence({basis:'CONSENTED'}),seller_creator_access_grant_status:'UNKNOWN',channel_fit:['Moda','Nostalgia'],last_contact_at:null,status:'ELIGIBLE',...patch});
const product=()=>salesPricedProduct();
const base=()=>upsertAiSalesAffiliateCreator(createAiSalesAffiliateWorkspace(),creator(),{at});
const proposal=(patch={})=>({plan_id:'proposal-test',creator_ref:'creator-test',product:product(),commission_rate_bps:500,commission_evidence:salesEvidence(),extra_cost_cents:0,extra_cost_evidence:salesEvidence(),returns_evidence:salesEvidence({basis:'RECONCILED_ZERO_RETURN_EXPOSURE'}),at,...patch});

test('real creator CRUD keeps shops separate, validates consent and revokes dependent approvals on edits',async()=>{
 let state=base();assert.equal(state.creators.length,1);assert.equal(state.creators[0].approved_handle,'@creator_test');assert.equal(state.commercial_writes,false);
 assert.deepEqual(upsertAiSalesAffiliateCreator(state,creator(),{at:at+1}),state,'unchanged content is idempotent');
 assert.throws(()=>upsertAiSalesAffiliateCreator(state,creator({internal_creator_id:'second',approved_handle:'CREATOR_TEST'}),{at}),/HANDLE_DUPLICATE/);
 state=await draftAiSalesAffiliateProposal(state,proposal());state=await approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:product(),approval_id:'approval-test',at:at+1});
 assert.equal(state.plans[0].collaboration.status,'APPROVED');
 state=upsertAiSalesAffiliateCreator(state,creator({status:'BLOCKED'}),{at:at+2});assert.equal(state.plans[0].collaboration.status,'BLOCKED');assert.equal(state.plans[0].collaboration.owner_approval_id,null);
 assert.throws(()=>upsertAiSalesAffiliateCreator(state,creator({approved_handle:'buyer@example.com'}),{at:at+3}),/CREATOR_INVALID/);
 const removed=removeAiSalesAffiliateCreator(state,{provider:'SHOPEE_BR',shop_ref:'fixture-shop',internal_creator_id:'creator-test'},{at:at+3});assert.equal(removed.creators.length,0);assert.equal(removed.plans.length,0);assert.ok(Object.isFrozen(removed));
});
test('commission remains a draft and explicit local approval binds current product, creator and economic evidence',async()=>{
 let state=await draftAiSalesAffiliateProposal(base(),proposal());const draft=state.plans[0];
 assert.equal(draft.gate.status,'READY');assert.equal(draft.gate.contribution_cents,3500);assert.equal(draft.collaboration.status,'DRAFT');assert.equal(draft.collaboration.commercial_writes,false);assert.equal(draft.collaboration.owner_approval_id,null);
 assert.equal(draft.collaboration.money_exposure_cents,6500);assert.equal(state.audit[0].executed_at,null);assert.equal(state.audit[0].provider_result_status,'NOT_EXECUTED');
 assert.deepEqual(await draftAiSalesAffiliateProposal(state,proposal()),state);
 await assert.rejects(()=>approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:product(),approval_id:null,at:at+1}),/APPROVAL_INVALID/);
 await assert.rejects(()=>approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:productWithChangedCost(),approval_id:'approval-test',at:at+1}),/PRODUCT_CHANGED/);
 state=await approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:product(),approval_id:'approval-test',at:at+1});assert.equal(state.plans[0].collaboration.status,'APPROVED');assert.equal(state.audit.at(-1).executed_at,null);
 assert.deepEqual(await approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:product(),approval_id:'approval-test',at:at+2}),state);
 const stale=await approveAiSalesAffiliateProposal(state,{plan_id:'proposal-test',product:product(),approval_id:'approval-stale',at:at+86401});assert.equal(stale.plans[0].collaboration.status,'BLOCKED');assert.equal(stale.commercial_writes,false);
});
function productWithChangedCost(){return {...product(),cost_cents:5100};}
test('unknown values, missing costs, return exposure, consent and incompatible evidence fail closed',async()=>{
 const unknown=await draftAiSalesAffiliateProposal(base(),proposal({commission_rate_bps:null,commission_evidence:null,extra_cost_cents:null,extra_cost_evidence:null,returns_evidence:null}));assert.equal(unknown.plans[0].gate.status,'BLOCKED');assert.equal(unknown.plans[0].collaboration.money_exposure_cents,null);assert.ok(unknown.plans[0].gate.blocked_reasons.includes('RETURNS_EXPOSURE_UNVERIFIED'));
 for(const patch of [{returns_evidence:salesEvidence({shop_ref:'other-shop'})},{returns_evidence:salesEvidence()},{commission_evidence:salesEvidence({status:'DECLARED'})},{extra_cost_cents:null}]){
  const state=await draftAiSalesAffiliateProposal(base(),proposal(patch));assert.equal(state.plans[0].gate.status,'BLOCKED');assert.equal(state.plans[0].collaboration.owner_approval_id,null);
 }
 const draftOnly=upsertAiSalesAffiliateCreator(createAiSalesAffiliateWorkspace(),creator({consent_evidence:null,status:'DRAFT',seller_creator_access_grant_status:'GRANTED'}),{at});const state=await draftAiSalesAffiliateProposal(draftOnly,proposal());assert.ok(state.plans[0].gate.blocked_reasons.includes('CREATOR_CONSENT_OR_ELIGIBILITY_MISSING'));assert.equal(state.commercial_writes,false,'documentary grant is never an API permission');
 await assert.rejects(()=>draftAiSalesAffiliateProposal(base(),proposal({product:{...product(),shop_ref:'other-shop'}})),/AI_SALES_/);
});
test('workspace JSON and creator CSV preserve local data while downgrading all imported authority and approvals',async()=>{
 let original=await draftAiSalesAffiliateProposal(base(),proposal());original=await approveAiSalesAffiliateProposal(original,{plan_id:'proposal-test',product:product(),approval_id:'approval-test',at:at+1});
 const imported=importAiSalesAffiliateWorkspace(exportAiSalesAffiliateWorkspace(original),{imported_at:at+2});
 assert.equal(imported.creators[0].seller_creator_access_grant_status,'UNKNOWN');assert.equal(imported.creators[0].consent_evidence.status,'DECLARED');assert.equal(imported.creators[0].consent_evidence.source,'OPERATOR_IMPORTED');assert.equal(imported.plans[0].collaboration.status,'BLOCKED');assert.equal(imported.plans[0].collaboration.owner_approval_id,null);assert.deepEqual(imported.plans[0].proposal.product.verified_product_attributes,[]);assert.ok(imported.plans[0].proposal.product.observations.every(row=>row.evidence.status==='DECLARED'));assert.deepEqual(imported.audit,[]);
 await assert.rejects(()=>approveAiSalesAffiliateProposal(imported,{plan_id:'proposal-test',product:imported.plans[0].proposal.product,approval_id:'untrusted-import',at:at+3}),/DRAFT_CHANGED/);
 const csv=exportAiSalesAffiliateCreators(original),restored=importAiSalesAffiliateCreators(createAiSalesAffiliateWorkspace(),csv,{imported_at:at+2});assert.equal(restored.creators[0].approved_handle,'@creator_test');assert.equal(restored.creators[0].consent_evidence.source,'OPERATOR_IMPORTED');assert.deepEqual(restored.creators[0].channel_fit,['Moda','Nostalgia']);
 const json=exportAiSalesAffiliateCreators(original,{format:'json'});assert.deepEqual(importAiSalesAffiliateCreators(createAiSalesAffiliateWorkspace(),json,{format:'json',imported_at:at+2}).creators,restored.creators);
});
test('closed inputs reject PII extras, getters, sparse arrays, malformed CSV, reversed clocks and future facts atomically',async()=>{
 const state=base();assert.throws(()=>upsertAiSalesAffiliateCreator(state,creator({private_email:'no'}),{at}),/AI_SALES_/);
 const getter=creator();Object.defineProperty(getter,'approved_handle',{enumerable:true,get(){throw Error('must not invoke');}});assert.throws(()=>upsertAiSalesAffiliateCreator(state,getter,{at}),/AI_SALES_/);
 assert.throws(()=>validateAiSalesAffiliateWorkspace({...state,creators:Array(1)}),/AI_SALES_/);
 assert.throws(()=>validateAiSalesAffiliateWorkspace({...state,creators:[creator(),creator({internal_creator_id:'duplicate-handle'})]}),/HANDLE_DUPLICATE/);
 assert.throws(()=>removeAiSalesAffiliateCreator(state,{provider:'UNKNOWN',shop_ref:'fixture-shop',internal_creator_id:'creator-test'},{at}),/SELECTION_INVALID/);
 assert.throws(()=>upsertAiSalesAffiliateCreator(state,creator({channel_fit:['changed'],consent_evidence:salesEvidence({basis:'CONSENTED',observed_at:at-2})}),{at:at-1}),/CLOCK_REVERSED/);
 assert.throws(()=>upsertAiSalesAffiliateCreator(state,creator({consent_evidence:salesEvidence({basis:'CONSENTED',observed_at:at+1})}),{at}),/FUTURE_EVIDENCE/);
 assert.throws(()=>importAiSalesAffiliateCreators(state,'wrong,headers\nunsafe,data',{imported_at:at}),/HEADERS_INVALID/);
 assert.throws(()=>importAiSalesAffiliateWorkspace(exportAiSalesAffiliateWorkspace(state),{imported_at:at-1}),/FUTURE_EVIDENCE/);
 assert.equal(state.creators.length,1);assert.equal(state.revision,1);
});
