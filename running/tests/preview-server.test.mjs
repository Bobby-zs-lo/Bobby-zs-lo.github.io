// Tests for the preview server's static side: which paths it refuses, and that js/config.js only
// ever leaves it rewritten to the mock API, whatever the path it is asked for under.
// (Its page rewriting, injectPreview and rewriteConfig, is covered in mock-api.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewServer, resolveStatic } from './preview-server.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIVE_HOST = 'cloudfunctions.net';

test('resolveStatic: app files resolve inside the repo; a folder serves its index.html', () => {
  assert.equal(resolveStatic('/running/js/app.js'), join(REPO, 'running', 'js', 'app.js'));
  assert.equal(resolveStatic('/running/'), join(REPO, 'running', 'index.html'));
  assert.equal(resolveStatic('/running/css/overview.css'), join(REPO, 'running', 'css', 'overview.css'));
});

test('resolveStatic: traversal is refused, however it is spelt', () => {
  for (const path of [
    '/running/../../outside.txt', '/../outside.txt',
    '/running/%2e%2e/%2e%2e/outside.txt', '/running/%2E%2E/x',
    '/running%5c..%5c..%5coutside.txt', '/%5c..%5coutside.txt',
  ]) assert.equal(resolveStatic(path), null, path);
});

test('resolveStatic: dot folders are refused, including through a backslash', () => {
  for (const path of ['/.git/config', '/%2egit/config', '/%5c.git%5cconfig', '/running%5c.git%5cHEAD', '/running/.env', '/.claude/settings.json']) {
    assert.equal(resolveStatic(path), null, path);
  }
});

test('resolveStatic: Windows aliases of a file are refused: data streams and 8.3 short names', () => {
  for (const path of ['/running/js/config.js::$DATA', '/running/js/config.js%3A%3A%24DATA', '/running/js/config.js:stream', '/running/js/CONFIG~1.JS', '/RUNNIN~1/js/config.js', '/running/js/config.js%7e']) {
    assert.equal(resolveStatic(path), null, path);
  }
});

test('resolveStatic: a NUL byte or a broken escape is refused', () => {
  assert.equal(resolveStatic('/running/js/config.js%00.png'), null);
  assert.equal(resolveStatic('/running/%E0%A4%A'), null);
});

// The whole server, over a socket: the raw request path is what an attacker controls.
async function withServer(fn) {
  const server = createPreviewServer({ port: 0 });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  const get = (path) => new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, path, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => ok({ status: res.statusCode, body }));
    });
    req.on('error', fail);
    req.end();
  });
  try { await fn(get, port); } finally { await new Promise((ok) => server.close(ok)); }
}

test('server: config.js is served rewritten to the mock API, and never under an alias', async () => {
  await withServer(async (get, port) => {
    const config = await get('/running/js/config.js');
    assert.equal(config.status, 200);
    assert.match(config.body, new RegExp(`export const API_BASE = "http://127\\.0\\.0\\.1:${port}/mock-api";`));
    assert.ok(!config.body.includes(LIVE_HOST), 'no live API_BASE');
    for (const path of ['/running/js/config.js::$DATA', '/running/js/CONFIG~1.JS', '/%5c.git%5cconfig', '/.git/config', '/running/%2e%2e/%2e%2e/etc/hosts']) {
      const res = await get(path);
      assert.ok(res.status === 403 || res.status === 404, `${path} -> ${res.status}`);
      assert.ok(!res.body.includes(LIVE_HOST), `${path} leaks the live API_BASE`);
    }
  });
});
