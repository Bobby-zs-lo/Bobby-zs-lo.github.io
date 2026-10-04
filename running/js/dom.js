// Safe templating: html`...${value}...` escapes every value unless it is
// wrapped in raw() (used only for markup this app built itself).
import { escapeHtml } from './markdown.js';

const RAW = Symbol('raw');
export const raw = s => ({ [RAW]: String(s ?? '') });

function piece(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(piece).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return escapeHtml(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += piece(v) + strings[i + 1]; });
  return raw(out);
}
export const toString = r => (r && typeof r === 'object' && RAW in r ? r[RAW] : piece(r));

export function mount(el, tpl) { el.innerHTML = toString(tpl); }
