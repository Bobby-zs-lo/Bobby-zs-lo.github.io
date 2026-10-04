// Generates the PWA icons as real PNGs using only node:zlib.
//   node running/tools/make-icons.mjs
// Mark: a running track (stadium ring with a lane line) in paper on the
// portfolio accent. Shapes are signed-distance functions, 4×4 supersampled.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

const ACCENT = [0xC4, 0x30, 0x2B];
const PAPER = [0xFB, 0xFA, 0xF7];
const INK = [0x7A, 0x1F, 0x2B]; // --accent-2, the lane line

// ── PNG encoder ────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── shapes (coordinates in -1..1, y down) ──────────────────────────────────
const capsule = (x, y, a, r) => Math.hypot(Math.max(Math.abs(x) - a, 0), y) - r; // horizontal stadium
const roundRect = (x, y, half, rad) => {
  const qx = Math.abs(x) - half + rad, qy = Math.abs(y) - half + rad;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
};

/** Returns [r,g,b,a] for one sample. */
function shade(x, y, { scale, bg, mono }) {
  const gx = x / scale, gy = y / scale;
  const d = capsule(gx, gy, 0.30, 0.52);
  const ring = Math.abs(d + 0.13) - 0.13;         // track band, 0.26 thick, inside the outline
  const lane = Math.abs(d + 0.13) - 0.022;         // lane divider in the middle of the band
  if (mono) return ring <= 0 ? [255, 255, 255, 255] : [0, 0, 0, 0];
  if (bg === 'rounded' && roundRect(x, y, 1, 0.44) > 0) return [0, 0, 0, 0];
  if (lane <= 0) return [...INK, 255];
  if (ring <= 0) return [...PAPER, 255];
  return [...ACCENT, 255];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = ((px + (sx + 0.5) / S) / size) * 2 - 1;
      const y = ((py + (sy + 0.5) / S) / size) * 2 - 1;
      const c = shade(x, y, opts);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const i = (py * size + px) * 4;
    buf[i + 3] = Math.round(a / (S * S));
    if (a) { buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a); }
  }
  return png(size, size, buf);
}

const jobs = [
  ['icon-192.png', 192, { scale: 0.92, bg: 'rounded' }],
  ['icon-512.png', 512, { scale: 0.92, bg: 'rounded' }],
  // Maskable: full bleed; the mark stays inside the 80% safe circle.
  ['icon-maskable.png', 512, { scale: 0.76, bg: 'full' }],
  // Notification badge: Android uses only the alpha channel.
  ['badge-96.png', 96, { scale: 1.05, mono: true }],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(OUT, name), render(size, opts));
  console.log('wrote', join('running/assets', name));
}
