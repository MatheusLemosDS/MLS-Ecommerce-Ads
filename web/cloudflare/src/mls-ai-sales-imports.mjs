/** Bounded local interchange only. No filesystem, network, storage or evaluation. */
export class AiSalesImportError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new AiSalesImportError(code);};
const MAX_BYTES=2*1024*1024,MAX_ROWS=5000,MAX_CELL=32768;
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const headersChecked=headers=>{
 if(!Array.isArray(headers)||headers.length<1||headers.length>64||new Set(headers).size!==headers.length||headers.some(key=>typeof key!=='string'||!/^[_a-z][_a-z0-9]{0,63}$/.test(key)))fail('AI_SALES_CSV_HEADERS_INVALID');
 return headers;
};
const textChecked=text=>{
 if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))fail('AI_SALES_IMPORT_TEXT_INVALID');
 return text.charCodeAt(0)===0xfeff?text.slice(1):text;
};

// Apostrophe escaping protects spreadsheet imports without altering the local
// semantic value on a subsequent export/import round trip.
function encodeCell(value){
 if(value===null||value===undefined)return '';
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))fail('AI_SALES_CSV_VALUE_INVALID');return String(value);}
 if(typeof value!=='string'||value.length>MAX_CELL)fail('AI_SALES_CSV_VALUE_INVALID');
 let text=value;if(/^['=+\-@\t\r\n]/.test(text)||/^\s+[=+\-@]/.test(text))text="'"+text;
 return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
function decodeCell(text){return /^'(?:['=+\-@\t\r\n]|\s+[=+\-@])/.test(text)?text.slice(1):text;}

export function exportAiSalesCsv(rows,headers){
 headersChecked(headers);
 if(!Array.isArray(rows)||rows.length>MAX_ROWS)fail('AI_SALES_CSV_ROWS_INVALID');
 const lines=[headers.join(',')];
 for(const row of rows){
  if(!plain(row)||Reflect.ownKeys(row).some(key=>typeof key!=='string'||!headers.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value')))fail('AI_SALES_CSV_ROW_INVALID');
  lines.push(headers.map(key=>encodeCell(row[key])).join(','));
 }
 const output=lines.join('\r\n')+'\r\n';textChecked(output);return output;
}

export function parseAiSalesCsv(raw,headers){
 headersChecked(headers);const text=textChecked(raw),rows=[];let row=[],cell='',quoted=false,closed=false;
 const finishCell=()=>{if(cell.length>MAX_CELL)fail('AI_SALES_CSV_CELL_TOO_LONG');row.push(decodeCell(cell));cell='';closed=false;if(row.length>64)fail('AI_SALES_CSV_COLUMNS_INVALID');};
 const finishRow=()=>{finishCell();if(row.length===1&&row[0]===''&&rows.length&&row!==rows[0]){row=[];return;}rows.push(row);row=[];if(rows.length>MAX_ROWS+1)fail('AI_SALES_CSV_ROWS_INVALID');};
 for(let index=0;index<text.length;index++){
  const char=text[index];
  if(quoted){if(char==='"'){if(text[index+1]==='"'){cell+='"';index++;}else{quoted=false;closed=true;}}else cell+=char;}
  else if(char==='"'){if(cell!==''||closed)fail('AI_SALES_CSV_QUOTE_INVALID');quoted=true;}
  else if(char===',')finishCell();
  else if(char==='\r'||char==='\n'){finishRow();if(char==='\r'&&text[index+1]==='\n')index++;}
  else{if(closed)fail('AI_SALES_CSV_QUOTE_INVALID');cell+=char;}
  if(cell.length>MAX_CELL)fail('AI_SALES_CSV_CELL_TOO_LONG');
 }
 if(quoted)fail('AI_SALES_CSV_QUOTE_INVALID');if(cell!==''||row.length||closed)finishRow();
 if(!rows.length||rows[0].length!==headers.length||rows[0].some((value,index)=>value!==headers[index]))fail('AI_SALES_CSV_HEADERS_INVALID');
 return Object.freeze(rows.slice(1).map(values=>{
  if(values.length!==headers.length)fail('AI_SALES_CSV_COLUMNS_INVALID');
  return Object.freeze(Object.fromEntries(headers.map((key,index)=>[key,values[index]])));
 }));
}

export function parseAiSalesJson(raw){
 const text=textChecked(raw);let value;try{value=JSON.parse(text);}catch{fail('AI_SALES_JSON_INVALID');}
 if(!plain(value))fail('AI_SALES_JSON_INVALID');return value;
}

export function parseAiSalesInteger(value,{nullable=true,signed=false,max=Number.MAX_SAFE_INTEGER}={}){
 if(nullable&&(value===''||value===null))return null;
 if(typeof value==='string'){
  if(!(signed?/^-?(?:0|[1-9][0-9]*)$/:/^(?:0|[1-9][0-9]*)$/).test(value))fail('AI_SALES_IMPORT_INTEGER_INVALID');
  value=Number(value);
 }
 if(!Number.isSafeInteger(value)||Object.is(value,-0)||Math.abs(value)>max||!signed&&value<0)fail('AI_SALES_IMPORT_INTEGER_INVALID');
 return value;
}
