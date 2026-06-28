// Attach a tap handler that ignores drags and fires once.
export function onTap(el, fn){
  let sx=0, sy=0, moved=false;
  el.addEventListener('pointerdown', e=>{ sx=e.clientX; sy=e.clientY; moved=false; });
  el.addEventListener('pointermove', e=>{ if(Math.hypot(e.clientX-sx,e.clientY-sy)>10) moved=true; });
  el.addEventListener('pointerup', e=>{ if(!moved) fn(e); });
}
// Press-and-hold repeat: fires immediately, then accelerates.
export function onHoldRepeat(el, fn){
  let timer=null, delay=400;
  const stop=()=>{ if(timer){clearTimeout(timer); timer=null;} delay=400; };
  const tick=()=>{ fn(); delay=Math.max(60, delay*0.8); timer=setTimeout(tick, delay); };
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); fn(); delay=400; timer=setTimeout(tick, delay); });
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev, stop));
}
// Radial drag dial: reports angle 0..1 around center of el. fn(fraction).
export function onDial(el, fn){
  let active=false;
  const calc=e=>{ const r=el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    let a=Math.atan2(e.clientY-cy, e.clientX-cx) + Math.PI/2; if(a<0) a+=Math.PI*2;
    fn(a/(Math.PI*2)); };
  el.addEventListener('pointerdown', e=>{ active=true; el.setPointerCapture(e.pointerId); calc(e); });
  el.addEventListener('pointermove', e=>{ if(active) calc(e); });
  ['pointerup','pointercancel'].forEach(ev=>el.addEventListener(ev, ()=>active=false));
}
