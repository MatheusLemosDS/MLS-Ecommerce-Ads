import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_RELEASE} from '../src/app-release.mjs';
import {releaseOverviewBody,releaseNotesBody,APP_RELEASE_CSS} from '../src/app-release-view.mjs';
import {adminBody} from '../src/admin-view.mjs';
import {incurredProductionBody} from '../src/incurred-production-view.mjs';

const targets=['/admin?tab=agent-returns#physicalReturnsDetails','/admin?tab=margins#incurredProductionDetails','/admin?tab=agent-returns#returnManufacturingLinksDetails'];

test('release discovery replaces the static activity placeholder with three real destinations and a visible build label',()=>{
 const html=adminBody(),overview=releaseOverviewBody();assert.equal((html.match(/id="appReleaseOverviewTitle"/g)||[]).length,1);assert.doesNotMatch(html,/Últimas atividades dos agentes|Sem atividade auditada no período/);assert.match(html,new RegExp('title="Versão do painel '+APP_RELEASE.id.replaceAll('.','\\.')+'"'));assert.ok(html.includes('Novidades · '+APP_RELEASE.date.slice(0,5)));assert.equal((overview.match(/<nav\b/g)||[]).length,1);
 const controls=html+incurredProductionBody();for(const href of targets){assert.equal(overview.split('href="'+href+'"').length-1,1);const id=href.split('#')[1];assert.equal((controls.match(new RegExp('id="'+id+'"','g'))||[]).length,1);assert.match(controls,new RegExp('<details id="'+id+'"'));}
 assert.doesNotMatch(overview,/data-mission-open|<button|<script|fetch\(/);assert.ok(overview.includes('href="/admin?tab=roadmap#appReleaseNotes"'));assert.match(overview,/Exigem seus registros e conferência/);assert.match(overview,/impacto financeiro.*ainda não foi apurado/);
});

test('Returns presents receiving and origin links before charts and keeps one distinct financial destination',()=>{
 const html=adminBody(),start=html.indexOf('id="agent-returns"'),end=html.indexOf('id="agent-auditor"',start),returns=html.slice(start,end);assert.ok(returns.indexOf('id="physicalReturns"')<returns.indexOf('id="missionChart-returns-reasons"'));assert.ok(returns.indexOf('id="returnManufacturingLinks"')<returns.indexOf('id="missionChart-returns-reasons"'));const nav=returns.match(/<nav class="mission-page-tabs[\s\S]*?<\/nav>/)?.[0];assert.ok(nav);assert.match(nav,/href="#physicalReturnsDetails"/);assert.match(nav,/href="#returnManufacturingLinksDetails"/);assert.match(nav,/Conciliação financeira/);assert.equal((nav.match(/href="\/admin\?tab=agent-finance#businessReconciliation"/g)||[]).length,1);assert.doesNotMatch(nav,/Reembolsos|>Motivos<|>Análise</);assert.match(returns,/1\. Registrar o recebimento → 2\. Inspecionar as peças → 3\. Associar à fabricação/);
});

test('release notes distinguish delivered features, operator proof and unknown financial value without stale PR counts',()=>{
 const notes=releaseNotesBody();assert.ok(notes.includes(APP_RELEASE.id));assert.ok(notes.includes(APP_RELEASE.date));for(const href of targets)assert.ok(notes.includes('href="'+href+'"'));assert.match(notes,/não comprovam que os registros reais/);assert.match(notes,/quantidade a uma fabricação compatível/);assert.match(notes,/sem descontar a produção duas vezes/);assert.match(notes,/não publicam estoque, não reservam peças, não confirmam revenda e não alteram o lucro/);assert.match(notes,/Custo desconhecido permanece pendente/);assert.doesNotMatch(notes,/PR ?#?101|2\.143|\d+%|<script|<button/);assert.match(APP_RELEASE_CSS,/#physicalReturnsDetails,#returnManufacturingLinksDetails,#incurredProductionDetails,#appReleaseNotes\{scroll-margin-top:160px\}/);assert.match(APP_RELEASE_CSS,/min-height:44px/);assert.match(APP_RELEASE_CSS,/@media\(max-width:390px\)/);
});

test('existing command search reaches each new control and initial hard links use the same focus path as clicks',()=>{
 const client=readFileSync(new URL('../src/admin-client.mjs',import.meta.url),'utf8');for(const hash of [...targets.map(href=>href.split('#')[1]),'appReleaseNotes'])assert.ok(client.includes("hash:'"+hash+"'"));assert.match(client,/title:'Receber e inspecionar devoluções'/);assert.match(client,/title:'Produção realizada'/);assert.match(client,/title:'Vínculo da devolução com a produção'/);assert.match(client,/Registre a produção realizada e confira, separadamente/);assert.match(client,/workspaceOpenFragment\(globalThis\.location\.hash,\{focus:true\}\)/);
});
