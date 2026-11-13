import {TOTP,Secret} from 'otpauth';
import {ACCOUNT_POLICY} from './account-policy.mjs';

const encoder=new TextEncoder();
export class AccountCryptoError extends Error{
 constructor(code,status=400){super(code);this.name='AccountCryptoError';this.code=code;this.status=status;}
}
const fail=(code,status=400)=>{throw new AccountCryptoError(code,status);};
const commonPasswords=new Set(['123456789012345','1234567890123456','12345678901234567890','passwordpassword','passwordpassword1','passwordpassword123','password123456789','qwertyuiopasdfgh','qwertyuiopasdfghjkl','letmeinletmein123','iloveyouiloveyou','adminadminadmin','administrator123','passw0rdpassw0rd!','correct horse battery staple','minhasenhamuitosegura','senhasenha123456','123456789abcdefg']);
const commonKey=value=>value.normalize('NFKC').toLocaleLowerCase('en-US');
export function validateAccountPassword(password,{blockedPasswords=[]}={}){
 if(typeof password!=='string'||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u0000/.test(password))fail('ACCOUNT_PASSWORD_INVALID');
 const length=[...password].length;
 if(length<ACCOUNT_POLICY.passwordMin)fail('ACCOUNT_PASSWORD_TOO_SHORT');
 if(length>ACCOUNT_POLICY.passwordMax)fail('ACCOUNT_PASSWORD_TOO_LONG');
 if(!Array.isArray(blockedPasswords)||blockedPasswords.some(value=>typeof value!=='string'))fail('ACCOUNT_PASSWORD_POLICY_CONFIGURATION',503);
 const key=commonKey(password);
 if(commonPasswords.has(key)||blockedPasswords.some(value=>commonKey(value)===key)||/^(.)\1{14,}$/us.test(password))fail('ACCOUNT_PASSWORD_COMMON');
 return password;
}
function encode(bytes){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode(value,maximum=1048576){
 if(typeof value!=='string'||!value||value.length>maximum||!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)fail('ACCOUNT_CRYPTO_ENCODING_INVALID');
 let bytes;try{bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));}catch{fail('ACCOUNT_CRYPTO_ENCODING_INVALID');}
 if(encode(bytes)!==value)fail('ACCOUNT_CRYPTO_ENCODING_INVALID');return bytes;
}
function bytes(value){if(typeof value==='string')return encoder.encode(value);if(value instanceof Uint8Array)return value;fail('ACCOUNT_CRYPTO_INPUT_INVALID');}
export function accountToken(size=32){if(!Number.isSafeInteger(size)||size<16||size>128)fail('ACCOUNT_TOKEN_SIZE_INVALID');return encode(crypto.getRandomValues(new Uint8Array(size)));}
export async function accountDigest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function accountEqual(left,right){
 if(typeof left!=='string'||typeof right!=='string')return false;
 const [a,b]=await Promise.all([left,right].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
 const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;
}
function passwordIterations({iterations=ACCOUNT_POLICY.passwordIterations,test=false}={}){
 if(!Number.isSafeInteger(iterations)||iterations<1000||iterations>ACCOUNT_POLICY.passwordIterations||iterations!==ACCOUNT_POLICY.passwordIterations&&test!==true)fail('ACCOUNT_PASSWORD_KDF_CONFIGURATION',503);
 return iterations;
}
async function derive(password,salt,iterations){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
export async function hashAccountPassword(password,options={}){
 validateAccountPassword(password,options);const iterations=passwordIterations(options),salt=crypto.getRandomValues(new Uint8Array(32)),result=await derive(password,salt,iterations);
 return '$mls-pbkdf2-sha256$v=1$i='+iterations+'$'+encode(salt)+'$'+encode(result);
}
export async function verifyAccountPassword(password,encoded,{test=false}={}){
 if(typeof password!=='string'||[...password].length>ACCOUNT_POLICY.passwordMax||typeof encoded!=='string'||encoded.length>256)return false;
 const match=/^\$mls-pbkdf2-sha256\$v=1\$i=([1-9][0-9]{3,5})\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{43})$/.exec(encoded);if(!match)return false;
 let salt,expected,iterations;
 try{iterations=passwordIterations({iterations:Number(match[1]),test});salt=decode(match[2]);expected=decode(match[3]);}catch{return false;}
 if(salt.length!==32||expected.length!==32)return false;
 const actual=await derive(password,salt,iterations);let difference=0;for(let i=0;i<actual.length;i++)difference|=actual[i]^expected[i];return difference===0;
}
async function encryptionKey(value){
 let raw;try{raw=typeof value==='string'?decode(value):value;}catch{fail('ACCOUNT_ENCRYPTION_CONFIGURATION',503);}
 if(!(raw instanceof Uint8Array)||raw.length!==32)fail('ACCOUNT_ENCRYPTION_CONFIGURATION',503);
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function additionalData(aad){if(typeof aad!=='string'||encoder.encode(aad).byteLength>2048)fail('ACCOUNT_ENCRYPTION_CONTEXT_INVALID');return encoder.encode(JSON.stringify(['MLS_ACCOUNT_AESGCM_V1',aad]));}
export async function accountEncrypt(value,key,{aad=''}={}){
 let plaintext;try{plaintext=JSON.stringify(value);}catch{fail('ACCOUNT_ENCRYPTION_INPUT_INVALID');}
 if(typeof plaintext!=='string'||encoder.encode(plaintext).byteLength>65536)fail('ACCOUNT_ENCRYPTION_INPUT_INVALID');
 const imported=await encryptionKey(key),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:additionalData(aad),tagLength:128},imported,encoder.encode(plaintext));
 return {version:1,iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};
}
export async function accountDecrypt(record,key,{aad=''}={}){
 if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).length!==3||record.version!==1||!Object.hasOwn(record,'iv')||!Object.hasOwn(record,'ciphertext'))fail('ACCOUNT_ENCRYPTED_VALUE_INVALID');
 const imported=await encryptionKey(key);
 try{const iv=decode(record.iv,16),ciphertext=decode(record.ciphertext,90000);if(iv.length!==12||ciphertext.length<16||ciphertext.length>65552)throw Error();
 const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:additionalData(aad),tagLength:128},imported,ciphertext);
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
 }catch{fail('ACCOUNT_DECRYPTION_FAILED',503);}
}
function otpSecret(value){if(typeof value!=='string'||!/^[A-Z2-7]{32}$/.test(value))fail('ACCOUNT_MFA_SECRET_INVALID');return Secret.fromBase32(value);}
function clock(value){const stamp=typeof value==='function'?value():value;if(!Number.isSafeInteger(stamp)||stamp<0||stamp>4102444800000)fail('ACCOUNT_CLOCK_INVALID',503);return stamp;}
export function createAccountTotpSecret(){return new Secret({size:20}).base32;}
export function accountTotp(secret,{now=Date.now(),digits=ACCOUNT_POLICY.totpDigits}={}){
 if(![6,8].includes(digits))fail('ACCOUNT_MFA_POLICY_INVALID');
 return TOTP.generate({secret:otpSecret(secret),algorithm:'SHA1',digits,period:ACCOUNT_POLICY.totpPeriodSeconds,timestamp:clock(now)});
}
export function verifyAccountTotp(secret,token,{now=Date.now(),afterCounter=-1,window=ACCOUNT_POLICY.totpWindow}={}){
 if(typeof token!=='string'||!/^\d{6}$/.test(token))return null;
 if(!Number.isSafeInteger(afterCounter)||afterCounter< -1||!Number.isSafeInteger(window)||window<0||window>1)fail('ACCOUNT_MFA_POLICY_INVALID');
 const stamp=clock(now),counter=Math.floor(stamp/1000/ACCOUNT_POLICY.totpPeriodSeconds);
 const delta=TOTP.validate({secret:otpSecret(secret),token,algorithm:'SHA1',digits:ACCOUNT_POLICY.totpDigits,period:ACCOUNT_POLICY.totpPeriodSeconds,timestamp:stamp,window,afterCounter});
 return delta===null?null:counter+delta;
}
