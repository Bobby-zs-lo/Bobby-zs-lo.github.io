// Overview (desk only): the whole training picture on one wide screen. A placeholder until
// the dashboard tiles land; it exists now so the route, the rail tab and the service-worker
// precache all resolve.
import { html, mount } from '../dom.js';

export async function render(el) {
  mount(el, html`
    <header class="page-head">
      <p class="eyebrow">Desk</p>
      <h1>Overview</h1>
      <p class="sub">Volume, load and trends across the whole plan will appear here.</p>
    </header>
  `);
}
