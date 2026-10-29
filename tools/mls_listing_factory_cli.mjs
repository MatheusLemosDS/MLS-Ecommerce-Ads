#!/usr/bin/env node
// Local-only CLI. Reads operator files, writes a review manifest; zero network calls.
import {readFileSync,statSync,realpathSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planMlsListingFactory} from '../web/cloudflare/src/mls-listing-factory-planner.mjs';

const validName=name=>typeof name==='string'&&name.length<=160&&name.length>4&&
 !/[\/\\\u0000-\u001f\u007f]/.test(name)&&!name.startsWith('.')&&/\.(png|jpe?g)$/i.test(name);
export function inspectLocalListingImage(assetsDirectory,name){
 if(!validName(name))return null;
 try{
  const root=realpathSync(assetsDirectory),target=realpathSync(path.join(root,name));
  if(path.dirname(target)!==root)return null;
  const stat=statSync(target);
  if(!stat.isFile()||stat.size<1||stat.size>2*1024*1024)return null;
  const bytes=readFileSync(target);let mime=null,width=null,height=null;
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  if(bytes.length>=33&&bytes.subarray(0,8).equals(png)&&
   bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'){
   mime='image/png';width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else if(bytes.length>=11&&bytes[0]===255&&bytes[1]===216){
   mime='image/jpeg';let offset=2;
   while(offset+4<bytes.length){
    if(bytes[offset]!==255)break;
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===217||marker===218)break;
    if(marker===1||(marker>=208&&marker<=215))continue;
    if(offset+2>bytes.length)break;
    const length=bytes.readUInt16BE(offset);
    if(length<2||offset+length>bytes.length)break;
    if((marker>=192&&marker<=207)&&![196,200,204].includes(marker)&&length>=7){
     height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;
    }
    offset+=length;
   }
  }
  if(!mime||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
   width<1||height<1||width>50000||height>50000||
   mime!==(name.toLowerCase().endsWith('.png')?'image/png':'image/jpeg'))return null;
  return {name,mime,width,height,size_bytes:stat.size,
   sha256:createHash('sha256').update(bytes).digest('hex'),inspection:'HEADER_ONLY_SHA256'};
 }catch{return null;}
}

export function buildLocalListingReview(input,assetsDirectory){
 const seen=new Set(),media={};
 if(!input||!Array.isArray(input.items)||input.items.length>500)return null;
 for(const row of input.items){
  if(!Array.isArray(row?.images))continue;
  for(const name of row.images){
   if(!validName(name)||seen.has(name))continue;
   seen.add(name);
   const observed=inspectLocalListingImage(assetsDirectory,name);
   if(observed)media[name]=observed;
  }
 }
 return planMlsListingFactory(input,media);
}

function main(argv){
 if(argv.length!==3){
  console.error('Uso: node tools/mls_listing_factory_cli.mjs <manifest.json> <pasta-imagens> <saida.json>');
  process.exitCode=2;return;
 }
 try{
  const [manifest,assets,output]=argv;
  if(statSync(manifest).size>1024*1024)throw Error('MANIFEST_LIMIT');
  const input=JSON.parse(readFileSync(manifest,'utf8'));
  const review=buildLocalListingReview(input,assets);
  if(!review)throw Error('MANIFEST_SCHEMA_INVALID');
  const dest=path.resolve(output);mkdirSync(path.dirname(dest),{recursive:true});
  const pending=dest+'.pending-'+process.pid;
  writeFileSync(pending,JSON.stringify(review,null,2)+'\n',{flag:'wx',mode:0o600});
  renameSync(pending,dest);
  console.log('MLS Listing Factory · '+review.summary.items+' anúncio(s) · '+
   review.summary.ready_for_review+' pronto(s) para revisão · '+
   review.summary.needs_correction+' com correção necessária · '+review.summary.batches+' lote(s).');
  console.log('Manifesto de revisão salvo. Nenhuma imagem foi enviada e nenhum anúncio publicado.');
 }catch(error){
  console.error('MLS_LISTING_FACTORY_CLI_FAILED:',error.message==='MANIFEST_LIMIT'?'MANIFEST_LIMIT':
   error.message==='MANIFEST_SCHEMA_INVALID'?'MANIFEST_SCHEMA_INVALID':'LOCAL_INPUT_INVALID');
  process.exitCode=1;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv.slice(2));
