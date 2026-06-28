import { registerScene } from '../scene.js';

registerScene(
  { id: 'castle',    name: 'Castle',       thumb: 'thumb_castle',    comingSoon: false },
  () => import('./castle.js').then(m => m.CastleScene)
);
registerScene(
  { id: 'monsterhp', name: 'Monster HP',  thumb: 'thumb_monsterhp', comingSoon: false },
  () => import('./monsterhp.js').then(m => m.MonsterHpScene)
);

// Phase-2 placeholders (shown locked in the theme picker):
registerScene({ id: 'dragon',  name: 'Dragon Sleep',  thumb: 'thumb_dragon',  comingSoon: true }, null);
registerScene({ id: 'bridge',  name: 'Canyon Bridge', thumb: 'thumb_bridge',  comingSoon: true }, null);
registerScene({ id: 'volcano', name: 'Volcano Run',   thumb: 'thumb_volcano', comingSoon: true }, null);
registerScene({ id: 'feeding', name: 'Monster Feast', thumb: 'thumb_feeding', comingSoon: true }, null);
