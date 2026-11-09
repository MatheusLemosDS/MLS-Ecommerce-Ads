import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {salesAt as at,salesEvidence,salesPricedProduct} from '../../web/cloudflare/tests/mls-ai-sales-domain-fixture.mjs';

// Execute only the pure core builder, never build.py's top-level artifact writes.
// The reference browser assembly uses every original module without pruning;
// synthetic source changes exercise the same import checks used for deployment.
const probe=String.raw`
import ast,json,re,sys
from pathlib import Path
root=Path(sys.argv[1])
build_source=(root/'build.py').read_text()
node=next(n for n in ast.parse(build_source).body if isinstance(n,ast.FunctionDef) and n.name=='build_ai_sales_browser_core')
builder_source=ast.get_source_segment(build_source,node)

def builder(path):
    scope={'root':path,'re':re,'json':json}
    exec(builder_source,scope)
    return scope['build_ai_sales_browser_core']

build=builder(root)
browser=build()
server=build(server_only=True)
assert browser==build(), 'server profile must not change later browser builds'

filenames=['mls-ai-sales-contracts.mjs','mls-ai-sales-imports.mjs',
    'mls-ai-sales-campaign-planner.mjs','mls-ai-sales-profitability-gate.mjs',
    'mls-ai-sales-capability-audit.mjs','mls-ai-sales-catalog.mjs',
    'mls-ai-sales-affiliates.mjs','mls-ai-sales-performance.mjs']
registry=re.findall(r'^export function projectProductRegistryFrame\([\s\S]*?^\}',(root/'src/product-registry.mjs').read_text(),flags=re.M)
assert len(registry)==1
parts=['modules["product-registry.mjs"]={projectProductRegistryFrame:'+registry[0].removeprefix('export ')+'};']
browser_exports=[]
for filename in filenames:
    source=(root/'src'/filename).read_text()
    exports=re.findall(r'^export (?:async )?(?:function|class|const) ([A-Za-z_$][A-Za-z0-9_$]*)',source,flags=re.M)
    browser_exports.extend(exports)
    source=re.sub(r"^import \{([^}]+)\} from './([^']+)';",lambda m:'const {'+m.group(1).strip()+'}=modules['+json.dumps(m.group(2))+'];',source,flags=re.M)
    source=re.sub(r'^export ', '',source,flags=re.M)
    parts.append('modules['+json.dumps(filename)+']=(()=>{\n'+source+'\nreturn {'+','.join(exports)+'};})();')
expected='const MlsAiSalesCore=(()=>{const modules=Object.create(null);\n'+'\n'.join(parts)+'\nreturn Object.freeze(Object.assign({},'+','.join('modules['+json.dumps(f)+']' for f in filenames)+'));})();'
required={filename:[name.strip() for name in names.split(',')] for names,filename in re.findall(r"^import \{([^}]+)\} from './([^']+)';",(root/'src/mls-ai-sales-workspace-store.mjs').read_text(),flags=re.M)}

class VirtualPath:
    def __init__(self,path,replacements):self.path=path;self.replacements=replacements
    def __truediv__(self,key):return VirtualPath(self.path/key,self.replacements)
    def read_text(self):
        text=self.path.read_text()
        transform=self.replacements.get(self.path.name)
        return transform(text) if transform else text

def rejection(replacements):
    try:builder(VirtualPath(root,replacements))(server_only=True)
    except AssertionError as error:return str(error)
    return None

guards={
    'orphan_reference':rejection({'mls-ai-sales-affiliates.mjs':lambda source:source+'\nconst futureDraft=draftAiSalesAffiliateProposal;\n'}),
    'store_import_removed_export':rejection({'mls-ai-sales-workspace-store.mjs':lambda source:source.replace('import {validateAiSalesAffiliateWorkspace,','import {draftAiSalesAffiliateProposal,validateAiSalesAffiliateWorkspace,',1)}),
    'core_import_removed_export':rejection({'mls-ai-sales-performance.mjs':lambda source:"import {approveAiSalesAffiliateProposal} from './mls-ai-sales-affiliates.mjs';\n"+source}),
    'store_import_wrong_module':rejection({'mls-ai-sales-workspace-store.mjs':lambda source:source.replace('import {validateAiSalesAffiliateWorkspace,','import {createAiSalesPerformanceLedger,validateAiSalesAffiliateWorkspace,',1)}),
    'core_import_wrong_module':rejection({'mls-ai-sales-performance.mjs':lambda source:"import {createAiSalesAffiliateWorkspace} from './mls-ai-sales-catalog.mjs';\n"+source}),
}
print(json.dumps({'browser':browser,'server':server,'browser_byte_exact':browser==expected,'browser_exports':browser_exports,'required':required,'guards':guards}))
`;
const result=spawnSync('python3',['-c',probe,fileURLToPath(new URL('../../web/cloudflare/',import.meta.url))],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:15000});
assert.equal(result.error,undefined,result.error?.message);
assert.equal(result.status,0,result.stderr);
const profiles=JSON.parse(result.stdout);
const loadCore=(source,name)=>vm.runInThisContext('(()=>{'+source+'\nreturn MlsAiSalesCore;})()',{filename:name});
const browser=loadCore(profiles.browser,'ai-sales-browser-profile.js');
const server=loadCore(profiles.server,'ai-sales-server-profile.js');
const omitted=['draftAiSalesAffiliateProposal','approveAiSalesAffiliateProposal'];

test('server pruning leaves the complete browser module assembly byte exact',()=>{
 assert.equal(profiles.browser_byte_exact,true,'the browser must retain all original modules, bodies, exports and ordering');
 assert.deepEqual(Object.keys(browser),profiles.browser_exports);
 for(const name of omitted)assert.equal(typeof browser[name],'function',name+' remains available in the browser');
});

test('the reduced server core preserves every required persistence API and retained function body',()=>{
 for(const name of omitted)assert.equal(Object.hasOwn(server,name),false,name+' is browser only');
 for(const [filename,names] of Object.entries(profiles.required))for(const name of names){
  assert.equal(typeof server[name],'function',filename+' must retain '+name);
  assert.equal(String(server[name]),String(browser[name]),name+' keeps its full validation implementation');
 }
 for(const [name,value] of Object.entries(server))if(typeof value==='function')assert.equal(String(value),String(browser[name]),name+' is unchanged');
 assert.ok(Buffer.byteLength(profiles.server)<Buffer.byteLength(profiles.browser));
});

test('browser proposals remain usable and the reduced server still revokes imported approvals',async()=>{
 const creator={schema:'mls_ai_sales_creator_v1',internal_creator_id:'creator-build-fixture',provider:'SHOPEE_BR',shop_ref:'fixture-shop',approved_handle:'@build_fixture',consent_evidence:salesEvidence({basis:'CONSENTED'}),seller_creator_access_grant_status:'GRANTED',channel_fit:['Moda'],last_contact_at:null,status:'ELIGIBLE'};
 const product=salesPricedProduct();
 let state=browser.upsertAiSalesAffiliateCreator(browser.createAiSalesAffiliateWorkspace(),creator,{at});
 state=await browser.draftAiSalesAffiliateProposal(state,{plan_id:'build-proposal-fixture',creator_ref:creator.internal_creator_id,product,commission_rate_bps:500,commission_evidence:salesEvidence(),extra_cost_cents:0,extra_cost_evidence:salesEvidence(),returns_evidence:salesEvidence({basis:'RECONCILED_ZERO_RETURN_EXPOSURE'}),at});
 state=await browser.approveAiSalesAffiliateProposal(state,{plan_id:'build-proposal-fixture',product,approval_id:'build-approval-fixture',at:at+1});
 assert.equal(state.plans[0].collaboration.status,'APPROVED');
 const before=JSON.stringify(state),options={imported_at:at+2};
 assert.deepEqual(server.validateAiSalesAffiliateWorkspace(state),browser.validateAiSalesAffiliateWorkspace(state));
 const imported=server.importAiSalesAffiliateWorkspace(before,options);
 assert.deepEqual(imported,browser.importAiSalesAffiliateWorkspace(before,options));
 assert.equal(imported.plans[0].collaboration.status,'BLOCKED');
 assert.equal(imported.plans[0].collaboration.owner_approval_id,null);
 assert.equal(imported.creators[0].seller_creator_access_grant_status,'UNKNOWN');
 assert.equal(imported.creators[0].consent_evidence.status,'DECLARED');
 assert.deepEqual(imported.audit,[]);
 assert.equal(JSON.stringify(state),before,'server import does not mutate the browser draft');
 assert.deepEqual(server.createAiSalesPerformanceLedger(),browser.createAiSalesPerformanceLedger());
});

for(const [guard,expected] of [
 ['orphan_reference','draftAiSalesAffiliateProposal'],
 ['store_import_removed_export','mls-ai-sales-affiliates.mjs'],
 ['core_import_removed_export','mls-ai-sales-affiliates.mjs'],
 ['store_import_wrong_module','mls-ai-sales-affiliates.mjs'],
 ['core_import_wrong_module','mls-ai-sales-catalog.mjs'],
])test('the server build fails closed for '+guard,()=>assert.equal(profiles.guards[guard],expected));
