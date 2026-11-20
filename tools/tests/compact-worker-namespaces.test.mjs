import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {compactWorkerNamespaces,compactWorkerBrowserFactories} from '../compact_worker_namespaces.mjs';
import {createCashStatementImportParser} from '../../web/finance/src/cash-statement-import.mjs';
import {createExternalCashProtocol} from '../../web/finance/src/external-cash-frame.mjs';
import {bankReconciliationBody,createBankReconciliationController} from '../../web/cloudflare/src/bank-reconciliation-view.mjs';
import {DTF_ENGINE_CLIENT} from '../../web/cloudflare/src/dtf-layout.mjs';
import {MLS_BROWSER_ASSET_MANIFEST} from '../../web/cloudflare/src/browser-assets-manifest.mjs';
import {cashRead,cashPreview,cashImport,cashWorkspace,cashPreviewFrame,cashImportFrame} from '../../web/finance/tests/external-cash-fixture.mjs';

const schema='worker_server_namespaces_v1';
const fixture=name=>{
 const browser='const content = "  keep spaces  ";\n// keep this browser comment\nconst template = `value`;';
 return {name,source:'const '+name+' = (() => {\nfunction retainedName(value){\n // ordinary host comment\n return value + 1;\n}\nconst browser = '+JSON.stringify(browser)+';\nreturn {retainedName,browser};\n})();\nconst {retainedName,browser}='+name+';\n'};
};
const evaluate=(source,names)=>vm.runInThisContext('(()=>{\n"use strict";\n'+source+'\nreturn {'+names.join(',')+'};\n})()');

test('namespace whitespace compaction preserves strings, exported names and executable functions',()=>{
 const row=fixture('fixture$Namespace'),result=compactWorkerNamespaces({schema,namespaces:[row]});
 assert.equal(result.schema,schema);assert.equal(result.namespaces[0].name,row.name);
 const compact=result.namespaces[0].source,raw=evaluate(row.source,[row.name])[row.name],actual=evaluate(compact,[row.name])[row.name];
 assert.deepEqual(Object.keys(actual),Object.keys(raw));assert.equal(actual.browser,raw.browser);
 assert.equal(actual.retainedName.name,'retainedName');assert.equal(actual.retainedName.length,raw.retainedName.length);assert.equal(actual.retainedName(41),42);
 assert.match(actual.browser,/keep spaces/);assert.match(actual.browser,/keep this browser comment/);assert.doesNotMatch(compact,/ordinary host comment/);
 assert.ok(Buffer.byteLength(compact)<Buffer.byteLength(row.source));
});

test('compaction rejects malformed, duplicate and dynamic browser interpolation inputs',()=>{
 const row=fixture('fixtureNamespace');
 for(const input of [null,{}, {schema,namespaces:[]},{schema,namespaces:[row],extra:true},{schema,namespaces:[row,row]},{schema,namespaces:[{...row,extra:true}]},{schema,namespaces:[{...row,name:'invalid-name'}]},{schema,namespaces:[{...row,source:''}]}])assert.throws(()=>compactWorkerNamespaces(input));
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source+'\nconst client = String.raw`function f(){${retainedName.toString()}}`;'}]}),/DYNAMIC_CLIENT_SOURCE/);
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source.replace('}=fixtureNamespace;','}=differentNamespace;')}]}),/BOUNDARY_INVALID/);
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source+'\n'}]}),/BOUNDARY_INVALID/);
});

test('fragment formatting retains ES module strict semantics for block-scoped functions',()=>{
 const name='strictNamespace',source='const strictNamespace = (() => {\nfunction check(flag){\n if(flag){function hidden(){return 1;}}\n return typeof hidden;\n}\nreturn {check};\n})();\nconst {check}=strictNamespace;\n';
 const actual=compactWorkerNamespaces({schema,namespaces:[{name,source}]}).namespaces[0].source;
 const before=evaluate(source,[name])[name],after=evaluate(actual,[name])[name];
 assert.equal(before.check(true),'undefined');assert.equal(after.check(true),before.check(true));assert.equal(after.check(false),before.check(false));
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{name,source:source.replace('function check(flag)','function check(flag,flag)')}]}),/multiple times in the same parameter list/i,'strict-invalid parameter lists must not be accepted as sloppy scripts');
});

const browserFactoryRows=[createCashStatementImportParser,createExternalCashProtocol,createBankReconciliationController].map(factory=>({name:factory.name,source:factory.toString()}));
const compactBrowserFactories=compactWorkerBrowserFactories({schema:'worker_browser_factories_v1',factories:browserFactoryRows}).factories;
const factoryProfiles=[browserFactoryRows,compactBrowserFactories].map(rows=>Object.fromEntries(rows.map(row=>[row.name,vm.runInThisContext('('+row.source+')')])));

test('only the three new browser factories shorten local names and remain self contained',()=>{
 const [before,after]=factoryProfiles;
 for(const row of browserFactoryRows){assert.equal(after[row.name].name,before[row.name].name);assert.equal(after[row.name].length,before[row.name].length);}
 const saved=browserFactoryRows.reduce((sum,row,index)=>sum+Buffer.byteLength(row.source)-Buffer.byteLength(compactBrowserFactories[index].source),0);
 assert.ok(saved>=12000,'new browser factory formatting must save at least12KB; actual '+saved);
 const row=browserFactoryRows[0],schema='worker_browser_factories_v1';
 for(const input of [null,{}, {schema,factories:[]},{schema,factories:[row],extra:true},{schema,factories:[row,row]},{schema,factories:[{...row,name:'createLegacyBrowserFactory'}]},{schema,factories:[{...row,source:'const other=1;'}]}])assert.throws(()=>compactWorkerBrowserFactories(input));
});

test('normal and compact browser parser/protocol factories retain canonical and rejected DTOs',()=>{
 const parsers=factoryProfiles.map(profile=>profile.createCashStatementImportParser()),protocols=factoryProfiles.map(profile=>profile.createExternalCashProtocol());
 assert.deepEqual(Object.keys(parsers[1]),Object.keys(parsers[0]));assert.deepEqual(parsers[1].CASH_STATEMENT_IMPORT_LIMITS,parsers[0].CASH_STATEMENT_IMPORT_LIMITS);
 assert.equal(Object.isFrozen(parsers[1]),Object.isFrozen(parsers[0]));assert.equal(Object.isFrozen(parsers[1].CASH_STATEMENT_IMPORT_LIMITS),Object.isFrozen(parsers[0].CASH_STATEMENT_IMPORT_LIMITS));
 const options={format:'nubank_csv',separator:',',currency:'BRL',date_format:'DMY',amount_format:'DECIMAL'};
 for(const text of ['Data,Valor,Identificador,Descrição\n10/11/2026,125.90,synthetic-credit,Crédito\n11/11/2026,-4.01,synthetic-debit,Pagamento','Data,Valor,Identificador,Descrição\n10/11/2026,0,synthetic-zero,Zero','Data,Valor,Identificador,Descrição\n31/02/2026,1.00,synthetic-invalid,Data','Data,Valor,Identificador,Descrição\n10/11/2026,"unfinished']){
  assert.deepEqual(parsers[1].parseCashStatement(text,options),parsers[0].parseCashStatement(text,options));
  assert.deepEqual(parsers[1].inspectCashStatement(text,{separator:','}),parsers[0].inspectCashStatement(text,{separator:','}));
 }
 assert.deepEqual(Object.keys(protocols[1]),Object.keys(protocols[0]));
 for(const request of [cashRead(),cashPreview(),cashImport(),{...cashRead(),actor:'FORBIDDEN'},{...cashImport(),confirmed:false},null])assert.deepEqual(protocols[1].projectExternalCashRequest(request),protocols[0].projectExternalCashRequest(request));
 for(const frame of [cashWorkspace(),cashPreviewFrame(),cashImportFrame(),{...cashWorkspace(),schema:'external_cash_workspace_v2'},null])assert.deepEqual(protocols[1].projectExternalCashResponse(frame),protocols[0].projectExternalCashResponse(frame));
 for(const [request,frame] of [[cashRead(),cashWorkspace()],[cashPreview(),cashPreviewFrame()],[cashImport(),cashImportFrame()],[cashRead(),cashImportFrame()]])assert.equal(protocols[1].externalCashResponseMatches(request,frame),protocols[0].externalCashResponseMatches(request,frame));
 for(const status of ['Concluído','Completed','Pending',null])assert.equal(protocols[1].isExternalCashCompletedStatus(status),protocols[0].isExternalCashCompletedStatus(status));
 for(const [a,b] of [[parsers[0],parsers[1]],[protocols[0],protocols[1]]])for(const key of Object.keys(a))if(typeof a[key]==='function')assert.equal(b[key].length,a[key].length,key+' arity');
});

test('normal and compact browser controllers retain lazy reads, lifecycle API and visible states',async()=>{
 async function lifecycle(profile){
  const controls=new Map(),makeNode=()=>({textContent:'',value:'',checked:false,hidden:false,disabled:false,children:[],files:[],append(...rows){this.children.push(...rows);},replaceChildren(...rows){this.children=rows;this.textContent='';},querySelectorAll(){return [];},setAttribute(){},focus(){},scrollIntoView(){}});
  for(const match of bankReconciliationBody().matchAll(/\bid="([^"]+)"/g))controls.set(match[1],makeNode());
  const el=name=>controls.get('bankReconciliation'+name),document={hidden:false,documentElement:{dataset:{activePanel:'agent-finance'}},getElementById:id=>controls.get(id),createElement:makeNode};
  const controller=profile.createBankReconciliationController(profile.createCashStatementImportParser(),profile.createExternalCashProtocol(),{document,crypto:globalThis.crypto}),calls=[];
  assert.equal(Object.isFrozen(controller),true);assert.deepEqual(Object.keys(controller),['prepare','start','stop','observe','open']);
  const arities=Object.fromEntries(Object.entries(controller).map(([key,value])=>[key,value.length]));
  assert.equal(controller.prepare(),true);assert.equal(controller.prepare(),false);
  assert.equal(await controller.start({api:async path=>{calls.push(path);return cashWorkspace();},month:'2026-11'}),true);assert.equal(calls.length,0);
  controller.open();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
  assert.equal(await controller.observe('2026-10'),true);assert.equal(calls.length,2);
  const status=el('Status').textContent;controller.stop();
  return {arities,calls,status,stopped:el('Status').textContent,importDisabled:el('Import').disabled,draftHidden:el('Draft').hidden};
 }
 assert.deepEqual(await lifecycle(factoryProfiles[1]),await lifecycle(factoryProfiles[0]));
});

// Execute only the pure namespace builders, never build.py's artifact writes.
// This exercises the real Python→Node integration while retaining every
// original namespace for byte comparisons of the evaluated browser strings.
const probe=String.raw`
import ast,json,re,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);source=(root/'build.py').read_text();tree=ast.parse(source)
scope={'root':root,'re':re,'json':json,'subprocess':subprocess,'server_namespace_sources':[],'browser_asset_sources':[]}
for name in ['freeze_client_helpers','source_namespace','compact_server_namespaces']:
    node=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name==name)
    exec(ast.get_source_segment(source,node),scope)
rows=[];names=[]
for node in tree.body:
    if isinstance(node,ast.Assign) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='source_namespace':
        call=node.value;args=[ast.literal_eval(arg) for arg in call.args];kwargs={key.arg:ast.literal_eval(key.value) for key in call.keywords}
        value=scope['source_namespace'](*args,**kwargs)
        rows.append(value);names.append(args[1])
        scope[node.targets[0].id]=value
# Read the build's explicit manual selection. Evaluate only those pure source
# assignments and the three-file Hermes assembly, never the App/artifact build.
manual_node=next(node for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='reviewed_manual_namespace_sources' for target in node.targets))
manual_vars=set()
for row in manual_node.value.elts:
    assert isinstance(row,ast.Dict) and [ast.literal_eval(key) for key in row.keys]==['name','source']
    assert isinstance(row.values[1],ast.Name)
    manual_vars.add(row.values[1].id)
pure_dependencies={'business_tax','dtf_layout','dtf_engine_browser_source','dtf_engine_marker'}
for node in tree.body:
    if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in manual_vars|pure_dependencies:
        exec(ast.get_source_segment(source,node),scope)
    elif isinstance(node,ast.For) and isinstance(node.iter,ast.List) and ast.literal_eval(node.iter)==['business-month-summary.mjs','account-diagnosis.mjs','hermes-financial-context.mjs']:
        exec(ast.get_source_segment(source,node),scope)
exec(ast.get_source_segment(source,manual_node),scope)
manual=scope['reviewed_manual_namespace_sources'];manual_names=[row['name'] for row in manual]
sentinel='\nconst brazaAdmin = (() => {\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n'
source_raw='\n'.join(rows);source_compact=scope['compact_server_namespaces'](source_raw+sentinel)[:-len(sentinel)]
# The DTF host remains an unchanged dependency of ProductionDtf. Capture its
# original browser source before the explicit external-asset stub, as the real
# builder does; no artifact writes or arbitrary assignments are executed here.
raw='\n'.join([source_raw,scope['dtf_layout'],*(row['source'] for row in manual)])
compact=scope['compact_server_namespaces'](raw+sentinel,manual)
assert compact.endswith(sentinel),'Admin seam must remain byte exact'
assert sentinel in compact
rejected={}
for key,value in [('missing',raw.replace(scope['server_namespace_sources'][0]['source'],'',1)),('duplicate',raw+scope['server_namespace_sources'][0]['source']),('manual_missing',raw.replace(manual[0]['source'],'',1)),('manual_duplicate',raw+manual[0]['source'])]:
    try:scope['compact_server_namespaces'](value,manual)
    except ValueError:rejected[key]=True
    else:rejected[key]=False
try:scope['compact_server_namespaces'](raw,[*manual,manual[0]])
except ValueError:rejected['manual_name_duplicate']=True
else:rejected['manual_name_duplicate']=False
compact=compact[:-len(sentinel)]
manual_saved=(len(raw.encode())-len(compact.encode()))-(len(source_raw.encode())-len(source_compact.encode()))
print(json.dumps({'raw':raw,'compact':compact,'engine_browser_source':scope['dtf_engine_browser_source'],'names':[*names,'brazaDtfLayout',*manual_names],'manual_names':manual_names,'manual_saved':manual_saved,'selected':[row['name'] for row in [*scope['server_namespace_sources'],*manual]],'rejected':rejected}))
`;
const result=spawnSync('python3',['-B','-c',probe,fileURLToPath(new URL('../../web/cloudflare/',import.meta.url))],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:30000});
assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stderr);
const profiles=JSON.parse(result.stdout),raw=evaluate(profiles.raw,profiles.names),compact=evaluate(profiles.compact,profiles.names);

test('the real build preserves every namespace API and all evaluated client/CSS strings',()=>{
 let strings=0,functions=0;
 assert.deepEqual(Object.keys(compact),Object.keys(raw));
 for(const name of profiles.names){
  const before=raw[name],after=compact[name];assert.deepEqual(Object.keys(after),Object.keys(before),name);
  for(const key of Object.keys(before)){
   assert.equal(typeof after[key],typeof before[key],name+'.'+key);
   if(typeof before[key]==='function'){
    functions++;assert.equal(after[key].name,before[key].name,name+'.'+key+' name');assert.equal(after[key].length,before[key].length,name+'.'+key+' arity');
   }else{
    if(typeof before[key]==='string')strings++;
    assert.equal(JSON.stringify(after[key]),JSON.stringify(before[key]),name+'.'+key+' value');
    if(before[key]&&typeof before[key]==='object')assert.equal(Object.isFrozen(after[key]),Object.isFrozen(before[key]),name+'.'+key+' frozen');
   }
  }
 }
 assert.ok(strings>=35,'frozen browser scripts/CSS and constants are compared');assert.ok(functions>=150,'the complete exported host API stays available');
});

test('real markup renderers retain exact HTML and dynamic client namespaces are excluded',()=>{
 for(const [name,key,args] of [
  ['mlsAppReleaseView','releaseOverviewBody',[]],['mlsAppReleaseView','releaseNotesBody',[]],
  ['mlsProductionCostPeriodsView','productionCostPeriodsBody',[]],
  ['mlsIncurredProductionView','incurredProductionBody',[]],['mlsProductionWeeklyView','productionWeeklyClosingBody',[]],
  ['mlsProductionCoverageView','productionCoverageBody',[]],['mlsProductionDailyFinanceView','productionDailyFinanceBody',[]],
  ['mlsProductionWorkspaceView','productionWorkspaceBody',[{daily:'daily-fixture',weekly:'weekly-fixture',coverage:'coverage-fixture',reference:'reference-fixture'}]],
 ])assert.equal(compact[name][key](...args),raw[name][key](...args),key+' markup');
 for(const excluded of ['brazaBusinessDayView','mlsMissionView','brazaDtfLayout','brazaDtfView','brazaAdmin','mlsAiSalesView','MlsAiSalesCore','mlsAiSalesWorkspaceStore'])assert.ok(!profiles.selected.includes(excluded),excluded+' must retain original host formatting');
 assert.equal(compact.brazaDtfLayout.DTF_ENGINE_CLIENT,raw.brazaDtfLayout.DTF_ENGINE_CLIENT,'concatenated Function#toString browser source stays byte exact');
 assert.equal(raw.brazaDtfLayout.DTF_ENGINE_CLIENT,'','the host no longer duplicates the external engine client');
 const browser=evaluate(profiles.engine_browser_source,['DTF_ENGINE_CLIENT']).DTF_ENGINE_CLIENT;assert.equal(browser,DTF_ENGINE_CLIENT,'the pure build probe captures the original browser generator before the host stub');
 const asset=MLS_BROWSER_ASSET_MANIFEST.assets.find(row=>row.id==='dtf');assert.ok(asset);const bytes=readFileSync(new URL('../../dist/browser-assets/'+asset.path.slice(1),import.meta.url),'utf8'),emitted=browser.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,value=>'\\u'+value.charCodeAt(0).toString(16).padStart(4,'0'));assert.equal(bytes.split('\n/* MLS_DTF_ENGINE_END */\n')[0],emitted,'external distribution preserves the complete original engine bytes');
 assert.deepEqual(profiles.rejected,{missing:true,duplicate:true,manual_missing:true,manual_duplicate:true,manual_name_duplicate:true});
 const saved=Buffer.byteLength(profiles.raw)-Buffer.byteLength(profiles.compact);
 assert.ok(saved>=25000,'host-only compaction must save at least25KB; actual '+saved);
});

test('the explicit manual host selection preserves APIs, schema strings and frozen values with additional headroom',()=>{
 const additions=['brazaDatedCostEvidence','brazaDatedCostCandidates','brazaBusinessHistoryContinuation'];
 assert.deepEqual(profiles.manual_names.filter(name=>!additions.includes(name)),[
  'brazaBusinessSync','brazaBusinessHistorySync','brazaBusinessProducts','brazaCostRuleLearning','brazaSavedCatalogMedia',
  'brazaCatalogClassification','brazaHistoricalCostEvidence','brazaHistoricalCostOrchestration','brazaCostRulesStore','brazaProductionDtfStore',
  'brazaBusinessCheckpoint','brazaBusinessMonth','brazaHermesFinancialContext','brazaRecordedBusinessBalance','brazaBackgroundCollectionDiagnostics',
  'brazaBusinessCostDiagnostics','brazaOperatorCostCorrections','brazaSavedOrderItems','brazaProductRegistry','brazaProductionCostPeriods',
  'brazaFinancePreviewFrame','brazaVariantCatalogFrame','brazaHistoricalVariantFrame','brazaHistoricalVariantAdapter','brazaDailyOrdersFrame',
  'brazaStorePeriodFrame','brazaBusinessPeriodFrame','brazaProductIndexFrame','brazaFinanceBusinessVariants','brazaProductionOrdersFrame',
  'brazaAdsMeasurement','brazaAdsCalendar','brazaWorkspaceAuth',
 ]);
 assert.deepEqual(profiles.manual_names.filter(name=>additions.includes(name)),additions);assert.equal(profiles.manual_names.indexOf(additions[0]),profiles.manual_names.indexOf('brazaHistoricalCostEvidence')+1);
 const addedExports={brazaBusinessHistorySync:['BUSINESS_HISTORY_SYNC_FAIRNESS_SCHEMA'],brazaHistoricalCostEvidence:['deriveHistoricalCompositionConsensus'],brazaHistoricalCostOrchestration:['runDatedCostHistory'],brazaProductionDtfStore:['readProductionDtfBatches','readProductionDtfBatch'],brazaProductRegistry:['PRODUCT_REGISTRY_DIAGNOSTIC_SCHEMA'],brazaProductIndexFrame:['financeProductIndexDiagnostic','projectProductIndexDiagnostic']};
 for(const[name,keys]of Object.entries(addedExports))for(const key of keys)assert.ok(Object.hasOwn(raw[name],key),'reviewed additive host export '+name+'.'+key);
 const sourceRecovery=raw.brazaBusinessMonthSourceRecovery.BUSINESS_MONTH_SOURCE_RECOVERY_SCHEMA,cohortRecovery=raw.brazaBusinessMonthCohortSourceRecovery.BUSINESS_MONTH_COHORT_SOURCE_RECOVERY_SCHEMA,fairness=raw.brazaBusinessHistorySync.BUSINESS_HISTORY_SYNC_FAIRNESS_SCHEMA;for(const schema of [sourceRecovery,cohortRecovery,fairness])assert.equal(schema.length,1);
 assert.deepEqual(raw.brazaBusinessMonth.BUSINESS_MONTH_SCHEMA.filter(sql=>[...sourceRecovery,...cohortRecovery].includes(sql)),[...sourceRecovery,...cohortRecovery]);assert.deepEqual(raw.brazaBusinessHistorySync.BUSINESS_HISTORY_SYNC_SCHEMA.filter(sql=>fairness.includes(sql)),fairness);
 const legacyValue=(name,key,value)=>name==='brazaBusinessMonth'&&key==='BUSINESS_MONTH_SCHEMA'?value.filter(sql=>![...sourceRecovery,...cohortRecovery].includes(sql)):name==='brazaBusinessHistorySync'&&key==='BUSINESS_HISTORY_SYNC_SCHEMA'?value.filter(sql=>!fairness.includes(sql)):value;
 let functions=0,values=0,strings=0;
 const countStrings=value=>typeof value==='string'?1:Array.isArray(value)?value.reduce((sum,item)=>sum+countStrings(item),0):value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+countStrings(item),0):0;
 for(const name of profiles.manual_names){
  const before=raw[name],after=compact[name];assert.deepEqual(Object.keys(after),Object.keys(before),name+' exports');
  for(const key of Object.keys(before)){
   assert.equal(typeof after[key],typeof before[key],name+'.'+key+' type');
   const legacy=!additions.includes(name)&&!addedExports[name]?.includes(key);
   if(typeof before[key]==='function'){
    if(legacy)functions++;assert.equal(after[key].name,before[key].name,name+'.'+key+' name');assert.equal(after[key].length,before[key].length,name+'.'+key+' arity');
   }else{
    if(legacy){values++;strings+=countStrings(legacyValue(name,key,before[key]));}
    assert.equal(JSON.stringify(after[key]),JSON.stringify(before[key]),name+'.'+key+' value');
    if(before[key]&&typeof before[key]==='object')assert.equal(Object.isFrozen(after[key]),Object.isFrozen(before[key]),name+'.'+key+' frozen');
   }
  }
 }
 // The weekly SELECT-only reader reuses the existing monthly calculation via
 // this newly exposed helper; every prior export stays in the exact profile.
 assert.equal(typeof raw.brazaBusinessMonth.businessMonthBundle,'function');
 assert.equal(raw.brazaBusinessMonth.businessMonthBundle.length,5);
 assert.equal(typeof raw.brazaCostRulesStore.costRuleSchemaForEnvironment,'function');
 assert.equal(raw.brazaCostRulesStore.costRuleSchemaForEnvironment.length,1);
 assert.equal(functions,136);assert.equal(values,17);assert.equal(strings,121);
 assert.ok(profiles.manual_saved>=48394,'additional manual formatting must save at least48394 bytes; actual '+profiles.manual_saved);
});

test('reviewed financial and pure-host compaction preserves exports and frozen browser bytes',()=>{
 for(const name of ['mlsFinancialEventLedger','mlsFinancialInventoryBridge','brazaBusinessMonth','mlsReturnManufacturingLinksStore','brazaBusinessVariantAttribution']){
  const row=fixture(name),result=compactWorkerNamespaces({schema,namespaces:[row]}).namespaces[0];
  const execute=source=>new vm.Script(source+'\nJSON.stringify({value:retainedName(41),browser})').runInNewContext();
  assert.equal(execute(result.source),execute(row.source));assert.ok(result.source.endsWith('\nconst {retainedName,browser}='+name+';\n'));
  assert.equal(result.name,name);
 }
});
