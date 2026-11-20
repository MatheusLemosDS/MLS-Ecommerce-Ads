import http from 'node:http';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createLocalBrowserAssets,orderedBrowserScripts} from '../../../tools/browser_assets.mjs';
import {browserWorkspaceFailureScript} from '../src/browser-assets.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
export const getOrderedBrowserScripts=html=>orderedBrowserScripts(html,{root});

// The two previous inline DTF fragments are now one signed external asset.
// Validate the complete architecture and bodies instead of relaxing a count:
// owner preview has11 inline+7 external tags and retains both DTF fragments.
export function assertCompiledBrowserScriptInventory(html,{listingFactory=true,aiSales=false}={}){
 const local=createLocalBrowserAssets(root),manifest=local.manifest,byPath=new Map(manifest.assets.map(row=>[row.path,row])),tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)],scripts=getOrderedBrowserScripts(html),external=[];
 assert.deepEqual(manifest.assets.map(row=>row.id),['bank','dtf','month','orders','production','weekly','workspace'],'the complete closed seven-asset manifest is required');
 assert.equal(tags.length,scripts.length,'every shipped script is resolved and validated');
 const families=[
  ['theme',"var key='braza-theme'"],['cost rules','globalThis.brazaCostRules='],['automation','globalThis.brazaAutomationWorkspace='],
  ['income','globalThis.brazaIncomeOverview='],['agent registry','globalThis.mlsAgentRegistry='],['mission','globalThis.mlsMission='],
  ['mission trends','globalThis.mlsMissionTrends='],['saved catalog','globalThis.brazaSavedCatalog='],['physical returns','globalThis.brazaPhysicalReturns='],
 ];
 if(listingFactory)families.push(['owner listing editor',"const root=document.getElementById('mlsListingFactory')"]);
 if(aiSales)families.push(['owner AI workspace','const MlsAiSalesCore=']);
 const listener=browserWorkspaceFailureScript();let listenerIndex=-1;
 for(const [index,tag]of tags.entries()){
  const src=/\bsrc="([^"]+)"/.exec(tag[1]);
  if(src){const row=byPath.get(src[1]);assert.ok(row,'each external tag names a current manifest member');assert.equal(tag[0],'<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>','every external tag retains exact SRI and parser-blocking attributes');external.push({id:row.id,index});}
  else if(tag[2]===listener){assert.equal(listenerIndex,-1,'the load guard is registered exactly once');listenerIndex=index;}
  else assert.equal(families.filter(([,marker])=>tag[2].includes(marker)).length,1,'each inline script belongs to one retained controller family');
  new vm.Script(scripts[index],{filename:'reviewed-owner-script-'+index+'.js'});
 }
 assert.deepEqual(external.map(row=>row.id),['dtf','month','production','bank','orders','weekly','workspace'],'the seven signed dependencies retain their exact execution order');
 assert.equal(tags.length-external.length,10+Number(listingFactory)+Number(aiSales),'every inline family and the load guard remain present');
 assert.equal(tags.length,17+Number(listingFactory)+Number(aiSales),'two inline DTF fragments become one external tag without losing a controller');
 assert.ok(listenerIndex>=0&&external.every(row=>listenerIndex<row.index),'the failure guard is installed before every external dependency');assert.equal(external.at(-1).index,tags.length-1,'workspace startup executes last');
 for(const [label,marker]of families)assert.equal(scripts.filter(script=>script.includes(marker)).length,1,label+' is shipped once');
 assert.equal(scripts.filter(script=>script.includes('globalThis.brazaReturnManufacturingLinks=')).length,1,'physical-return links are retained');
 const dtf=scripts[external.find(row=>row.id==='dtf').index],workspace=scripts.at(-1),separator='/* MLS_DTF_ENGINE_END */';assert.equal(dtf.split(separator).length,2,'the signed DTF asset contains both original fragments');const [engine,controller]=dtf.split(separator);
 assert.ok(engine.includes('globalThis.brazaDtfEngine='));assert.ok(controller.includes('globalThis.brazaDtfWorkspace='));
 for(const marker of ['globalThis.brazaDtfEngine=','globalThis.brazaDtfWorkspace='])assert.equal(scripts.filter(script=>script.includes(marker)).length,1,'the original DTF fragment is shipped once: '+marker);
 const startup=workspace.indexOf('function productionClientAvailability(');assert.ok(startup>0);
 for(const name of ['mlsDtfRecipeController','mlsDtfLifecycleController','mlsDtfArtworkBackupCodec','mlsDtfArtworkBackupController']){const marker='globalThis.'+name+'=';assert.equal(workspace.split(marker).length,2,name+' has one frozen factory');assert.ok(workspace.indexOf(marker)<startup,name+' is declared before its dependent controller can start');}
 new vm.Script(scripts.join('\n'),{filename:'complete-reviewed-owner-scripts.js'});return scripts;
}

// Legacy UI scenarios provide their own saved API responses and HTML handler.
// Serve only the same build's verified public code; production route/security
// checks use real Worker + ASSETS fixtures in browser-assets.test and bank QA.
export function createServer(...args){
 const listener=args.at(-1);if(typeof listener!=='function')return http.createServer(...args);
 const assets=createLocalBrowserAssets(root),paths=new Set([...assets.manifest.assets,...assets.manifest.retained].map(row=>row.path));
 args[args.length-1]=function(request,response){
  const url=new URL(request.url||'/','http://fixture.invalid');
  if(!url.search&&paths.has(url.pathname)&&['GET','HEAD'].includes(request.method)){
   void assets.fetch(new Request(url,{method:request.method})).then(async value=>{response.writeHead(value.status,Object.fromEntries(value.headers));response.end(Buffer.from(await value.arrayBuffer()));}).catch(()=>{response.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":"FIXTURE_BROWSER_ASSET_UNAVAILABLE"}');});
   return;
  }
  return listener.call(this,request,response);
 };
 return http.createServer(...args);
}
export default {...http,createServer};
