import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const schema='worker_server_namespaces_v1';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

// Compact host JavaScript formatting with syntax optimization, identifier
// minification and dead-code removal disabled. Exported names/arities and all
// string values (including frozen browser helpers) have build-profile checks.
// Modules with dynamic Function#toString interpolation are rejected: their
// client output would otherwise depend on host function formatting.
export function compactWorkerNamespaces(input){
 if(!exact(input,['schema','namespaces'])||input.schema!==schema||!Array.isArray(input.namespaces)||!input.namespaces.length||input.namespaces.length>128)throw Error('WORKER_NAMESPACE_INPUT_INVALID');
 const seen=new Set();
 return {schema,namespaces:input.namespaces.map(row=>{
  if(!exact(row,['name','source'])||typeof row.name!=='string'||!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(row.name)||seen.has(row.name)||typeof row.source!=='string'||!row.source.length||Buffer.byteLength(row.source)>1048576)throw Error('WORKER_NAMESPACE_ROW_INVALID');
  if(/\$\{[^{}\n]*\.toString\(\)/.test(row.source))throw Error('WORKER_NAMESPACE_DYNAMIC_CLIENT_SOURCE');
  seen.add(row.name);
  // Keep the outer destructuring outside the formatter. Otherwise esbuild
  // disambiguates same-named inner bindings despite minifyIdentifiers:false.
  const boundary=row.source.lastIndexOf('\nconst {'),tail=row.source.slice(boundary),match=/^\nconst \{[A-Za-z0-9_$,]+\}=([A-Za-z_$][A-Za-z0-9_$]*);\n$/.exec(tail);
  if(boundary<0||match?.[1]!==row.name)throw Error('WORKER_NAMESPACE_BOUNDARY_INVALID');
  // A generated Worker is an ES module and therefore strict. A fragment has
  // no import/export syntax, so explicitly preserve that parse context rather
  // than letting sloppy-script Annex B rewrite block-scoped functions.
  const result=transformSync('"use strict";\n'+row.source.slice(0,boundary),{loader:'js',target:'esnext',charset:'utf8',legalComments:'inline',treeShaking:false,minifyWhitespace:true,minifySyntax:false,minifyIdentifiers:false,sourcefile:row.name+'.mjs'});
  if(result.warnings.length)throw Error('WORKER_NAMESPACE_COMPACTION_WARNING');
  return {name:row.name,source:result.code+tail};
 })};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(compactWorkerNamespaces(JSON.parse(readFileSync(0,'utf8')))));}
 catch(error){process.stderr.write((error?.message||'WORKER_NAMESPACE_COMPACTION_FAILED')+'\n');process.exitCode=1;}
}
