import { onTap, onHoldRepeat, onDial } from '../input.js';

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];

/**
 * Duration picker screen (Mouse-Timer style).
 * params: { themeId }
 */
export function renderPicker(ctx, { themeId }) {
  let minutes = Math.min(60, Math.max(1, ctx.store.lastMins));

  const div = document.createElement('div');
  div.className = 'screen picker';

  div.innerHTML = `
    <div class="picker-header">
      <button class="btn-back" id="btn-back">&#8592; BACK</button>
      <span class="picker-theme">${themeId.toUpperCase()}</span>
    </div>
    <div class="picker-readout" id="readout">05:00</div>
    <div class="picker-dial-wrap">
      <div class="picker-dial" id="dial">
        <div class="picker-dial__track"></div>
        <div class="picker-dial__hand" id="dial-hand"></div>
        <div class="picker-dial__center"></div>
      </div>
    </div>
    <div class="picker-stepper">
      <button class="btn-step btn-minus" id="btn-minus">&#8722;</button>
      <button class="btn-step btn-plus"  id="btn-plus">+</button>
    </div>
    <div class="preset-chips" id="presets"></div>
    <button class="btn-start" id="btn-start">&#9654; START</button>
  `;
  ctx.app.appendChild(div);

  // Build preset chips
  const presetsEl = div.querySelector('#presets');
  for (const p of PRESETS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.m = String(p);
    chip.textContent = `${p}m`;
    presetsEl.appendChild(chip);
  }

  const readout  = div.querySelector('#readout');
  const dialHand = div.querySelector('#dial-hand');

  function updateReadout() {
    const mm = String(minutes).padStart(2, '0');
    readout.textContent = `${mm}:00`;
    // sync dial hand: fraction 0..1 maps to 1..60
    const frac = (minutes - 1) / 59;
    dialHand.style.transform = `rotate(${frac * 360}deg)`;
  }

  updateReadout();

  // Back button
  onTap(div.querySelector('#btn-back'), () => {
    ctx.audio.sfx('click');
    ctx.go('home');
  });

  // Stepper buttons with hold-repeat
  onHoldRepeat(div.querySelector('#btn-minus'), () => {
    if (minutes > 1) {
      minutes--;
      ctx.audio.sfx('click');
      updateReadout();
    }
  });
  onHoldRepeat(div.querySelector('#btn-plus'), () => {
    if (minutes < 60) {
      minutes++;
      ctx.audio.sfx('click');
      updateReadout();
    }
  });

  // Preset chips
  presetsEl.querySelectorAll('.chip').forEach(chip => {
    onTap(chip, () => {
      minutes = parseInt(chip.dataset.m, 10);
      ctx.audio.sfx('click');
      updateReadout();
    });
  });

  // Dial: fraction 0..1 maps to 1..60 minutes
  onDial(div.querySelector('#dial'), frac => {
    const newMins = Math.min(60, Math.max(1, Math.round(1 + frac * 59)));
    if (newMins !== minutes) {
      minutes = newMins;
      updateReadout();
    }
  });

  // Start button
  onTap(div.querySelector('#btn-start'), () => {
    ctx.store.lastMins = minutes;
    ctx.store.lastTheme = themeId;
    ctx.audio.unlock();
    ctx.audio.sfx('click');
    ctx.go('run', { themeId, durationMs: minutes * 60000 });
  });
}
