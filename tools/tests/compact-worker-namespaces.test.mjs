import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {compactWorkerNamespaces} from '../compact_worker_namespaces.mjs';

const schema='worker_server_namespaces_v1';
const fixture=name=>{
 const browser='const content = "  keep spaces  ";\n// keep this browser comment\nconst template = `value`;';
 return {name,source:'const '+name+' = (() => {\nfunction retainedName(value){\n // ordinary host comment\n return value + 1;\n}\nconst browser = '+JSON.stringify(browser)+';\nreturn {retainedName,browser};\n})();\nconst {retainedName,browser}='+name+';\n'};
};
const evaluate=(source,names)=>vm.runInThisContext('(()=>{\n"use strict";\n'+source+'\nreturn {'+names.join(',')+'};\n})()');

test('namespace whitespace compaction preserves strings, exported names and executable functions',()=>{
 const row=fixture('fixture$Namespace'),result=compactWorkerNamespaces({schema,namespaces:[row]});
 assert.equal(result.schema,schema);assert.equal(result.namespaces[0].name,row.name);
 const compact=result.namespaces[0].source,raw=evaluate(row.source,[row.name])[row.name],actual=evaluate(compact,[row.name])[row.name];
 assert.deepEqual(Object.keys(actual),Object.keys(raw));assert.equal(actual.browser,raw.browser);
 assert.equal(actual.retainedName.name,'retainedName');assert.equal(actual.retainedName.length,raw.retainedName.length);assert.equal(actual.retainedName(41),42);
 assert.match(actual.browser,/keep spaces/);assert.match(actual.browser,/keep this browser comment/);assert.doesNotMatch(compact,/ordinary host comment/);
 assert.ok(Buffer.byteLength(compact)<Buffer.byteLength(row.source));
});

test('compaction rejects malformed, duplicate and dynamic browser interpolation inputs',()=>{
 const row=fixture('fixtureNamespace');
 for(const input of [null,{}, {schema,namespaces:[]},{schema,namespaces:[row],extra:true},{schema,namespaces:[row,row]},{schema,namespaces:[{...row,extra:true}]},{schema,namespaces:[{...row,name:'invalid-name'}]},{schema,namespaces:[{...row,source:''}]}])assert.throws(()=>compactWorkerNamespaces(input));
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source+'\nconst client = String.raw`function f(){${retainedName.toString()}}`;'}]}),/DYNAMIC_CLIENT_SOURCE/);
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source.replace('}=fixtureNamespace;','}=differentNamespace;')}]}),/BOUNDARY_INVALID/);
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{...row,source:row.source+'\n'}]}),/BOUNDARY_INVALID/);
});

test('fragment formatting retains ES module strict semantics for block-scoped functions',()=>{
 const name='strictNamespace',source='const strictNamespace = (() => {\nfunction check(flag){\n if(flag){function hidden(){return 1;}}\n return typeof hidden;\n}\nreturn {check};\n})();\nconst {check}=strictNamespace;\n';
 const actual=compactWorkerNamespaces({schema,namespaces:[{name,source}]}).namespaces[0].source;
 const before=evaluate(source,[name])[name],after=evaluate(actual,[name])[name];
 assert.equal(before.check(true),'undefined');assert.equal(after.check(true),before.check(true));assert.equal(after.check(false),before.check(false));
 assert.throws(()=>compactWorkerNamespaces({schema,namespaces:[{name,source:source.replace('function check(flag)','function check(flag,flag)')}]}),/multiple times in the same parameter list/i,'strict-invalid parameter lists must not be accepted as sloppy scripts');
});

// Execute only the pure namespace builders, never build.py's artifact writes.
// This exercises the real Python→Node integration while retaining every
// original namespace for byte comparisons of the evaluated browser strings.
const probe=String.raw`
import ast,json,re,subprocess,sys
from pathlib import Path
root=Path(sys.argv[1]);source=(root/'build.py').read_text();tree=ast.parse(source)
scope={'root':root,'re':re,'json':json,'subprocess':subprocess,'server_namespace_sources':[]}
for name in ['freeze_client_helpers','source_namespace','compact_server_namespaces']:
    node=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name==name)
    exec(ast.get_source_segment(source,node),scope)
rows=[];names=[]
for node in tree.body:
    if isinstance(node,ast.Assign) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='source_namespace':
        call=node.value;args=[ast.literal_eval(arg) for arg in call.args];kwargs={key.arg:ast.literal_eval(key.value) for key in call.keywords}
        rows.append(scope['source_namespace'](*args,**kwargs));names.append(args[1])
sentinel='\nconst brazaAdmin = (() => {\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n'
raw='\n'.join(rows);compact=scope['compact_server_namespaces'](raw+sentinel)
assert compact.endswith(sentinel),'Admin seam must remain byte exact'
assert sentinel in compact
rejected={}
for key,value in [('missing',raw.replace(scope['server_namespace_sources'][0]['source'],'',1)),('duplicate',raw+scope['server_namespace_sources'][0]['source'])]:
    try:scope['compact_server_namespaces'](value)
    except ValueError:rejected[key]=True
    else:rejected[key]=False
print(json.dumps({'raw':raw,'compact':compact[:-len(sentinel)],'names':names,'selected':[row['name'] for row in scope['server_namespace_sources']],'rejected':rejected}))
`;
const result=spawnSync('python3',['-B','-c',probe,fileURLToPath(new URL('../../web/cloudflare/',import.meta.url))],{encoding:'utf8',maxBuffer:12*1024*1024,timeout:30000});
assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stderr);
const profiles=JSON.parse(result.stdout),raw=evaluate(profiles.raw,profiles.names),compact=evaluate(profiles.compact,profiles.names);

test('the real build preserves every namespace API and all evaluated client/CSS strings',()=>{
 let strings=0,functions=0;
 assert.deepEqual(Object.keys(compact),Object.keys(raw));
 for(const name of profiles.names){
  const before=raw[name],after=compact[name];assert.deepEqual(Object.keys(after),Object.keys(before),name);
  for(const key of Object.keys(before)){
   assert.equal(typeof after[key],typeof before[key],name+'.'+key);
   if(typeof before[key]==='function'){
    functions++;assert.equal(after[key].name,before[key].name,name+'.'+key+' name');assert.equal(after[key].length,before[key].length,name+'.'+key+' arity');
   }else{
    if(typeof before[key]==='string')strings++;
    assert.equal(JSON.stringify(after[key]),JSON.stringify(before[key]),name+'.'+key+' value');
    if(before[key]&&typeof before[key]==='object')assert.equal(Object.isFrozen(after[key]),Object.isFrozen(before[key]),name+'.'+key+' frozen');
   }
  }
 }
 assert.ok(strings>=35,'frozen browser scripts/CSS and constants are compared');assert.ok(functions>=150,'the complete exported host API stays available');
});

test('real markup renderers retain exact HTML and dynamic client namespaces are excluded',()=>{
 for(const [name,key,args] of [
  ['mlsAppReleaseView','releaseOverviewBody',[]],['mlsAppReleaseView','releaseNotesBody',[]],
  ['mlsIncurredProductionView','incurredProductionBody',[]],['mlsProductionWeeklyView','productionWeeklyClosingBody',[]],
  ['mlsProductionCoverageView','productionCoverageBody',[]],['mlsProductionDailyFinanceView','productionDailyFinanceBody',[]],
  ['mlsProductionWorkspaceView','productionWorkspaceBody',[{daily:'daily-fixture',weekly:'weekly-fixture',coverage:'coverage-fixture',reference:'reference-fixture'}]],
 ])assert.equal(compact[name][key](...args),raw[name][key](...args),key+' markup');
 assert.ok(!profiles.selected.includes('brazaBusinessDayView'));assert.ok(!profiles.selected.includes('mlsMissionView'));
 assert.deepEqual(profiles.rejected,{missing:true,duplicate:true});
 const saved=Buffer.byteLength(profiles.raw)-Buffer.byteLength(profiles.compact);
 assert.ok(saved>=25000,'host-only compaction must save at least25KB; actual '+saved);
});
