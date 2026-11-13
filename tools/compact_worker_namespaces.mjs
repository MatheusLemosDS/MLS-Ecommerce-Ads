import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const schema='worker_server_namespaces_v1';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const browserSchema='worker_browser_factories_v1';
const browserFactoryNames=new Set(['createCashStatementImportParser','createExternalCashProtocol','createBankReconciliationController']);
// These new server-only namespaces have no Function#toString consumers.
// Preserve their public property names and the outer destructuring boundary;
// shorten only private implementation names to fit the unchanged Worker cap.
const financialHostNamespaces=new Set(['mlsFinancialSourceCapabilities','mlsFinancialSourceFrame','mlsFinancialAllocationFrame','mlsFinancialObligationFrame','mlsFinancialPrivateProtocol','mlsAppFinancialAutomation','mlsFinancialEventLedger','mlsFinancialEventStore','mlsFinancialAccountingSchedule','mlsFinancialAccountingPolicy','mlsFinancialAccountingProjection','mlsFinancialCloseStore','mlsFinancialAutomationStore','mlsFinancialAutomationBridge','mlsFinancialReturnsTracker','mlsFinancialInventoryBridge','mlsFinancialAutomationService','mlsFinancialAutomationJobs','mlsFinancialAutomationAdsSources','mlsFinancialAutomationCashSources','mlsFinancialObligationAppSource','mlsFinancialAutomationSources','mlsFinancialAutomationView']);
// The builders already freeze every browser consumer of these pure host
// models. Their exported names and frozen browser strings remain unchanged.
const compactHostModels=new Set(['brazaBusinessMonth','brazaHermesFinancialContext','brazaHistoricalCostEvidence','brazaBusinessCostDiagnostics','brazaCatalogClassification','brazaBusinessReconciliation','brazaBusinessFinancialCloseout','brazaHistoricalCostOrchestration','mlsReturnManufacturingLinksStore','brazaBusinessVariantAttribution']);

// Only these new, self-contained browser factories may shorten local names.
// Legacy client values and every server namespace retain their existing profile.
export function compactWorkerBrowserFactories(input){
 if(!exact(input,['schema','factories'])||input.schema!==browserSchema||!Array.isArray(input.factories)||!input.factories.length||input.factories.length>browserFactoryNames.size)throw Error('WORKER_BROWSER_FACTORY_INPUT_INVALID');
 const seen=new Set();
 return {schema:browserSchema,factories:input.factories.map(row=>{
  if(!exact(row,['name','source'])||!browserFactoryNames.has(row.name)||seen.has(row.name)||typeof row.source!=='string'||Buffer.byteLength(row.source)>1048576||!row.source.startsWith('function '+row.name+'('))throw Error('WORKER_BROWSER_FACTORY_ROW_INVALID');
  seen.add(row.name);
  const result=transformSync('export '+row.source,{loader:'js',target:'esnext',charset:'utf8',legalComments:'inline',treeShaking:false,minifyWhitespace:true,minifySyntax:false,minifyIdentifiers:true,sourcefile:row.name+'.mjs'});
  if(result.warnings.length||!result.code.startsWith('export function '+row.name+'('))throw Error('WORKER_BROWSER_FACTORY_COMPACTION_INVALID');
  return {name:row.name,source:result.code.slice('export '.length).trimEnd()};
 })};
}

// Compact host JavaScript formatting with syntax optimization, identifier
// minification and dead-code removal disabled. Exported names/arities and all
// string values (including frozen browser helpers) have build-profile checks.
// Modules with dynamic Function#toString interpolation are rejected: their
// client output would otherwise depend on host function formatting.
export function compactWorkerNamespaces(input){
 if(!exact(input,['schema','namespaces'])||input.schema!==schema||!Array.isArray(input.namespaces)||!input.namespaces.length||input.namespaces.length>128)throw Error('WORKER_NAMESPACE_INPUT_INVALID');
 const seen=new Set();
 return {schema,namespaces:input.namespaces.map(row=>{
  if(!exact(row,['name','source'])||typeof row.name!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(row.name)||seen.has(row.name)||typeof row.source!=='string'||!row.source.length||Buffer.byteLength(row.source)>1048576)throw Error('WORKER_NAMESPACE_ROW_INVALID');
  if(/\$\{[^{}\n]*\.toString\(\)/.test(row.source))throw Error('WORKER_NAMESPACE_DYNAMIC_CLIENT_SOURCE');
  seen.add(row.name);
  // Keep the outer destructuring outside the formatter. Otherwise esbuild
  // disambiguates same-named inner bindings despite minifyIdentifiers:false.
  const boundary=row.source.lastIndexOf('\nconst {'),tail=row.source.slice(boundary),match=/^\nconst \{[A-Za-z0-9_$,]+\}=([A-Za-z_$][A-Za-z0-9_$]*);\n$/.exec(tail);
  if(boundary<0||match?.[1]!==row.name)throw Error('WORKER_NAMESPACE_BOUNDARY_INVALID');
  // A generated Worker is an ES module and therefore strict. A fragment has
  // no import/export syntax, so explicitly preserve that parse context rather
  // than letting sloppy-script Annex B rewrite block-scoped functions.
  const financial=financialHostNamespaces.has(row.name)||compactHostModels.has(row.name);
  const result=transformSync('"use strict";\n'+row.source.slice(0,boundary),{loader:'js',target:'esnext',charset:'utf8',legalComments:'inline',treeShaking:false,minifyWhitespace:true,minifySyntax:financial,minifyIdentifiers:financial,keepNames:compactHostModels.has(row.name),sourcefile:row.name+'.mjs'});
  if(result.warnings.length)throw Error('WORKER_NAMESPACE_COMPACTION_WARNING');
  return {name:row.name,source:result.code+tail};
 })};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify((process.argv[2]==='browser-factories'?compactWorkerBrowserFactories:compactWorkerNamespaces)(JSON.parse(readFileSync(0,'utf8')))));}
 catch(error){process.stderr.write((error?.message||'WORKER_NAMESPACE_COMPACTION_FAILED')+'\n');process.exitCode=1;}
}
