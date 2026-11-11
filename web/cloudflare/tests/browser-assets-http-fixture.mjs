import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createLocalBrowserAssets,orderedBrowserScripts} from '../../../tools/browser_assets.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
export const getOrderedBrowserScripts=html=>orderedBrowserScripts(html,{root});

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
