import {projectProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';

// Cost-only composition of an explicitly numbered two-shirt selling unit.
// Axis 1/2 says nothing about gender, artwork, garment ownership or manufacture.
// This current catalogue evidence must never approve a historical identity.
export function numberedAdultKitCostCompositions(itemId,catalog){
 const read=(value,key)=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
 if(typeof itemId!=='string'||!/^[1-9][0-9]{0,19}$/.test(itemId))return [];
 const count=read(read(catalog,'variants'),'length');
 if(!Number.isSafeInteger(count)||count<1||count>1000)return [];
 const source=projectProductCostCatalog(catalog,count);if(!source)return [];
 const normal=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const title=normal(source.product_name),tokens=new Set(title.split(' '));
 const twoShirts=/\b(?:2|duas) (?:camisetas?|camisas?)\b/.test(title)||tokens.has('casal')&&/\b(?:camisetas?|camisas?)\b/.test(title);
 // A pair title cannot override an explicit single or larger quantity.
 // Include compound cardinals (e.g. vinte e duas), not a short 1–5 list.
 const cardinal='(?:[0-9]+|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezasseis|dezessete|dezassete|dezoito|dezenove|dezanove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|duzentas|trezentos|trezentas|quatrocentos|quatrocentas|quinhentos|quinhentas|seiscentos|seiscentas|setecentos|setecentas|oitocentos|oitocentas|novecentos|novecentas|mil|duzia|duzias|meia|meio|trio|trios)',quantity=cardinal+'(?: e '+cardinal+')*';
 const declarations=[...title.matchAll(new RegExp('\\b('+quantity+') ?(?:camisetas?|camisas?|pecas?|unidades?)\\b','g')),...title.matchAll(new RegExp('\\b(?:kit|combo|conjunto)(?: de)? ('+quantity+')\\b','g'))];
 const contradictory=declarations.some(match=>!['2','duas','dois'].includes(match[1]))||/\b(?:avuls[ao]s?|unitari[ao]s?)\b|\b(?:unidades?|pecas?) unic[ao]s?\b|\bunic[ao]s? (?:camisetas?|camisas?|unidades?|pecas?)\b/.test(title);
 if(!twoShirts||contradictory||['infantil','infantis','kids','crianca','criancas','bebe','bebes','body','calca','calcas','baggy','short','shorts','bermuda','bermudas','moletom','moletons','vestido','vestidos','saia','saias','legging','leggings','pet','pets','boneca','bonecas','familia','family','filho','filhos','filha','filhas'].some(word=>tokens.has(word)))return [];
 const sizes=new Set(['P','M','G','GG','G1','G2','G3']),compositions=[];
 for(const variant of source.variants){
  if(variant.attributes.length!==2)continue;
  const axes=new Map(variant.attributes.map(attribute=>[normal(attribute.name),attribute.value.trim().toUpperCase()]));
  if(axes.size!==2||!axes.has('tamanho 1')||!axes.has('tamanho 2'))continue;
  const ordered=[axes.get('tamanho 1'),axes.get('tamanho 2')];if(!ordered.every(size=>sizes.has(size)))continue;
  compositions.push({item_id:itemId,model_id:variant.model_id,provenance:'CURRENT_CATALOG_NUMBERED_ADULT_KIT',sizes:ordered});
 }
 return compositions;
}
