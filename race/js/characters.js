/* 12 original fighters, rendered as parameterized SVG. Pose is controlled by a
   CSS class (pose-idle / pose-run / pose-eat / pose-cheer / pose-charred) on the WRAPPER element. */
(function () {
  'use strict';
  const INK = '#16121f';
  const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

  const CHARACTERS = [
    { id: 'blaze',   name: 'BLAZE',   skin: '#ffb37a', suit: '#ff6a2a', suitD: '#c73f0e', accent: '#ffd23f', acc: 'fox' },
    { id: 'volt',    name: 'VOLT',    skin: '#ffe9a8', suit: '#ffc400', suitD: '#e08900', accent: '#4dc3ff', acc: 'bolt' },
    { id: 'splash',  name: 'SPLASH',  skin: '#a8e6ff', suit: '#00a3e0', suitD: '#005f9e', accent: '#7ff0d3', acc: 'fin' },
    { id: 'boulder', name: 'BOULDER', skin: '#d9c9a3', suit: '#8a6d3b', suitD: '#5c4423', accent: '#a7c957', acc: 'rock' },
    { id: 'luna',    name: 'LUNA',    skin: '#f2d5ff', suit: '#8e44ad', suitD: '#5b2c6f', accent: '#ffd700', acc: 'moon' },
    { id: 'turbo',   name: 'TURBO',   skin: '#ffcba4', suit: '#e60012', suitD: '#9c0010', accent: '#ffffff', acc: 'helmet' },
    { id: 'shadow',  name: 'SHADOW',  skin: '#c8b8d8', suit: '#3a3a55', suitD: '#20202f', accent: '#00e5c0', acc: 'band' },
    { id: 'nova',    name: 'NOVA',    skin: '#ffd9c2', suit: '#0069c0', suitD: '#003f7a', accent: '#ffd700', acc: 'cape' },
    { id: 'frost',   name: 'FROST',   skin: '#eaf7ff', suit: '#7fd4f0', suitD: '#3f9dc4', accent: '#ffffff', acc: 'ice' },
    { id: 'rex',     name: 'REX',     skin: '#c9f0a0', suit: '#00a651', suitD: '#00703a', accent: '#ff7a00', acc: 'dino' },
    { id: 'cosmo',   name: 'COSMO',   skin: '#ffe1c9', suit: '#f2f2f2', suitD: '#b8b8c8', accent: '#ff7a00', acc: 'space' },
    { id: 'robo',    name: 'ROBO',    skin: '#cfd8e3', suit: '#6d7a8c', suitD: '#46505e', accent: '#ff3b2e', acc: 'robot' },
  ];

  function starPts(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  /* Per-character accessory shapes: { back: behind body, hat: on the head group } */
  function accessory(c) {
    const a = c.accent;
    switch (c.acc) {
      case 'fox': return {
        back: `<path d="M66 90 Q94 86 90 58 Q84 74 68 78 Z" fill="${c.suit}" ${S}/><path d="M84 66 Q86 62 88 60 Q88 68 84 72 Z" fill="${a}" stroke="none"/>`,
        hat: `<path d="M28 26 L32 2 L46 18 Z" fill="${c.suit}" ${S}/><path d="M72 26 L68 2 L54 18 Z" fill="${c.suit}" ${S}/><path d="M32 21 L34 9 L42 18 Z" fill="${a}" stroke="none"/><path d="M68 21 L66 9 L58 18 Z" fill="${a}" stroke="none"/>` };
      case 'bolt': return {
        back: '',
        hat: `<line x1="50" y1="13" x2="50" y2="2" ${S}/><polygon points="50,-14 42,0 48,0 44,10 56,-4 50,-4 54,-14" fill="${a}" ${S} transform="translate(0,4) scale(.8)" transform-origin="50 0"/>` };
      case 'fin': return {
        back: `<circle cx="80" cy="52" r="5" fill="none" ${S} opacity=".6"/><circle cx="88" cy="38" r="3.5" fill="none" ${S} opacity=".5"/>`,
        hat: `<path d="M38 16 Q50 -10 62 16 Q50 4 38 16 Z" fill="${a}" ${S}/>` };
      case 'rock': return {
        back: '',
        hat: `<path d="M32 20 L38 4 L46 18 Z" fill="#9aa0a6" ${S}/><path d="M45 16 L52 0 L60 15 Z" fill="#7d838a" ${S}/><path d="M59 18 L66 6 L70 20 Z" fill="#9aa0a6" ${S}/>` };
      case 'moon': return {
        back: `<path d="M64 60 Q88 72 82 100 L66 92 Z" fill="${c.suitD}" ${S}/>`,
        hat: `<path d="M60 4 A11 11 0 1 0 72 18 A8.5 8.5 0 1 1 60 4 Z" fill="${a}" ${S}/><polygon points="${starPts(34, 10, 6)}" fill="${a}" ${S}/>` };
      case 'helmet': return {
        back: '',
        hat: `<path d="M25 30 A25 25 0 0 1 75 30 L75 24 A25 25 0 0 0 25 24 Z" fill="${a}" ${S}/><path d="M26 24 A25 27 0 0 1 74 24 L74 16 A26 26 0 0 0 26 16 Z" fill="${c.suit}" ${S}/><rect x="30" y="14" width="40" height="9" rx="4.5" fill="${a}" ${S}/><rect x="36" y="15.5" width="12" height="6" rx="3" fill="#4dc3ff" stroke="none"/><rect x="52" y="15.5" width="12" height="6" rx="3" fill="#4dc3ff" stroke="none"/>` };
      case 'band': return {
        back: `<path d="M70 26 Q84 30 88 44 L80 46 Q78 34 68 32 Z" fill="${a}" ${S}/>`,
        hat: `<rect x="24" y="20" width="52" height="10" rx="5" fill="${a}" ${S}/>` };
      case 'cape': return {
        back: `<path d="M32 62 Q50 58 68 62 L78 104 Q50 96 22 104 Z" fill="${a}" ${S}/>`,
        hat: `<polygon points="${starPts(50, 6, 8)}" fill="${a}" ${S}/>` };
      case 'ice': return {
        back: '',
        hat: `<path d="M34 20 L38 0 L46 17 Z" fill="#dff4ff" ${S}/><path d="M54 17 L62 0 L66 20 Z" fill="#dff4ff" ${S}/>` };
      case 'dino': return {
        back: `<path d="M64 88 Q90 92 94 76 Q82 80 68 74 Z" fill="${c.suit}" ${S}/>`,
        hat: `<path d="M34 18 Q38 4 44 16 Z" fill="${a}" ${S}/><path d="M45 14 Q50 -2 56 13 Z" fill="${a}" ${S}/><path d="M57 15 Q62 4 66 17 Z" fill="${a}" ${S}/>` };
      case 'space': return {
        back: `<rect x="60" y="58" width="18" height="28" rx="5" fill="${a}" ${S}/><path d="M64 88 Q66 96 62 100 M74 88 Q76 96 72 100" fill="none" ${S}/>`,
        hat: `<ellipse cx="50" cy="34" rx="29" ry="30" fill="rgba(160,220,255,.25)" ${S}/><line x1="50" y1="4" x2="50" y2="-4" ${S}/><circle cx="50" cy="-7" r="4" fill="${a}" ${S}/>` };
      case 'robot': return {
        back: '',
        hat: `<rect x="20" y="26" width="8" height="12" rx="3" fill="${a}" ${S}/><rect x="72" y="26" width="8" height="12" rx="3" fill="${a}" ${S}/><line x1="50" y1="12" x2="50" y2="2" ${S}/><circle cx="50" cy="-1" r="4.5" fill="${a}" ${S}/>` };
      default: return { back: '', hat: '' };
    }
  }

  /**
   * Render a fighter as an SVG string. Pose comes from a CSS class on the wrapper.
   * opts.flip: mirror horizontally (unused for now).
   */
  function renderCharacter(c, opts = {}) {
    const acc = accessory(c);
    const gid = 'g' + c.id + (opts.uid ?? '');
    return `<svg viewBox="-8 -18 116 148" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-label="${c.name}">
<defs>
  <linearGradient id="${gid}b" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c.suit}"/><stop offset="1" stop-color="${c.suitD}"/>
  </linearGradient>
  <radialGradient id="${gid}h" cx=".38" cy=".32" r="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="${c.skin}"/><stop offset="1" stop-color="${c.suitD}"/>
  </radialGradient>
</defs>
<g class="char">
  <g class="body-g">
    ${acc.back}
    <g class="leg l"><rect x="36" y="88" width="11" height="32" rx="5.5" fill="url(#${gid}b)" ${S}/><ellipse cx="40" cy="121" rx="10" ry="5.5" fill="${c.suitD}" ${S}/></g>
    <g class="leg r"><rect x="53" y="88" width="11" height="32" rx="5.5" fill="url(#${gid}b)" ${S}/><ellipse cx="60" cy="121" rx="10" ry="5.5" fill="${c.suitD}" ${S}/></g>
    <g class="arm l"><rect x="20" y="60" width="10" height="32" rx="5" fill="url(#${gid}b)" ${S}/><circle cx="25" cy="93" r="6.5" fill="${c.skin}" ${S}/></g>
    <path d="M32 60 Q50 50 68 60 L71 92 Q50 104 29 92 Z" fill="url(#${gid}b)" ${S}/>
    <ellipse cx="46" cy="80" rx="12" ry="10" fill="rgba(255,255,255,.22)" stroke="none"/>
    <polygon points="${starPts(50, 76, 8)}" fill="${c.accent}" ${S}/>
    <g class="arm r"><rect x="70" y="60" width="10" height="32" rx="5" fill="url(#${gid}b)" ${S}/><circle cx="75" cy="93" r="6.5" fill="${c.skin}" ${S}/></g>
    <g class="head-g">
      <circle cx="50" cy="34" r="26" fill="url(#${gid}h)" ${S}/>
      ${acc.hat}
      <g class="eye"><ellipse cx="41" cy="32" rx="5.2" ry="6.8" fill="#fff" ${S}/><circle cx="42.5" cy="33.5" r="2.7" fill="${INK}" stroke="none"/></g>
      <g class="eye"><ellipse cx="59" cy="32" rx="5.2" ry="6.8" fill="#fff" ${S}/><circle cx="60.5" cy="33.5" r="2.7" fill="${INK}" stroke="none"/></g>
      <g class="eye-x"><path d="M37 28 L45 36 M45 28 L37 36 M55 28 L63 36 M63 28 L55 36" fill="none" ${S}/></g>
      <path d="M34 23 Q40 20 45 23 M55 23 Q60 20 66 23" fill="none" ${S}/>
      <circle cx="33" cy="42" r="3.5" fill="rgba(255,110,110,.55)" stroke="none"/>
      <circle cx="67" cy="42" r="3.5" fill="rgba(255,110,110,.55)" stroke="none"/>
      <path class="m-smile" d="M42 46 Q50 53 58 46" fill="none" ${S}/>
      <path class="m-open" d="M40 45 Q50 62 60 45 Z" fill="#8c2f22" ${S}/>
      <circle class="m-oh" cx="50" cy="48" r="4.5" fill="#8c2f22" ${S}/>
    </g>
  </g>
</g></svg>`;
  }

  /* Card background: diagonal energy burst in the fighter's colors. */
  function cardBg(c) {
    return `background:
      radial-gradient(circle at 50% 105%, rgba(255,255,255,.35), transparent 55%),
      repeating-conic-gradient(from -15deg at 50% 60%, ${c.suit} 0deg 14deg, ${c.suitD} 14deg 28deg);`;
  }

  window.Characters = { CHARACTERS, renderCharacter, cardBg };
})();
