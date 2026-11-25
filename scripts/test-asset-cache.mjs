import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';

let checks = 0;
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const immutable = 'public, max-age=31536000, immutable';
const serverSource = fs.readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false');
const compiled = ts.transpileModule(serverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cacheModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/response-cache.server.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: cacheModule, exports: cacheModule.exports, Headers, Response, URL });
const upgrade = { status: 101, headers: new Headers(), webSocket: {} };
same(cacheModule.exports.applyResponseCachePolicy(new Request('https://fixture.invalid/api/socket'), upgrade), upgrade);

function server(handler) {
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Request, Response, Headers, URL,
    process: { env: {} }, console: { error() {} },
    require(name) {
      if (name === './lib/error-capture') return { consumeLastCapturedError: () => undefined };
      if (name === './lib/error-page') return { renderErrorPage: () => '<!doctype html><body>Error</body>' };
      if (name === './lib/response-cache.server') return cacheModule.exports;
      if (name === 'cloudflare:workers') return { env: {} };
      if (name === '@tanstack/react-start/server-entry') return { default: { fetch: handler } };
      throw new Error(`Unexpected module: ${name}`);
    },
  }, { filename: 'server-cache-fixture.cjs' });
  return module.exports.default;
}

async function asset(pathname, { status = 200, type = 'application/javascript', method = 'GET', body = 'fixture', extra = {} } = {}) {
  const response = new Response([204, 205, 304].includes(status) || method === 'HEAD' ? null : body, {
    status, headers: { 'content-type': type, 'cache-control': immutable, etag: '"fixture-etag"',
      'x-content-type-options': 'nosniff', 'cdn-cache-control': 'public,max-age=99999',
      'cloudflare-cdn-cache-control': 'public,max-age=99999', expires: 'Wed, 01 Jan 2031 00:00:00 GMT', ...extra },
  });
  let calls = 0;
  const entry = server(() => { throw new Error('Asset request must not render SSR'); });
  const result = await entry.fetch(new Request(`https://fixture.invalid${pathname}`, { method }), {
    ASSETS: { fetch: async request => { same(new URL(request.url).pathname, pathname); calls++; return response; } },
  }, {});
  same(calls, 1);
  same(result.status, status);
  same(result.headers.get('etag'), '"fixture-etag"');
  same(result.headers.get('x-content-type-options'), 'nosniff');
  same(result.headers.get('cdn-cache-control'), null);
  same(result.headers.get('cloudflare-cdn-cache-control'), null);
  same(result.headers.get('expires'), null);
  return result;
}

for (const [file, type] of [
  ['index-AbCd1234.js', 'application/javascript; charset=utf-8'],
  ['module-ZyXw9876.mjs', 'text/javascript'], ['style-A1b2C3d4.css', 'text/css'],
  ['font-Ab_cD-12.woff2', 'font/woff2'], ['font-ZyXw9876.woff', 'font/woff'],
  ['logo-AbCd1234.svg', 'image/svg+xml'],
]) same((await asset(`/assets/${file}`, { type })).headers.get('cache-control'), immutable);
same((await asset('/assets/index-AbCd1234.js', { method: 'HEAD' })).headers.get('cache-control'), immutable);
same((await asset('/assets/index-AbCd1234.js', { status: 206, extra: { 'content-range': 'bytes 0-6/7' } })).headers.get('cache-control'), immutable);
for (const status of [204, 205, 301, 302, 304, 404, 405, 500, 503]) {
  const response = await asset('/assets/index-AbCd1234.js', { status });
  same(response.headers.get('cache-control'), 'no-store', `Status ${status} must never become immutable`);
  if ([204, 205, 304].includes(status)) same(await response.text(), '');
}
for (const file of ['plain.js', 'index-short.js', 'data-AbCd1234.json', 'page-AbCd1234.html']) {
  same((await asset(`/assets/${file}`)).headers.get('cache-control'), 'no-store');
}
same((await asset('/assets/index-AbCd1234.js', { type: 'text/html', body: '<html>fallback</html>' })).headers.get('cache-control'), 'no-store');
same((await asset('/assets/index-AbCd1234.js', { type: 'application/json' })).headers.get('cache-control'), 'no-store');
same((await asset('/assets/index-AbCd1234.js', { method: 'POST' })).headers.get('cache-control'), 'no-store');
for (const status of [200, 304, 404, 500]) same((await asset('/client-entry.js', { status })).headers.get('cache-control'), 'no-store');

async function dynamic(pathname, handler, accept = 'text/html') {
  return server(handler).fetch(new Request(`https://fixture.invalid${pathname}`, { headers: { accept } }), {}, {});
}
for (const html of ['<!doctype html><body>Home</body>', '']) {
  const result = await dynamic('/', () => new Response(html, { headers: { 'content-type': 'text/html', 'cache-control': immutable } }));
  same(result.status, 200);
  same(result.headers.get('cache-control'), 'no-store');
  ok((await result.text()).includes('<body>'));
}
const swallowed = await dynamic('/', () => new Response('{"unhandled":true,"message":"HTTPError"}', { status: 500, headers: { 'content-type': 'application/json' } }));
same(swallowed.status, 500);
same(swallowed.headers.get('cache-control'), 'no-store');
const thrown = await dynamic('/', () => { throw new Error('fixture failure'); });
same(thrown.status, 500);
same(thrown.headers.get('cache-control'), 'no-store');
const assetThrown = await server(() => { throw new Error('SSR must not run'); }).fetch(
  new Request('https://fixture.invalid/assets/index-AbCd1234.js'),
  { ASSETS: { fetch: async () => { throw new Error('binding failure'); } } }, {},
);
same(assetThrown.status, 500);
same(assetThrown.headers.get('cache-control'), 'no-store');
same((await dynamic('/assets/missing-AbCd1234.js', () => new Response('missing', { status: 404 }), '*/*')).headers.get('cache-control'), 'no-store');
for (const status of [204, 205, 304]) {
  const response = await dynamic('/api/fixture', () => new Response(null, { status }), '*/*');
  same(response.status, status);
  same(await response.text(), '');
}
const json = await dynamic('/api/fixture', () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=0' } }), '*/*');
same(json.headers.get('cache-control'), 'private, max-age=0');
same((await dynamic('/api/fixture', () => new Response('failed', { status: 503, headers: { 'cache-control': immutable } }), '*/*')).headers.get('cache-control'), 'no-store');
same((await dynamic('/deployment.json', () => new Response('{}'), '*/*')).headers.get('cache-control'), 'no-store');

// Execute the real deployment preparation script against isolated, fictional
// build outputs. This checks generated routing/header behaviour, not source text.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookzenvo-cache-'));
try {
  fs.mkdirSync(path.join(temp, 'scripts'));
  fs.mkdirSync(path.join(temp, '.output', 'server'), { recursive: true });
  fs.mkdirSync(path.join(temp, '.output', 'public', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'src', 'lib'), { recursive: true });
  fs.copyFileSync(new URL('../src/lib/response-cache.server.ts', import.meta.url), path.join(temp, 'src', 'lib', 'response-cache.server.ts'));
  fs.copyFileSync(new URL('./prepare-cloudflare-deploy.mjs', import.meta.url), path.join(temp, 'scripts', 'prepare-cloudflare-deploy.mjs'));
  fs.writeFileSync(path.join(temp, '.output', 'server', 'index.mjs'), `export const namedFixture = "preserved";
export default { fetch(request, env) { return env.ASSETS.fetch(request); }, scheduled() { return "scheduled"; }, queue() { return "queue"; } };\n`);
  fs.writeFileSync(path.join(temp, '.output', 'public', 'assets', 'index-AbCd1234.js'), '/* fixture */');
  for (let n = 0; n < 205; n++) fs.writeFileSync(path.join(temp, '.output', 'public', 'assets', `chunk-${n}-AbCd1234.js`), '/* fixture */');
  const configPath = path.join(temp, '.output', 'server', 'wrangler.json');
  for (const existing of [undefined, false, ['/api/*', '!/api/docs/*'], true]) {
    fs.writeFileSync(configPath, JSON.stringify({ assets: { binding: 'ASSETS', directory: '../public', run_worker_first: existing } }));
    execFileSync(process.execPath, [path.join(temp, 'scripts', 'prepare-cloudflare-deploy.mjs')], {
      cwd: temp, env: { SystemRoot: process.env.SystemRoot ?? '', GITHUB_SHA: 'a'.repeat(40), NODE_PATH: fileURLToPath(new URL('../node_modules/', import.meta.url)) }, stdio: 'pipe',
    });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    same(config.assets.run_worker_first, existing === true ? true : [...(Array.isArray(existing) ? existing : []), '/assets/*', '/client-entry.js']);
    same(config.assets.binding, 'ASSETS');
    same(config.assets.directory, '../public');
    same(config.main, 'bookzenvo-cache-entry.mjs');
  }
  // A repeated preparation must still import index.mjs, never its own wrapper.
  execFileSync(process.execPath, [path.join(temp, 'scripts', 'prepare-cloudflare-deploy.mjs')], {
    cwd: temp, env: { SystemRoot: process.env.SystemRoot ?? '', GITHUB_SHA: 'a'.repeat(40), NODE_PATH: fileURLToPath(new URL('../node_modules/', import.meta.url)) }, stdio: 'pipe',
  });
  const original = await import(pathToFileURL(path.join(temp, '.output', 'server', 'index.mjs')).href);
  const wrapped = await import(pathToFileURL(path.join(temp, '.output', 'server', 'bookzenvo-cache-entry.mjs')).href);
  same(wrapped.namedFixture, original.namedFixture);
  same(wrapped.default.scheduled, original.default.scheduled);
  same(wrapped.default.queue, original.default.queue);
  for (const [pathname, type, status, expected] of [
    ['/assets/index-AbCd1234.js', 'text/javascript', 200, immutable],
    ['/assets/index-AbCd1234.js', 'text/javascript', 404, 'no-store'],
    ['/client-entry.js', 'text/javascript', 200, 'no-store'],
    ['/', 'text/html', 200, 'no-store'],
  ]) {
    const response = await wrapped.default.fetch(new Request(`https://fixture.invalid${pathname}`), {
      ASSETS: { fetch: async () => new Response('fixture', { status, headers: { 'content-type': type, 'cache-control': 'no-store' } }) },
    }, {});
    same(response.status, status);
    same(response.headers.get('cache-control'), expected);
  }
  const headers = fs.readFileSync(path.join(temp, '.output', 'public', '_headers'), 'utf8');
  const blocks = headers.trim().split(/\n\s*\n/).map(block => block.split('\n'));
  ok(blocks.length <= 100, '206 assets must not exceed the Cloudflare 100-header-rule limit');
  const staticHeaders = pathname => {
    const result = new Map();
    for (const [pattern, ...lines] of blocks) {
      if (pattern !== '/*' && pattern !== pathname) continue;
      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('! ')) { result.delete(line.slice(2).toLowerCase()); continue; }
        const split = line.indexOf(':');
        const name = line.slice(0, split).toLowerCase(), value = line.slice(split + 1).trim();
        result.set(name, result.has(name) ? `${result.get(name)}, ${value}` : value);
      }
    }
    return result;
  };
  for (const pathname of ['/', '/assets/index-AbCd1234.js', '/assets/missing-AbCd1234.js', '/client-entry.js', '/deployment.json']) {
    const matched = staticHeaders(pathname);
    same(matched.get('cache-control'), 'no-store', 'Static bypass/fallback cannot inherit immutable or duplicate conflicting directives');
    same(matched.get('x-content-type-options'), 'nosniff');
  }
  same(fs.readFileSync(path.join(temp, '.output', 'public', 'client-entry.js'), 'utf8'), 'import "/assets/index-AbCd1234.js";\n');
} finally {
  const resolved = fs.realpathSync(temp);
  assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(resolved).startsWith('bookzenvo-cache-'));
  fs.rmSync(resolved, { recursive: true });
}
console.log(`Asset cache: ${checks} response, bodyless, bootstrap, generated-routing and static-header assertions passed; no network calls.`);
