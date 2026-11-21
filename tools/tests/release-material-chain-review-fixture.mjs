// Test-only exact inverses. Original frozen hashes and all original assertion
// bodies remain authoritative after these finite, independently reviewed deltas.
// This fixture grants no release, external-write or publication authority.
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const sources={
  "web/cloudflare/src/agent-registry-view.mjs": {
    "baseline_sha256": "193529bff9b4904926bcb4483af4d2893eb822e970480f5ad37ab04145108171",
    "reviewed_sha256": "4ae14e26b60ac7915ed81f70e8ef7e5faa07a31bd0a7414ed61ced798f4b9882",
    "patches": [
      {
        "offset": 0,
        "added": "import {projectProductionMaterialAvailability} from './production-material-availability.mjs';\n",
        "removed": ""
      },
      {
        "offset": 28992,
        "added": "ProductionMaterialAvailability=${projectProductionMaterialAvailability.toString()};\n const project",
        "removed": ""
      },
      {
        "offset": 30669,
        "added": ",materialEvents=false",
        "removed": ""
      },
      {
        "offset": 30850,
        "added": "e=null,materials=null,materialScop",
        "removed": ""
      },
      {
        "offset": 31678,
        "added": "try{materials=globalThis.brazaProductionMaterials?.getSnapshot?.()??null;const context=globalThis.mlsCommercialWorkspace?.getContext?.();if(context)materialScope={organization_id:context.organizationId,store_id:context.storeId};else if(globalThis.mlsCommercialContext)materials=null;}catch{}\n  ",
        "removed": ""
      },
      {
        "offset": 32222,
        "added": "e,materials,materialScop",
        "removed": ""
      },
      {
        "offset": 32325,
        "added": ",projectMaterials:projectProductionMaterialAvailability",
        "removed": ""
      },
      {
        "offset": 59946,
        "added": "if(!materialEvents&&typeof globalThis.addEventListener==='function'){globalThis.addEventListener('mls:production-materials-updated',queue);materialEvents=true;}\n  ",
        "removed": ""
      },
      {
        "offset": 66642,
        "added": "if(materialEvents){globalThis.removeEventListener?.('mls:production-materials-updated',queue);materialEvents=false;}",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/src/incurred-production.mjs": {
    "baseline_sha256": "3958d0babcaa370cf6f1bcf8d7201cb00e7fc7a015ceddc4c32c1189ea5d3e4d",
    "reviewed_sha256": "4fdf5086a068f2b5f6141b1cb68a3ef2482d0b38a197e226234b37902c4792de",
    "patches": [
      {
        "offset": 22676,
        "added": "MATERIAL_PRODUCTION_LINK_ACTIVE'))throw new IncurredProductionError('INCURRED_PRODUCTION_MATERIAL_LINK_ACTIVE',409);if(typeof error?.message==='string'&&error.message.includes('MLS_",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/src/production-weekly-payments.mjs": {
    "baseline_sha256": "2474a2c40ecb1d63513cb6a4b00bb6863f0dd7c756a95c30f85d02d2d2a841f3",
    "reviewed_sha256": "6bb09bc8303d686e80652c6b22ad4348194c4c6314eb28ed16f31665874b04a9",
    "patches": [
      {
        "offset": 7227,
        "added": "// Reuse the same validated ledger projection in operational weekly reads.\n// This exposes no new command, money movement, or accounting calculation.\nexport function projectProductionWeeklyPaymentLedger(value,revision){\n if(!integer(revision,1))fail('REVISION_INVALID');\n return selected(value,revision);\n}\n",
        "removed": ""
      }
    ]
  },
  "tools/tests/release-finance-completion-preflight.test.mjs": {
    "baseline_sha256": "ec8368eeee48d6fe259740504d8a97e2c1916e1f690854091f8d162ed5e053c4",
    "reviewed_sha256": "49fd51b00f23c9d1e9cf355f3b2a176884e2c2eff2c2d2a46a0e447c45372fb9",
    "patches": [
      {
        "offset": 276,
        "added": "';\nimport {restoreSourceBeforeMaterialChain} from './release-material-chain-review-fixture.mjs",
        "removed": ""
      },
      {
        "offset": 11059,
        "added": "restoreSourceBeforeMaterialChain(filename,",
        "removed": ""
      },
      {
        "offset": 11148,
        "added": ")",
        "removed": ""
      }
    ]
  },
  "tools/tests/release-historical-profit-preflight.test.mjs": {
    "baseline_sha256": "9eac7235c8cf668507e97ba181bbd60d4a07b7847471695445a61b3f92dacead",
    "reviewed_sha256": "ff66370e0604f8fffb4230c39698159f948148213bde9bb858323e614bdae120",
    "patches": [
      {
        "offset": 276,
        "added": "';\nimport {restoreSourceBeforeMaterialChain} from './release-material-chain-review-fixture.mjs",
        "removed": ""
      },
      {
        "offset": 5870,
        "added": "restoreSourceBeforeMaterialChain(filename,",
        "removed": ""
      },
      {
        "offset": 5951,
        "added": "),'utf8'",
        "removed": ""
      }
    ]
  },
  "tools/tests/release-operating-increment-preflight.test.mjs": {
    "baseline_sha256": "33dc872b16beab20111fb97f8a7faaa6ca74f345162854acbbe1fb8e30fd6e0d",
    "reviewed_sha256": "a8fbc996c689ea6013f87f33335dd7f81c4803652c8b15bdd13819ef9d9243e9",
    "patches": [
      {
        "offset": 276,
        "added": "';\nimport {restoreSourceBeforeMaterialChain} from './release-material-chain-review-fixture.mjs",
        "removed": ""
      },
      {
        "offset": 6085,
        "added": "restoreSourceBeforeMaterialChain(filename,",
        "removed": ""
      },
      {
        "offset": 6166,
        "added": "),'utf8'",
        "removed": ""
      },
      {
        "offset": 10553,
        "added": "spawn",
        "removed": "fs.readFile"
      },
      {
        "offset": 10563,
        "added": "'git',['show','de0bb72e5",
        "removed": "path.join(root,file),'utf"
      },
      {
        "offset": 10588,
        "added": "3a84d86b20952e55b352722996cbed:'+file],{cwd:root,encoding:'utf8'}).stdout",
        "removed": "')"
      }
    ]
  },
  "tools/tests/operating-integration-gates.test.mjs": {
    "baseline_sha256": "6f7f0b814d0fddc2742ff1b929fe48bb6345fa11f7165258d6f2a3e98f1d8787",
    "reviewed_sha256": "9c6c6f6e78d8d39c8c71be950ae50c80650df7f5078d796942946d36ec4dfc0d",
    "patches": [
      {
        "offset": 699,
        "added": "restoreSourceBeforeMaterialChain} from './release-material-chain-review-fixture.mjs';\nconst {",
        "removed": ""
      },
      {
        "offset": 804,
        "added": "=await import('data:text",
        "removed": " from '.."
      },
      {
        "offset": 829,
        "added": "javascript;base64,'+Buffer.from(execFileSync('git',['show','de0bb72e583a84d86b20952e55b352722996cbed:",
        "removed": "../"
      },
      {
        "offset": 965,
        "added": "],{cwd:new URL('../../',import.meta.url),encoding:'utf8'})).toString('base64'))",
        "removed": ""
      },
      {
        "offset": 4221,
        "added": "storeSourceBeforeMaterialChain('tools/release_preflight.mjs',re",
        "removed": ""
      },
      {
        "offset": 4345,
        "added": ")",
        "removed": ""
      },
      {
        "offset": 6197,
        "added": "storeSourceBeforeMaterialChain(filename,re",
        "removed": ""
      },
      {
        "offset": 6271,
        "added": "),'utf8'",
        "removed": ""
      },
      {
        "offset": 7197,
        "added": "storeSourceBeforeMaterialChain(filename,re",
        "removed": ""
      },
      {
        "offset": 7279,
        "added": ")",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/tests/reviewed-cost-source-invariants.mjs": {
    "baseline_sha256": "db9d6f2b8d36488fdaf06dda7a713b7ffbb245c363f9aaf22ec6024845c871ce",
    "reviewed_sha256": "ab2139ee0983cbbfeef82b71cef7dbcc20c9bbbfd737df5477e7125f4f2e5d64",
    "patches": [
      {
        "offset": 299,
        "added": ".mjs';\nimport {restoreSourceBeforeMaterialChain} from '../../../tools/tests/release-material-chain-review-fixture",
        "removed": ""
      },
      {
        "offset": 9180,
        "added": "// Reverse only the exact material-link error mapping before all existing\n// source hashes, direct formula guards and commercial-to-legacy comparisons.\nexport function normalizeReviewedMaterialChainCostSource(name,observed){return restoreSourceBeforeMaterialChain('web/cloudflare/src/'+name,observed)??observed;}\n",
        "removed": ""
      },
      {
        "offset": 9891,
        "added": "normalizeReviewedMaterialChainCost",
        "removed": "read"
      },
      {
        "offset": 9936,
        "added": ",readSource(name)",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/tests/production-closing-workspace-chrome.test.mjs": {
    "baseline_sha256": "dca4a53856ee40ecd57d6316714fe459b120385d31523fb21888898e669d8c50",
    "reviewed_sha256": "551196566204985263d4f37a283a0934e5ea003c5e99e51d70f4603129a2c6b4",
    "patches": [
      {
        "offset": 874,
        "added": "CostSource,normalizeReviewedMaterialChain",
        "removed": ""
      },
      {
        "offset": 2389,
        "added": "normalizeReviewedMaterialChainCostSource(name,",
        "removed": ""
      },
      {
        "offset": 2494,
        "added": ")",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/tests/browser-assets.test.mjs": {
    "baseline_sha256": "77cacac953fb57e16ae95bd6292133b266543bd92fa723408f54833f4de66cd9",
    "reviewed_sha256": "ab46e2201b813cc1de1a264f5405d8a9ef24cfbd7a45df8552b139f8a817e081",
    "patches": [
      {
        "offset": 5327,
        "added": "reviewed ",
        "removed": ""
      },
      {
        "offset": 5340,
        "added": "predecessor and engine remain",
        "removed": "asset preserves the"
      },
      {
        "offset": 5376,
        "added": "while the material-aware controller sta",
        "removed": "published engine/workspace b"
      },
      {
        "offset": 5416,
        "added": "s",
        "removed": "tes while browser factories stay"
      },
      {
        "offset": 5424,
        "added": "",
        "removed": " in the workspace"
      },
      {
        "offset": 5440,
        "added": "e",
        "removed": "ow=manifest.assets.find("
      },
      {
        "offset": 5442,
        "added": "iewed=readFileSync(path.join(root,'web','cloudflare','tests','fixtures','re",
        "removed": "alue=>"
      },
      {
        "offset": 5518,
        "added": "iewed-dtf-extraction-before-materials.js'));\n ",
        "removed": "alue.id==='dtf');assert.ok(row);"
      },
      {
        "offset": 5577,
        "added": "createHash('",
        "removed": "row."
      },
      {
        "offset": 5595,
        "added": "').update(reviewed).digest('hex')",
        "removed": ""
      },
      {
        "offset": 5711,
        "added": "eviewed.length",
        "removed": "ow.bytes"
      },
      {
        "offset": 5731,
        "added": ");\n const row=manifest.assets.find(value=>value.id==='dtf');assert.ok(row",
        "removed": ""
      },
      {
        "offset": 6140,
        "added": ");\n const engine=Buffer.from(DTF_ENGINE_CLIENT+'\\n/* MLS_DTF_ENGINE_END */\\n');assert.deepEqual(bytes.subarray(0,engine.length),reviewed.subarray(0,engine.length));assert.deepEqual(bytes.subarray(0,engine.length),engine,'material availability cannot change the reviewed layout engine'",
        "removed": ""
      },
      {
        "offset": 17742,
        "added": "equal(bytes.length,emitted.length,'workspace length matches the canonical client export');assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(emitted).digest('hex'),'workspace digest matches before formatting a large byte comparison');assert.",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/src/commercial-route-policy.mjs": {
    "baseline_sha256": "34e4145dbe0bb0aca5fad7f48e5226243403cedc86d3bfddd07e75f5aae24df7",
    "reviewed_sha256": "4a42ee7ae2ab8dafd31d6504f14dcaf4eb4903199add4960bb99506963b02a13",
    "patches": [
      {
        "offset": 2070,
        "added": "'],\n ['production/material-needs','GET','production.read','orders.read','costs.read'],\n ['production/material-needs','POST','production.read','orders.read','costs.read','production.write'],\n ['production/weekly-materials','GET','production.read','finance.read",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/tests/commercial-route-policy.test.mjs": {
    "baseline_sha256": "6fbfef98fe6ee7ca3cf01156997c71b16ab9ebc9df1d755e6c9c9b02c2456756",
    "reviewed_sha256": "5e7505a22df9cbd2b6917f43f5b11ed9f9898155d7aae9279303e8e23f63528c",
    "patches": [
      {
        "offset": 2875,
        "added": ");\n});\n\ntest('material workspaces require every exposed domain and retain exact method and suffix boundaries',async()=>{\n const routes=[\n  ['/api/admin/production/material-needs','GET',['production.read','orders.read','costs.read']],\n  ['/api/admin/production/material-needs','POST',['production.read','orders.read','costs.read','production.write']],\n  ['/api/admin/production/weekly-materials','GET',['production.read','finance.read']],\n ];\n for(const [path,method,required]of routes){\n  const options={method,...(method==='POST'?{body:{action:'reserve_order'}}:{})};\n  const policy=await commercialRoutePolicy(request(path,options));\n  assert.deepEqual(policy.capabilities,required,path+':'+method);\n  assert.equal(policy.mutating,method==='POST');\n  assert.equal(await commercialRouteAllowed(principal('OWNER',required),request(path,options)),true);\n  for(const missing of required)assert.equal(await commercialRouteAllowed(principal('OWNER',required.filter(cap=>cap!==missing)),request(path,options)),false,path+':'+method+' must require '+missing);\n  // Quotes and declared purchase plans do not edit financial cost rules, post\n  // another expense, send a purchase order or grant banking authority.\n  for(const capability of ['finance.write','bank.read','bank.write','costs.write'])assert.equal(required.includes(capability),false,capability);\n  for(const suffix of ['/','/extra','/sync'])assert.equal(await read(path+suffix,options),null,path+suffix);\n  for(const unsupported of ['HEAD','PUT','PATCH','DELETE','OPTIONS'])assert.equal(await read(path,{method:unsupported}),null,path+':'+unsupported);\n }\n assert.equal(await read('/api/admin/production/weekly-materials',{method:'POST',body:{}}),null,'the weekly observation has no mutation method');\n});\n\ntest('material observations and writes respect role ceilings and explicit read grants without finance promotion',async()=>{\n const path='/api/admin/production/material-needs',required=['production.read','orders.read','costs.read'];\n const readonly=principal('VIEWER',required),operations=principal('OPERATIONS'),grantedOperations=principal('OPERATIONS',[...ACCOUNT_ROLES.OPERATIONS.capabilities,'costs.read']);\n assert.equal(await commercialRouteAllowed(readonly,request(path)),true);\n assert.equal(await commercialRouteAllowed(readonly,request(path,{method:'POST',body:{action:'reserve_order'}})),false,'read access cannot reserve or mutate material facts');\n assert.equal(await commercialRouteAllowed(principal('OWNER',required),request(path,{method:'POST',body:{action:'save_supplier'}})),false,'a quotation declaration still requires operational write authority');\n assert.equal(await commercialRouteAllowed(operations,request(path)),false,'the closed material DTO includes supplier quotation prices');\n assert.equal(await commercialRouteAllowed(grantedOperations,request(path)),true);\n assert.equal(await commercialRouteAllowed(grantedOperations,request(path,{method:'POST',body:{action:'save_purchase'}})),true);\n assert.equal(await commercialRouteAllowed(grantedOperations,request('/api/admin/production/weekly-materials')),false,'material access must not disclose weekly obligations without finance.read');\n assert.equal(await commercialRouteAllowed(principal('FINANCE'),request(path)),false,'the finance role has no implicit physical-production grant');\n assert.equal(await commercialRouteAllowed(principal('FINANCE',[...ACCOUNT_ROLES.FINANCE.capabilities,'production.read']),request(path)),false,'a grant outside the existing role ceiling is rejected');\n const headers={'x-role':'OWNER','x-mls-capability':'production.write'};\n assert.equal(await commercialRouteAllowed(readonly,request(path,{method:'POST',headers,body:{action:'save_purchase',capability:'production.write',role:'OWNER'}})),false,'headers and command fields cannot promote a read grant'",
        "removed": ""
      }
    ]
  }
};
const policy={
  "baseline_sha256": "a7e47f34d491fd7ba7414a5b45f6ac2a957513a4ecc51acd0c59c304f0dab74e",
  "reviewed_sha256": "cbddb55eb16f024f8aecfa893bc605b6732f34df8c205c3287720d02d3634873",
  "sections": [
    {
      "begin": "// BEGIN MATERIAL_CHAIN_MERGE_V1\n",
      "end": "// END MATERIAL_CHAIN_MERGE_V1\n",
      "sha256": "0a62d0fc292beb3b60af942def887266edde29e83fb41a425598027aff00df0e"
    },
    {
      "begin": " // BEGIN MATERIAL_CHAIN_DISPATCH_V1\n",
      "end": " // END MATERIAL_CHAIN_DISPATCH_V1\n",
      "sha256": "b346a73d67b4110498c3e74d1bbd8e2e68b3001c27f04a4da5a7f41fc2c69e2a"
    }
  ]
};
for(const proof of Object.values(sources)){for(const patch of proof.patches)Object.freeze(patch);Object.freeze(proof.patches);Object.freeze(proof);}
for(const section of policy.sections)Object.freeze(section);Object.freeze(policy.sections);Object.freeze(policy);
export const MATERIAL_CHAIN_REVIEWED_SOURCE_DELTAS=Object.freeze(sources);
export const MATERIAL_CHAIN_REVIEWED_POLICY=policy;
export function restoreSourceBeforeMaterialChain(filename,source){
 if(typeof filename!=='string'||typeof source!=='string')return null;
 if(filename==='tools/release_preflight.mjs'){
  if(digest(source)!==policy.reviewed_sha256)return null;
  let restored=source;
  for(const {begin,end,sha256} of policy.sections){
   const first=restored.indexOf(begin),last=restored.indexOf(end);
   if(first<0||last<first||restored.indexOf(begin,first+begin.length)!==-1||restored.indexOf(end,last+end.length)!==-1)return null;
   if(digest(restored.slice(first,last+end.length))!==sha256)return null;
   restored=restored.slice(0,first)+restored.slice(last+end.length);
  }
  return digest(restored)===policy.baseline_sha256?restored:null;
 }
 if(!Object.hasOwn(sources,filename))return source;
 const proof=sources[filename];if(digest(source)!==proof.reviewed_sha256)return null;
 let restored=source;
 for(const patch of [...proof.patches].reverse()){
  if(restored.slice(patch.offset,patch.offset+patch.added.length)!==patch.added)return null;
  restored=restored.slice(0,patch.offset)+patch.removed+restored.slice(patch.offset+patch.added.length);
 }
 return digest(restored)===proof.baseline_sha256?restored:null;
}
