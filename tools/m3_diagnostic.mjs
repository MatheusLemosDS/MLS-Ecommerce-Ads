import vm from 'node:vm';
import {BUSINESS_MONTH_CLIENT} from '../web/cloudflare/src/business-month-client.mjs';
import {CLIENT} from '../web/cloudflare/src/admin-client.mjs';
import {adminBody} from '../web/cloudflare/src/admin-view.mjs';
import {businessMonthBody} from '../web/cloudflare/src/business-month-view.mjs';
import {MISSION_CLIENT} from '../web/cloudflare/src/mission-control.mjs';

let errors=0;
for(const [label,script] of [['MONTH',BUSINESS_MONTH_CLIENT],['ADMIN',CLIENT],['MISSION',MISSION_CLIENT]]){
 try{new vm.Script(script,{filename:'mls-'+label+'.js'});console.log('M3_DIAG_SCRIPT_OK',label,script.length);}
 catch(error){errors++;console.error('M3_DIAG_SCRIPT_BAD',label,error.name,error.message,String(error.stack).slice(0,1000));}
}
for(const [label,body] of [['MONTH_HTML',businessMonthBody],['ADMIN_HTML',adminBody]]){
 try{
  const html=body();
  console.log('M3_DIAG_HTML_OK',label,html.length,(html.match(/<script\b/g)||[]).length);
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const [index,part] of scripts.entries()){
   if(!part[1].trim())continue;
   try{new vm.Script(part[1],{filename:label+'_'+index+'.js'});}
   catch(error){errors++;console.error('M3_DIAG_HTML_SCRIPT_BAD',label,index,error.name,error.message,String(error.stack).slice(0,1000));}
  }
 }catch(error){errors++;console.error('M3_DIAG_HTML_BAD',label,error.name,error.message,String(error.stack).slice(0,1000));}
}
console.log('M3_DIAG_SCRIPTS',errors);

import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
try {
 const output=await build({entryPoints:[fileURLToPath(new URL('../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:false});
 console.log('M3_DIAG_BUNDLE_BYTES',output.outputFiles[0].text.length);
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'))).default;
 console.log('M3_DIAG_WORKER',typeof worker?.fetch);
 const origin='https://m3-debug.invalid',env={ADMIN_USERNAME:'test-owner',ADMIN_PASSWORD:'TEST_ADMIN_PASSWORD_123456',ADMIN_SESSION_SECRET:'test-m3-diagnostic-'+ 'x'.repeat(40)};
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 console.log('M3_DIAG_LOGIN_STATUS',login.status);
 const cookie=login.headers.get('set-cookie')?.split(';')[0]||'';
 const bootstrap=await worker.fetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env);
 console.log('M3_DIAG_BOOTSTRAP_STATUS',bootstrap.status);
 const html=await worker.fetch(new Request(origin+'/admin',{headers:{cookie}}),env);
 console.log('M3_DIAG_ADMIN_STATUS',html.status);
 const text=await html.text();console.log('M3_DIAG_OWNER_HTML',text.length,(text.match(/<script>/g)||[]).length);
}catch(error){
 errors++;
 console.error('M3_DIAG_WORKER_BOOT_FAILURE',error.name,error.message,String(error.stack).slice(0,950));
}
if(errors)process.exitCode=1;

