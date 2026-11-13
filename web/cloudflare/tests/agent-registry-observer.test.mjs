import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {AGENT_REGISTRY_CLIENT,commandCenterBody} from '../src/agent-registry-view.mjs';

function mount(){
 class Element{
  constructor(id=''){this.id=id;this.nodeType=1;this.parentElement=null;this.dataset={};this.children=[];this.attributes=new Map();this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.textContent='';this.hidden=false;this.disabled=false;}
  setAttribute(key,value){this.attributes.set(key,String(value));}
  removeAttribute(key){this.attributes.delete(key);}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  closest(selector){for(let current=this;current;current=current.parentElement)if(selector==='#'+current.id)return current;return null;}
 }
 const nodes=new Map([...commandCenterBody().matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element(id)]));
 const source=new Element('businessMonth'),chart=new Element('missionTrendsFinance'),plot=new Element('missionTrendGraphFinance');source.append(chart);chart.append(plot);nodes.set(source.id,source);nodes.set(chart.id,chart);nodes.set(plot.id,plot);
 const observations=[];let observerCallback,reads=0,trendRefreshes=0,loopBudget=8,month=null;
 const document={getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],createElement:()=>new Element()};
 const context=vm.createContext({document,Intl,Date,Number,BigInt,Math,Promise,MutationObserver:class{constructor(callback){observerCallback=callback;}observe(target,options){observations.push({target,options});}disconnect(){}},brazaMonthDashboard:{getSnapshot(){reads++;return month;}},mlsMissionTrends:{refresh(){trendRefreshes++;if(observerCallback&&loopBudget-->0)observerCallback([{type:'childList',target:plot}]);}}});
 vm.runInContext(AGENT_REGISTRY_CLIENT,context);
 const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 return {nodes,source,chart,plot,context,observations,emit:records=>observerCallback(records),settle,get reads(){return reads;},get trendRefreshes(){return trendRefreshes;},setMonth(value){month=value;},newElement:id=>new Element(id)};
}

test('Finance chart-owned element and text mutations do not requeue the registry; source and mixed batches still update',async()=>{
 const mounted=mount();await mounted.settle();
 assert.ok(mounted.observations.some(row=>row.target===mounted.source&&row.options.subtree&&row.options.characterData&&row.options.childList&&row.options.attributes),'monthly source remains observed in full');
 const initialReads=mounted.reads,initialTrends=mounted.trendRefreshes;
 mounted.emit([{type:'childList',target:mounted.plot},{type:'attributes',target:mounted.chart},{type:'characterData',target:{nodeType:3,parentElement:mounted.plot}}]);await mounted.settle();
 assert.equal(mounted.reads,initialReads,'projected chart output must not read sources again');
 assert.equal(mounted.trendRefreshes,initialTrends,'projected chart output must not redraw itself');
 const sourceLabel=mounted.newElement('businessMonthStatus');mounted.source.append(sourceLabel);
 const month={schema:'mls_month_snapshot_v1',month:'2026-10',status:'COMPLETE',checked_at:1793070000,balance_cents:231759,pending:[],coverage:{orders:294,paid:242,completed:96,ongoing:146,cancelled:49,cancel_pending:0,unpaid:1,other:0,unknown:0,returns:0,returns_unknown:0},production_coverage:{total_units:257,known_units:257,pending_units:0},ads_spend_cents:131479,ads_checked_at:1793070000,ads_pending:false};
 mounted.setMonth(month);
 mounted.emit([{type:'characterData',target:{nodeType:3,parentElement:sourceLabel}}]);await mounted.settle();
 assert.ok(mounted.reads>initialReads,'real source text changes still notify');
 assert.equal(mounted.context.mlsAgentRegistry.getSnapshot().month.balance_cents,231759,'a real collector publication reaches the registry');
 assert.equal(mounted.trendRefreshes,initialTrends+1,'one source notification redraws once and then settles despite its own chart mutation');
 const nextReads=mounted.reads,nextTrends=mounted.trendRefreshes;
 mounted.setMonth({...month,balance_cents:232000,checked_at:1793070100});
 mounted.emit([{type:'childList',target:mounted.plot},{type:'attributes',target:sourceLabel}]);await mounted.settle();
 assert.ok(mounted.reads>nextReads,'mixed batches must retain real source notifications');
 assert.equal(mounted.context.mlsAgentRegistry.getSnapshot().month.balance_cents,232000,'mixed batches publish updated source data');
 assert.equal(mounted.trendRefreshes,nextTrends+1,'mixed source/chart batch queues one bounded refresh');
});
