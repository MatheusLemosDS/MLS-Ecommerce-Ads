/** Local inspection of escaped, validated chart marks. No IO or data synthesis.
 * Keep this factory self-contained: the Worker compiler embeds its source.
 */
export function createMlsChartInteractions(){
 const bindings=new WeakMap();
 const markSelector='[data-mls-chart-mark]';
 const ns='http://www.w3.org/2000/svg';
 function clear(host){
  const cleanup=host&&bindings.get(host);
  if(cleanup)cleanup();
 }
 function bind(host){
  if(!host||typeof host.querySelector!=='function')return ()=>{};
  clear(host);
  const svg=host.querySelector('svg.mls-verified-chart');
  if(!svg)return ()=>{};
  const marks=Array.from(svg.querySelectorAll(markSelector));
  if(!marks.length)return ()=>{};
  const doc=host.ownerDocument;
  if(!doc?.createElement||!doc?.createElementNS)return ()=>{};
  const readout=doc.createElement('div');
  readout.className='mls-chart-readout';readout.hidden=true;
  readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');readout.setAttribute('aria-atomic','true');
  const label=doc.createElement('span'),value=doc.createElement('span'),context=doc.createElement('span');
  label.className='mls-chart-readout-label';value.className='mls-chart-readout-value';context.className='mls-chart-readout-context';
  readout.append(label,value,context);host.append(readout);
  const crosshair=doc.createElementNS(ns,'path');
  crosshair.setAttribute('class','mls-chart-crosshair');crosshair.setAttribute('aria-hidden','true');
  crosshair.setAttribute('pointer-events','none');crosshair.setAttribute('fill','none');
  crosshair.setAttribute('stroke','var(--muted,#96b5d9)');crosshair.setAttribute('stroke-dasharray','3 5');
  crosshair.setAttribute('visibility','hidden');crosshair.setAttribute('hidden','');svg.append(crosshair);
  let selected=null,pinned=null,disposed=false;
  const markFrom=target=>{
   const mark=typeof target?.closest==='function'?target.closest(markSelector):null;
   return marks.includes(mark)?mark:null;
  };
  const focused=()=>markFrom(doc.activeElement);
  function nearest(event){
   // Inspect an existing observation across its date column. A missing date has
   // no mark and remains a gap; no value is calculated at the pointer position.
   if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return null;
   const coordinates=marks.map(mark=>({mark,
    x:Number(mark.getAttribute('data-mls-chart-x')),index:Number(mark.getAttribute('data-mls-chart-mark'))
   })).filter(row=>row.mark.hasAttribute('data-mls-chart-x')&&Number.isFinite(row.x)&&Number.isFinite(row.index));
   if(coordinates.length<2)return null;
   let point;
   try{
    const matrix=svg.getScreenCTM?.();
    if(matrix&&typeof svg.createSVGPoint==='function'){
     const cursor=svg.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;point=cursor.matrixTransform(matrix.inverse());
    }
   }catch{}
   if(!point)return null;
   const reference=coordinates[0].mark;
   const bounds=['left','right','top','bottom'].map(key=>Number(reference.getAttribute('data-mls-chart-'+key)));
   if(bounds.some(value=>!Number.isFinite(value)))return null;
   const [left,right,top,bottom]=bounds;
   if(point.x<left||point.x>right||point.y<top||point.y>bottom)return null;
   const first=coordinates[0],last=coordinates.at(-1);
   const column=(last.x-first.x)/(last.index-first.index);
   if(!Number.isFinite(column)||column<=0)return null;
   const closest=coordinates.reduce((best,row)=>Math.abs(row.x-point.x)<Math.abs(best.x-point.x)?row:best);
   return Math.abs(closest.x-point.x)<=column/2+0.01?closest.mark:null;
  }
  function hide(){
   selected?.removeAttribute('data-mls-chart-selected');selected=null;pinned=null;
   host.removeAttribute('data-mls-chart-inspection');readout.hidden=true;
   crosshair.setAttribute('visibility','hidden');crosshair.setAttribute('hidden','');
  }
  function show(mark){
   if(disposed||!marks.includes(mark))return;
   if(selected!==mark)selected?.removeAttribute('data-mls-chart-selected');
   selected=mark;mark.setAttribute('data-mls-chart-selected','true');
   host.setAttribute('data-mls-chart-inspection','active');
   label.textContent=mark.getAttribute('data-mls-chart-label')||'';
   value.textContent=mark.getAttribute('data-mls-chart-value')||'';
   context.textContent=mark.getAttribute('data-mls-chart-context')||'Valor observado';
   readout.hidden=false;
   const coordinates=['x','top','bottom'].map(name=>mark.getAttribute('data-mls-chart-'+name));
   if(coordinates.every(v=>v!==null&&v!==''&&Number.isFinite(Number(v)))){
    const [x,top,bottom]=coordinates.map(Number);
    crosshair.setAttribute('d','M '+x+' '+top+' V '+bottom);
    crosshair.setAttribute('visibility','visible');crosshair.removeAttribute('hidden');
   }else{
    crosshair.setAttribute('visibility','hidden');crosshair.setAttribute('hidden','');
   }
  }
  const pointer=event=>{
   const mark=markFrom(event.target)||nearest(event);
   if(mark){if(event.type==='pointerdown'&&event.pointerType==='touch')pinned=mark;show(mark);}
   else if(event.type==='pointerdown'||!focused()&&!pinned)hide();
  };
  const leave=()=>{const mark=focused()||pinned;mark?show(mark):hide();};
  const focus=event=>{const mark=markFrom(event.target);if(mark)show(mark);};
  const blur=event=>{const mark=markFrom(event.relatedTarget);mark?show(mark):hide();};
  function key(event){
   const mark=markFrom(event.target);if(!mark)return;
   const index=marks.indexOf(mark),last=marks.length-1;
   let next=null;
   if(event.key==='ArrowRight'||event.key==='ArrowDown')next=Math.min(last,index+1);
   else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=Math.max(0,index-1);
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=last;
   else if(event.key==='Escape'){event.preventDefault();hide();return;}
   if(next===null)return;
   event.preventDefault();marks[next].focus?.({preventScroll:true});show(marks[next]);
  }
  const listeners=[['pointerover',pointer],['pointermove',pointer],['pointerdown',pointer],
   ['pointerleave',leave],['focusin',focus],['focusout',blur],['keydown',key]];
  for(const [type,listener] of listeners)svg.addEventListener(type,listener);
  const cleanup=()=>{
   if(disposed)return;
   disposed=true;
   for(const [type,listener] of listeners)svg.removeEventListener(type,listener);
   hide();readout.remove();crosshair.remove();bindings.delete(host);
  };
  bindings.set(host,cleanup);
  return cleanup;
 }
 return Object.freeze({bind,clear});
}
