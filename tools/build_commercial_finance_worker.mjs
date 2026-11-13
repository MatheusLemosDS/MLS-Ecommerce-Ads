import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {PROJECT_ROOT,sha256} from './worker_project.mjs';

// The historical builder still verifies its exact original Auth SHA before
// assembly. Finance then has one ESM graph, including tenant context brands.
export async function buildCommercialFinanceWorker({root=PROJECT_ROOT,outfile=path.join(root,'docs/finance-connection-delivery/finance-worker.mjs'),run=execFileSync,minify=false}={}){
 run('python3',['-B','tools/build_finance_connection_candidate.py'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const result=await build({absWorkingDir:root,entryPoints:['web/finance/src/commercial-finance-worker.mjs'],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022',minify,sourcemap:false,metafile:true,legalComments:'inline',logLevel:'silent',write:false});
 if(result.outputFiles.length!==1)throw Error('COMMERCIAL_FINANCE_BUILD_OUTPUT_INVALID');
 const output=result.outputFiles[0].contents;fs.mkdirSync(path.dirname(outfile),{recursive:true});fs.writeFileSync(outfile,output);
 const sources=Object.fromEntries(Object.keys(result.metafile.inputs).sort().map(name=>[name,sha256(fs.readFileSync(path.resolve(root,name)))]));
 return {entry:'web/finance/src/commercial-finance-worker.mjs',outfile:path.relative(root,outfile),bytes:output.length,sha256:sha256(output),sources};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await buildCommercialFinanceWorker(process.argv[2]?{outfile:path.resolve(process.argv[2])}:{})));}catch(error){console.error(error?.message||'COMMERCIAL_FINANCE_BUILD_FAILED');process.exitCode=1;}
}
