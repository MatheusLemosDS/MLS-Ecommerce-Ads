import {ReturnManufacturingLinksError,readReturnManufacturingLinks,mutateReturnManufacturingLinks,returnManufacturingLinkHandles,deriveReturnManufacturingLinkContext} from './return-manufacturing-links.mjs';
import {readPhysicalReturns} from './physical-returns.mjs';
import {readIncurredProduction} from './incurred-production.mjs';

// Association context comes only from the two owner-declared ledgers. Missing
// parent data must not erase association history or manufacture source evidence.
const encoder=new TextEncoder();
function clock(now){let stamp;try{stamp=Math.floor(now()/1000);}catch{}if(!Number.isSafeInteger(stamp)||stamp<1||stamp>9999999999)throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_CLOCK_INVALID',503);return stamp;}
async function parents(env,now){
 let physical=null,production=null;
 try{physical=await readPhysicalReturns(env,{now});}catch{}
 try{production=await readIncurredProduction(env,{now});}catch{}
 return {physical,production};
}
async function envelope(ledger,physical,production,stamp){
 const handles=await returnManufacturingLinkHandles(physical,production),context=deriveReturnManufacturingLinkContext(ledger,physical,production,handles);
 if(!context)throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_CONTEXT_INVALID',503);
 const result={schema:'return_manufacturing_links_workspace_v1',checked_at:stamp,ledger,physical,production,handles,context};
 if(encoder.encode(JSON.stringify(result)).byteLength>4194304)throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_LIMIT',503);
 return result;
}
export async function readReturnManufacturingLinksWorkspace(env,{now=()=>Date.now()}={}){
 const stamp=clock(now),fixedNow=()=>stamp*1000;
 const ledger=await readReturnManufacturingLinks(env,{now:fixedNow}),{physical,production}=await parents(env,fixedNow);
 return envelope(ledger,physical,production,stamp);
}
export async function mutateReturnManufacturingLinksWorkspace(env,body,actor,{now=()=>Date.now()}={}){
 const stamp=clock(now),fixedNow=()=>stamp*1000;
 const {physical,production}=await parents(env,fixedNow);
 const ledger=await mutateReturnManufacturingLinks(env,body,actor,{now:fixedNow,physical,production});
 return envelope(ledger,physical,production,stamp);
}
