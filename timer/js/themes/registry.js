import { registerScene } from '../scene.js';

registerScene(
  { id: 'castle',    name: 'Castle',       thumb: 'thumb_castle',    comingSoon: false },
  () => import('./castle.js').then(m => m.CastleScene)
);
registerScene(
  { id: 'monsterhp', name: 'Monster HP',  thumb: 'thumb_monsterhp', comingSoon: false },
  () => import('./monsterhp.js').then(m => m.MonsterHpScene)
);

// Phase-2 live theme:
registerScene(
  { id: 'dragon',    name: 'Dragon Sleep', thumb: 'thumb_dragon',    comingSoon: false },
  () => import('./dragon.js').then(m => m.DragonScene)
);

// Phase-2 live theme:
registerScene(
  { id: 'bridge',    name: 'Canyon Bridge', thumb: 'thumb_bridge', comingSoon: false },
  () => import('./bridge.js').then(m => m.BridgeScene)
);

// Phase-2 placeholders (shown locked in the theme picker):
registerScene({ id: 'volcano', name: 'Volcano Run',   thumb: 'thumb_volcano', comingSoon: true }, null);
registerScene({ id: 'feeding', name: 'Monster Feast', thumb: 'thumb_feeding', comingSoon: true }, null);

// Phase-2 live theme (appended last so it shows last in the picker):
registerScene(
  { id: 'mouse', name: 'Mouse Timer', thumb: 'thumb_mouse', comingSoon: false },
  () => import('./mouse.js').then(m => m.MouseScene)
);
