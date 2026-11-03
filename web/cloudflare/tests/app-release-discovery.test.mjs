import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_RELEASE} from '../src/app-release.mjs';
import {releaseOverviewBody,releaseNotesBody,APP_RELEASE_CSS} from '../src/app-release-view.mjs';
import {adminBody} from '../src/admin-view.mjs';
import {incurredProductionBody} from '../src/incurred-production-view.mjs';

const targets=['/admin?tab=agent-products#businessMonthPricingObserver','/admin?tab=overview#commandAgents','/admin?tab=agent-returns#physicalReturnsQueue','/admin?tab=agent-production#incurredProductionDetails','/admin?tab=products'];
const originalTargets=['/admin?tab=agent-returns#physicalReturnsOriginalItems','/admin?tab=agent-returns#physicalReturnsDetails','/admin?tab=agent-returns#returnManufacturingLinksDetails'];
const previousTargets=['/admin?tab=agent-returns#physicalReturnsDetails','/admin?tab=margins#incurredProductionDetails','/admin?tab=agent-returns#returnManufacturingLinksDetails'];
const monthlyTargets=['/admin?tab=agent-finance#businessMonthNetCard','/admin?tab=agent-finance#mlsAgentPeriod','/admin?tab=agent-finance#businessMonthExpensesForm'];

test('overview has one compact release link, while M3 notes retain the restored team and every existing workflow',()=>{
 const html=adminBody(),overview=releaseOverviewBody(),notes=releaseNotesBody();
 assert.equal((html.match(/id="appReleaseOverviewTitle"/g)||[]).length,1);
 assert.doesNotMatch(html,/Últimas atividades dos agentes|Sem atividade auditada no período/);
 assert.ok(overview.includes('title="Versão do painel '+APP_RELEASE.id+'"'));
 assert.ok(overview.includes('Novidades · '+APP_RELEASE.date.slice(0,5)));
 assert.equal((overview.match(/<a\b/g)||[]).length,1,'a compact announcement must not duplicate the task navigation');
 assert.doesNotMatch(overview,/<nav\b|data-mission-open|<button|<script|fetch\(/);
 assert.ok(overview.includes('href="/admin?tab=roadmap#appReleaseNotes"'));
 const controls=html+incurredProductionBody();
 for(const href of [...targets,...originalTargets,...previousTargets,...monthlyTargets]){
  assert.ok(notes.includes('href="'+href+'"'),'preserved route '+href);
  const id=href.includes('#')?href.split('#')[1]:new URL(href,'https://test.invalid').searchParams.get('tab');
  assert.equal((controls.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'one real destination for '+id);
 }
 for(const href of previousTargets)assert.match(controls,new RegExp('<details id="'+href.split('#')[1]+'"'));
});

test('Returns places the receiving queue before charts and offers one distinct financial destination',()=>{
 const html=adminBody(),start=html.indexOf('id="agent-returns"'),end=html.indexOf('id="agent-auditor"',start),returns=html.slice(start,end);
 for(const id of ['physicalReturns','physicalReturnsQueue','returnManufacturingLinks'])assert.ok(returns.indexOf('id="'+id+'"')<returns.indexOf('id="missionChart-returns-reasons"'),id);
 const nav=returns.match(/<nav class="mission-page-tabs[\s\S]*?<\/nav>/)?.[0];assert.ok(nav);
 assert.match(nav,/href="#physicalReturnsQueue"/);assert.match(nav,/href="#returnManufacturingLinksDetails"/);
 assert.equal((nav.match(/href="\/admin\?tab=agent-finance#businessReconciliation"/g)||[]).length,1);
 assert.doesNotMatch(nav,/href="#physicalReturnsDetails"|>Motivos<|>Análise</,'the queue is not duplicated as a second subtab');
 assert.match(returns,/Escolha o caso e confira os itens de origem/);assert.match(returns,/Registre e inspecione somente as peças recebidas/);
});

test('release notes expose M3 Observer while retaining the restored team, fabrication dates and financial gates',()=>{
 const all=releaseNotesBody(),split=all.indexOf('id="appReleaseOriginalItemsPrevious"');assert.ok(split>0);
 const current=all.slice(0,split),previous=all.slice(split);
 for(const href of targets)assert.ok(current.includes('href="'+href+'"'));
 assert.match(current,/ranking e curva ABC por unidades vendidas/);
 assert.match(current,/custos atuais por variação e cenários matemáticos de equilíbrio e margem desejada/);
 assert.match(current,/margem de contribuição e os componentes dos pedidos exclusivos/);
 assert.match(current,/cada pedido contém um produto e uma variação/);
 assert.match(current,/Pedidos com vários pares ficam sem rateio/);
 assert.match(current,/meses sem essa captura permanecem pendentes/);
 assert.match(current,/Ads, despesas e DAS mensal continuam separados/);
 assert.match(current,/Hermes, Finance, Ads, Products, Production e Returns aparecem abaixo dos indicadores/);
 assert.match(current,/A página Equipe mantém os sete especialistas e seus filtros/);
 for(const href of [...originalTargets,...previousTargets,...monthlyTargets])assert.ok(previous.includes('href="'+href+'"'));
 for(const text of ['nome, tamanho e custo atual quando os dados permitem','Foto do produto salvo e estampa local','kits ambíguos continuam pendentes','dia 15 ao 25','data de fabricação e o custo histórico registrado','referência de custo dos pedidos pagos e a montagem DTF continuam separadas','Visão geral, Produção, Devoluções, Financeiro, Produtos, Anúncios e Hermes','não publicam estoque nem alteram o lucro automaticamente'])assert.ok(current.includes(text),text);
 for(const text of ['itens vendidos e os itens informados na solicitação','Dados antigos ou ausentes permanecem desconhecidos, nunca quantidade zero','unidade comercial de kit não vira uma quantidade de camisetas por inferência','saldo antes dessas despesas','não presume zero nem copia a declaração de outro mês','Custo desconhecido permanece pendente','sem descontar a produção duas vezes','não publicam estoque, não reservam peças, não confirmam revenda e não alteram o lucro'])assert.ok(previous.includes(text),text);
 assert.ok(all.includes(APP_RELEASE.id));assert.ok(all.includes(APP_RELEASE.date));assert.doesNotMatch(all,/<script|<button|\d+%/);
 for(const id of ['physicalReturnsOriginalItems','physicalReturnsDetails','incurredProductionDetails','appReleaseNotes','businessMonthNetCard','mlsAgentPeriod'])assert.ok(APP_RELEASE_CSS.includes('#'+id));
 assert.match(APP_RELEASE_CSS,/min-height:44px/);assert.match(APP_RELEASE_CSS,/@media\(max-width:390px\)/);
});

test('command search and hard links preserve focus resolution when production moves from Costs to Production',()=>{
 const client=readFileSync(new URL('../src/admin-client.mjs',import.meta.url),'utf8');
 for(const hash of [...previousTargets.map(href=>href.split('#')[1]),'appReleaseNotes'])assert.ok(client.includes("hash:'"+hash+"'"));
 assert.match(client,/title:'Receber e inspecionar devoluções'/);assert.match(client,/title:'Produção realizada'/);assert.match(client,/title:'Vínculo da devolução com a produção'/);
 assert.match(client,/panel:'agent-production',hash:'incurredProductionDetails'/);
 assert.match(client,/canonical=current!==panel.id/);assert.match(client,/updateUrl:updateUrl\|\|canonical/);
 assert.match(client,/workspaceOpenFragment\(globalThis\.location\.hash,\{focus:true\}\)/);
 assert.match(client,/openTab\(item\.panel,\{updateUrl:!item\.hash\}\)/);assert.match(client,/workspaceOpenFragment\('#'\+item\.hash,\{focus:true,updateUrl:true\}\)/);
});
