const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/workspace-session.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, URL });
const { workspaceSessionScript, workspaceSignOutScript, WORKSPACE_AUTH_STORAGE_KEY: key } = exportsObject;
const now = Math.floor(Date.now() / 1000);
const jwt = (user, aal, iat) => `fixture.${Buffer.from(JSON.stringify({ sub: user, aal, iat, exp: now + 3600 })).toString('base64url')}.signature`;
const session = (user, aal = 'aal1', iat = now - 100) => ({ user: { id: user }, access_token: jwt(user, aal, iat), refresh_token: `fixture-${user}-${aal}` });
const basic = session('owner');
const mfa = session('owner', 'aal2', now);

function browser() {
  class Storage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
    clear() { this.values.clear(); }
  }
  const events = [], messages = [], pending = [];
  let entries = 0;
  const window = { location: { origin: 'https://bookzenvo.com', reload() {} }, ReactNativeWebView: { postMessage: message => messages.push(JSON.parse(message)) } };
  const localStorage = new Storage();
  const context = vm.createContext({ window, Storage, localStorage, Promise, atob: value => Buffer.from(value, 'base64').toString('binary'), BroadcastChannel: class {
    constructor(name) { assert.equal(name, key); }
    postMessage(event) { events.push(event); }
    close() {}
  } });
  const inject = value => vm.runInContext(workspaceSessionScript(value, 'https://bookzenvo.com'), context);
  const useBoundary = () => {
    window.__bookzenvoAuthCommit = { run(write) {
      entries++;
      return new Promise((resolve, reject) => pending.push(() => {
        try { const result = write(); assert.equal(result?.then, undefined, 'commit callback stays synchronous'); resolve(result); }
        catch (error) { reject(error); }
      }));
    } };
  };
  const flush = () => { assert.equal(pending.length, 1); pending.shift()(); };
  return { context, window, localStorage, events, messages, inject, useBoundary, flush, get entries() { return entries; }, read: () => JSON.parse(localStorage.getItem(key)) };
}

(async () => {
  const first = browser();
  first.inject(basic);
  assert.equal(first.read().user.id, 'owner', 'pre-bootstrap seed is synchronous');
  assert.equal(first.events[0].event, 'SIGNED_IN');
  first.useBoundary();
  first.inject(session('other'));
  assert.equal(first.entries, 1);
  assert.equal(first.read().user.id, 'owner', 'post-bootstrap injection waits for the shared boundary');
  assert.equal(first.events.length, 1, 'no auth notification escapes before commit');
  first.flush();
  assert.equal(first.read().user.id, 'other');
  assert.equal(first.events.at(-1).event, 'SIGNED_IN');

  const refresh = browser();
  refresh.inject(basic);
  vm.runInContext(workspaceSignOutScript(), refresh.context);
  refresh.useBoundary();
  refresh.inject(basic);
  // A website MFA commit wins while the native write waits. The preservation
  // decision must read this new value inside the shared boundary, not before it.
  refresh.localStorage.setItem(key, JSON.stringify(mfa));
  refresh.flush();
  assert.equal(refresh.read().access_token, mfa.access_token, 'late native AAL1 cannot replace the newer MFA result');
  assert.equal(refresh.messages.at(-1).type, 'workspace-session-updated');
  assert.equal(refresh.messages.at(-1).accessToken, mfa.access_token, 'normal native MFA handover remains available');

  const signedOut = browser();
  signedOut.inject(basic);
  vm.runInContext(workspaceSignOutScript(), signedOut.context);
  signedOut.useBoundary();
  signedOut.inject(mfa);
  signedOut.localStorage.removeItem(key);
  signedOut.flush();
  assert.equal(signedOut.read(), null, 'sign-out before lock acquisition prevents delayed native re-entry');
  assert.equal(signedOut.messages.length, 1);
  assert.equal(signedOut.messages[0].type, 'workspace-signed-out');

  const foreign = browser();
  foreign.useBoundary();
  foreign.inject(basic);
  foreign.window.location.origin = 'https://other.example';
  foreign.flush();
  assert.equal(foreign.read(), null, 'origin is rechecked when the queued callback runs');
  assert.equal(foreign.events.length, 0);

  const failed = browser();
  failed.window.__bookzenvoAuthCommit = { run: () => Promise.reject(new Error('fixture lock unavailable')) };
  failed.inject(basic);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.read(), null, 'failed shared boundary cannot fall back to an unguarded write');
  assert.equal(failed.events.length, 0);
  console.log('Native shared-session commit passed: synchronous bootstrap, queued writes/events, MFA preservation, sign-out/origin rechecks and failed-boundary isolation. No provider or network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
