import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCashStatementImportParser,parseCashStatement,inspectCashStatement,CASH_STATEMENT_IMPORT_LIMITS} from '../src/cash-statement-import.mjs';

const csvOptions={format:'nubank_csv',separator:',',currency:'BRL',date_format:'DMY',amount_format:'DECIMAL'};
const csvHeader='Data,Valor,Identificador,Descrição';
const csv=(body,options={})=>parseCashStatement(csvHeader+'\n'+body,{...csvOptions,...options});
const transaction=(fields='',xml=true)=>'<STMTTRN>'+(
 fields||'<TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261110120000[-3:BRT]</DTPOSTED><TRNAMT>125.90</TRNAMT><FITID>SYNTHETIC_ID_A</FITID><MEMO>Transferência sintética</MEMO>'
).replace(xml?/$^/:/<\/(?:TRNTYPE|DTPOSTED|TRNAMT|FITID|MEMO)>/g,'')+'</STMTTRN>';
const ofx=(transactions=transaction(),{xml=true,currency='BRL',prefix,extra='',account='BANKACCTFROM'}={})=>
 (prefix??(xml?'<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="202"?>\n':'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:UTF-8\nCHARSET:NONE\nCOMPRESSION:NONE\n\n'))+
 '<OFX><BANKMSGSRSV1><STMTTRNRS><TRNUID>0</TRNUID><STMTRS><CURDEF>'+currency+'</CURDEF><'+account+'><BANKID>000</BANKID><ACCTID>SYNTHETIC_ACCOUNT_DO_NOT_EMIT</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></'+account+'><BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>'+transactions+'</BANKTRANLIST>'+extra+'</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
const parseOfx=(text,options={})=>parseCashStatement(text,{format:'nubank_ofx',...options});
const error=(value,code,line)=>{assert.equal(value.ok,false);assert.ok(value.errors.some(entry=>entry.code===code),JSON.stringify(value.errors));if(line!==undefined)assert.ok(value.errors.some(entry=>entry.line===line));};

test('Nubank bank CSV preserves cents, identity, signed values and descriptions without money-derived claims',()=>{
 const value=csv('10/11/2026,125.90,CaseSensitive-ID,Transferência recebida\n11/11/2026,-4.01,debit-id,Pagamento\n12/11/2026,0,zero-id,Zero explícito');
 assert.equal(value.ok,true);assert.equal(value.source,'NUBANK');assert.equal(value.currency,'BRL');
 assert.deepEqual(value.rows[0],{line:2,date:'2026-11-10',amount_cents:12590,external_id:'CaseSensitive-ID',reference:null,description:'Transferência recebida',reported_status:null,source:'NUBANK',source_format:'nubank_csv'});
 assert.deepEqual(value.rows.map(row=>row.amount_cents),[12590,-401,0]);
 for(const field of ['realized_profit_cents','net_profit_cents','balance_cents','account_id','raw'])assert.equal(Object.hasOwn(value,field),false);
});

test('UTF-8 bytes, BOM, CRLF, quoted separators, escaped quotes and multiline fields retain starting line numbers',()=>{
 const text='\ufeff'+csvHeader+'\r\n10/11/2026,10.01,first,"Linha 1, com vírgula\r\nLinha ""2"""\r\n11/11/2026,20.00,second,Fim\r\n';
 const value=parseCashStatement(new TextEncoder().encode(text),csvOptions);
 assert.equal(value.ok,true);assert.equal(value.rows[0].description,'Linha 1, com vírgula Linha "2"');assert.deepEqual(value.rows.map(row=>row.line),[2,4]);
 error(parseCashStatement(Uint8Array.from([0xc3,0x28]),csvOptions),'UTF8_INVALID');
 error(parseCashStatement('\ud800',csvOptions),'UTF8_INVALID');
 error(csv('10/11/2026,1,x,\u0000private'),'CHARACTER_INVALID');
});

test('inspection shares the strict CSV grammar and exposes only header metadata for explicit mapping',()=>{
 const value=inspectCashStatement('\ufeff'+csvHeader+'\n10/11/2026,1,id,Descrição',{separator:','});
 assert.deepEqual(value,{ok:true,headers:['Data','Valor','Identificador','Descrição'],status_headers:[],rows_count:1,detected_format:'nubank_csv',card_csv:false,errors:[]});
 assert.equal(Object.hasOwn(value,'rows'),false);
 error(inspectCashStatement(csvHeader),'SEPARATOR_REQUIRED');
 error(inspectCashStatement('Data,data\n1,2',{separator:','}),'HEADER_INVALID');
});

test('Nubank CSV rejects credit card exports and requires explicit mapping for unknown bank headers',()=>{
 const options={...csvOptions,columns:{date:'Data',amount:'Valor'}};
 error(parseCashStatement('Data,Valor,Descrição\n10/11/2026,1,Título',csvOptions),'NUBANK_HEADER_REQUIRED');
 error(parseCashStatement('date,title,amount\n2026-11-10,Compra,1',csvOptions),'CARD_CSV_UNSUPPORTED');
 error(parseCashStatement(csvHeader+',Cartão\n10/11/2026,1,id,Compra,final0000',csvOptions),'CARD_CSV_UNSUPPORTED');
 assert.equal(parseCashStatement('Data,Valor,Descrição\n10/11/2026,1,Título',options).ok,true);
 error(parseCashStatement('Data,Valor,Cartão\n10/11/2026,1,Final0000',options),'CARD_CSV_UNSUPPORTED');
 assert.equal(inspectCashStatement('Data,Estabelecimento,Valor',{separator:','}).card_csv,true);
});

test('Shopee accepts only explicit unique column mappings and preserves reported status as text',()=>{
 const text='Data do pagamento;Total;Referência;Identificador;Status;Observação\n2026-11-10;"R$ 1.234,56";SYNTHETIC_REF;SYNTHETIC_TRANSFER;Concluído;Transferência';
 const options={format:'shopee_csv',separator:';',currency:'BRL',date_format:'YMD',amount_format:'BRL',columns:{date:'Data do pagamento',amount:'Total',reference:'Referência',external_id:'Identificador',status:'Status',description:'Observação'}};
 const value=parseCashStatement(text,options);assert.equal(value.ok,true);assert.equal(value.rows[0].amount_cents,123456);assert.equal(value.rows[0].reported_status,'Concluído');assert.equal(value.rows[0].source,'SHOPEE');
 error(parseCashStatement(text,{...options,columns:undefined}),'MAPPING_REQUIRED');
 error(parseCashStatement(text,{...options,columns:{date:'Data do pagamento',amount:'Total',reference:'Total',status:'Status'}}),'MAPPING_INVALID');
 error(parseCashStatement(text,{...options,columns:{date:'Data do pagamento',amount:'total',status:'Status'}}),'MAPPING_INVALID');
 error(parseCashStatement(text,{...options,columns:{date:'Data do pagamento',amount:'Total',unsupported:'Status'}}),'MAPPING_REQUIRED');
 const pending=parseCashStatement(text.replace('Concluído','Em processamento'),options);assert.equal(pending.ok,true);assert.equal(pending.rows[0].reported_status,'Em processamento');assert.equal(Object.hasOwn(pending.rows[0],'status'),false);
});

test('CSV format, separator, currency and date/money conventions are never guessed',()=>{
 for(const [field,code] of [['separator','SEPARATOR_REQUIRED'],['currency','CURRENCY_REQUIRED'],['date_format','DATE_FORMAT_REQUIRED'],['amount_format','AMOUNT_FORMAT_REQUIRED']])error(csv('10/11/2026,1,id,Descrição',{[field]:undefined}),code);
 error(csv('10/11/2026,1,id,Descrição',{currency:'USD'}),'CURRENCY_REQUIRED');
 error(csv('10/11/2026,1,id,Descrição',{extra:'private'}),'OPTIONS_INVALID');
 error(parseCashStatement(csvHeader,{}),'FORMAT_REQUIRED');
 const value=parseCashStatement('Data\tValor\tIdentificador\tDescrição\n2026-11-10\t1.25\tid\tFinal',{...csvOptions,separator:'\t',date_format:'YMD'});assert.equal(value.ok,true);assert.equal(value.rows[0].amount_cents,125);
});

test('recognizable Shopee status headers cannot be omitted or replaced by an innocent mapped column',()=>{
 const options={format:'shopee_csv',separator:';',currency:'BRL',date_format:'YMD',amount_format:'DECIMAL',columns:{date:'Data',amount:'Valor'}};
 for(const status of ['Status','Situação','Estado','Transfer status','Status da Transferência','StatusDaTransferencia','TransferStatus']){
  const text='Data;Valor;'+status+';Descrição\n2026-11-10;1.00;PENDING;Texto inocente';
  const info=inspectCashStatement(text,{separator:';'});assert.deepEqual(info.status_headers,[status]);
  error(parseCashStatement(text,options),'MAPPING_STATUS_REQUIRED');
  error(parseCashStatement(text,{...options,columns:{...options.columns,status:'Descrição'}}),'MAPPING_STATUS_REQUIRED');
  const pending=parseCashStatement(text,{...options,columns:{...options.columns,status}});assert.equal(pending.ok,true);assert.equal(pending.rows[0].reported_status,'PENDING');
 }
 const ambiguous='Data;Valor;Status;Situação\n2026-11-10;1.00;PENDING;Concluído';
 error(parseCashStatement(ambiguous,{...options,columns:{...options.columns,status:'Situação'}}),'MAPPING_STATUS_AMBIGUOUS');
 error(parseCashStatement(ambiguous,options),'MAPPING_STATUS_AMBIGUOUS');
 const noStatus=parseCashStatement('Data;Valor;Descrição\n2026-11-10;1.00;Transferência declarada',{...options,columns:{...options.columns,description:'Descrição'}});
 assert.equal(noStatus.ok,true);assert.equal(noStatus.rows[0].reported_status,null);
});

test('calendar validation rejects impossible dates and distinguishes explicit DMY from YMD',()=>{
 assert.equal(csv('29/02/2024,1,id,Leap').ok,true);
 for(const date of ['29/02/2026','31/04/2026','00/11/2026','10/13/2026','10/11/26','2026-11-10'])error(csv(date+',1,id,Invalid'),'DATE_INVALID',2);
 assert.equal(csv('01/02/2026,1,id,Explicit').rows[0].date,'2026-02-01');
});

test('money conversion uses exact integer cents and rejects ambiguous grouping, exponent, subcents and overflow',()=>{
 assert.equal(csv('10/11/2026,90071992547409.91,id,Max').rows[0].amount_cents,Number.MAX_SAFE_INTEGER);
 for(const amount of ['1e3','1.001','Infinity','NaN','1,25','-','90071992547409.92']){
  const value=csv('10/11/2026,"'+amount+'",id,Invalid');assert.equal(value.ok,false);assert.ok(value.errors.every(entry=>['AMOUNT_INVALID','AMOUNT_RANGE'].includes(entry.code)));
 }
 for(const amount of ['1.23','1,234','1.234.56','12.34,00'])error(csv('10/11/2026,"'+amount+'",id,Invalid',{amount_format:'BRL'}),'AMOUNT_INVALID');
 assert.equal(csv('10/11/2026,"-1.234,56",id,Grouped',{amount_format:'BRL'}).rows[0].amount_cents,-123456);
 assert.equal(Object.is(csv('10/11/2026,-0.00,id,Zero').rows[0].amount_cents,-0),false);
});

test('CSV malformed quoting, column counts and headers report only codes and source line numbers',()=>{
 for(const [body,code] of [['10/11/2026,1,id,"unclosed','CSV_QUOTE_UNCLOSED'],['10/11/2026,1,id,"closed"trailer','CSV_QUOTE_INVALID'],['10/11/2026,1,id,un"quoted','CSV_QUOTE_INVALID'],['10/11/2026,1,id','COLUMN_COUNT'],['10/11/2026,1,id,desc,extra','COLUMN_COUNT']])error(csv(body),code,2);
 error(parseCashStatement('Data,Valor,Identificador,Data\n1,2,3,4',csvOptions),'HEADER_INVALID');
 const value=csv('31/02/2026,1,PRIVATE_NEVER_IN_ERROR,PRIVATE_BANK_TEXT\n10/11/2026,2,good,Valid');
 assert.equal(value.ok,false);assert.equal(value.rows.length,1);assert.deepEqual(value.errors,[{line:2,code:'DATE_INVALID'}]);
 assert.ok(!JSON.stringify(value.errors).includes('PRIVATE'));
});

test('identical rows and repeated identities remain separate observations for conflict-aware server dedupe',()=>{
 const text='10/11/2026,1,same-id,Repeated';
 const value=csv(text+'\n'+text+'\n10/11/2026,2,same-id,Changed');
 assert.equal(value.ok,true);assert.equal(value.rows.length,3);assert.deepEqual(value.rows.map(row=>row.amount_cents),[100,100,200]);
 const noId=csv('10/11/2026,1,,Same\n10/11/2026,1,,Same');assert.equal(noId.rows.length,2);assert.ok(noId.rows.every(row=>row.external_id===null));
});

test('bounded CSV accepts exact row/column/cell limits and rejects excessive data before a partial commit',()=>{
 const row='10/11/2026,1,id,Value',atLimit=csv(Array(CASH_STATEMENT_IMPORT_LIMITS.rows).fill(row).join('\n'));
 assert.equal(atLimit.ok,true);assert.equal(atLimit.rows.length,10000);error(csv(Array(10001).fill(row).join('\n')),'ROW_LIMIT');
 assert.equal(inspectCashStatement(csvHeader+'\n10/11/2026,1,id,'+'é'.repeat(2048),{separator:','}).ok,true);error(csv('10/11/2026,1,id,'+'é'.repeat(2049)),'CELL_TOO_LARGE');
 error(csv('10/11/2026,1,id,'+'x'.repeat(241)),'FIELD_INVALID');
 const headers=Array.from({length:32},(_,index)=>'C'+index),record=Array.from({length:32},(_,index)=>index===0?'2026-11-10':index===1?'1':'x');
 const opts={format:'shopee_csv',separator:',',currency:'BRL',date_format:'YMD',amount_format:'DECIMAL',columns:{date:'C0',amount:'C1'}};
 assert.equal(parseCashStatement(headers.join(',')+'\n'+record.join(','),opts).ok,true);
 error(inspectCashStatement(headers.join(',')+',extra',{separator:','}),'COLUMN_LIMIT');
 error(parseCashStatement(new Uint8Array(CASH_STATEMENT_IMPORT_LIMITS.bytes+1),csvOptions),'FILE_TOO_LARGE');
 const oversized=new Uint8Array(CASH_STATEMENT_IMPORT_LIMITS.bytes);oversized.fill(32);oversized.set(new TextEncoder().encode(csvHeader+'\n'));
 error(parseCashStatement(oversized,csvOptions),'CELL_TOO_LARGE');
 assert.equal(Object.isFrozen(CASH_STATEMENT_IMPORT_LIMITS),true);
});

test('OFX2 XML and OFX1 SGML produce the same normalized bank entries without exposing account metadata',()=>{
 const xml=parseOfx(ofx()),sgml=parseOfx(ofx(transaction('',false),{xml:false}));
 assert.equal(xml.ok,true);assert.equal(sgml.ok,true);assert.deepEqual({...xml.rows[0],line:0},{...sgml.rows[0],line:0});
 assert.equal(xml.rows[0].date,'2026-11-10');assert.equal(xml.rows[0].amount_cents,12590);assert.equal(xml.rows[0].reported_status,null);assert.equal(xml.rows[0].source_format,'nubank_ofx');
 assert.ok(!JSON.stringify(xml).includes('SYNTHETIC_ACCOUNT_DO_NOT_EMIT'));
 assert.equal(parseOfx(ofx('',{xml:true})).ok,true);
});

test('OFX preserves bank calendar date instead of shifting by UTC and validates times and offsets',()=>{
 const fields=posted=>'<DTPOSTED>'+posted+'</DTPOSTED><TRNAMT>-0.01</TRNAMT><FITID>ID</FITID>';
 for(const [posted,date] of [['20261110003000[14:ZONE]','2026-11-10'],['20261110235959[-12:ZONE]','2026-11-10'],['20240229','2024-02-29']]){
  const value=parseOfx(ofx(transaction(fields(posted))));assert.equal(value.ok,true);assert.equal(value.rows[0].date,date);assert.equal(value.rows[0].amount_cents,-1);
 }
 for(const posted of ['20260229','20261110240000','20261110236000','20261110235960','20261110000000[15:ZONE]'])error(parseOfx(ofx(transaction(fields(posted)))),'DATE_INVALID');
});

test('OFX entities decode once and unsupported entities and declarations fail closed',()=>{
 const fields='<DTPOSTED>20261110</DTPOSTED><TRNAMT>1.00</TRNAMT><MEMO>A &amp; B &#xE9; &#233; &amp;unknown;</MEMO>';
 const good=parseOfx(ofx(transaction(fields)));assert.equal(good.ok,true);assert.equal(good.rows[0].description,'A & B é é &unknown;');
 for(const entity of ['&external;','&bare','&#0;','&#xD800;','&#x110000;'])error(parseOfx(ofx(transaction(fields.replace('A &amp; B &#xE9; &#233; &amp;unknown;',entity)))),entity.startsWith('&#')?'CHARACTER_INVALID':'ENTITY_UNSUPPORTED');
 error(parseOfx('<!DOCTYPE OFX SYSTEM "https://example.invalid/private">'+ofx()),'DTD_UNSUPPORTED');
 error(parseOfx('<!ENTITY x SYSTEM "file:///private">'+ofx()),'DTD_UNSUPPORTED');
 error(parseOfx(ofx().replace('encoding="UTF-8"','encoding="ISO-8859-1"')),'UTF8_INVALID');
 error(parseOfx(ofx('',{prefix:'<?external target="https://example.invalid"?>'})),'OFX_HEADER_INVALID');
});

test('OFX requires one bank statement and scoped BRL, rejecting cards, investment and foreign currencies',()=>{
 error(parseOfx(ofx(undefined,{currency:'USD'})),'CURRENCY_REQUIRED');
 error(parseOfx(ofx().replace('<CURDEF>BRL</CURDEF>','')),'CURRENCY_REQUIRED');
 error(parseOfx(ofx().replace('<CURDEF>BRL</CURDEF>','<CURDEF>BRL</CURDEF><CURDEF>BRL</CURDEF>')),'CURRENCY_REQUIRED');
 error(parseOfx(ofx().replaceAll('STMTRS','CCSTMTRS')),'OFX_ACCOUNT_UNSUPPORTED');
 error(parseOfx(ofx().replaceAll('STMTRS','INVSTMTRS')),'OFX_ACCOUNT_UNSUPPORTED');
 error(parseOfx(ofx().replace('</STMTRS>','</STMTRS><STMTRS></STMTRS>')),'OFX_STATEMENT_REQUIRED');
 error(parseOfx(ofx(undefined,{extra:'<CURRENCY><CURSYM>USD</CURSYM></CURRENCY>'})),'CURRENCY_REQUIRED');
 error(parseOfx(ofx(undefined,{account:'CCACCTFROM'})),'OFX_STRUCTURE_INVALID');
});

test('OFX rejects incomplete aggregates, malformed XML and duplicated required transaction fields',()=>{
 for(const text of [ofx().replace('</STMTTRN>',''),ofx().replace('</TRNAMT>',''),ofx()+'<OFX></OFX>',ofx()+'PRIVATE_TRAILER',ofx().replace('<TRNAMT>','<TRNAMT bad="x">')])error(parseOfx(text),'OFX_STRUCTURE_INVALID');
 const duplicate=ofx().replace('<TRNAMT>125.90</TRNAMT>','<TRNAMT>1</TRNAMT><TRNAMT>2</TRNAMT>');error(parseOfx(duplicate),'OFX_FIELD_INVALID');
 const subcent=ofx().replace('125.90','1.001');error(parseOfx(subcent),'AMOUNT_INVALID');
 const badHeader=ofx(transaction('',false),{xml:false}).replace('ENCODING:UTF-8','ENCODING:1252');error(parseOfx(badHeader),'OFX_HEADER_INVALID');
 error(parseOfx(ofx().replace('</STMTTRN>','<NAME>A</NAME><NAME>B</NAME></STMTTRN>')),'OFX_FIELD_INVALID');
 error(parseOfx(ofx(undefined,{extra:'<IGNORED>&external;</IGNORED>'})),'ENTITY_UNSUPPORTED');
 error(parseOfx('<OFX>'.repeat(21)+'</OFX>'.repeat(21)),'OFX_STRUCTURE_LIMIT');
 error(parseOfx(ofx(transaction().repeat(10001))),'ROW_LIMIT');
});

test('normalized rows respect the closed DTO string limits without silent truncation or inferred statuses',()=>{
 const value=csv('10/11/2026,0,'+'é'.repeat(128)+','+'é'.repeat(240));assert.equal(value.ok,true);assert.equal(value.rows[0].external_id.length,128);assert.equal(value.rows[0].description.length,240);
 error(csv('10/11/2026,1,'+'x'.repeat(129)+',Description'),'FIELD_INVALID');
 const options={format:'shopee_csv',separator:',',currency:'BRL',date_format:'YMD',amount_format:'DECIMAL',columns:{date:'D',amount:'A',reference:'R',status:'S'}};
 const text='D,A,R,S\n2026-11-10,1,'+'r'.repeat(160)+','+'é'.repeat(80);
 assert.equal(parseCashStatement(text,options).ok,true);error(parseCashStatement(text+'s',options),'FIELD_INVALID');
 error(parseCashStatement(text.replace('r'.repeat(160),'r'.repeat(161)),options),'FIELD_INVALID');
});

test('self-contained factory survives browser-style serialization and stays inside the approved source budget',()=>{
 const frozen=(0,eval)('('+createCashStatementImportParser.toString()+')')();
 assert.equal(frozen.parseCashStatement(csvHeader+'\n10/11/2026,1,id,Value',csvOptions).ok,true);
 assert.equal(typeof frozen.inspectCashStatement,'function');
 assert.ok(readFileSync(new URL('../src/cash-statement-import.mjs',import.meta.url)).byteLength<=26*1024);
});
