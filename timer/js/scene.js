// Base class every theme extends. Subclasses override the lifecycle hooks.
export class Scene {
  constructor(ctx, assets, opts){
    this.ctx = ctx;            // 2d context of the low-res buffer
    this.assets = assets;      // { image, frames } from loadSheet()
    this.W = ctx.canvas.width;
    this.H = ctx.canvas.height;
    this.reducedMotion = !!opts?.reducedMotion;
  }
  /** Called by run.js after canvas is resized; subclasses override to recompute positions. */
  layout(W, H){ this.W = W; this.H = H; }
  init(durationMs){}                       // setup state
  update(progress, dtMs, remainingMs){}    // advance animation
  render(){}                               // draw a frame
  onMilestone(i, total){}                  // discrete event + sfx
  onComplete(){}                           // finale begins
  isFinaleDone(){ return true; }           // run.js waits for this before Done screen
  dispose(){}
}

// Sprite-sheet loader: PNG + JSON frame map { name:[x,y,w,h] }.
export async function loadSheet(base){
  const [image, frames] = await Promise.all([
    new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=`${base}.png`; }),
    fetch(`${base}.json`).then(r=>r.json()),
  ]);
  return { image, frames };
}
// Blit one named frame, nearest-neighbor (ctx.imageSmoothingEnabled=false set by caller).
export function blit(ctx, sheet, name, dx, dy, scale=1, flip=false){
  const f = sheet.frames[name]; if(!f) return;
  const [sx,sy,sw,sh]=f;
  if(flip){ ctx.save(); ctx.translate(dx+sw*scale,dy); ctx.scale(-1,1);
    ctx.drawImage(sheet.image,sx,sy,sw,sh,0,0,sw*scale,sh*scale); ctx.restore(); }
  else ctx.drawImage(sheet.image,sx,sy,sw,sh,dx,dy,sw*scale,sh*scale);
}

export const SceneRegistry = new Map(); // id -> { meta, load: () => Promise<SceneClass> }
export function registerScene(meta, loader){ SceneRegistry.set(meta.id, { meta, load: loader }); }
