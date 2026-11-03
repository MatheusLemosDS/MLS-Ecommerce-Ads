import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildMlsProductIntelligence} from '../src/mls-product-intelligence.mjs';
import {buildMlsProductWorkbench} from '../src/mls-product-workbench.mjs';
import {buildMlsProductFinancialEvidence} from '../src/mls-product-contribution.mjs';
import {createMlsProductWorkbenchView,productWorkbenchBody} from '../src/mls-product-workbench-view.mjs';
import {contributionFrame,contributionCatalog} from './mls-product-contribution-fixture.mjs';

function fixture(){
 const make=(tag='div')=>{let own='';const attrs=new Map(),node={tagName:tag.toUpperCase(),children:[],dataset:{},style:{},hidden:false,disabled:false,open:false,value:'',className:'',
  append(...items){for(const item of items){item.parentNode=this;this.children.push(item);}},
  insertBefore(item,next){item.parentNode=this;const index=next?this.children.indexOf(next):-1;if(index<0)this.children.push(item);else this.children.splice(index,0,item);},
  replaceChildren(...items){for(const item of this.children)item.parentNode=null;this.children=[];own='';this.append(...items);},
  setAttribute(name,value){attrs.set(name,String(value));},getAttribute(name){return attrs.get(name)??null;}};
  Object.defineProperty(node,'textContent',{get(){return own+this.children.map(item=>item.textContent).join('');},set(value){own=String(value);this.children=[];}});
  Object.defineProperty(node,'nextSibling',{get(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;}});
  Object.defineProperty(node,'innerHTML',{set(){throw Error('UNSAFE_HTML_WRITE');}});return node;};
 const nodes=new Map([...productWorkbenchBody().matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],make()]));
 const document={createElement:make,getElementById:id=>nodes.get(id)??null},all=node=>node.children.flatMap(child=>[child,...all(child)]);
 const h={document,all,el:name=>nodes.get('businessMonthPricing'+name)};
 h.rows=()=>h.el('Rows').children.filter(row=>row.dataset.m3Product);h.row=id=>h.rows().find(row=>row.dataset.m3Product===id);
 h.open=id=>{const row=h.row(id),detail=all(row).find(node=>node.tagName==='DETAILS');detail.open=true;detail.ontoggle();return h.el('Rows').children.find(node=>node.dataset.m3DetailFor===id);};
 h.money=(node,key)=>all(node).find(value=>value.dataset.m3Money===key)?.textContent;
 h.change=(name,value)=>{h.el(name).value=value;h.el(name).onchange();};return h;
}
function reports(options={}){const frame=contributionFrame(options),catalog=contributionCatalog().products.map(({item_id,product_name,variants})=>({item_id,product_name,variants:variants.map(({model_id,model_name,attributes})=>({model_id,model_name,attributes}))}));return {frame,workbench:buildMlsProductWorkbench(buildMlsProductIntelligence(frame),catalog),evidence:buildMlsProductFinancialEvidence(frame,projectBusinessMonth)};}

test('financial table distinguishes positive, negative, zero and unknown values and sorts covered margins only',()=>{
 const {frame,workbench,evidence}=reports(),before=JSON.stringify({frame,workbench,evidence}),h=fixture();assert.ok(evidence);const view=createMlsProductWorkbenchView({document:h.document});view.render(workbench,evidence);
 assert.match(h.row('401').children[3].textContent,/▲ Saldo positivo.*48,20%/);assert.equal(h.row('401').children[3].dataset.tone,'positive');
 assert.match(h.row('402').children[3].textContent,/▼ Saldo negativo.*-21,33%/);assert.equal(h.row('402').children[3].dataset.tone,'negative');
 assert.match(h.row('403').children[3].textContent,/R\$\u00a00,00.*Saldo zerado.*0,00%/);assert.equal(h.row('403').children[3].dataset.tone,'neutral');
 assert.ok(h.row('407').children[3].textContent.startsWith('Em conferência'));assert.doesNotMatch(h.row('407').children[3].textContent,/%/);
 h.change('Sort','contribution_asc');assert.deepEqual(h.rows().slice(0,5).map(row=>row.dataset.m3Product),['402','403','404','405','401']);
 h.change('Sort','margin_asc');assert.deepEqual(h.rows().map(row=>row.dataset.m3Product),['402','403','405','404','401','406','407','408']);
 h.change('Sort','margin_desc');assert.deepEqual(h.rows().slice(0,5).map(row=>row.dataset.m3Product),['401','404','405','403','402']);
 assert.match(h.el('CostCoverage').textContent,/5 de 8 produtos: 3 positivos, 1 negativos e 1 zerados/);
 assert.equal(JSON.stringify({frame,workbench,evidence}),before,'view cannot rewrite financial evidence or legacy null contracts');
});

test('one lazy full-width detail exposes exclusive components and proven single-sold-model attribution',()=>{
 const {workbench,evidence}=reports(),h=fixture();createMlsProductWorkbenchView({document:h.document}).render(workbench,evidence);
 assert.equal(h.el('Rows').children.length,8,'closed product rows do not create extra table rows');
 const localScroll={scrollLeft:240};h.el('Rows').closest=selector=>{assert.equal(selector,'.m3-table-wrap');return localScroll;};
 const index=h.el('Rows').children.indexOf(h.row('401')),detail=h.open('401');assert.equal(detail.children[0].colSpan,5);assert.equal(h.el('Rows').children[index+1],detail);
 assert.equal(localScroll.scrollLeft,0,'opening financial evidence brings the constrained detail content into the visible local table area');
 assert.equal(h.money(detail,'sales'),'R$\u00a0100,00');assert.equal(h.money(detail,'repass'),'R$\u00a080,00');assert.equal(h.money(detail,'production'),'− R$\u00a031,80');assert.equal(h.money(detail,'contribution'),'R$\u00a048,20');
 assert.match(detail.textContent,/não será descontada novamente/);assert.match(detail.textContent,/DAS-MEI é mensal e fica fora/);
 const proof=h.all(detail).find(node=>node.dataset.m3VariantAttribution==='401:1');assert.ok(proof);assert.equal(proof.dataset.state,'ATTRIBUTED');assert.match(proof.textContent,/uma única variação vendida/);
 assert.equal(h.all(detail).some(node=>node.dataset.m3Variant==='401:2'),false,'unsold catalogue models cannot change sold-model proof or appear as sales');
 assert.ok(workbench.products.flatMap(row=>row.variants).every(variant=>variant.margin_bps===null&&variant.net_profit_cents===null),'new attribution does not modify v1 unknown SKU fields');
});

test('mixed kit sales never leak all-unit production or mixed payout into the exclusive waterfall',()=>{
 const {workbench,evidence}=reports(),h=fixture();createMlsProductWorkbenchView({document:h.document}).render(workbench,evidence);const detail=h.open('405');
 assert.equal(h.money(detail,'production'),'− R$\u00a063,60');assert.notEqual(h.money(detail,'production'),'− R$\u00a095,40');assert.equal(h.money(detail,'repass'),'R$\u00a0110,00');assert.equal(h.money(detail,'contribution'),'R$\u00a046,40');
 const proof=h.all(detail).find(node=>node.dataset.m3VariantAttribution==='405:1');assert.match(proof.textContent,/2 unidade\(s\) exclusiva\(s\).*1 unidade\(s\) mista\(s\) ficam fora/);assert.match(proof.textContent,/30,93%/);
 const multiple=h.open('404');assert.equal(h.all(multiple).some(node=>node.dataset.m3VariantAttribution),false);assert.match(multiple.textContent,/mais de uma variação vendida.*Nenhum repasse foi rateado/);
 const mixedOnly=h.open('406');assert.equal(h.all(mixedOnly).some(node=>node.dataset.m3VariantAttribution),false);assert.match(mixedOnly.textContent,/Não há pedidos exclusivos/);
});

test('blocked returns and missing costs show recorded components without deriving a partial contribution',()=>{
 const {workbench,evidence}=reports(),h=fixture();createMlsProductWorkbenchView({document:h.document}).render(workbench,evidence);
 for(const id of ['407','408']){const detail=h.open(id),facts=h.all(detail).find(node=>node.dataset.m3ProductEvidence===id);assert.equal(facts.dataset.state,'RECORDED');assert.equal(h.money(detail,'contribution'),'Em conferência');assert.equal(h.all(detail).some(node=>node.dataset.m3VariantAttribution),false);assert.match(detail.textContent,/componentes podem estar incompletos/);assert.match(detail.textContent,/Não somamos componentes parciais/);}
 assert.equal(h.money(h.el('Rows').children.find(row=>row.dataset.m3DetailFor==='407'),'production'),'R$\u00a012,50');
 const pending=h.el('Rows').children.find(row=>row.dataset.m3DetailFor==='408');assert.match(pending.textContent,/Custos de produção incompletos/);assert.equal(h.money(pending,'production'),'R$\u00a00,00','known zero component is explicit partial evidence, never a completed zero cost');assert.match(pending.textContent,/não formam uma conta de subtração/);
});

test('stale financial sources retain only labelled recorded subtotals and source redraw removes open details',()=>{
 const fresh=reports(),stale=reports({stale:true}),h=fixture(),view=createMlsProductWorkbenchView({document:h.document});view.render(fresh.workbench,fresh.evidence);
 h.change('Sort','margin_asc');const old=h.open('401'),oldToggle=h.all(h.row('401')).find(node=>node.tagName==='DETAILS');view.render(stale.workbench,stale.evidence);
 assert.equal(view.getState().sort,'margin_asc');assert.equal(h.el('Rows').children.some(row=>row.dataset.m3DetailFor),false);oldToggle.ontoggle();assert.equal(h.el('Rows').children.some(row=>row===old),false,'detached source toggles cannot insert stale evidence');
 assert.ok(h.rows().every(row=>row.children[3].textContent.startsWith('Em conferência')));const detail=h.open('401');assert.equal(h.money(detail,'contribution'),'R$\u00a048,20');assert.match(detail.textContent,/Subtotal registrado · sujeito à revisão/);assert.match(detail.textContent,/leitura financeira precisa ser atualizada/);assert.equal(h.all(detail).some(node=>node.dataset.m3VariantAttribution),false);
 view.clear();assert.equal(h.el('Rows').children.length,0);view.render(fresh.workbench);const fallback=h.open('401');assert.equal(h.all(fallback).some(node=>node.dataset.m3VariantAttribution),false,'render without evidence never reuses the previous source');
});

test('optional evidence from another month or product cohort is ignored without losing legacy table functions',()=>{
 const current=reports(),h=fixture(),view=createMlsProductWorkbenchView({document:h.document});
 for(const evidence of [reports({month:'2026-09'}).evidence,{...current.evidence,products:current.evidence.products.map((product,index)=>index?product:{...product,scope:{...product.scope,quantity:999}})}]){
  view.render(current.workbench,evidence);assert.match(h.row('401').children[3].textContent,/48,20%/);const detail=h.open('401');assert.match(detail.textContent,/aguardam uma evidência do mesmo mês/);assert.equal(h.all(detail).some(node=>node.dataset.m3VariantAttribution),false);
 }
});

test('zero exclusive sales retain a proven zero balance with unknown margin instead of unknown money',()=>{
 const frame=structuredClone(contributionFrame()),row=frame.product_summary.products.find(product=>product.item_id==='403');row.known_exclusive_sales_cents=row.exclusive_sales_cents=0;row.exclusive_margin_bps=null;frame.sales_cents-=2500;frame.known_sales_cents-=2500;assert.ok(projectBusinessMonth(frame));
 const workbench=buildMlsProductWorkbench(buildMlsProductIntelligence(frame)),evidence=buildMlsProductFinancialEvidence(frame,projectBusinessMonth),h=fixture();assert.ok(evidence);assert.equal(workbench.products.find(row=>row.item_id==='403').exclusive_after_costs_cents,null);
 createMlsProductWorkbenchView({document:h.document}).render(workbench,evidence);assert.match(h.row('403').children[3].textContent,/R\$\u00a00,00.*Saldo zerado/);assert.doesNotMatch(h.row('403').children[3].textContent,/%/);assert.match(h.el('CostCoverage').textContent,/5 de 8 produtos/);
});

test('signed percentages preserve all safe integer basis points and are not clamped below minus100 percent',()=>{
 const max=Number.MAX_SAFE_INTEGER,frame={status:'COMPLETE',month:'2026-10',result:{pending:[]},product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[{item_id:'1',quantity:1,orders:1,exclusive_orders:1,mixed_orders:0,pending:[],exclusive_sales_cents:10000,exclusive_after_costs_cents:-max,exclusive_margin_bps:-max,variants:[{model_id:'1',quantity:1,unit_cost_cents:0}]}]}};
 const workbench=buildMlsProductWorkbench(buildMlsProductIntelligence(frame)),h=fixture();assert.ok(workbench);createMlsProductWorkbenchView({document:h.document}).render(workbench);assert.ok(h.row('1').children[3].textContent.includes('-90.071.992.547.409,91%'));
});

test('optional financial evidence renders without import closures in the frozen browser factory',()=>{
 const {workbench,evidence}=reports(),h=fixture(),context=vm.createContext({document:h.document,Intl});context.serialized=JSON.stringify({workbench,evidence});vm.runInContext('const create='+createMlsProductWorkbenchView.toString()+';const data=JSON.parse(serialized);globalThis.view=create({document});globalThis.ok=view.render(data.workbench,data.evidence);',context);assert.equal(context.ok,true);const detail=h.open('405');assert.equal(h.money(detail,'contribution'),'R$\u00a046,40');
});
