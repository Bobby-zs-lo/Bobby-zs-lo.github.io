import { onTap } from '../input.js';

/**
 * Done / finale screen.
 * params: { themeId, durationMs }
 * Loops alarm sfx every ~1.2s until user taps anything.
 */
export function renderDone(ctx, { themeId, durationMs }) {
  // Theme accent for celebratory styling
  const accentVar = themeId === 'monsterhp' ? 'var(--magenta)' : 'var(--cyan)';

  const div = document.createElement('div');
  div.className = 'screen done';
  div.style.setProperty('--done-accent', accentVar);

  div.innerHTML = `
    <div class="done-title">TIME'S<br>UP!</div>
    <div class="done-sub">&#127881; Great job! &#127881;</div>
    <div class="done-buttons">
      <button class="btn-done btn-again"  id="btn-again">&#9654; AGAIN</button>
      <button class="btn-done btn-change" id="btn-change">&#10066; CHANGE THEME</button>
    </div>
  `;
  ctx.app.appendChild(div);

  // Start alarm loop immediately
  ctx.audio.sfx('alarm');
  const alarmInterval = setInterval(() => ctx.audio.sfx('alarm'), 1200);

  function stopAlarm() {
    clearInterval(alarmInterval);
  }

  // Stop alarm on any pointer-down anywhere on this screen (fires before tap handlers)
  div.addEventListener('pointerdown', stopAlarm, { once: true });

  onTap(div.querySelector('#btn-again'), () => {
    stopAlarm();
    ctx.audio.sfx('click');
    ctx.go('run', { themeId, durationMs });
  });

  onTap(div.querySelector('#btn-change'), () => {
    stopAlarm();
    ctx.audio.sfx('click');
    ctx.go('home');
  });
}
