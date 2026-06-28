import { onTap } from '../input.js';

/**
 * Home screen: theme picker grid.
 * ctx.registry is a Map of id -> { meta, load }.
 * meta: { id, name, thumb, comingSoon }
 */
export function renderHome(ctx, _params) {
  const div = document.createElement('div');
  div.className = 'screen home';

  const header = document.createElement('div');
  header.className = 'home-header';
  header.innerHTML = `
    <h1 class="home-title">PIXEL TIMER</h1>
    <button class="btn-mute" id="btn-mute" aria-label="Toggle sound">${ctx.store.muted ? '🔇' : '🔊'}</button>
  `;
  div.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'theme-grid';
  div.appendChild(grid);

  ctx.app.appendChild(div);

  for (const [id, entry] of ctx.registry) {
    const { meta } = entry;
    const card = document.createElement('div');
    card.className = 'theme-card' + (meta.comingSoon ? ' theme-card--soon' : '');

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'theme-card__thumb';

    const img = document.createElement('img');
    img.src = `assets/${meta.thumb}.png`;
    img.alt = meta.name;
    img.style.cssText = 'image-rendering:pixelated; width:100%; display:block;';
    thumbWrap.appendChild(img);

    if (meta.comingSoon) {
      const lockImg = document.createElement('img');
      lockImg.src = 'assets/thumb_lock.png';
      lockImg.alt = 'Coming soon';
      lockImg.className = 'theme-card__lock';
      thumbWrap.appendChild(lockImg);

      const soonTag = document.createElement('span');
      soonTag.className = 'theme-card__soon-tag';
      soonTag.textContent = 'SOON';
      thumbWrap.appendChild(soonTag);
    }

    card.appendChild(thumbWrap);

    const name = document.createElement('div');
    name.className = 'theme-card__name';
    name.textContent = meta.name;
    card.appendChild(name);

    grid.appendChild(card);

    if (!meta.comingSoon) {
      onTap(card, () => {
        ctx.audio.sfx('click');
        ctx.go('picker', { themeId: meta.id });
      });
    }
  }

  const muteBtn = div.querySelector('#btn-mute');
  onTap(muteBtn, () => {
    ctx.store.muted = !ctx.store.muted;
    muteBtn.textContent = ctx.store.muted ? '🔇' : '🔊';
  });
}
