// One self-contained deterministic engine is shared by the private backend and
// the browser. No source identifiers, clocks or image pixels are inferred here.
export function createDtfEngine(){
 const maximumPixels=50000000,maximumPrints=300,maximumSheets=20;
 const fail=(code,issues)=>{const error=new Error(code);error.code=code;error.status=400;if(issues)error.issues=issues;throw error;};
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(value,min,max)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const string=(value,max)=>typeof value==='string'&&value.length>=1&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
 function normalizeArtKey(value){
  if(!string(value,132))fail('DTF_ART_NAME_INVALID');
  const key=value.normalize('NFC').toLowerCase().trim().replace(/\.png$/,'');
  if(!/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,127}$/u.test(key)||key.endsWith('.')||key.includes('..'))fail('DTF_ART_NAME_INVALID');
  return key;
 }
 function parseSku(sku){
  if(!string(sku,256)||sku!==sku.trim())fail('DTF_SKU_INVALID');
  if(/^sem[-_ ]estampa$/i.test(sku.normalize('NFC')))return [];
  const tokens=sku.split('+');if(tokens.length>8||tokens.some(value=>!value))fail('DTF_SKU_INVALID');
  return tokens.map(token=>{
   const found=/^(.+)-([1-9][0-9]{0,2})(?:[.,]([0-9]))?$/.exec(token);
   if(!found)fail('DTF_SKU_INVALID');
   const width_mm=Number(found[2])*10+Number(found[3]||0);
   if(!integer(width_mm,10,2000))fail('DTF_WIDTH_INVALID');
   return {art_key:normalizeArtKey(found[1]),width_mm,copies:1};
  });
 }
 function validateSettings(value){
  if(!exact(value,['film_width_mm','max_length_mm','gap_mm','margin_mm','dpi','allow_rotate'])||!integer(value.film_width_mm,100,2000)||!integer(value.max_length_mm,100,5000)||!integer(value.gap_mm,0,50)||!integer(value.margin_mm,0,50)||![150,300,600].includes(value.dpi)||typeof value.allow_rotate!=='boolean'||value.film_width_mm<=2*value.margin_mm||value.max_length_mm<=2*value.margin_mm)fail('DTF_SETTINGS_INVALID');
  return {...value};
 }
 function plan(input){
  if(!exact(input,['settings','units','artworks'])||!array(input.units,300)||!input.units.length||!array(input.artworks,300))fail('DTF_PLAN_INVALID');
  const settings=validateSettings(input.settings),artworks=new Map(),unitKeys=new Set(),issues=[],pieces=[];
  const pixelWidth=Math.ceil(settings.film_width_mm*settings.dpi/25.4),pixelHeightLimit=Math.floor(maximumPixels/pixelWidth);
  // A useful strip may be shorter than the configured length to stay within
  // the explicit raster memory bound; no image is downsampled to fit a canvas.
  const sheetHeightLimit=Math.min(settings.max_length_mm,Math.floor(pixelHeightLimit*25.4/settings.dpi));
  const availableWidth=settings.film_width_mm-2*settings.margin_mm,availableHeight=sheetHeightLimit-2*settings.margin_mm;
  if(pixelWidth>32767||availableWidth<1||availableHeight<1)fail('DTF_CANVAS_LIMIT');
  for(const art of input.artworks){
   if(!exact(art,['art_key','sha256','pixel_width','pixel_height'])||!string(art.art_key,128)||normalizeArtKey(art.art_key)!==art.art_key||artworks.has(art.art_key)||typeof art.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(art.sha256)||!integer(art.pixel_width,1,32767)||!integer(art.pixel_height,1,32767)||art.pixel_width*art.pixel_height>maximumPixels)fail('DTF_ARTWORK_INVALID');
   artworks.set(art.art_key,{...art});
  }
  for(const unit of input.units){
   if(!exact(unit,['unit_key','sku','quantity','requires_pair'])||!string(unit.unit_key,256)||unitKeys.has(unit.unit_key)||!integer(unit.quantity,1,1000)||typeof unit.requires_pair!=='boolean')fail('DTF_UNIT_INVALID');unitKeys.add(unit.unit_key);
   let parts;try{parts=parseSku(unit.sku);}catch(error){issues.push({unit_key:unit.unit_key,code:error.code});continue;}
   if(unit.requires_pair&&parts.length>0&&parts.length<2){issues.push({unit_key:unit.unit_key,code:'DTF_KIT_PARTS_REQUIRED'});continue;}
   for(let part_index=0;part_index<parts.length;part_index++){
    const part=parts[part_index],art=artworks.get(part.art_key);
    if(!art){issues.push({unit_key:unit.unit_key,code:'DTF_ART_NOT_FOUND',art_key:part.art_key});continue;}
    const width=part.width_mm,height=Math.ceil(width*art.pixel_height/art.pixel_width);
    if(!integer(height,1,2000000)){issues.push({unit_key:unit.unit_key,code:'DTF_DIMENSION_INVALID'});continue;}
    // Height is rounded upward only for the packing footprint. Raster output
    // retains the original aspect ratio inside it, so width determines DPI.
    if(art.pixel_width*25.4+1e-8<width*settings.dpi){issues.push({unit_key:unit.unit_key,code:'DTF_ART_RESOLUTION_LOW',art_key:part.art_key});continue;}
    const originalFits=width<=availableWidth&&height<=availableHeight,rotatedFits=settings.allow_rotate&&height<=availableWidth&&width<=availableHeight;
    if(!originalFits&&!rotatedFits){issues.push({unit_key:unit.unit_key,code:width>availableWidth&&(!settings.allow_rotate||height>availableWidth)?'DTF_ART_TOO_WIDE':'DTF_ART_TOO_TALL',art_key:part.art_key});continue;}
    if(pieces.length+unit.quantity>maximumPrints){issues.push({unit_key:unit.unit_key,code:'DTF_PRINT_LIMIT'});continue;}
    for(let copy_index=0;copy_index<unit.quantity;copy_index++)pieces.push({unit_key:unit.unit_key,part_index,copy_index,art_key:part.art_key,sha256:art.sha256,width_mm:width,height_mm:height,rotated:false});
   }
  }
  if(issues.length)fail('DTF_PLAN_PENDING',issues);
  if(!pieces.length)fail('DTF_NO_PRINTS');
  // Shelf packing is deterministic and keeps placement footprints integer and
  // non-overlapping. Stable tie-breaks allow the server to reproduce a preview.
  pieces.sort((a,b)=>Math.max(b.width_mm,b.height_mm)-Math.max(a.width_mm,a.height_mm)||b.height_mm-a.height_mm||b.width_mm-a.width_mm||a.unit_key.localeCompare(b.unit_key,'en')||a.part_index-b.part_index||a.copy_index-b.copy_index);
  const work=[];
  for(const piece of pieces){
   const options=[{width_mm:piece.width_mm,height_mm:piece.height_mm,rotated:false}];if(settings.allow_rotate&&piece.width_mm!==piece.height_mm)options.push({width_mm:piece.height_mm,height_mm:piece.width_mm,rotated:true});
   let chosen=null;
   for(let sheetIndex=0;sheetIndex<work.length&&!chosen;sheetIndex++){
    const sheet=work[sheetIndex];
    for(let rowIndex=0;rowIndex<sheet.rows.length&&!chosen;rowIndex++){
     const row=sheet.rows[rowIndex],fitting=options.filter(option=>option.height_mm<=row.height_mm&&row.next_x+option.width_mm<=settings.film_width_mm-settings.margin_mm).sort((a,b)=>a.width_mm-b.width_mm||Number(a.rotated)-Number(b.rotated));
     if(fitting.length)chosen={sheet,row,option:fitting[0]};
    }
    if(!chosen){const y=sheet.rows.length?sheet.rows.at(-1).y_mm+sheet.rows.at(-1).height_mm+settings.gap_mm:settings.margin_mm,option=options.filter(value=>value.width_mm<=availableWidth&&y+value.height_mm<=sheetHeightLimit-settings.margin_mm).sort((a,b)=>a.height_mm-b.height_mm||Number(a.rotated)-Number(b.rotated))[0];if(option){const row={y_mm:y,height_mm:option.height_mm,next_x:settings.margin_mm};sheet.rows.push(row);chosen={sheet,row,option};}}
   }
   if(!chosen){
    if(work.length>=maximumSheets)fail('DTF_SHEET_LIMIT');
    const option=options.filter(value=>value.width_mm<=availableWidth&&value.height_mm<=availableHeight).sort((a,b)=>a.height_mm-b.height_mm||Number(a.rotated)-Number(b.rotated))[0];if(!option)fail('DTF_LAYOUT_INVALID');
    const row={y_mm:settings.margin_mm,height_mm:option.height_mm,next_x:settings.margin_mm},sheet={rows:[row],placements:[]};work.push(sheet);chosen={sheet,row,option};
   }
   const {sheet,row,option}=chosen;
   sheet.placements.push({...piece,x_mm:row.next_x,y_mm:row.y_mm,width_mm:option.width_mm,height_mm:option.height_mm,rotated:option.rotated});row.next_x+=option.width_mm+settings.gap_mm;
  }
  const sheets=work.map(sheet=>({width_mm:settings.film_width_mm,height_mm:Math.max(...sheet.placements.map(row=>row.y_mm+row.height_mm))+settings.margin_mm,placements:sheet.placements}));
  if(sheets.some(sheet=>Math.ceil(sheet.width_mm*settings.dpi/25.4)*Math.ceil(sheet.height_mm*settings.dpi/25.4)>maximumPixels))fail('DTF_CANVAS_LIMIT');
  return {schema:'dtf_layout_v1',settings,sheets,total_length_mm:sheets.reduce((total,sheet)=>total+sheet.height_mm,0),print_count:pieces.length};
 }
 return {normalizeArtKey,parseSku,validateSettings,plan};
}

const dtfEngine=createDtfEngine();
export const normalizeDtfArtKey=value=>dtfEngine.normalizeArtKey(value);
export const parseDtfSku=value=>dtfEngine.parseSku(value);
export const validateDtfSettings=value=>dtfEngine.validateSettings(value);
export const planDtfLayout=value=>dtfEngine.plan(value);
export const DTF_ENGINE_CLIENT='globalThis.brazaDtfEngine=('+createDtfEngine.toString()+')();';
