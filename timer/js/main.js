import './themes/registry.js';
import { SceneRegistry } from './scene.js';
import { audio } from './audio.js';
import { renderHome } from './screens/home.js';
import { renderPicker } from './screens/picker.js';
import { renderRun } from './screens/run.js';
import { renderDone } from './screens/done.js';

const app = document.getElementById('app');
const store = {
  get muted(){ return localStorage.getItem('pt.muted')==='1'; },
  set muted(v){ localStorage.setItem('pt.muted', v?'1':'0'); audio.setMuted(v); },
  get lastTheme(){ return localStorage.getItem('pt.theme') || 'castle'; },
  set lastTheme(v){ localStorage.setItem('pt.theme', v); },
  get lastMins(){ return +(localStorage.getItem('pt.mins')||'5'); },
  set lastMins(v){ localStorage.setItem('pt.mins', String(v)); },
};
audio.setMuted(store.muted);
const ctx = { app, store, registry: SceneRegistry, audio, go };
function clear(){ app.innerHTML=''; }
function go(screen, params){
  clear();
  if(screen==='home') renderHome(ctx, params);
  else if(screen==='picker') renderPicker(ctx, params);
  else if(screen==='run') renderRun(ctx, params);
  else if(screen==='done') renderDone(ctx, params);
}
// unlock audio on first interaction anywhere
window.addEventListener('pointerdown', ()=>audio.unlock(), { once:true });
go('home');

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
