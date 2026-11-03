import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildMlsProductIntelligence} from '../src/mls-product-intelligence.mjs';
import {buildMlsProductWorkbench} from '../src/mls-product-workbench.mjs';
import {createMlsProductWorkbenchView,productWorkbenchBody} from '../src/mls-product-workbench-view.mjs';
import {m3ProductFrame,m3MixedFrame,m3CatalogLabels} from './mls-product-workbench-fixture.mjs';

function fakeDocument(){
 const element=(tag='div')=>{
  let ownText='';const attributes=new Map();
  const value={tagName:tag.toUpperCase(),children:[],dataset:{},style:{},value:'',className:'',id:'',hidden:false,disabled:false,open:false,
   append(...items){for(const item of items){if(item&&typeof item==='object')item.parentNode=this;this.children.push(item);}},
   insertBefore(item,next){const index=next?this.children.indexOf(next):-1;item.parentNode=this;if(index<0)this.children.push(item);else this.children.splice(index,0,item);},
   replaceChildren(...items){for(const item of this.children)if(item&&typeof item==='object')item.parentNode=null;this.children=[];ownText='';this.append(...items);},
   setAttribute(name,text){attributes.set(name,String(text));},getAttribute(name){return attributes.get(name)??null;}};
  Object.defineProperty(value,'textContent',{get(){return ownText+this.children.map(item=>typeof item==='object'?item.textContent:String(item)).join('');},set(text){ownText=String(text);this.children=[];}});
  Object.defineProperty(value,'nextSibling',{get(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;}});
  Object.defineProperty(value,'innerHTML',{set(){throw Error('UNSAFE_HTML_WRITE');}});return value;
 };
 const nodes=new Map([...productWorkbenchBody().matchAll(/\bid="([^"]+)"/g)].map(match=>{const value=element();value.id=match[1];return [match[1],value];}));
 const document={createElement:element,getElementById:id=>nodes.get(id)??null};
 const descendants=node=>node.children.flatMap(child=>child&&typeof child==='object'?[child,...descendants(child)]:[]);
 return {document,nodes,el:name=>nodes.get('businessMonthPricing'+name),descendants};
}
const workbench=(options={})=>buildMlsProductWorkbench(buildMlsProductIntelligence(m3ProductFrame(options)),m3CatalogLabels());
const rowIds=h=>h.el('Rows').children.filter(row=>row.dataset.m3Product).map(row=>row.dataset.m3Product);
const input=(h,name,value,event='onchange')=>{h.el(name).value=value;h.el(name)[event]();};

test('M3 local paging exposes all25 products and filters without mutating the saved financial frame',()=>{
 const frame=m3ProductFrame(),before=JSON.stringify(frame),report=buildMlsProductWorkbench(buildMlsProductIntelligence(frame),m3CatalogLabels());
 assert.ok(report);const original=JSON.stringify(report),h=fakeDocument(),view=createMlsProductWorkbenchView({document:h.document});
 assert.equal(view.render(report),true);assert.equal(rowIds(h).length,20);assert.equal(h.el('Previous').disabled,true);assert.equal(h.el('Next').disabled,false);
 const all=new Set(rowIds(h));h.el('Next').onclick();assert.equal(rowIds(h).length,5);for(const id of rowIds(h))all.add(id);assert.equal(all.size,25);assert.equal(view.getState().page,2);
 input(h,'Search','UNIVÉRSO','oninput');assert.deepEqual(rowIds(h),['301']);assert.equal(view.getState().page,1);
 input(h,'Search','P + P','oninput');assert.deepEqual(rowIds(h),['301'],'current variant attributes participate in search');
 input(h,'Search','','oninput');input(h,'ABC','C');assert.ok(rowIds(h).length);assert.ok(h.el('Rows').children.filter(row=>row.dataset.m3Product).every(row=>row.children[1].textContent==='C'));
 input(h,'ABC','all');input(h,'PageSize','50');assert.equal(rowIds(h).length,25);assert.equal(h.el('Next').disabled,true);
 input(h,'Sort','contribution_desc');assert.equal(rowIds(h)[0],report.products.toSorted((a,b)=>b.exclusive_after_costs_cents-a.exclusive_after_costs_cents)[0].item_id);
 const negative=h.el('Rows').children.find(row=>row.dataset.m3Product==='304');assert.equal(negative.children[3].dataset.tone,'negative');assert.match(negative.children[3].textContent,/-/);
 assert.equal(JSON.stringify(frame),before);assert.equal(JSON.stringify(report),original);
});

test('M3 variant inspection uses one commercial kit cost, current labels and safe text nodes',()=>{
 const h=fakeDocument(),chosen=[],view=createMlsProductWorkbenchView({document:h.document,onSelectVariant:key=>chosen.push(key)});view.render(workbench());
 const first=h.el('Rows').children.find(row=>row.dataset.m3Product==='301'),detail=h.descendants(first).find(node=>node.tagName==='DETAILS');
 assert.ok(detail);assert.equal(h.descendants(detail).some(node=>node.dataset.m3Variant),false,'variant details stay lazy until opened');
 detail.open=true;detail.ontoggle();const expanded=h.el('Rows').children.find(row=>row.dataset.m3DetailFor==='301');assert.ok(expanded);assert.equal(expanded.children[0].colSpan,5);const card=h.descendants(expanded).find(node=>node.dataset.m3Variant==='301:1');assert.ok(card);
 assert.match(card.textContent,/Kit P \/ P/);assert.match(card.textContent,/29,00 por unidade vendida/);assert.doesNotMatch(card.textContent,/58,00 por unidade vendida/);
 assert.match(card.textContent,/30 unidade/);assert.match(expanded.textContent,/Margem líquida total por variação aguarda receitas e despesas atribuídas/);
 detail.open=false;detail.ontoggle();assert.equal(expanded.hidden,true);detail.open=true;detail.ontoggle();assert.equal(expanded.hidden,false);assert.equal(h.el('Rows').children.filter(row=>row.dataset.m3DetailFor==='301').length,1);
 const select=h.descendants(card).find(node=>node.dataset.m3UseVariant==='301:1');assert.equal(select.disabled,false);select.onclick();assert.deepEqual(chosen,['301:1']);
 input(h,'Search','303','oninput');assert.match(h.el('Rows').textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(h.descendants(h.el('Rows')).some(node=>['IMG','SCRIPT','IFRAME'].includes(node.tagName)),false);
});

test('M3 table state survives month switches and refreshes while getState stays detached',()=>{
 const h=fakeDocument(),view=createMlsProductWorkbenchView({document:h.document});view.render(workbench());
 h.el('Next').onclick();assert.equal(view.getState().page,2);view.render(workbench({revision:2}));assert.equal(view.getState().page,2,'metadata/source refresh does not reset paging');
 const detached=view.getState();detached.query='not the actual query';detached.page=99;assert.equal(view.getState().query,'');assert.equal(view.getState().page,2);
 view.render(workbench({month:'2026-09'}));assert.equal(view.getState().page,1);input(h,'Search','Universo','oninput');assert.equal(view.getState().filtered_products,1);
 view.render(workbench());assert.equal(view.getState().month,'2026-10');assert.equal(view.getState().query,'');assert.equal(view.getState().page,2);
 view.render(workbench({month:'2026-09'}));assert.equal(view.getState().query,'Universo');assert.deepEqual(rowIds(h),['301']);
 view.clear();assert.equal(h.el('Rows').children.length,0);assert.equal(h.el('Next').disabled,true);assert.match(h.el('Page').textContent,/Sem fonte/);
 assert.equal(view.render(null),false);assert.equal(h.el('Stats').children.length,0);
});

test('M3 mixed orders keep volume and costs visible while exclusive money remains unknown',()=>{
 const frame=m3MixedFrame(),report=buildMlsProductWorkbench(buildMlsProductIntelligence(frame),m3CatalogLabels()),h=fakeDocument();assert.ok(report);
 createMlsProductWorkbenchView({document:h.document}).render(report);
 assert.equal(rowIds(h).length,2);assert.ok(h.el('Rows').children.every(row=>row.children[3].textContent.startsWith('Em conferência')));
 assert.match(h.el('Stats').textContent,/Em conferência/);assert.match(h.el('CostCoverage').textContent,/58,00/);
 assert.equal(h.el('Chart').children.length,2);assert.equal(h.el('ABCBars').children.length,3);
 assert.equal(report.safe_price_cents,null);assert.equal(report.execution_allowed,false);
 assert.ok(report.products.flatMap(row=>row.variants).every(row=>row.margin_bps===null&&row.net_profit_cents===null&&row.safe_price_cents===null),'the view cannot invent an attributed variant margin or safe price');
});

test('M3 chart depicts sold units, not inventory, and invalid local control values stay bounded',()=>{
 const h=fakeDocument(),view=createMlsProductWorkbenchView({document:h.document});view.render(workbench());
 assert.equal(h.el('Chart').children.length,8);const bars=h.descendants(h.el('Chart')).filter(node=>node.tagName==='PROGRESS');assert.equal(bars[0].max,10000);assert.equal(bars[0].value,10000);assert.match(bars[0].getAttribute('aria-label'),/30 unidade/);
 assert.match(h.el('CostCoverage').textContent,/Não é o gasto real por data de fabricação/);
 input(h,'PageSize','3000');assert.equal(view.getState().page_size,20);assert.equal(rowIds(h).length,20);
 input(h,'ABC','<img>');assert.equal(view.getState().abc,'all');input(h,'Sort','arbitrary');assert.equal(view.getState().sort,'quantity_desc');
 input(h,'Search','x'.repeat(500),'oninput');assert.equal(view.getState().query.length,120);assert.equal(rowIds(h).length,0);assert.match(h.el('Rows').textContent,/Nenhum produto corresponde/);
});

test('M3 view factory is self-contained when frozen in the compiled browser realm',()=>{
 const report=workbench(),h=fakeDocument(),context=vm.createContext({document:h.document,Intl});
 context.serialized=JSON.stringify(report);vm.runInContext('const create='+createMlsProductWorkbenchView.toString()+';globalThis.view=create({document});globalThis.ok=view.render(JSON.parse(serialized));',context);
 assert.equal(context.ok,true);assert.equal(rowIds(h).length,20);vm.runInContext("document.getElementById('businessMonthPricingNext').onclick()",context);assert.equal(rowIds(h).length,5);
 assert.equal(vm.runInContext('view.getState().page',context),2);
});

test('M3 reference money preserves every accepted cent at the safe integer boundary',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 const frame={status:'COMPLETE',month:'2026-10',result:{pending:[]},product_summary:{schema:'business_month_products_v1',mixed_orders:0,products:[{
  item_id:'1',quantity:max,orders:1,exclusive_orders:1,mixed_orders:0,pending:[],exclusive_sales_cents:max,
  exclusive_after_costs_cents:max,exclusive_margin_bps:10000,variants:[{model_id:'1',quantity:max,unit_cost_cents:1}]
 }]}};
 const report=buildMlsProductWorkbench(buildMlsProductIntelligence(frame));assert.ok(report);assert.equal(report.coverage.known_production_cost_cents,max);
 const h=fakeDocument();assert.equal(createMlsProductWorkbenchView({document:h.document}).render(report),true);
 assert.ok(h.el('CostCoverage').textContent.includes('R$\u00a090.071.992.547.409,91'));
 assert.ok(h.el('Rows').children[0].children[3].textContent.startsWith('R$\u00a090.071.992.547.409,91'));
 assert.ok(h.el('Rows').children[0].children[4].textContent.startsWith('R$\u00a090.071.992.547.409,91'));
});
