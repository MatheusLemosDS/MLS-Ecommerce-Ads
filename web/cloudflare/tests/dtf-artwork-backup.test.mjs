import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {crc32} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createDtfArtworkBackupCodec,createDtfArtworkBackupController} from '../src/dtf-artwork-backup.mjs';
import {normalizeDtfArtKey} from '../src/dtf-layout.mjs';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const row={art_key:'synthetic-art',sha256:createHash('sha256').update(bytes).digest('hex'),pixel_width:1,pixel_height:1,blob:new Blob([bytes],{type:'image/png'})},scope={origin:'https://owner.example.test',name:'synthetic-account-store'};
const codec=(decode=async()=>({width:1,height:1,close(){}}))=>createDtfArtworkBackupCodec({crypto:webcrypto,decode,normalizeArtKey:normalizeDtfArtKey});
async function alter(zip,name,change,{repairCrc=true}={}){const b=Buffer.from(await zip.arrayBuffer());let p=b.readUInt32LE(b.length-6);while(b.readUInt32LE(p)===0x02014b50){const n=b.readUInt16LE(p+28),local=b.readUInt32LE(p+42),size=b.readUInt32LE(p+24),start=local+30+n;if(b.subarray(p+46,p+46+n).toString()===name){change(b.subarray(start,start+size),b,p,local);if(repairCrc){const c=crc32(b.subarray(start,start+size));b.writeUInt32LE(c,p+16);b.writeUInt32LE(c,local+14);}return new Blob([b]);}p+=46+n;}throw Error('fixture-entry-missing');}
test('backup is a standard ZIP with exact original PNG bytes and all SKU identities; Python independently reads it',async()=>{
 const c=codec(),zip=await c.pack([row,{...row,art_key:'another-sku'}],scope),result=await c.unpack(zip,scope);assert.deepEqual(result.rows.map(r=>r.art_key),['another-sku','synthetic-art']);for(const r of result.rows)assert.deepEqual(Buffer.from(await r.blob.arrayBuffer()),bytes);
 const python="import sys,zipfile,io,json,hashlib; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); m=json.loads(z.read('manifest.json')); assert len(m['arts'])==2; assert len(z.namelist())==2; assert z.testzip() is None; assert all(hashlib.sha256(z.read(a['path'])).hexdigest()==a['sha256'] for a in m['arts']); print('ZIP_PNG_HASHES_VERIFIED')";
 assert.equal(execFileSync('python3',['-c',python],{input:Buffer.from(await zip.arrayBuffer()),encoding:'utf8'}).trim(),'ZIP_PNG_HASHES_VERIFIED');assert.deepEqual(await c.compare(result.rows,[row]),{add:[result.rows[0]],same:['synthetic-art']});
});
test('one corrupt pixel rejects even when ZIP CRC is repaired; changed scope and manifest identities are rejected',async()=>{
 const c=codec(),zip=await c.pack([row],scope),path='artworks/'+row.sha256+'.png';await assert.rejects(c.unpack(await alter(zip,path,b=>b[45]^=1),scope),/DTF_BACKUP_PIXELS/);await assert.rejects(c.unpack(await alter(zip,path,b=>b[45]^=1,{repairCrc:false}),scope),/DTF_BACKUP_PIXELS/);
 for(const other of [{...scope,name:'other-store'},{...scope,origin:'https://other.example.test'}])await assert.rejects(c.unpack(zip,other),/DTF_BACKUP_SCOPE/);
 await assert.rejects(c.unpack(await alter(zip,'manifest.json',b=>{const i=b.indexOf('synthetic-art');b[i]=47;}),scope));
});
test('truncation, trailing bytes, compression, encryption and traversal paths cannot be restored',async()=>{
 const c=codec(),zip=await c.pack([row],scope),b=Buffer.from(await zip.arrayBuffer()),path='artworks/'+row.sha256+'.png';for(const bad of [new Blob([b.subarray(0,-1)]),new Blob([b,Buffer.from([0])])])await assert.rejects(c.unpack(bad,scope));
 for(const modify of [(b,p,l)=>{b.writeUInt16LE(8,p+10);b.writeUInt16LE(8,l+8);},(b,p,l)=>{b.writeUInt16LE(1,p+8);b.writeUInt16LE(1,l+6);},(b,p,l)=>{b.write('../evil/',p+46);b.write('../evil/',l+30);},(b,p,l)=>b.writeUInt32LE(0,l+18)])await assert.rejects(c.unpack(await alter(zip,path,(_,b,p,l)=>modify(b,p,l)),scope));
});
test('invalid PNG, decoding mismatch, duplicate identity and limits fail without omitting rows',async()=>{
 const c=codec();await assert.rejects(c.pack([],scope),/DTF_BACKUP_LIMIT/);await assert.rejects(c.pack([row,row],scope),/DTF_BACKUP_INVALID/);await assert.rejects(c.pack(Array(5001).fill(row),scope),/DTF_BACKUP_LIMIT/);await assert.rejects(c.pack([{...row,blob:new Blob([new Uint8Array(33554433)])}],scope),/DTF_BACKUP_LIMIT/);await assert.rejects(c.pack([{...row,pixel_width:2}],scope),/DTF_BACKUP_PIXELS/);await assert.rejects(codec(async()=>({width:2,height:1})).pack([row],scope),/DTF_BACKUP_PIXELS/);await assert.rejects(codec(async()=>{throw Error('decode-failed');}).pack([row],scope),/decode-failed/);
});
test('restoration never replaces a conflicting name or accepts corrupted local pixels, and respects session changes',async()=>{
 const c=codec();await assert.rejects(c.compare([row],[{...row,sha256:'b'.repeat(64)}]),/DTF_BACKUP_CONFLICT/);await assert.rejects(c.compare([row],[{...row,blob:new Blob([new Uint8Array(bytes.length)])}]),/DTF_BACKUP_PIXELS/);await assert.rejects(c.pack([row],scope,{current:()=>false}),/DTF_BACKUP_SESSION/);const zip=await c.pack([row],scope);await assert.rejects(c.unpack(zip,scope,{current:()=>false}),/DTF_BACKUP_SESSION/);
});
function controllerFixture({commit=async()=>{},read=async()=>[]}={}){const els=new Map(['Download','File','Status','Summary','Review','Confirm','Cancel','Restore'].map(k=>[k,{value:'',checked:false,hidden:false,disabled:false,textContent:''}]));let calls=0,changed=0;const controller=createDtfArtworkBackupController({codec:codec(),scope:()=>scope,current:()=>true,read,commit:async(...args)=>{calls++;await commit(...args);},run:fn=>fn(),changed:()=>{changed++;},document:{getElementById:id=>els.get(id.slice(9))},URL});return {controller,el:key=>els.get(key),calls:()=>calls,changed:()=>changed};}
test('restore requires explicit confirmation and does not report success when storage did not commit',async()=>{
 const f=controllerFixture(),zip=await codec().pack([row],scope);await f.el('File').onchange({target:{files:[zip]}});assert.equal(f.el('Review').hidden,false);await f.el('Restore').onclick();assert.equal(f.calls(),0);f.el('Confirm').checked=true;await f.el('Restore').onclick();assert.equal(f.calls(),1);assert.equal(f.changed(),0);assert.doesNotMatch(f.el('Status').textContent,/após a restauração/);
});
test('conflicting restore commits nothing and cancellation discards the preview',async()=>{
 const f=controllerFixture({read:async()=>[{...row,sha256:'b'.repeat(64)}]}),zip=await codec().pack([row],scope);await f.el('File').onchange({target:{files:[zip]}});assert.match(f.el('Status').textContent,/diferentes/);assert.equal(f.calls(),0);const g=controllerFixture();await g.el('File').onchange({target:{files:[zip]}});g.el('Cancel').onclick();g.el('Confirm').checked=true;await g.el('Restore').onclick();assert.equal(g.calls(),0);
});
