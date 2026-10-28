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
console.log('M3_DIAG_RESULT',errors);
if(errors)process.exitCode=1;
