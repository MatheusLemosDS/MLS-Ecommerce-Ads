import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function buildCommercialAuth({root=projectRoot,input='docs/finance-connection-delivery/auth-worker.mjs',output='docs/finance-connection-delivery/auth-worker.mjs',minify=true}={}){
 const original=await readFile(path.resolve(root,input),'utf8'),marker='export default {';
 if(original.split(marker).length!==2||original.includes('MLS_LEGACY_AUTH_WORKER')||!original.includes('async function validateInternalApp('))throw Object.assign(Error('COMMERCIAL_AUTH_BASE_INVALID'),{code:'COMMERCIAL_AUTH_BASE_INVALID'});
 const bundle=await build({absWorkingDir:root,entryPoints:['web/cloudflare/src/commercial-auth-worker.mjs'],bundle:true,write:false,format:'iife',globalName:'MLS_COMMERCIAL_AUTH',platform:'browser',target:'es2022',minify,legalComments:'inline',metafile:true,conditions:['browser','worker','import'],logLevel:'silent'});
 const graph=bundle.outputFiles[0].text;if(/\b(?:from\s*["']node:|require\(["']node:|node:crypto)\b/.test(graph))throw Error('COMMERCIAL_AUTH_NODE_DEPENDENCY');
 const licenses=await Promise.all(['node_modules/otpauth/LICENSE.md','node_modules/@noble/hashes/LICENSE'].map(file=>readFile(path.resolve(root,file),'utf8'))),notices='/*! MLS account runtime dependency notices\n'+licenses.join('\n\n').replaceAll('*/','* /')+'\n*/\n';
 const source=original.replace(marker,'const MLS_LEGACY_AUTH_WORKER = {')+'\n\n'+notices+graph+'\nexport default MLS_COMMERCIAL_AUTH.createCommercialAuthWorker(MLS_LEGACY_AUTH_WORKER,{validateInternalApp});\n';
 await mkdir(path.dirname(path.resolve(root,output)),{recursive:true});await writeFile(path.resolve(root,output),source);
 return {output,bytes:Buffer.byteLength(source),legacyBytes:Buffer.byteLength(original),graphBytes:Buffer.byteLength(graph),sha256:createHash('sha256').update(source).digest('hex'),sourceInputs:Object.keys(bundle.metafile.inputs).sort()};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),positional=args.filter(a=>a!=='--no-minify'),input=positional[0]??'docs/finance-connection-delivery/auth-worker.mjs',output=positional[1]??input;console.log(JSON.stringify(await buildCommercialAuth({input,output,minify:!args.includes('--no-minify')})));}catch(error){console.error(error?.code??error?.message??'COMMERCIAL_AUTH_BUILD_FAILED');process.exitCode=1;}
}
