import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../mobile/src/lib/workspace-session.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { WORKSPACE_AUTH_STORAGE_KEY: key, workspaceSessionScript, workspaceSignOutScript, recoverySessionFromDeepLink } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const webClient = fs.readFileSync(new URL('../src/integrations/supabase/client.ts', import.meta.url), 'utf8');
assert.equal(webClient.match(/storageKey:\s*"([^"]+)"/)[1], key, 'Native and website must use the same persisted session');

function browser(origin = 'https://bookzenvo.com', broadcast = true) {
  class Storage {
    values = new Map();
    getItem(k) { return this.values.get(k) ?? null; }
    setItem(k, v) { this.values.set(k, String(v)); }
    removeItem(k) { this.values.delete(k); }
    clear() { this.values.clear(); }
  }
  const events = [], messages = [];
  let reloads = 0, closed = 0;
  const window = { location: { origin, reload: () => reloads++ }, ReactNativeWebView: { postMessage: data => messages.push(JSON.parse(data)) } };
  const context = vm.createContext({ window, Storage, localStorage: new Storage(), sessionStorage: new Storage(),
    BroadcastChannel: broadcast ? class {
      constructor(name) { assert.equal(name, key); }
      postMessage(data) { events.push(JSON.parse(JSON.stringify(data))); }
      close() { closed++; }
    } : undefined });
  return { context, window, events, messages, get reloads() { return reloads; }, get closed() { return closed; } };
}
const first = { access_token: 'fixture-access-1', refresh_token: 'fixture-refresh', user: { id: 'fixture-owner' } };
const next = { ...first, access_token: 'fixture-access-2' };
const sync = session => workspaceSessionScript(session, 'https://bookzenvo.com');
const b = browser();
vm.runInContext(sync(first), b.context);
assert.deepEqual(JSON.parse(b.context.localStorage.getItem(key)), first);
assert.equal(b.window.__bookzenvoNativeAccessToken, first.access_token);
assert.equal(b.events[0].event, 'SIGNED_IN');
vm.runInContext(sync(next), b.context);
assert.equal(b.events[1].event, 'TOKEN_REFRESHED');
assert.equal(b.events[1].session.access_token, next.access_token);
vm.runInContext(sync(next), b.context);
assert.equal(b.events.length, 2, 'Repeated load-end injection must not repeat auth notifications');
assert.equal(b.closed, 2, 'Each temporary broadcast channel must close');
for (const origin of ['https://other.example', 'https://bookzenvo.com.other.example', 'http://bookzenvo.com', 'null']) {
  const foreign = browser(origin);
  vm.runInContext(sync(first), foreign.context);
  assert.equal(foreign.context.localStorage.getItem(key), null);
  assert.equal(foreign.window.__bookzenvoNativeAccessToken, undefined);
  assert.equal(foreign.events.length, 0);
}
const legacy = browser('https://bookzenvo.com', false);
vm.runInContext(sync(first), legacy.context);
vm.runInContext(sync(first), legacy.context);
assert.equal(legacy.reloads, 1, 'Older WebView first-load fallback must not loop');

vm.runInContext(workspaceSignOutScript(), b.context);
b.context.sessionStorage.setItem(key, 'unrelated');
b.context.sessionStorage.removeItem(key);
assert.equal(b.messages.length, 0, 'Session-storage changes must not sign out the native app');
b.context.localStorage.removeItem('unrelated');
assert.equal(b.messages.length, 0);
b.context.localStorage.removeItem(key);
assert.equal(b.messages[0].type, 'workspace-signed-out');
assert.equal(b.window.__bookzenvoNativeAccessToken, undefined);
vm.runInContext(sync(next), b.context);
assert.equal(b.context.localStorage.getItem(key), null, 'A delayed native refresh must not restore a signed-out workspace');
const cleared = browser();
vm.runInContext(sync(first), cleared.context);
vm.runInContext(workspaceSignOutScript(), cleared.context);
cleared.context.localStorage.clear();
assert.equal(cleared.messages.length, 1);
assert.equal(cleared.window.__bookzenvoNativeAccessToken, undefined);
const recoveryFragment = '#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh';
assert.deepEqual(recoverySessionFromDeepLink('bookzenvo://auth/reset' + recoveryFragment), { access_token: 'fixture-access', refresh_token: 'fixture-refresh' });
for (const url of [
  'https://other.example/' + recoveryFragment,
  'bookzenvo://workspace/calendar' + recoveryFragment,
  'bookzenvo://auth/reset?type=recovery#access_token=a&refresh_token=r',
  'bookzenvo://user@auth/reset' + recoveryFragment,
  'bookzenvo://auth/reset#type=recovery&access_token=a&access_token=b&refresh_token=r',
  'bookzenvo://auth/reset#type=recovery&access_token=a',
  'not a URL',
]) assert.equal(recoverySessionFromDeepLink(url), null, 'Only the exact configured recovery callback can change the native session');
console.log('Mobile session handover, refresh, origin isolation and sign-out regressions passed.');
