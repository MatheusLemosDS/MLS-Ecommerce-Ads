import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedAdultKitCostCompositions} from '../src/numbered-adult-kit-costs.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {COST_RULE_DEFAULTS,costRuleReferenceFromSnapshot,mergeCatalogCostReference,readCostRuleReference,syncCostRuleCatalog} from '../src/cost-rules.mjs';
import {D1} from './sqlite-d1.mjs';

const stamp=1795262400,now=()=>stamp*1000;
const catalog=(sizes=['P','G1'],name='Kit de duas Camisetas Adultas Unissex')=>({schema:'product_cost_catalog_v1',product_name:name,variants:[{model_id:'0',attributes:[{name:'Tamanho 1',value:sizes[0]},{name:'Tamanho 2',value:sizes[1]}]}]});
const composition=()=>numberedAdultKitCostCompositions('101',catalog());
const automatic=(extra={})=>({revision:1,variants:[],classified_item_ids:['101'],catalog_model_keys:['101:0'],current_catalog_compositions:composition(),...extra});
const frame={status:'AVAILABLE',rows:[{item_id:'101',model_id:'0',quantity:3}]};
const price=(ref=automatic(),values=COST_DEFAULTS,bindings=[])=>productionCostReference(frame,{revision:1,bindings},{revision:1,values},ref);
const bound=(confirmed=true)=>({item_id:'101',model_id:'0',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'G2',female_size:'G3',operator_confirmed:confirmed,...(confirmed?{}:{source:'CATALOG_VARIATION_AXES',catalog_fingerprint:'a'.repeat(64)})});
const snapshot=source=>[{results:[{revision:1,payload:JSON.stringify(COST_RULE_DEFAULTS),updated_at:new Date(stamp*1000).toISOString()}]},{results:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),payload:JSON.stringify(source),checked_at:stamp}]}];

test('numbered adult kit axes yield cost-only pieces without assigning gender, artwork or bindings',()=>{
 const source=catalog(),before=structuredClone(source),value=numberedAdultKitCostCompositions('101',source);
 assert.deepEqual(value,[{item_id:'101',model_id:'0',provenance:'CURRENT_CATALOG_NUMBERED_ADULT_KIT',sizes:['P','G1']}]);assert.deepEqual(source,before);
 assert.doesNotMatch(JSON.stringify(value),/male|female|selling_unit|operator_confirmed|artwork|HISTORICAL/);
 const reversed=catalog();reversed.variants[0].attributes.reverse();assert.deepEqual(numberedAdultKitCostCompositions('101',reversed),value);
 assert.equal(numberedAdultKitCostCompositions('101',catalog(['gg',' g2 '],'Kit 2 Camisetas Adultas')).length,1);
 assert.equal(numberedAdultKitCostCompositions('101',catalog(['M','G'],'2 Camisetas Adultas Estampadas')).length,1);
 assert.equal(numberedAdultKitCostCompositions('101',catalog(['M','G'],'Camiseta Casal Retrô Unissex 100% Algodão P ao G3')).length,1);
});

test('ambiguous piece counts, non-adult clothing and unsupported axes never borrow the two-shirt price',()=>{
 for(const title of ['Kit Camisetas Adultas','Kit 3 Camisetas','Camisetas avulsas','Kit 2 Camisetas Infantil','Kit 2 Camisetas e Calça','Kit 2 Camisetas Pet','Kit 2 Camisetas Bonecas','Kit 3 com 2 Camisetas','2 ou 3 Camisetas','2 Camisetas ou 3 Camisetas','Combo 3 Casal Camisetas','Conjunto 3 Casal Camisetas','Camiseta Casal Família','Camiseta Casal Filho'])assert.deepEqual(numberedAdultKitCostCompositions('101',catalog(['P','M'],title)),[],title);
 for(const names of [['Tamanho','Tamanho 2'],['Tamanho Masculino','Tamanho Feminino'],['Tamanho 1','Tamanho 1'],['Código 1','Código 2']]){const source=catalog();source.variants[0].attributes.forEach((row,index)=>row.name=names[index]);assert.deepEqual(numberedAdultKitCostCompositions('101',source),[]);}
 for(const sizes of [['4','M'],['G4','P'],['HOMEM P','M'],['P/M','G'],['P','']])assert.deepEqual(numberedAdultKitCostCompositions('101',catalog(sizes)),[]);
 const extra=catalog();extra.variants[0].attributes.push({name:'Cor',value:'Azul'});assert.deepEqual(numberedAdultKitCostCompositions('101',extra),[]);
});

test('explicit single and larger quantities override a casal title even with two valid numbered adult axes',()=>{
 const titles=['Combo de seis camisetas casal','Conjunto de dez camisetas casal','Kit de vinte e duas camisetas casal','Combo de doze camisetas casal','Camiseta casal avulsa','Camisetas casal avulsas','Camiseta casal unidade única','Camiseta casal peça única','Camiseta casal unitária','Camiseta casal uma camiseta','Camiseta casal 1 peça','Camiseta casal 3camisetas'];
 for(const title of titles)assert.deepEqual(numberedAdultKitCostCompositions('101',catalog(['P','M'],title)),[],title);
 assert.equal(numberedAdultKitCostCompositions('101',catalog(['P','M'],'Camiseta casal meu único amor')).length,1,'unique design text is not a piece count');
});

test('malformed or accessor-based catalogue inputs fail closed without invoking getters',()=>{
 let gets=0;const poisoned={};Object.defineProperty(poisoned,'variants',{get(){gets++;throw Error('private');}});
 assert.deepEqual(numberedAdultKitCostCompositions('101',poisoned),[]);assert.equal(gets,0);
 for(const item of ['0','-1','101:0',101,null])assert.deepEqual(numberedAdultKitCostCompositions(item,catalog()),[]);
 const source=catalog();source.variants.push(structuredClone(source.variants[0]));assert.deepEqual(numberedAdultKitCostCompositions('101',source),[]);
});

test('current numbered composition prices two adult pieces, including plus sizes, once per sold kit',()=>{
 const ref=price();assert.equal(ref.total_cents,(1590+1890)*3);assert.equal(ref.mapped_quantity,3);assert.equal(ref.unmapped_quantity,0);
 const row=ref.variants[0];assert.equal(row.unit_cost_cents,3480);assert.equal(row.cost_source,'CUSTOM_PROFILE');assert.match(row.cost_profile_label,/Kit de 2 camisetas P\/G1 · catálogo/);assert.equal(Object.hasOwn(row,'catalog_binding'),false);
 const swapped=automatic({current_catalog_compositions:numberedAdultKitCostCompositions('101',catalog(['G1','P']))});assert.equal(price(swapped).total_cents,ref.total_cents);
 const unconfirmed=bound(false),before=structuredClone(unconfirmed);assert.equal(price(automatic(),COST_DEFAULTS,[unconfirmed]).total_cents,ref.total_cents);assert.deepEqual(unconfirmed,before);
});

test('inclusive prices suppress retained components; itemized prices count each piece and each kit exactly once',()=>{
 const components=[{id:'print',label:'Impressão',basis:'per_piece',amount_cents:120},{id:'pack',label:'Embalagem',basis:'per_kit',amount_cents:80}];
 const inclusive={...COST_DEFAULTS,components};assert.equal(price(automatic(),inclusive).variants[0].unit_cost_cents,3480);
 const itemized={...inclusive,mode:'itemized',base_regular_cents:1000,base_plus_cents:1400};assert.equal(price(automatic(),itemized).variants[0].unit_cost_cents,1000+1400+2*120+80);
});

test('manual profile, composition recipe, rule and operator-confirmed binding keep their precedence',()=>{
 const custom={...COST_DEFAULTS,custom_profiles:[{id:'exception',label:'Exceção azul',unit_cost_cents:999}],custom_assignments:[{item_id:'101',model_id:'0',profile_id:'exception'}]};assert.equal(price(automatic(),custom).variants[0].unit_cost_cents,999);
 const recipe={...COST_DEFAULTS,composition_recipes:[{id:'three',label:'Composição conferida',components:[{kind:'ADULT_GARMENT',size:'P',quantity:3}]}],composition_assignments:[{item_id:'101',model_id:'0',recipe_id:'three'}]};assert.equal(price(automatic(),recipe).variants[0].unit_cost_cents,4770);
 assert.equal(price(automatic(),COST_DEFAULTS,[bound()]).variants[0].unit_cost_cents,3780);
 const ruled=automatic({variants:[{item_id:'101',model_id:'0',unit_cost_cents:2150,profile_id:'rule',profile_label:'Regra inteira',reason:null}],restricted_item_ids:['101']});assert.equal(price(ruled).variants[0].unit_cost_cents,2150);
});

test('metadata conflicts and unmatched or disabled manual rules remain pending instead of falling back to numbered sizes',()=>{
 for(const patch of [{metadata_changed_item_ids:['101']},{restricted_item_ids:['101']},{manual_product_item_ids:['101']},{manual_variant_keys:['101:0']},{variants:[{item_id:'101',model_id:'0',unit_cost_cents:null,profile_id:null,profile_label:null,reason:'RULE_CONFLICT'}]}])assert.equal(price(automatic(patch)).total_cents,null,JSON.stringify(patch));
});

test('invalid or duplicated internal cost composition records are rejected before arithmetic',()=>{
 const original=composition()[0];for(const rows of [[{...original,sizes:['P']}],[{...original,sizes:['P','G4']}],[{...original,provenance:'HISTORICAL_ORDER_EVIDENCE'}],[original,original]])assert.throws(()=>price(automatic({current_catalog_compositions:rows})),/PRODUCTION_COST_REFERENCE_INVALID/);
});

test('cost-rule snapshot and classification merge carry current composition without changing the public rule DTO',()=>{
 const ref=costRuleReferenceFromSnapshot(snapshot(catalog()),{now});assert.deepEqual(ref.current_catalog_compositions,composition());assert.equal(Object.keys(ref).includes('current_catalog_compositions'),false);
 const merged=mergeCatalogCostReference(ref,{revision:1,bindings:[],products:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),checked_at:stamp,reason:'AXES_NOT_RECOGNIZED'}],variants:[]});assert.deepEqual(merged.current_catalog_compositions,composition());assert.equal(price(merged).total_cents,10440);
 const changed=mergeCatalogCostReference(ref,{revision:2,bindings:[],products:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),checked_at:stamp,reason:'CATALOG_METADATA_CHANGED'}],variants:[]});assert.equal(price(changed).total_cents,null);
 assert.equal(Object.keys(merged).includes('current_catalog_compositions'),false);
});

test('historical-name-only snapshots do not inherit present catalogue compositions or approve history',()=>{
 const ref=costRuleReferenceFromSnapshot(snapshot(catalog()).slice(0,1),{now});assert.deepEqual(ref.current_catalog_compositions,[]);assert.equal(price(ref).total_cents,null);
});

test('saved unresolved numbered kit catalogues are priced on read without changing gendered classifications',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const source=catalog();
 await syncCostRuleCatalog(env,['101'],async()=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:source}]}),{now});
 const before=env.ADMIN_DB.db.prepare('SELECT payload FROM catalog_classification_variants').all(),beforeJob=env.ADMIN_DB.db.prepare('SELECT reason FROM catalog_classification_jobs WHERE item_id=?').get('101');
 const ref=await readCostRuleReference(env,['101'],{now});assert.equal(price(ref).total_cents,10440);assert.deepEqual(ref.catalog_bindings,[]);assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT payload FROM catalog_classification_variants').all(),before);
 assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT reason FROM catalog_classification_jobs WHERE item_id=?').get('101'),beforeJob);
});
