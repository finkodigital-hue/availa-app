// Post-build integration: import the actual generated Wrangler entry and the
// actual Nitro manifest fast path. All ASSETS responses are inert fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverDirectory = path.join(root, '.output', 'server');
const config = JSON.parse(fs.readFileSync(path.join(serverDirectory, 'wrangler.json'), 'utf8'));
const manualConfig = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
let checks = 0;
const same = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
same(config.main, 'bookzenvo-cache-entry.mjs');
same(path.resolve(root, manualConfig.main), path.resolve(serverDirectory, config.main));
for (const route of ['/assets/*', '/client-entry.js']) {
  same(Array.isArray(config.assets.run_worker_first) && config.assets.run_worker_first.includes(route), true);
  same(Array.isArray(manualConfig.assets.run_worker_first) && manualConfig.assets.run_worker_first.includes(route), true);
}
const indexPath = path.join(serverDirectory, 'index.mjs');
const source = fs.readFileSync(indexPath, 'utf8');
const pathname = source.match(/"(\/assets\/index-[A-Za-z0-9_-]+\.js)"\s*:/)?.[1];
assert.ok(pathname, 'The integration case must be a real Nitro public_assets_data entry');
checks++;
const savedFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden in built cache integration'); };
try {
  const original = await import(pathToFileURL(indexPath).href);
  const wrapped = await import(pathToFileURL(path.resolve(serverDirectory, config.main)).href);
  same(Object.keys(wrapped).sort(), Object.keys(original).sort());
  for (const name of Object.keys(original.default).filter(name => name !== 'fetch')) same(wrapped.default[name], original.default[name]);
  const run = async (entry, method, status, type = 'text/javascript') => {
    let calls = 0;
    const body = method === 'HEAD' || [204, 205, 304].includes(status) ? null : 'inert asset fixture';
    const response = await entry.fetch(new Request(`https://fixture.invalid${pathname}`, { method }), {
      ASSETS: { fetch: async () => {
        calls++;
        return new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', etag: '"fixture"', 'x-content-type-options': 'nosniff' } });
      } },
    }, { waitUntil() {} });
    same(calls, 1);
    same(response.status, status);
    same(response.headers.get('content-type'), type);
    same(response.headers.get('etag'), '"fixture"');
    same(response.headers.get('x-content-type-options'), 'nosniff');
    same(await response.text(), body ?? '');
    return response.headers.get('cache-control');
  };
  // Prove the previously missed shortcut: original Nitro retains binding no-store.
  same(await run(original.default, 'GET', 200), 'no-store');
  for (const method of ['GET', 'HEAD']) {
    for (const status of [200, 206]) same(await run(wrapped.default, method, status), 'public, max-age=31536000, immutable');
    for (const status of [204, 205, 302, 304, 404, 500, 503]) same(await run(wrapped.default, method, status), 'no-store');
  }
  same(await run(wrapped.default, 'GET', 200, 'text/html'), 'no-store');
  const savedError = console.error;
  const diagnostics = [];
  console.error = (...args) => diagnostics.push(args);
  try {
    for (const method of ['GET', 'HEAD']) {
      const failed = await wrapped.default.fetch(new Request(`https://fixture.invalid${pathname}`, { method }), { ASSETS: { fetch: async () => { throw new Error('private fixture detail must not be logged'); } } }, { waitUntil() {} });
      same(failed.status, 500);
      same(failed.headers.get('cache-control'), 'no-store');
      same(failed.headers.get('x-content-type-options'), 'nosniff');
      same(await failed.text(), method === 'HEAD' ? '' : 'Service unavailable');
    }
    same(diagnostics, [['Bookzenvo outer Worker request failed'], ['Bookzenvo outer Worker request failed']]);
  } finally { console.error = savedError; }
  same(networkCalls, 0);
  same(fs.readFileSync(indexPath, 'utf8'), source);
  console.log(`Built asset cache: ${checks} actual Nitro/Wrangler entry, bypass, status, header, bodyless and handler-preservation assertions passed; no network calls.`);
} finally { globalThis.fetch = savedFetch; }
