import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createMlsChartInteractions} from '../src/mls-chart-interactions.mjs';

// Small DOM port: the browser suite separately exercises the compiled Worker in
// Chromium. These tests isolate state, safe text writes and listener disposal.
function chartFixture(){
 const doc={activeElement:null};
 class Element{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.attributes=new Map();this.children=[];this.listeners=new Map();this.hidden=false;this.textContent='';}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  hasAttribute(name){return this.attributes.has(name);}
  removeAttribute(name){this.attributes.delete(name);}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
  closest(selector){return selector==='[data-mls-chart-mark]'&&this.hasAttribute('data-mls-chart-mark')?this:this.parentNode?.closest(selector)??null;}
  querySelectorAll(selector){const result=[];for(const child of this.children){if(selector==='[data-mls-chart-mark]'&&child.hasAttribute('data-mls-chart-mark'))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
  querySelector(selector){if(selector==='svg.mls-verified-chart')return this.children.find(node=>node.tagName==='svg')??null;return null;}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  emit(type,properties={}){const event={type,target:this,preventDefault(){this.prevented=true;},...properties};for(const listener of this.listeners.get(type)||[])listener(event);return event;}
  focus(){doc.activeElement=this;svg.emit('focusin',{target:this});}
  set innerHTML(_value){throw Error('Inspection must never write provider HTML');}
 }
 doc.createElement=tag=>new Element(tag);doc.createElementNS=(_ns,tag)=>new Element(tag);
 const host=new Element('div'),svg=new Element('svg');host.append(svg);
 svg.getScreenCTM=()=>({inverse:()=>({})});
 svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}});
 const rows=[
  {index:0,x:78,label:'24/10/2026',value:'-R$ 1,00',context:'Resultado estimado'},
  // Column 1 intentionally has no observation or focus target.
  {index:2,x:278,label:'26/10/2026',value:'R$ 0,00',context:'Subtotal com custos conhecidos · Dia parcial'},
  {index:3,x:378,label:'27/10/2026',value:'R$ 1.250,99',context:'Valor observado'}
 ];
 const marks=rows.map(row=>{
  const mark=new Element('circle');
  for(const [name,value] of Object.entries({mark:row.index,x:row.x,left:78,right:378,top:16,bottom:187,label:row.label,value:row.value,context:row.context}))mark.setAttribute('data-mls-chart-'+name,value);
  svg.append(mark);return mark;
 });
 return {host,svg,marks,doc,readout:()=>host.children.find(node=>node.className==='mls-chart-readout')};
}

test('inspection factory embeds independently and writes all provider text as text',()=>{
 const factory=vm.runInNewContext('('+createMlsChartInteractions.toString()+')');
 const inspection=factory(),fixture=chartFixture();
 fixture.marks[0].setAttribute('data-mls-chart-label','<img src=x onerror=alert(1)>');
 inspection.bind(fixture.host);
 fixture.svg.emit('pointerover',{target:fixture.marks[0]});
 assert.equal(fixture.readout().hidden,false);
 assert.equal(fixture.readout().children[0].textContent,'<img src=x onerror=alert(1)>');
 assert.equal(fixture.readout().children[1].textContent,'-R$ 1,00');
 assert.equal(fixture.host.getAttribute('data-mls-chart-inspection'),'active');
 inspection.clear(fixture.host);
 assert.equal(fixture.readout(),undefined);
 assert.equal(fixture.host.getAttribute('data-mls-chart-inspection'),null);
});

test('keyboard navigation moves among actual observations, retains zero/context and Escape dismisses',()=>{
 const inspection=createMlsChartInteractions(),{host,svg,marks,doc,readout}=chartFixture();
 inspection.bind(host);marks[0].focus();
 assert.equal(readout().children[1].textContent,'-R$ 1,00');
 assert.equal(svg.emit('keydown',{target:marks[0],key:'ArrowRight'}).prevented,true);
 assert.equal(doc.activeElement,marks[1],'the absent date never receives focus');
 assert.equal(readout().children[1].textContent,'R$ 0,00');
 assert.match(readout().children[2].textContent,/Subtotal com custos conhecidos · Dia parcial/);
 svg.emit('keydown',{target:marks[1],key:'End'});assert.equal(doc.activeElement,marks[2]);
 svg.emit('keydown',{target:marks[2],key:'ArrowLeft'});assert.equal(doc.activeElement,marks[1]);
 svg.emit('keydown',{target:marks[1],key:'Home'});assert.equal(doc.activeElement,marks[0]);
 const unrelated=svg.emit('keydown',{target:marks[0],key:'Tab'});assert.equal(unrelated.prevented,undefined);
 svg.emit('keydown',{target:marks[0],key:'Escape'});
 assert.equal(readout().hidden,true);
 assert.equal(marks.some(mark=>mark.hasAttribute('data-mls-chart-selected')),false);
 assert.equal(svg.children.at(-1).getAttribute('visibility'),'hidden');
});

test('pointer date columns improve touch targets while missing dates remain empty',()=>{
 const inspection=createMlsChartInteractions(),{host,svg,marks,readout}=chartFixture();
 inspection.bind(host);
 svg.emit('pointermove',{clientX:282,clientY:30});
 assert.equal(readout().children[1].textContent,'R$ 0,00');
 assert.equal(marks[1].getAttribute('data-mls-chart-selected'),'true');
 assert.equal(svg.children.at(-1).getAttribute('d'),'M 278 16 V 187');
 svg.emit('pointermove',{clientX:178,clientY:30});
 assert.equal(readout().hidden,true,'the missing date column remains unavailable');
 svg.emit('pointerdown',{clientX:282,clientY:180,pointerType:'touch'});
 svg.emit('pointerleave');
 assert.equal(readout().hidden,false,'a touch inspection survives pointerleave');
 svg.emit('pointerdown',{clientX:282,clientY:210,pointerType:'touch'});
 assert.equal(readout().hidden,true,'touching outside the plot dismisses the readout');
});

test('rebinding and clearing remove stale marks, readouts and all listeners idempotently',()=>{
 const inspection=createMlsChartInteractions(),{host,svg,marks,readout}=chartFixture();
 const dispose=inspection.bind(host);svg.emit('pointerdown',{target:marks[0]});
 inspection.bind(host);
 assert.equal(host.children.filter(node=>node.className==='mls-chart-readout').length,1);
 assert.equal(svg.children.filter(node=>node.tagName==='path').length,1);
 assert.equal([...svg.listeners.values()].reduce((total,set)=>total+set.size,0),7);
 assert.equal(marks[0].getAttribute('data-mls-chart-selected'),null);
 dispose();assert.ok(readout(),'an old cleanup cannot remove a newer binding');
 inspection.clear(host);inspection.clear(host);
 assert.equal(readout(),undefined);
 assert.equal([...svg.listeners.values()].reduce((total,set)=>total+set.size,0),0);
 assert.equal(svg.children.length,marks.length);
 assert.doesNotThrow(()=>{inspection.bind(null);inspection.clear(null);});
});
