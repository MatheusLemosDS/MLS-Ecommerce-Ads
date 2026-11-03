import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildMlsProductIntelligence} from '../src/mls-product-intelligence.mjs';
import {buildMlsProductWorkbench} from '../src/mls-product-workbench.mjs';
import {buildMlsProductFinancialEvidence} from '../src/mls-product-contribution.mjs';
import {createMlsProductWorkbenchView,productWorkbenchBody} from '../src/mls-product-workbench-view.mjs';
import {variantOrderFixture,variantOrderCatalog} from './mls-variant-order-fixture.mjs';

function documentFixture(){
 const make=(tag='div')=>{let text='';const attributes=new Map(),node={tagName:tag.toUpperCase(),children:[],dataset:{},style:{},hidden:false,disabled:false,open:false,value:'',className:'',
  append(...items){for(const item of items){item.parentNode=this;this.children.push(item);}},
  insertBefore(item,next){item.parentNode=this;const index=next?this.children.indexOf(next):-1;if(index<0)this.children.push(item);else this.children.splice(index,0,item);},
  replaceChildren(...items){for(const item of this.children)item.parentNode=null;this.children=[];text='';this.append(...items);},
  setAttribute(key,value){attributes.set(key,String(value));},getAttribute(key){return attributes.get(key)??null;}};
  Object.defineProperty(node,'textContent',{get(){return text+this.children.map(item=>item.textContent).join('');},set(value){text=String(value);this.children=[];}});
  Object.defineProperty(node,'nextSibling',{get(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;}});
  Object.defineProperty(node,'innerHTML',{set(){throw Error('UNSAFE_HTML_WRITE');}});return node;};
 const nodes=new Map([...productWorkbenchBody().matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],make()])),all=node=>node.children.flatMap(child=>[child,...all(child)]);
 const h={document:{createElement:make,getElementById:id=>nodes.get(id)??null},all,el:name=>nodes.get('businessMonthPricing'+name)};
 h.row=id=>h.el('Rows').children.find(row=>row.dataset.m3Product===id);
 h.open=id=>{const row=h.row(id),toggle=all(row).find(node=>node.tagName==='DETAILS');toggle.open=true;toggle.ontoggle();return h.el('Rows').children.find(node=>node.dataset.m3DetailFor===id);};
 h.proof=(detail,key)=>all(detail).find(node=>node.dataset.m3VariantOrderContribution===key);
 h.money=(proof,key)=>all(proof).find(node=>node.dataset.m3VariantMoney===key)?.textContent;
 return h;
}
async function reports(options={}){
 const fixture=await variantOrderFixture(options),labels=variantOrderCatalog().products.map(({item_id,product_name,variants})=>({item_id,product_name,variants:variants.map(({model_id,model_name,attributes})=>({model_id,model_name,attributes}))}));
 const workbench=buildMlsProductWorkbench(buildMlsProductIntelligence(fixture.frame),labels),evidence=buildMlsProductFinancialEvidence(fixture.frame,projectBusinessMonth);
 assert.ok(workbench);assert.ok(evidence);assert.ok(fixture.variant_contributions);return {...fixture,workbench,evidence,orders:fixture.variant_contributions};
}

test('separate single-pair orders prove two sold models without changing the exclusive product total or legacy nulls',async()=>{
 const r=await reports(),before=JSON.stringify(r),h=documentFixture(),view=createMlsProductWorkbenchView({document:h.document});
 assert.equal(view.render(r.workbench,r.evidence,r.orders),true);
 const detail=h.open('501'),one=h.proof(detail,'501:1'),two=h.proof(detail,'501:2');assert.ok(one);assert.ok(two);
 assert.equal(one.dataset.state,'AVAILABLE');assert.equal(two.dataset.state,'AVAILABLE');assert.equal(one.dataset.proofSource,'SINGLE_PAIR_ORDERS');
 assert.equal(h.money(one,'contribution'),'R$\u00a048,20');assert.equal(h.money(two,'contribution'),'R$\u00a015,60');
 assert.equal(h.all(detail).filter(node=>node.dataset.m3VariantAttribution).length,2,'one result per sold model, with no second legacy result');
 assert.match(h.row('501').children[3].textContent,/R\$\u00a075,50/,'product contribution retains its wider exclusive-order basis');
 assert.doesNotMatch(h.row('501').children[3].textContent,/R\$\u00a063,80/,'the model subset cannot replace or add to the product total');
 assert.ok(r.workbench.products.flatMap(row=>row.variants).every(row=>row.margin_bps===null&&row.net_profit_cents===null));assert.equal(JSON.stringify(r),before);
});

test('only attributed quantities receive production reference and retained adjustments are not added twice',async()=>{
 const r=await reports(),h=documentFixture();createMlsProductWorkbenchView({document:h.document}).render(r.workbench,r.evidence,r.orders);
 const one=h.proof(h.open('501'),'501:1');assert.equal(h.money(one,'production'),'− R$\u00a031,80');assert.equal(h.money(one,'repass'),'R$\u00a080,00');assert.equal(h.money(one,'contribution'),'R$\u00a048,20');
 assert.match(one.textContent,/2 de 4 unidade\(s\) com atribuição comprovada/);assert.match(one.textContent,/2 unidade\(s\) sem atribuição comprovada/);
 assert.match(one.textContent,/vários pares ou a fontes ainda não capturadas/);assert.match(h.money(one,'adjustment'),/R\$\u00a01,18.*sem nova soma ou desconto/);
 const kit=h.proof(h.open('503'),'503:1');assert.equal(h.money(kit,'production'),'− R$\u00a063,60');assert.equal(h.money(kit,'contribution'),'R$\u00a014,40');assert.doesNotMatch(kit.textContent,/R\$\u00a0127,20/);
 const mixed=h.proof(h.open('502'),'502:1');assert.equal(mixed.dataset.state,'BLOCKED');assert.equal(h.money(mixed,'contribution'),'Em conferência');assert.match(mixed.textContent,/Não há pedidos com um único par produto\/variação/);
});

test('negative and zero contributions remain numeric, while legacy tax preserves per-order rounding',async()=>{
 const r=await reports(),h=documentFixture(),view=createMlsProductWorkbenchView({document:h.document});view.render(r.workbench,r.evidence,r.orders);
 const negative=h.proof(h.open('504'),'504:1');assert.equal(h.money(negative,'contribution'),'-R$\u00a06,40');assert.equal(h.money(negative,'margin'),'-21,33% sobre as vendas atribuídas');assert.match(negative.textContent,/▼ Saldo negativo/);
 const zero=h.proof(h.open('505'),'505:1');assert.equal(h.money(zero,'contribution'),'R$\u00a00,00');assert.match(zero.textContent,/Saldo zerado/);assert.equal(h.money(zero,'margin'),'0,00% sobre as vendas atribuídas');
 const mei=h.proof(h.open('509'),'509:1');assert.equal(h.money(mei,'tax'),'− R$\u00a00,00');assert.equal(h.money(mei,'contribution'),'R$\u00a00,40');assert.match(mei.textContent,/DAS mensal fora deste saldo/);
 const legacy=await reports({mei:false});view.render(legacy.workbench,legacy.evidence,legacy.orders);const tax=h.proof(h.open('509'),'509:1');assert.equal(h.money(tax,'tax'),'− R$\u00a00,02');assert.equal(h.money(tax,'contribution'),'R$\u00a00,38');assert.match(tax.textContent,/estimativa por pedido/);
});

test('returns and unknown cost block strict variant contribution without inventing a partial subtotal',async()=>{
 const r=await reports(),h=documentFixture();createMlsProductWorkbenchView({document:h.document}).render(r.workbench,r.evidence,r.orders);
 for(const [id,reason] of [['506',/Devolução ou reembolso/],['507',/Custos de produção incompletos/]]){
  const proof=h.proof(h.open(id),id+':1');assert.equal(proof.dataset.state,'BLOCKED');assert.equal(h.money(proof,'contribution'),'Em conferência');assert.match(proof.textContent,reason);assert.match(proof.textContent,/Componentes parciais não formam uma subtração/);assert.equal(proof.dataset.m3VariantAttribution,undefined);
 }
});

test('partial or absent capture keeps the old independent sole-model proof once and leaves multi-model money pending',async()=>{
 const h=documentFixture(),view=createMlsProductWorkbenchView({document:h.document});
 for(const captured of ['partial','none']){
  const r=await reports({captured});view.render(r.workbench,r.evidence,r.orders);const multi=h.proof(h.open('501'),'501:1');assert.ok(multi);assert.notEqual(multi.dataset.state,'AVAILABLE');assert.equal(h.money(multi,'contribution'),'Em conferência');assert.match(multi.textContent,/evidência por pedido ainda não foi capturada/);
  if(captured==='none'){assert.equal(multi.dataset.state,'NOT_CAPTURED');for(const key of ['sales','repass','production','tax'])assert.equal(h.money(multi,key),'Em conferência','uncaptured money never becomes zero');}
  const sole=h.open('503'),proofs=h.all(sole).filter(node=>node.dataset.m3VariantAttribution==='503:1');assert.equal(proofs.length,1);assert.equal(proofs[0].dataset.state,'ATTRIBUTED');assert.equal(proofs[0].dataset.m3VariantOrderContribution,undefined,'the old proof is selected, never added to the new incomplete source');assert.match(proofs[0].textContent,/uma única variação vendida/);
 }
});

test('source and cost updates remove open variant results and same-month stale optional evidence is rejected',async()=>{
 const fresh=await reports(),changed=await reports({costDelta:100,revision:2}),stale=await reports({stale:true,revision:3}),h=documentFixture(),view=createMlsProductWorkbenchView({document:h.document});view.render(fresh.workbench,fresh.evidence,fresh.orders);
 const old=h.open('501'),toggle=h.all(h.row('501')).find(node=>node.tagName==='DETAILS');view.render(changed.workbench,changed.evidence,fresh.orders);assert.equal(h.el('Rows').children.some(row=>row.dataset.m3DetailFor),false);toggle.ontoggle();assert.equal(h.el('Rows').children.includes(old),false);
 assert.equal(h.proof(h.open('501'),'501:1'),undefined,'a previous cost revision cannot price the current model');
 view.render(changed.workbench,changed.evidence,changed.orders);assert.equal(h.money(h.proof(h.open('501'),'501:1'),'contribution'),'R$\u00a046,20');
 view.render(stale.workbench,stale.evidence,stale.orders);const proof=h.proof(h.open('501'),'501:1');assert.equal(proof.dataset.state,'BLOCKED');assert.equal(h.money(proof,'contribution'),'R$\u00a048,20');assert.match(proof.textContent,/Subtotal registrado · sujeito à revisão/);assert.match(proof.textContent,/precisa ser atualizada/);assert.equal(h.money(proof,'margin'),undefined);
 view.clear();view.render(fresh.workbench,fresh.evidence);assert.equal(h.proof(h.open('501'),'501:1'),undefined,'clear and legacy rendering cannot retain the previous per-order map');
});

test('invalid optional model cohorts or arithmetic are ignored while the existing product view keeps working',async()=>{
 const r=await reports(),h=documentFixture(),view=createMlsProductWorkbenchView({document:h.document});
 const mutations=[value=>value.checked_at--,value=>value.source.costs_revision++,value=>value.variants[0].total_quantity++,value=>value.variants[0].unit_cost_cents++,value=>value.variants[0].strict.contribution_cents++,value=>value.variants[0].strict.margin_bps++,value=>value.net_profit_cents=1];
 for(const mutate of mutations){const invalid=structuredClone(r.orders);mutate(invalid);assert.equal(view.render(r.workbench,r.evidence,invalid),true);assert.equal(h.proof(h.open('501'),'501:1'),undefined);assert.match(h.row('501').children[3].textContent,/75,50/);}
 const other=await reports({month:'2026-09'});view.render(r.workbench,r.evidence,other.orders);assert.equal(h.proof(h.open('501'),'501:1'),undefined);
});

test('per-order variant evidence renders from the frozen browser factory without import closures',async()=>{
 const r=await reports(),h=documentFixture(),context=vm.createContext({document:h.document,Intl});context.serialized=JSON.stringify({workbench:r.workbench,evidence:r.evidence,orders:r.orders});vm.runInContext('const create='+createMlsProductWorkbenchView.toString()+';const data=JSON.parse(serialized);globalThis.view=create({document});globalThis.ok=view.render(data.workbench,data.evidence,data.orders);',context);assert.equal(context.ok,true);assert.equal(h.money(h.proof(h.open('501'),'501:2'),'contribution'),'R$\u00a015,60');
});
