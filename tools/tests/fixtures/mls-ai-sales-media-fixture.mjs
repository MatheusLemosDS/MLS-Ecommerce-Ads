// Original synthetic test shirts. No merchant, customer, design-reference,
// third-party mockup, licensed photograph, or marketplace data is embedded.
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {makeAiSalesProductKey} from '../../../web/cloudflare/src/mls-ai-sales-contracts.mjs';
import {planAiSalesCampaign} from '../../../web/cloudflare/src/mls-ai-sales-campaign-planner.mjs';

const crc=bytes=>{let c=0xffffffff;for(const value of bytes){c^=value;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function chunk(name,bytes){const label=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);label.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([label,bytes])),bytes.length+8);return out;}
const polygon=[[200,110],[240,90],[360,90],[400,110],[490,210],[420,260],[400,220],[400,520],[200,520],[200,220],[180,260],[110,210]];
function inside(x,y){let value=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])value=!value;}return value;}
export function syntheticShirtPng({white=false}={}){
 const w=600,h=600,bytes=Buffer.alloc((w*3+1)*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let color=white?[40,45,55]:[235,235,235];if(inside(x,y))color=white?[248,248,248]:[25,30,40];
  // Deliberately asymmetric green stripe + red arrow pointing right.
  if(x>=250&&x<268&&y>=245&&y<315)color=[25,220,55];
  if(x>=280&&x<340&&y>=267&&y<292||x>=320&&x<360&&Math.abs(y-280)<(360-x)/1.3)color=[235,30,45];
  const p=y*(w*3+1)+1+x*3;bytes[p]=color[0];bytes[p+1]=color[1];bytes[p+2]=color[2];
 }
 const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]);
}

export function writeSyntheticAiSalesFixtures(directory,{count=3,allKits=false}={}){
 const products=[],assets=[],at=1793390400;
 for(let i=0;i<count;i++){
  const identity={marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',platform_product_id:'fixture-product-'+i,variant_ref:'fixture-variant-m'},key=makeAiSalesProductKey(identity),pieces=allKits||i===2?2:1;
  const refs=[],components=[];
  for(let part=0;part<pieces;part++){
   const name='original-shirt-'+i+'-'+part+'.png',id='fixture-photo-'+i+'-'+part,bytes=syntheticShirtPng({white:(i+part)%2===1});writeFileSync(path.join(directory,name),bytes,{mode:0o600});refs.push(id);
   assets.push({schema:'mls_ai_sales_asset_v1',asset_id:id,product_key:key,variant_ref:identity.variant_ref,file_name:name,sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',width:600,height:600,size_bytes:bytes.length,role:'MOCKUP_ORIGINAL',represented_units:1,component_coverage:[{component_ref:'component-'+part,quantity:1}],origin:'LOCAL_OPERATOR',rights:{status:'AUTHORIZED',reference:'ORIGINAL_SYNTHETIC_FIXTURE_OWNED_BY_THIS_TEST',observed_at:at},preserve_geometry:true});
   components.push({component_ref:'component-'+part,size:'M',quantity:1,art_ref:'original-asymmetric-art-'+part});
  }
  const evidence={source:'SYNTHETIC_TEST',reference:'TEST_ONLY_NOT_COMMERCIAL_DATA',observed_at:at,status:'DECLARED',marketplace:'SHOPEE_BR',shop_ref:identity.shop_ref,currency:'BRL',basis:'LOCAL_FIXTURE'};
  products.push({schema:'mls_ai_sales_product_snapshot_v1',...identity,product_key:key,sku:'fixture-art-27-M',title:pieces===2?'Kit de duas camisetas de demonstração':'Camiseta de demonstração',verified_product_attributes:[],landing_url:null,price_cents:null,currency:'BRL',cost_cents:null,fees_cents:null,inventory_units:null,piece_count:pieces,components,observations:[{field:'title',evidence},{field:'piece_count',evidence}],media_refs:refs});
 }
 return {products,assets};
}

export async function localFixtureInput(fixtures,{template='PRODUCT_DETAILS',productIndex=0,all=false,id='fixture-campaign'}={}){
 const products=all?fixtures.products:[fixtures.products[productIndex]],keys=new Set(products.map(p=>p.product_key)),assets=fixtures.assets.filter(a=>keys.has(a.product_key));
 const campaign=await planAiSalesCampaign({campaign_id:id,products,assets,template_id:template,channel:'SHOPEE_VIDEO',goal:'STORE_VIDEO',generated_at:1793390400});
 return {schema:'mls_ai_sales_local_input_v1',campaign,products,assets,narration:{mode:'ESPEAK_NG',language:'pt-BR',voice:'pt-br',words_per_minute:155},budget:{max_provider_cost_cents:0,max_render_seconds:300}};
}

export const localFixtureTools=()=>({ffmpeg:process.env.MLS_AI_SALES_FFMPEG||'ffmpeg',ffprobe:process.env.MLS_AI_SALES_FFPROBE||'ffprobe',espeak:process.env.MLS_AI_SALES_ESPEAK_BIN||'espeak-ng',...(process.env.MLS_AI_SALES_ESPEAK_DATA?{espeakDataPath:process.env.MLS_AI_SALES_ESPEAK_DATA}:{}),...(process.env.MLS_AI_SALES_ESPEAK_LIB?{espeakLibraryPath:process.env.MLS_AI_SALES_ESPEAK_LIB}:{})});
