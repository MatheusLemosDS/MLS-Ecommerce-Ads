// Test-only proof of the finite numbered-kit additions. No release policy or
// deployment authority consumes this fixture. Historical frozen hashes remain
// authoritative after reversing these exact, separately reviewed source bytes.
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const reviewed={
  "web/cloudflare/src/cost-rules.mjs": {
    "baseline_sha256": "bddd06c0c7f9b97c809240082137297b7d6b43b0a95ed61ddef7fead571643dd",
    "reviewed_sha256": "a6db866f802e4c5b52964d023ada26c11c4767c6c357c74924ab2d21587e0f35",
    "patches": [
      {
        "offset": 247,
        "added": ".mjs';\nimport {numberedAdultKitCostCompositions} from './numbered-adult-kit-costs",
        "removed": ""
      },
      {
        "offset": 16751,
        "added": "currentCompositions=[],",
        "removed": ""
      },
      {
        "offset": 18192,
        "added": ");\n  currentCompositions.push(...numberedAdultKitCostCompositions(row.item_id,catalog)",
        "removed": ""
      },
      {
        "offset": 22722,
        "added": "current_catalog_compositions:{value:currentCompositions},",
        "removed": ""
      },
      {
        "offset": 24528,
        "added": "current_catalog_compositions:{value:reference.current_catalog_compositions||[]},",
        "removed": ""
      }
    ]
  },
  "web/cloudflare/src/production-costs.mjs": {
    "baseline_sha256": "04d8a0cc79f95fae403ce09f3d4137a4eb5b71489a98aea8161abdc2bb53d7a8",
    "reviewed_sha256": "44636ea31d7b9a573c2bd3cbacf7cf313c169c941c1cc669597fcc3462e3a2ca",
    "patches": [
      {
        "offset": 16708,
        "added": "// Numbered catalogue axes prove only two financial garment sizes. They do\n // not mint a gendered binding or a dated historical identity.\n const numberedCompositions=new Map();\n for(const composition of automaticReference?.current_catalog_compositions||[]){\n  if(!costExact(composition,['item_id','model_id','provenance','sizes'])||!costItemId(composition.item_id)||!costModelId(composition.model_id)||composition.provenance!=='CURRENT_CATALOG_NUMBERED_ADULT_KIT'||!costArray(composition.sizes,2)||composition.sizes.length!==2||!composition.sizes.every(size=>['P','M','G','GG','G1','G2','G3'].includes(size)))costReferenceFailure();\n  const key=composition.item_id+':'+composition.model_id;if(numberedCompositions.has(key))costReferenceFailure();numberedCompositions.set(key,composition);\n }\n const numberedCost=(key,allowed)=>{const composition=allowed?numberedCompositions.get(key):null;return composition?recipeCost({id:'catalog-numbered-kit-'+composition.sizes.join('-').toLowerCase(),label:'Kit de 2 camisetas '+composition.sizes.join('/')+' · catálogo',components:composition.sizes.map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))}):null;};\n ",
        "removed": ""
      },
      {
        "offset": 20006,
        "added": ")||numberedCost(key,!changed&&legacy?.operator_confirmed!==true&&!catalogBinding&&!ruleManaged.has(row.item_id)&&!automatic&&!manualRuleKeys.has(key)&&!manualProductScopes.has(row.item_id)",
        "removed": ""
      }
    ]
  }
};
for(const entry of Object.values(reviewed)){for(const patch of entry.patches)Object.freeze(patch);Object.freeze(entry.patches);Object.freeze(entry);}
export const HISTORICAL_PROFIT_REVIEWED_SOURCE_ADDITIONS=Object.freeze(reviewed);
export const HISTORICAL_PROFIT_REVIEWED_KIT_HELPER=Object.freeze({"path": "web/cloudflare/src/numbered-adult-kit-costs.mjs", "sha256": "803a83c4b095be0de7ac471e83466588e6eeff161d3dec5200c6862050284768"});
export function restoreFinanceSourceBeforeNumberedKitAddition(filename,source){
 if(typeof filename!=='string'||typeof source!=='string'||!Object.hasOwn(reviewed,filename))return null;
 const proof=reviewed[filename];if(digest(source)!==proof.reviewed_sha256)return null;
 let restored=source;
 for(const patch of [...proof.patches].reverse()){
  if(restored.slice(patch.offset,patch.offset+patch.added.length)!==patch.added)return null;
  restored=restored.slice(0,patch.offset)+patch.removed+restored.slice(patch.offset+patch.added.length);
 }
 return digest(restored)===proof.baseline_sha256?restored:null;
}
