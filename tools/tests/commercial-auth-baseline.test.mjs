import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
test('finance build accepts only both exact independently reviewed Auth variants and rejects drift',()=>{
 const program=String.raw`
import importlib.util,json
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('candidate',root/'tools/build_finance_connection_candidate.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
source=(root/'web/cloudflare/auth-worker.mjs').read_bytes()
old_signature=b'async function boundedOrdersRead(target,headers,timeoutMs,maxBytes=16384){'
new_signature=b'async function boundedOrdersRead(target,headers,timeoutMs,maxBytes=16384,fetchImpl=fetch){'
old_fetch=b"const response=await fetch(target,{method:'GET',headers,redirect:'manual',signal});"
new_fetch=b"const response=await fetchImpl(target,{method:'GET',headers,redirect:'manual',signal});"
original=source.replace(new_signature,old_signature).replace(new_fetch,old_fetch)
assert original.count(old_signature)==2 and original.count(old_fetch)==2
updated=original.replace(old_signature,new_signature).replace(old_fetch,new_fetch)
accepted=[module.validate_auth_baseline(original),module.validate_auth_baseline(updated)]
assert len(module.REVIEWED_AUTH_SHA256)==2
denied=0
for raw in [original+b'\n// unreviewed drift\n',updated.replace(b'APP_INTERNAL_SECRET',b'UNREVIEWED_AUTHORITY',1),updated[:-1]]:
 try:module.validate_auth_baseline(raw)
 except SystemExit:denied+=1
 else:raise AssertionError('unreviewed Auth was accepted')
print(json.dumps({'accepted':accepted,'denied':denied}))
`;
 const result=JSON.parse(execFileSync('python3',['-B','-c',program],{cwd:root,encoding:'utf8'}));assert.deepEqual(result.accepted,['45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56','aaeced29f8d6c9a4b362bde5f9d8ea130abd8b2c2ad7cdd282725b0f88b4ffc2']);assert.equal(result.denied,3);
});
