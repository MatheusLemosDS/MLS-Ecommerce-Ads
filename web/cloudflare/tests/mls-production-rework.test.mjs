import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DTF_CSS,DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {DTF_ENGINE_CLIENT} from '../src/dtf-layout.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const stages=[
 ['dtfQueueStage','01','Fila'],
 ['dtfArtworkStage','02','Artes'],
 ['dtfFilmStage','03','Formato'],
 ['dtfPreviewStage','04','Prévia'],
 ['dtfBatchStage','05','Lotes']
];

test('DTF redesign separates five real steps while retaining queue, artwork, settings, preview and existing batches',()=>{
 const html=dtfBody();
 assert.match(html,/<section id="production" hidden class="dtf-workspace">/);
 assert.match(html,/id="dtfHeroTitle"/);
 assert.match(html,/aria-label="Etapas da produção DTF"/);
 for(const [id,number] of stages){
  assert.match(html,new RegExp('id="'+id+'"'),'stage missing: '+id);
  assert.match(html,new RegExp('href="#'+id+'"'),'stage link missing: '+id);
  assert.match(html,new RegExp(number+' · '));
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.equal((html.match(/class="dtf-flow-step"/g)||[]).length,5);
 for(const name of ['dtfPendingCount','dtfSelectedCount','dtfBatchCount','dtfStatus','dtfSearch',
  'dtfSync','dtfSelectReady','dtfClearSelection','dtfQueue','dtfPrevious','dtfNext',
  'dtfArtFiles','dtfArtStatus','dtfArtList','dtfSettingsForm','dtfFilmWidth','dtfMaxLength',
  'dtfGap','dtfMargin','dtfDpi','dtfRotate','dtfSaveSettings','dtfReloadSettings',
  'dtfPreviewButton','dtfPrepare','dtfPreview','dtfBatches','dtfDownloads']){
  assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1,name+' must exist once');
 }
 assert.match(html,/Conta \+ dispositivo/);
 assert.match(html,/os PNGs da biblioteca ficam neste navegador/);
 assert.match(html,/Conf(erir|erência) antes da exportação/i);
 assert.match(html,/SEM PUBLICAÇÃO COMERCIAL/);
 assert.match(html,/Pedidos cancelados e peças já reservadas não podem ser incluídos novamente/);
 assert.match(html,/não é espelhado/);
 assert.match(html,/mesma reserva/);
 assert.match(html,/Largura útil do filme · cm/);
 assert.match(html,/value="57"/);
 assert.match(html,/Artes salvas neste dispositivo/);
 assert.match(DTF_CSS,/\.dtf-workspace \.dtf-hero/);
 assert.match(DTF_CSS,/@media\(max-width:620px\)/);
 assert.match(DTF_CSS,/prefers-reduced-motion/);
 assert.doesNotMatch(DTF_CLIENT,/\binnerHTML\s*=/);
 assert.doesNotMatch(DTF_CLIENT,/dtf-flow-step|dtfHeroTitle|dtfQueueStage/,'DTF client business logic must remain unaware of visual additions');
 new vm.Script(DTF_CLIENT);
 new vm.Script(DTF_ENGINE_CLIENT);
});

for(const minify of [false,true]){
 test('compiled owner keeps all original DTF and Finance nodes without duplicates, minify='+minify,async()=>{
  const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'owner page duplicates DOM IDs');
  for(const id of ['production','dtfHeroTitle',...stages.map(x=>x[0]),'dtfQueue','dtfBatches','dtfSettingsForm',
   'dtfArtFiles','dtfPrepare','dtfDownloads','businessMonth','savedCatalog','variantCards','missionGlobalSearch']){
   assert.ok(ids.includes(id),id+' must survive compilation');
  }
  assert.ok(html.indexOf('id="production"')<html.indexOf('id="products"'),'DTF must remain independent of Products workspace');
  assert.equal((html.match(/id="dtfHeroTitle"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="mlsListingFactory"/,'V3.6 Listing Factory cannot be implied shipped in main');
 });
}
