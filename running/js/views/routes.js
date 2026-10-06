// Routes (desk only): maps of past runs and the route generator. A placeholder until the map
// lands; it exists now so the route, the rail tab and the service-worker precache all resolve.
import { html, mount } from '../dom.js';

export async function render(el) {
  mount(el, html`
    <header class="page-head">
      <p class="eyebrow">Desk</p>
      <h1>Routes</h1>
      <p class="sub">Maps of your runs and new routes to try will appear here.</p>
    </header>
  `);
}
