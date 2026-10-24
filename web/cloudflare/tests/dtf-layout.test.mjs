import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createDtfEngine,parseDtfSku,normalizeDtfArtKey,validateDtfSettings,planDtfLayout,DTF_ENGINE_CLIENT} from '../src/dtf-layout.mjs';

const settings=()=>({film_width_mm:570,max_length_mm:500,gap_mm:5,margin_mm:5,dpi:300,allow_rotate:false});
const unit=(unit_key='unit-1',sku='vivaosanos80-27',quantity=1,requires_pair=false)=>({unit_key,sku,quantity,requires_pair});
const art=(art_key='vivaosanos80',pixel_width=3300,pixel_height=4400)=>({art_key,sha256:'a'.repeat(64),pixel_width,pixel_height});
const input=(units=[unit()],artworks=[art()],config=settings())=>({settings:config,units,artworks});
const reason=(code)=>error=>error.code===code&&error.message===code&&error.status===400;
const pending=(code)=>error=>reason('DTF_PLAN_PENDING')(error)&&error.issues.some(row=>row.code===code);

test('confirmed 57cm film and vivaosanos80-27 SKU produce a proportional 27cm artwork with a transparent packing footprint',()=>{
 assert.deepEqual(parseDtfSku('vivaosanos80-27'),[{art_key:'vivaosanos80',width_mm:270,copies:1}]);
 const plan=planDtfLayout(input());assert.equal(plan.schema,'dtf_layout_v1');assert.deepEqual(plan.settings,settings());assert.equal(plan.print_count,1);assert.equal(plan.sheets.length,1);assert.equal(plan.sheets[0].width_mm,570);assert.equal(plan.sheets[0].height_mm,370);
 assert.deepEqual(plan.sheets[0].placements,[{unit_key:'unit-1',part_index:0,copy_index:0,art_key:'vivaosanos80',sha256:'a'.repeat(64),width_mm:270,height_mm:360,rotated:false,x_mm:5,y_mm:5}]);
});
test('the final hyphen sets width and exact art names remain distinct instead of being guessed',()=>{
 assert.deepEqual(parseDtfSku('Meu-Desenho-27,5+versão-2-10.5'),[{art_key:'meu-desenho',width_mm:275,copies:1},{art_key:'versão-2',width_mm:105,copies:1}]);
 assert.equal(normalizeDtfArtKey('VIVAOSANOS80.PNG'),'vivaosanos80');assert.equal(normalizeDtfArtKey('Leão.png'),'leão');assert.notEqual(normalizeDtfArtKey('leao.png'),normalizeDtfArtKey('leão.png'));
 for(const key of ['../arquivo.png','pasta/arte.png','pasta\\arte.png','<script>.png','arte+nome.png','.arquivo.png','arte..png'])assert.throws(()=>normalizeDtfArtKey(key),reason('DTF_ART_NAME_INVALID'));
 for(const sku of ['', 'vivaosanos80', 'vivaosanos80-0','vivaosanos80-027','vivaosanos80-27.25','vivaosanos80-27+',' vivaosanos80-27','vivaosanos80-27 ','vivaosanos80-201'])assert.throws(()=>parseDtfSku(sku));
});
test('two copies share the same row with exact spacing; additional copies start fresh bounded sheets',()=>{
 const plan=planDtfLayout(input([unit('order-a','vivaosanos80-27',5)]));assert.equal(plan.print_count,5);assert.equal(plan.sheets.length,3);assert.equal(plan.total_length_mm,1110);
 assert.deepEqual(plan.sheets.map(sheet=>sheet.placements.length),[2,2,1]);assert.deepEqual(plan.sheets[0].placements.map(row=>[row.x_mm,row.y_mm,row.copy_index]),[[5,5,0],[280,5,1]]);
});
test('kit components are explicit and each sold unit receives every part without doubling already complete artwork instructions',()=>{
 assert.throws(()=>planDtfLayout(input([unit('kit','vivaosanos80-27',1,true)])),pending('DTF_KIT_PARTS_REQUIRED'));
 const plan=planDtfLayout(input([unit('kit','vivaosanos80-27+vivaosanos80-25',2,true)]));assert.equal(plan.print_count,4);assert.deepEqual(plan.sheets.flatMap(sheet=>sheet.placements).map(row=>[row.part_index,row.copy_index]).sort(),[[0,0],[0,1],[1,0],[1,1]]);
 assert.deepEqual(parseDtfSku('sem-estampa'),[]);assert.deepEqual(parseDtfSku('SEM ESTAMPA'),[]);
 assert.throws(()=>planDtfLayout(input([unit('none','sem-estampa',2,true)])),reason('DTF_NO_PRINTS'));
 assert.equal(planDtfLayout(input([unit('none','sem-estampa'),unit('print')])).print_count,1);
});
test('missing artwork, insufficient native resolution and sizes that cannot fit remain explicit blocking issues',()=>{
 assert.throws(()=>planDtfLayout(input([unit()],[])),pending('DTF_ART_NOT_FOUND'));
 assert.throws(()=>planDtfLayout(input([unit()],[art('vivaosanos80',1500,2000)])),pending('DTF_ART_RESOLUTION_LOW'));
 assert.throws(()=>planDtfLayout(input([unit('wide','vivaosanos80-60')],[art('vivaosanos80',7200,4200)])),pending('DTF_ART_TOO_WIDE'));
 assert.throws(()=>planDtfLayout(input([unit()],[art('vivaosanos80',3300,15000)])),pending('DTF_ART_TOO_TALL'));
 // Rounding the bounding box upward must not lower the artwork's true DPI.
 const plan=planDtfLayout(input([unit()],[art('vivaosanos80',3189,3987)]));assert.equal(plan.sheets[0].placements[0].height_mm,338);
});
test('rotation is opt-in and its reported dimensions are the final placement footprint',()=>{
 const config={...settings(),max_length_mm:700},source=input([unit('rotate','vivaosanos80-60')],[art('vivaosanos80',7100,4700)],config);
 assert.throws(()=>planDtfLayout(source),pending('DTF_ART_TOO_WIDE'));source.settings.allow_rotate=true;
 const plan=planDtfLayout(source),placement=plan.sheets[0].placements[0];assert.equal(placement.rotated,true);assert.equal(placement.width_mm,398);assert.equal(placement.height_mm,600);assert.equal(plan.sheets[0].height_mm,610);
});
test('every packed placement stays inside its sheet and other footprints with the configured gap, including mixed rotations',()=>{
 const config={...settings(),allow_rotate:true},units=Array.from({length:18},(_,index)=>unit('order-'+String(index).padStart(2,'0'),'vivaosanos80-'+(10+index%5*3),1));
 const first=planDtfLayout(input(units,[art()],config)),again=planDtfLayout(input([...units].reverse(),[art()],config));assert.deepEqual(first,again);
 for(const sheet of first.sheets){
  assert.ok(Math.ceil(sheet.width_mm*config.dpi/25.4)*Math.ceil(sheet.height_mm*config.dpi/25.4)<=50000000);
  for(let i=0;i<sheet.placements.length;i++){const a=sheet.placements[i];assert.ok(a.x_mm>=config.margin_mm&&a.y_mm>=config.margin_mm);assert.ok(a.x_mm+a.width_mm<=sheet.width_mm-config.margin_mm&&a.y_mm+a.height_mm<=sheet.height_mm-config.margin_mm);
   for(const b of sheet.placements.slice(i+1)){assert.ok(a.x_mm+a.width_mm+config.gap_mm<=b.x_mm||b.x_mm+b.width_mm+config.gap_mm<=a.x_mm||a.y_mm+a.height_mm+config.gap_mm<=b.y_mm||b.y_mm+b.height_mm+config.gap_mm<=a.y_mm);}
  }
 }
});
test('bounds prevent oversized print runs, duplicate unit identities, duplicate assets and unsafe settings without mutating input',()=>{
 assert.throws(()=>planDtfLayout(input([unit('many','vivaosanos80-27',301)])),pending('DTF_PRINT_LIMIT'));
 assert.throws(()=>planDtfLayout(input([unit(),unit()])),reason('DTF_UNIT_INVALID'));
 assert.throws(()=>planDtfLayout(input([unit()],[art(),art()])),reason('DTF_ARTWORK_INVALID'));
 assert.throws(()=>planDtfLayout(input([unit()],[{...art(),pixel_width:32768}])),reason('DTF_ARTWORK_INVALID'));
 for(const patch of [{film_width_mm:0},{film_width_mm:570.1},{gap_mm:-1},{margin_mm:60},{dpi:72},{allow_rotate:1},{extra:1}])assert.throws(()=>validateDtfSettings({...settings(),...patch}),reason('DTF_SETTINGS_INVALID'));
 const original=input(),before=structuredClone(original);planDtfLayout(original);assert.deepEqual(original,before);
});
test('strict object and array projection rejects accessors before they can execute',()=>{
 let reads=0;const config=settings();Object.defineProperty(config,'dpi',{get(){reads++;return 300;},enumerable:true});assert.throws(()=>validateDtfSettings(config),reason('DTF_SETTINGS_INVALID'));
 const values=[unit()];Object.defineProperty(values,'0',{get(){reads++;return unit();},enumerable:true});assert.throws(()=>planDtfLayout(input(values)),reason('DTF_PLAN_INVALID'));assert.equal(reads,0);
});
test('the self-contained browser engine produces exactly the private server plan without private globals',()=>{
 const context=vm.createContext({});new vm.Script(DTF_ENGINE_CLIENT).runInContext(context);
 context.payload=JSON.stringify(input([unit('order-2','vivaosanos80-27',2)]));const result=new vm.Script('brazaDtfEngine.plan(JSON.parse(payload))').runInContext(context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),createDtfEngine().plan(JSON.parse(context.payload)));
});
for(const minify of [false,true])test('the deployed browser engine retains its complete closure after bundling (minify='+minify+')',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/dtf-layout.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const emitted=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const context=vm.createContext({});new vm.Script(emitted.DTF_ENGINE_CLIENT).runInContext(context);context.payload=JSON.stringify(input([unit('bundle','vivaosanos80-27',2)]));
 const result=new vm.Script('brazaDtfEngine.plan(JSON.parse(payload))').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(result)),planDtfLayout(JSON.parse(context.payload)));
});
