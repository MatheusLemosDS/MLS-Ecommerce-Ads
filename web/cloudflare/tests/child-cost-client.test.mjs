import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

const declaration=name=>{
 const marker=new RegExp('^(?:async )?function '+name+'\\(','m').exec(CLIENT);assert.ok(marker,name);
 const source=CLIENT.slice(marker.index),next=/\n(?:async )?function [A-Za-z_$]/.exec(source);
 assert.ok(next,'next declaration after '+name);
 return source.slice(0,next.index);
};

test('an incomplete adult draft does not block independent child cost discovery or send any adult binding',async()=>{
 const context=vm.createContext();new vm.Script(`
 let variantSyncPromise=null,bindingState={revision:1},bindingLoadFailed=false,bindingStale=false,bindingConflict=null,bindingSaving=false;
 const bindingDrafts=new Map([['101:189628289639',{item_id:'101',model_id:'189628289639',selling_unit:'SINGLE_GARMENT',size:'',confirmed:true}]]),variantGroups=new Map([['101:189628289639',{item_id:'101',model_id:'189628289639'}]]);
 const status={textContent:''},el=()=>status;let costReads=0,itemReads=0,adultWrites=0;
 globalThis.brazaCostRules={async syncCandidates(rows){costReads++;if(rows[0].model_id!=='189628289639')throw Error('wrong variation');},isMapped:()=>true};
 const loadVariants=async()=>{itemReads++;},api=async()=>{adultWrites++;throw Error('must not save an adult binding');};
 ${declaration('syncKnownVariants')}
 `).runInContext(context);
 assert.equal(await vm.runInContext('syncKnownVariants()',context),false);assert.equal(vm.runInContext('costReads',context),1);assert.equal(vm.runInContext('itemReads',context),1);assert.equal(vm.runInContext('adultWrites',context),0);assert.equal(vm.runInContext('bindingDrafts.size',context),1);assert.match(vm.runInContext('status.textContent',context),/custos por regra foram conferidos/i);
});

test('a child assignment with pending catalogue data shows its numeric size control and omits the adult editor',()=>{
 const context=vm.createContext();new vm.Script(`
 class Element{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};}append(...values){this.children.push(...values);}get lastChild(){return this.children.at(-1);}}
 const node=(tag,text,cls)=>{const value=new Element(tag,text);value.className=cls;return value;},text=value=>value.textContent+' '+value.children.map(text).join(' ');
 const bindingDrafts=new Map(),productSellingUnit=()=> 'SINGLE_GARMENT',automaticBinding=()=>false,savedCustomCost=()=>null,costRuleAssignmentSaved=async()=>{};
 globalThis.brazaCostRules={hasAssignment:()=>true,assignmentControl:()=>{const control=node('section','Camiseta infantil · R$12,50');for(const size of ['4','6','8','10','12','14','16'])control.append(node('option',size));return control;}};
 ${declaration('costRuleAssignmentControl')}
 ${declaration('renderProductVariantCard')}
 globalThis.card=renderProductVariantCard('101:189628289639',{item_id:'101',model_id:'189628289639',quantity:1,line_count:1,statuses:new Map([['READY_TO_SHIP',{lines:1,quantity:1}]])},new Map());
 `).runInContext(context);
 const text=vm.runInContext('text(card)',context);assert.match(text,/Camiseta infantil/);assert.match(text,/4  6  8  10  12  14  16/);assert.doesNotMatch(text,/GG é regular|G1, G2|Confirmo que 1 unidade/);
});

test('saving a child size clears only its replaced adult draft and refreshes monthly costs',async()=>{
 const context=vm.createContext();new vm.Script(`
 const bindingDrafts=new Map([['101:1',{item_id:'101',model_id:'1',confirmed:true}],['101:2',{item_id:'101',model_id:'2',confirmed:true}],['102:1',{item_id:'102',model_id:'1',confirmed:true}]]);
 let storePeriodBundle=null,reads=0,monthly=0;const loadVariants=async()=>{reads++;},notice=()=>{};globalThis.brazaMonthDashboard={async refreshCosts(){monthly++;}};
 ${declaration('costRuleAssignmentSaved')}
 `).runInContext(context);
 await vm.runInContext("costRuleAssignmentSaved({item_id:'101',model_id:'1'})",context);assert.equal(vm.runInContext("bindingDrafts.has('101:1')",context),false);assert.equal(vm.runInContext("bindingDrafts.has('101:2')&&bindingDrafts.has('102:1')",context),true);assert.equal(vm.runInContext('monthly',context),1);assert.equal(vm.runInContext('reads',context),1);
});
