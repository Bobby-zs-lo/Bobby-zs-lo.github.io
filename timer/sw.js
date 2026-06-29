const CACHE = 'pixel-timer-v6';
const ASSETS = [
  './', './index.html', './css/shell.css', './css/crt.css',
  './js/main.js', './js/timer.js', './js/audio.js', './js/input.js',
  './js/pixelfont.js', './js/palette.js', './js/scene.js',
  './js/themes/registry.js', './js/themes/castle.js', './js/themes/monsterhp.js',
  './js/themes/dragon.js', './js/themes/mouse.js',
  './js/screens/home.js', './js/screens/picker.js', './js/screens/run.js',
  './js/screens/done.js', './manifest.webmanifest',
  './assets/castle.png', './assets/castle.json',
  './assets/monsterhp.png', './assets/monsterhp.json',
  './assets/dragon.png', './assets/dragon.json',
  './assets/mouse.png', './assets/mouse.json',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png',
  './assets/thumb_castle.png', './assets/thumb_monsterhp.png',
  './assets/thumb_dragon.png', './assets/thumb_bridge.png',
  './assets/thumb_volcano.png', './assets/thumb_feeding.png',
  './assets/thumb_mouse.png',
  './assets/thumb_lock.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
