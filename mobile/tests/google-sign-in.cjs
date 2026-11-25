const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/google-sign-in.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest, URL, URLSearchParams, Date, JSON, Uint8Array, Set });
const { createGoogleSignIn, parseGoogleCallback, GOOGLE_CALLBACK } = exportsForTest;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture() {
  const values = new Map(), browser = deferred(), posted = [], adopted = [];
  let opened, now = 1000, signedOut = 0;
  const deps = {
    enabled: true, gateway: 'https://bookzenvo.com/api/supabase', storageKey: 'fixture-auth',
    storage: { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value), removeItem: async key => values.delete(key) },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      setSession: async pair => { adopted.push(pair); return { error: null }; },
      signOut: async () => { signedOut++; },
    },
    randomBytes: async () => crypto.randomBytes(32),
    sha256Base64: async value => crypto.createHash('sha256').update(value).digest('base64'),
    openBrowser: async (url, callback) => { opened = { url: new URL(url), callback }; return browser.promise; },
    fetch: async (url, options) => { posted.push({ url, options }); return { ok: true, json: async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' }) }; },
    now: () => now,
  };
  const flow = createGoogleSignIn(deps);
  return { flow, deps, values, browser, posted, adopted, opened: () => opened, signedOut: () => signedOut,
    callback: (suffix = '&code=fixture-code') => opened.url.searchParams.get('redirect_to') + suffix,
    tick: value => { now += value; },
  };
}
(async () => {
  const valid = `${GOOGLE_CALLBACK}?native_state=${'a'.repeat(64)}&code=fixture`;
  assert.equal(parseGoogleCallback(valid).code, 'fixture');
  for (const bad of [valid.replace('bookzenvo:', 'https:'), valid.replace('/google?', '/google/extra?'), valid.replace('auth/', 'user:pass@auth/'), `${valid}&code=other`, `${valid}&access_token=secret`, `${valid}#refresh_token=secret`, valid.replace('native_state=', 'state='), `${valid}&error=denied`, `${valid}&unexpected=1`]) assert.equal(parseGoogleCallback(bad), null, bad);

  const happy = fixture(); const first = happy.flow.start(); assert.equal(happy.flow.start(), first, 'double taps share one attempt');
  await flush(); const open = happy.opened(); assert(open); assert.equal(open.url.origin, 'https://bookzenvo.com');
  assert.equal(open.url.pathname, '/api/supabase/auth/v1/authorize'); assert.equal(open.url.searchParams.get('provider'), 'google');
  assert.equal(open.url.searchParams.get('code_challenge_method'), 's256'); assert.equal(open.callback, GOOGLE_CALLBACK);
  const saved = JSON.parse([...happy.values.values()][0]);
  assert.equal(open.url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(saved.verifier).digest('base64url'));
  assert(!open.url.href.includes(saved.verifier), 'verifier never enters browser URL');
  assert.equal(await happy.flow.handleColdCallback(happy.callback()), false, 'OS event leaves live browser callback to browser owner');
  happy.browser.resolve({ type: 'success', url: happy.callback() }); await first;
  assert.equal(happy.adopted.length, 1); assert.equal(happy.values.size, 0);
  const request = happy.posted[0]; assert.equal(request.url, 'https://bookzenvo.com/api/supabase/auth/v1/token?grant_type=pkce');
  assert.equal(JSON.parse(request.options.body).code_verifier, saved.verifier);
  assert.equal(await happy.flow.handleColdCallback(happy.callback()), false, 'consumed callback cannot repeat session adoption');

  const cold = fixture(); const coldState = 'a'.repeat(64), coldVerifier = 'b'.repeat(64);
  cold.values.set('fixture-auth.google-pkce', JSON.stringify({ state: coldState, verifier: coldVerifier, createdAt: 1000 }));
  assert.equal(await cold.flow.handleColdCallback(valid), true, 'cold launch recovers encrypted pending attempt');
  assert.equal(cold.adopted.length, 1);
  const mismatch = fixture(); mismatch.values.set('fixture-auth.google-pkce', JSON.stringify({ state: 'c'.repeat(64), verifier: coldVerifier, createdAt: 1000 }));
  await assert.rejects(mismatch.flow.handleColdCallback(valid), /different attempt/); assert.equal(mismatch.posted.length, 0);
  const expired = fixture(); expired.values.set('fixture-auth.google-pkce', JSON.stringify({ state: coldState, verifier: coldVerifier, createdAt: 1000 })); expired.tick(600_001);
  assert.equal(await expired.flow.handleColdCallback(valid), false); assert.equal(expired.values.size, 0); assert.equal(expired.posted.length, 0);
  const denied = fixture(); const deniedRun = denied.flow.start(); await flush(); denied.browser.resolve({ type: 'success', url: denied.callback('&error=access_denied') });
  await assert.rejects(deniedRun, /not completed/); assert.equal(denied.adopted.length, 0); assert.equal(denied.values.size, 0);
  const cancelled = fixture(); const cancelledRun = cancelled.flow.start(); await flush(); cancelled.browser.resolve({ type: 'cancel' }); await cancelledRun;
  assert.equal(cancelled.values.size, 0); assert.equal(cancelled.posted.length, 0);
  const brokenBrowser = fixture(); const brokenRun = brokenBrowser.flow.start(); await flush(); brokenBrowser.browser.reject(new Error('browser unavailable'));
  await assert.rejects(brokenRun, /browser unavailable/); assert.equal(brokenBrowser.values.size, 0);
  const closed = fixture(); const closedRun = closed.flow.start(); await flush(); const lateLink = closed.callback(); await closed.flow.cancel();
  closed.browser.resolve({ type: 'success', url: lateLink }); await closedRun; assert.equal(closed.adopted.length, 0);
  const inflight = fixture(); const exchange = deferred(); inflight.deps.fetch = () => exchange.promise;
  const inflightRun = inflight.flow.start(); await flush(); inflight.browser.resolve({ type: 'success', url: inflight.callback() }); await flush();
  const cancellation = inflight.flow.cancel(); exchange.resolve({ ok: true, json: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }) });
  await assert.rejects(inflightRun, /expired/); await cancellation; assert.equal(inflight.adopted.length, 0, 'late token exchange cannot undo sign-out');
  const writing = fixture(), write = deferred(); writing.deps.auth.setSession = async () => { writing.adopted.push('write'); return write.promise; };
  const writingRun = writing.flow.start(); await flush(); writing.browser.resolve({ type: 'success', url: writing.callback() }); await flush();
  assert.equal(writing.adopted.length, 1); const cancelWrite = writing.flow.cancel(); write.resolve({ error: null });
  await assert.rejects(writingRun, /expired/); await cancelWrite; assert.equal(writing.signedOut(), 1, 'sign-out follows an already-started session write');
  const existing = fixture(); existing.deps.auth.getSession = async () => ({ data: { session: { user: { id: 'other' } } }, error: null });
  existing.values.set('fixture-auth.google-pkce', JSON.stringify({ state: coldState, verifier: coldVerifier, createdAt: 1000 }));
  assert.equal(await existing.flow.handleColdCallback(valid), false); assert.equal(existing.posted.length, 0, 'cold callback cannot replace current signed-in user');
  const off = fixture(); off.deps.enabled = false; await assert.rejects(off.flow.start(), /not available/); assert.equal(off.opened(), undefined);
  const failedStorage = fixture(); failedStorage.deps.storage.setItem = async () => { throw new Error('secure store unavailable'); };
  await assert.rejects(failedStorage.flow.start(), /secure store unavailable/); assert.equal(failedStorage.opened(), undefined);
  console.log('Native Google sign-in regressions passed: S256/state, private verifier, exact callbacks, cold restart, duplicate/cancel/error/expiry flows, current-account preservation and both sign-out races. Provider/browser/crypto adapters isolated; no network or real accounts.');
})().catch(error => { console.error(error); process.exitCode = 1; });
