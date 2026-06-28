import { TimerEngine } from '../timer.js';
import { loadSheet } from '../scene.js';
import { audio } from '../audio.js';
import { drawText } from '../pixelfont.js';

// Per-theme background music loops (synthwave chiptune)
const CASTLE_LOOP = [
  { note: 'A', oct: 3, dur: 1 },
  { note: 'C', oct: 4, dur: 1 },
  { note: 'E', oct: 4, dur: 1 },
  { note: 'C', oct: 4, dur: 1 },
  { note: 'F', oct: 3, dur: 1 },
  { note: 'A', oct: 3, dur: 1 },
  { note: 'C', oct: 4, dur: 1 },
  { note: 'A', oct: 3, dur: 1 },
];

const MONSTER_LOOP = [
  { note: 'E', oct: 3, dur: 0.5 },
  { note: 'E', oct: 3, dur: 0.5 },
  { note: 'G', oct: 3, dur: 0.5 },
  { note: 'A', oct: 3, dur: 0.5 },
  { note: 'E', oct: 3, dur: 0.5 },
  { note: 'A', oct: 3, dur: 0.5 },
  { note: 'B', oct: 3, dur: 0.5 },
  { note: 'G', oct: 3, dur: 0.5 },
];

/**
 * Compute logical stage dimensions from the current viewport.
 * Shorter side = 240 logical px; longer side = round(240 * ratio),
 * ratio clamped to [1.25 .. 2.2] so extreme laptop widths cap out.
 */
function computeStage() {
  const vw = innerWidth, vh = innerHeight;
  const short = Math.min(vw, vh), long = Math.max(vw, vh);
  const ratio = Math.max(1.25, Math.min(2.2, long / short));
  const logicalShort = 240;
  const logicalLong = Math.round(240 * ratio);
  if (vh >= vw) return { W: logicalShort, H: logicalLong };
  return { W: logicalLong, H: logicalShort };
}

/**
 * Active timer screen.
 * params: { themeId, durationMs }
 */
export async function renderRun(ctx, { themeId, durationMs }) {
  const entry = ctx.registry.get(themeId);
  const SceneClass = await entry.load();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── DOM shell ────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'screen run';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'run-canvas-wrap';

  const canvas = document.createElement('canvas');
  // Orientation-aware logical stage — aspect matches viewport so 100%/100% won't distort
  let { W, H } = computeStage();
  canvas.width  = W;
  canvas.height = H;
  canvas.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;display:block;';
  canvasWrap.appendChild(canvas);
  wrap.appendChild(canvasWrap);

  // Controls overlay (bottom)
  const controls = document.createElement('div');
  controls.className = 'run-controls';
  controls.innerHTML = `
    <div class="run-hint" id="run-hint"></div>
    <div class="run-buttons">
      <button class="btn-run btn-back-home" id="btn-back-home" aria-label="Home">&#8962;</button>
      <button class="btn-run btn-pause" id="btn-pause">&#9646;&#9646; PAUSE</button>
      <button class="btn-run btn-reset" id="btn-reset" aria-label="Reset (hold)">&#8635; RESET</button>
    </div>
  `;
  wrap.appendChild(controls);
  ctx.app.appendChild(wrap);

  // ── Canvas setup ─────────────────────────────────────────────────────────────
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;

  // ── Scene + engine ───────────────────────────────────────────────────────────
  const sheet = await loadSheet(`assets/${themeId}`);
  const scene = new SceneClass(c, sheet, { reducedMotion });
  scene.layout(W, H);   // initial layout before init so positions are ready

  let paused = false;
  let doneFired = false;

  // Choose loop by themeId
  const loop = themeId === 'monsterhp' ? MONSTER_LOOP : CASTLE_LOOP;
  const bpm  = themeId === 'monsterhp' ? 132 : 110;

  const engine = new TimerEngine(durationMs, {
    milestones: 5,
    onMilestone: (i, t) => scene.onMilestone(i, t),
    onComplete: () => {
      scene.onComplete();
      audio.sfx('alarm');
      waitFinale();
    },
  });
  scene.init(durationMs);
  engine.start();
  audio.playTrack(loop, bpm);

  // Screen wake lock (best-effort)
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (_) {}

  // ── Render loop ───────────────────────────────────────────────────────────────
  let last = performance.now();
  let raf;
  function frame(now) {
    const dt = now - last;
    last = now;
    // While paused, freeze the countdown AND the scene animation (just keep
    // re-rendering the frozen frame so the HUD/scene stay drawn).
    if (!paused) {
      if (engine.state !== 'done') engine.tick();
      scene.update(engine.getProgress(), dt, engine.getRemainingMs());
    }
    scene.render();
    // HUD clock top-left — font scale relative to stage width
    const ms = engine.getRemainingMs();
    const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
    const ss = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    const fontScale = Math.max(2, Math.round(W / 100));
    drawText(c, `${mm}:${ss}`, 6, 6, fontScale, '#00f5d4');
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ── Finale poller ─────────────────────────────────────────────────────────────
  function waitFinale() {
    if (doneFired) return;
    const check = () => {
      if (doneFired) return;
      if (scene.isFinaleDone()) {
        doneFired = true;
        cleanup();
        ctx.go('done', { themeId, durationMs });
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  }

  // ── Visibility: re-sync rAF timestamp when tab returns ───────────────────────
  const onVisibilityChange = () => { if (!document.hidden) { last = performance.now(); } };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ── Resize / orientation handler (debounced ~100 ms) ─────────────────────────
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const s = computeStage();
      W = s.W; H = s.H;
      canvas.width  = W;
      canvas.height = H;
      c.imageSmoothingEnabled = false;  // canvas resize resets this
      scene.layout(W, H);
    }, 100);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  function cleanup() {
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    audio.stopTrack();
    wakeLock?.release?.();
    scene.dispose?.();
  }

  // ── Controls ──────────────────────────────────────────────────────────────────
  const pauseBtn = controls.querySelector('#btn-pause');
  const resetBtn = controls.querySelector('#btn-reset');
  const backBtn  = controls.querySelector('#btn-back-home');
  const hint     = controls.querySelector('#run-hint');

  // Pause / Resume toggle
  pauseBtn.addEventListener('click', () => {
    if (paused) {
      engine.resume();
      audio.playTrack(loop, bpm);
      pauseBtn.innerHTML = '&#9646;&#9646; PAUSE';
      paused = false;
    } else {
      engine.pause();
      audio.stopTrack();
      pauseBtn.innerHTML = '&#9654; RESUME';
      paused = true;
    }
  });

  // Long-press reset (~700 ms) — returns to picker
  let resetTimer = null;
  resetBtn.addEventListener('pointerdown', () => {
    hint.textContent = 'Hold to reset…';
    resetTimer = setTimeout(() => {
      hint.textContent = '';
      doneFired = true;   // prevent done navigation race
      cleanup();
      ctx.go('picker', { themeId });
    }, 700);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    resetBtn.addEventListener(ev, () => {
      clearTimeout(resetTimer);
      resetTimer = null;
      hint.textContent = '';
    })
  );

  // Back to home
  backBtn.addEventListener('click', () => {
    doneFired = true;
    cleanup();
    ctx.go('home');
  });
}
