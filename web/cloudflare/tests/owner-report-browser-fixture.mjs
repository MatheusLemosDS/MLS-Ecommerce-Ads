import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

export async function compiledOwnerReportPage(minify){
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 const origin='https://owner-report.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'owner-report-test-session-'+'s'.repeat(32),ADMIN_USERNAME:'owner-report',ADMIN_PASSWORD:'owner-report-fixture-password-123456'};
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie').split(';')[0],session=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const response=await worker.fetch(new Request(origin+'/admin?tab=hermes',{headers:{cookie}}),env);assert.equal(response.status,200);
  return {html:await response.text(),session};
 }finally{env.ADMIN_DB.db.close();}
}

// A small DOM is sufficient for the actual owner script. Network responses are
// parsed in the page's realm, as browser Response.json() would parse them.
export function ownerReportBrowser(html,{respond=async()=>new Promise(()=>{}),scriptIncludes='let renderedReportKey='}={}){
 const ids=[...html.matchAll(/\bid="([^"]*)"/g)].map(match=>match[1]),calls=[],timers=new Map();let nextTimer=0,context;
 const matches=(element,selector)=>{
  if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>element.className.split(/\s+/).includes(name));
  const attr=/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(selector);
  if(attr){const value=element.getAttribute(attr[1]);return value!==null&&(attr[2]===undefined||value===attr[2]);}
  return element.tagName===selector.toUpperCase();
 };
 const element=(tag='div')=>{
  let ownText='';const attributes=new Map(),value={tagName:tag.toUpperCase(),value:'',children:[],parentNode:null,dataset:{},style:{},hidden:false,disabled:false,open:false,className:'',id:'',type:'',max:'',append(...rows){for(const row of rows){if(row&&typeof row==='object')row.parentNode=this;this.children.push(row);}},replaceChildren(...rows){for(const child of this.children)if(child&&typeof child==='object')child.parentNode=null;ownText='';this.children=[];this.append(...rows);},setAttribute(name,text){attributes.set(name,String(text));if(name==='class')this.className=String(text);if(name==='id')this.id=String(text);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(text);},getAttribute(name){if(name==='class')return this.className;if(name==='id')return this.id;if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]??null;return attributes.get(name)??null;},removeAttribute(name){attributes.delete(name);},querySelectorAll(selector){const found=[];for(const child of this.children){if(!child||typeof child!=='object')continue;if(matches(child,selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},contains(child){return child===this||this.children.some(value=>value&&typeof value==='object'&&value.contains(child));},scrollIntoView(){},get childNodes(){return this.children;}};
  Object.defineProperty(value,'textContent',{get(){return ownText+this.children.map(child=>typeof child==='object'?child.textContent:String(child)).join('');},set(text){ownText=String(text);this.children=[];}});
  value.classList={add(...names){value.className=[...new Set([...value.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove(...names){value.className=value.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},toggle(name,enabled){const present=value.className.split(/\s+/).includes(name),add=enabled===undefined?!present:enabled;this[add?'add':'remove'](name);return add;}};
  return value;
 };
 const nodes=new Map(ids.map(id=>{const value=element();value.id=id;return [id,value];}));
 context=vm.createContext({AbortController,URLSearchParams,URL,Intl,Date,TextEncoder,location:{search:'?tab=hermes',href:'https://owner-report.test/admin?tab=hermes'},history:{replaceState(){},pushState(){}},setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 1;},clearInterval(){},document:{hidden:false,activeElement:null,documentElement:{dataset:{}},getElementById(id){if(nodes.has(id))return nodes.get(id);for(const root of nodes.values()){if(root.id===id)return root;const found=root.querySelectorAll('[id]').find(row=>row.id===id);if(found)return found;}return null;},createElement:element,querySelectorAll(){return [];},addEventListener(){}},fetch:async(url,options={})=>{
  calls.push({url,options});const response=await respond(url,options);
  if(!response)return new Promise(()=>{});const status=response.status??200;
  return {ok:status>=200&&status<300,status,body:null,json:async()=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(response.body))+')',context)};
 }});
 vm.runInContext("globalThis.window=globalThis;window.matchMedia=()=>({matches:false});globalThis.addEventListener=()=>{};",context);
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(value=>value.includes(scriptIncludes));assert.ok(script,'compiled owner client not found: '+scriptIncludes);vm.runInContext(script,context);
 return {nodes,calls,timers,context,run:source=>vm.runInContext(source,context),async flush(){for(let turn=0;turn<8;turn++)await new Promise(resolve=>setImmediate(resolve));},stop(){vm.runInContext('startupController.stop();clearTimeout(pollTimer);',context);timers.clear();}};
}
