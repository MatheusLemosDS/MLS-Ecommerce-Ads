import test from 'node:test';
import assert from 'node:assert/strict';
import {MLS_APPROVED_DESIGN_CSS} from '../src/approved-design-system.mjs';
import {CSS,adminBody} from '../src/admin-view.mjs';
import {renderAdsWorkspace,ADS_WORKSPACE_CSS} from '../src/ads-workspace-view.mjs';
import {MISSION_AGENTS,missionWorkspacesBody,MISSION_CLIENT} from '../src/mission-control.mjs';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {SAVED_CATALOG_CLIENT,savedCatalogBody} from '../src/saved-catalog-view.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const ids=MISSION_AGENTS.map(agent=>agent.id);
test('single approved visual language defines actual agent colors, responsive layout and dark/light contrast',()=>{
 for(const key of ['--mls-finance','--mls-ads','--mls-products','--mls-production','--mls-returns','--mls-auditor']){
  assert.ok(MLS_APPROVED_DESIGN_CSS.includes(key),key);
 }
 for(const selector of ['.mission-dashboard .command-metric','.mission-workspace>.mission-page-tabs',
  '.ads-workspace .ads-workspace-head','.automation-workspace','.mls-products-hub','.dtf-workspace',
  '#history .card','#margins .card']){
  assert.ok(MLS_APPROVED_DESIGN_CSS.includes(selector),selector);
 }
 assert.match(MLS_APPROVED_DESIGN_CSS,/@media\(min-width:1201px\)[\s\S]*?repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(MLS_APPROVED_DESIGN_CSS,/scroll-margin-top:99px/);
 assert.match(MLS_APPROVED_DESIGN_CSS,/:root\[data-theme=dark\]/);
 assert.match(MLS_APPROVED_DESIGN_CSS,/:root\[data-theme=light\]/);
 for(const width of ['1200','850','640','390'])
  assert.ok(MLS_APPROVED_DESIGN_CSS.includes('max-width:'+width+'px'),width+' responsive breakpoint');
 assert.ok(CSS.endsWith(MLS_APPROVED_DESIGN_CSS),'shared theme must be the final owner CSS layer');
 assert.doesNotMatch(MLS_APPROVED_DESIGN_CSS,/https?:\/\/|url\(["']?https?:|R\$\s*\d+|roas:\s*\d+/i);
});

test('specialists retain actual registry and chart nodes with visible local navigation, no added network path',()=>{
 const html=missionWorkspacesBody('<div id="financeFixtureProtected"></div>');
 for(const id of ids){
  assert.match(html,new RegExp('id="agent-'+id+'"'));
  assert.match(html,new RegExp('id="mission-'+id+'-top"'));
  assert.match(html,new RegExp('id="mission-'+id+'-metrics"'));
  assert.match(html,new RegExp('href="#mission-'+id+'-tasks"'));
  assert.match(html,new RegExp('href="#mission-'+id+'-tools"'));
  assert.match(html,new RegExp('href="#mission-'+id+'-metrics"'));
  assert.match(html,new RegExp('data-mission-status="'+id+'"'));
 }
 assert.equal((html.match(/id="financeFixtureProtected"/g)||[]).length,1);
 assert.match(html,/href="#businessMonth"/);
 assert.match(html,/id="mission-returns-evidence"/);
 assert.match(html,/id="mission-auditor-evidence"/);
 assert.match(html,/Modo Observador · sem escrita comercial/);
 assert.equal(MISSION_CLIENT.includes('fetch('),false,'no new agent reads');
 assert.equal(MISSION_CLIENT.includes('setInterval('),false);
});

test('Ads pages have shared header and preserve source semantics and action locks',()=>{
 const dashboard=renderAdsWorkspace('/dashboard',{role:'owner',ads:null});
 const campaigns=renderAdsWorkspace('/campaigns',{role:'owner'});
 const automation=renderAdsWorkspace('/optimization',{role:'owner',content:'<div id="operationDiagnostics">Dados em análise</div>'});
 const settings=renderAdsWorkspace('/integrations',{role:'owner',content:'<div id="originalIntegrations">Conexões existentes</div>'});
 for(const html of [dashboard,campaigns,automation,settings]){
  assert.match(html,/MLS_APPROVED_DESIGN_CSS|--mls-finance/);
  assert.match(html,/class="ads-workspace"/);
  assert.ok(html.includes('background:linear-gradient')||html.includes('linear-gradient'));
 }
 assert.match(campaigns,/Somente leitura/);
 assert.match(campaigns,/data-ads-route="campaigns"/);
 assert.match(campaigns,/Product Ads/);
 assert.match(campaigns,/GMV Max/);
 assert.match(automation,/Modo Observador/);
 assert.match(automation,/PROMO continuam bloqueados/);
 assert.match(automation,/id="operationDiagnostics"/);
 assert.match(settings,/id="originalIntegrations"/);
 assert.match(settings,/não libera escrita comercial/);
 assert.doesNotMatch(automation,/data-action="(?:scale|approve|publish)"/);
 assert.ok(ADS_WORKSPACE_CSS.includes('.ads-workspace-metrics'));
});

test('previously validated roadmap, Products and Production reworks remain intact',()=>{
 const html=adminBody();
 const idList=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
 assert.equal(idList.length,new Set(idList).size,'no duplicate owner IDs');
 // adminBody is the source template. Saved catalog and DTF are inserted by the
 // App dashboard composer, so their IDs belong to the compiled-page assertion.
 for(const id of ['overview','commandCenter','roadmap','mlsRoadmapHeading','agents','missionHubTitle',
  'products','legacyProductEditor','hermes','margins','history','missionGlobalSearch'])
  assert.ok(idList.includes(id),'missing preserved panel '+id);
 assert.match(savedCatalogBody(),/Homologação · não publicada/);
 assert.match(dtfBody(),/Conta \+ dispositivo/);
 assert.match(dtfBody(),/SEM PUBLICAÇÃO COMERCIAL/);
 assert.doesNotMatch(DTF_CLIENT,/dtf-flow-step/);
 assert.doesNotMatch(SAVED_CATALOG_CLIENT,/products-hub-card/);
});

for(const minify of [false,true]){
 test('owner deployable bundle applies neon CSS to all verified sections without changing scripts (minify='+minify+')',async()=>{
  const {html}=await compiledOwnerReportPage(minify);
  for(const token of ['--mls-finance','--mls-ads','--mls-products','--mls-production','--mls-returns','--mls-auditor',
   'id="agent-finance"','id="agent-ads"','id="agent-returns"','id="agent-auditor"','id="productsHub"',
   'id="dtfHeroTitle"','id="mlsRoadmapHeading"']){
   assert.ok(html.includes(token),'missing in compiled owner HTML: '+token);
  }
  assert.ok(!html.includes('id="mlsListingFactory"'),'draft V3.6 not shipped in main branch');
  const found=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
  assert.equal(found.length,new Set(found).size,'compiled HTML must maintain unique IDs');
 });
}
