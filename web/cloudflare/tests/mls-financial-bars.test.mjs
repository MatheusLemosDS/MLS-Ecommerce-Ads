import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createMlsFinancialBars} from '../src/mls-financial-bars.mjs';

function browser(){const document={createElement(tag){return {tag,children:[],dataset:{},style:{},attributes:{},textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=[...nodes];},setAttribute(key,value){this.attributes[key]=String(value);},focus(){this.onfocus?.();}};}};return {document,host:document.createElement('div')};}
const rows=()=>[{label:'Repasse',value:10000,role:'START'},{label:'Produção de referência',value:-6000,role:'DEDUCTION'},{label:'Despesas',value:null,role:'DEDUCTION'},{label:'Resultado parcial',value:-1200,role:'RESULT'},{label:'Zero confirmado',value:0,role:'CONTEXT'}];

test('signed financial model preserves negative, null and zero without calculating or closing partial components',()=>{
 const factory=createMlsFinancialBars(),source=rows(),before=JSON.stringify(source),model=factory.project(source,{complete:true,basis:'Mesmo recorte; despesas pendentes'});
 assert.equal(model.schema,'mls_signed_financial_bars_v1');assert.equal(model.unit,'BRL_CENTS');assert.equal(model.type,'signedBar');assert.equal(model.status,'PARTIAL');
 assert.deepEqual(model.segments.map(row=>row.value),[10000,-6000,null,-1200,0]);assert.equal(JSON.stringify(source),before);
 for(const value of [-0,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1]){const bad=rows();bad[0].value=value;assert.equal(factory.project(bad),null);}
 assert.equal(factory.project([source[0],source[0]]),null);assert.equal(factory.project([{label:'x',value:1,role:'FABRICATED_TOTAL'}]),null);
});

test('frozen renderer keeps signs around a zero axis, inspection and exact cents in the safe range',()=>{
 const b=browser(),factory=vm.runInNewContext('('+createMlsFinancialBars.toString()+')') (b.document),source=rows();source[0].value=Number.MAX_SAFE_INTEGER;
 assert.equal(factory.draw(b.host,source,{basis:'Base validada',complete:false}),true);
 const [heading,context,list,readout]=b.host.children;assert.match(context.textContent,/não formam uma conta fechada/);
 const positive=list.children[0],negative=list.children[1],unknown=list.children[2],zero=list.children[4];
 assert.equal(positive.children[1].children[0].style.left,'50%');assert.ok(Number.parseFloat(negative.children[1].children[0].style.left)<50);
 assert.equal(negative.dataset.sign,'negative');assert.match(negative.children[2].textContent,/− R\$ 60,00/);
 assert.equal(unknown.children[2].textContent,'Pendente');assert.equal(zero.children[1].children[0].style.width,'0%');
 positive.onclick();assert.match(readout.textContent,/90\.071\.992\.547\.409,91/);negative.onclick();assert.match(readout.textContent,/Dedução/);
 let prevented=false;negative.onkeydown({key:'End',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(zero.attributes['aria-pressed'],'true');
 zero.onkeydown({key:'Escape'});assert.equal(zero.attributes['aria-pressed'],'false');assert.match(readout.textContent,/Seleção fechada/);
});
