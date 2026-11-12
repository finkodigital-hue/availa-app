import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../mobile/package.json', import.meta.url))('typescript');
import { createNativeSessionBridge } from '../mobile/src/lib/native-session-bridge.ts';

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
  const context = vm.createContext({ window, Storage, localStorage: new Storage(), sessionStorage: new Storage(), atob: value => Buffer.from(value, 'base64').toString('binary'),
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

const jwt = claims => `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const now = Math.floor(Date.now()/1000);
const basic = { access_token: jwt({sub:'owner',aal:'aal1',iat:now-100,exp:now+3600}), refresh_token:'refresh-basic',user:{id:'owner'} };
const mfa = { ...basic, access_token:jwt({sub:'owner',aal:'aal2',iat:now-50,exp:now+3600}),refresh_token:'refresh-mfa' };
const active = browser();
vm.runInContext(sync(basic),active.context);
vm.runInContext(workspaceSignOutScript(),active.context);
active.context.localStorage.setItem(key,JSON.stringify(mfa));
assert.equal(active.messages.at(-1).type,'workspace-session-updated');
assert.equal(active.messages.at(-1).accessToken,mfa.access_token);
vm.runInContext(sync(basic),active.context);
assert.equal(JSON.parse(active.context.localStorage.getItem(key)).access_token,mfa.access_token,'Late native AAL1 must not replace verified browser MFA session');
vm.runInContext(sync(mfa),active.context);
assert.equal(active.window.__bookzenvoPendingWebAccessToken,undefined,'Native acknowledgement clears the pending handover');
const rotated={...mfa,access_token:jwt({sub:'owner',aal:'aal2',iat:now,exp:now+7200}),refresh_token:'refresh-rotated'};
active.context.localStorage.setItem(key,JSON.stringify(rotated));
vm.runInContext(sync(mfa),active.context);
assert.equal(JSON.parse(active.context.localStorage.getItem(key)).refresh_token,'refresh-rotated','Old native refresh token cannot overwrite browser rotation');
active.context.localStorage.removeItem(key);
active.context.localStorage.setItem(key,JSON.stringify(rotated));
assert.equal(active.context.localStorage.getItem(key),null,'Late browser refresh cannot restore signed-out storage');
const reload = browser();
reload.context.localStorage.setItem(key,JSON.stringify(mfa));
vm.runInContext(sync(basic),reload.context);
assert.equal(JSON.parse(reload.context.localStorage.getItem(key)).access_token,mfa.access_token,'A fresh WebView also preserves stored MFA');
assert.equal(reload.messages.at(-1).type,'workspace-session-updated');
vm.runInContext(sync({...basic,user:{id:'another-owner'}}),reload.context);
assert.equal(JSON.parse(reload.context.localStorage.getItem(key)).user.id,'another-owner','An explicit native user switch replaces the previous user');
assert.equal(reload.events.at(-1).event,'SIGNED_IN');

let nativeToken=null, verifiedTokens=[], nativeWrites=[];
let releaseVerification;
const client={
 async getUser(token){ verifiedTokens.push(token);return {data:{user:{id:token==='different'?'other':'owner'}},error:token==='invalid'?new Error('Invalid token'):null}; },
 async setSession(tokens){nativeWrites.push(tokens);nativeToken=tokens.access_token;return {data:{session:{user:{id:'owner'}}},error:null};},
 async signOut(){nativeWrites.push('signout');nativeToken=null;},
};
const bridge=createNativeSessionBridge(client,'owner');
assert.equal(await bridge.adopt(mfa.access_token,mfa.refresh_token),true);
assert.equal(nativeWrites[0].access_token,mfa.access_token,'Actual provider-verified token is retained, not rewritten');
assert.equal(await bridge.adopt('different','refresh'),false);
assert.equal(await bridge.adopt('invalid','refresh'),false);
assert.equal(nativeWrites.length,1,'Invalid and other-user tokens never reach native setSession');
await bridge.signOut();
assert.equal(await bridge.adopt(rotated.access_token,rotated.refresh_token),false);
assert.equal(nativeToken,null);
const pendingClient={...client,getUser:async()=>{await new Promise(r=>releaseVerification=r);return {data:{user:{id:'owner'}},error:null};}};
const pending=createNativeSessionBridge(pendingClient,'owner');
const adopting=pending.adopt('pending-access','pending-refresh');
await new Promise(r=>setImmediate(r));
const signingOut=pending.signOut();releaseVerification();
await Promise.all([adopting,signingOut]);
assert.equal(nativeToken,null,'Sign-out wins when verification finishes late');
assert.equal(nativeWrites.at(-1),'signout');
let releaseWrite;
const duringWrite=createNativeSessionBridge({...client,setSession:async tokens=>{await new Promise(r=>releaseWrite=r);return client.setSession(tokens);}},'owner');
const write=duringWrite.adopt('late-write','late-refresh');
await new Promise(r=>setImmediate(r));
const finalSignOut=duringWrite.signOut();releaseWrite();
await Promise.all([write,finalSignOut]);
assert.equal(nativeToken,null,'Sign-out is serialized after an in-flight credential write');
assert.equal(nativeWrites.at(-1),'signout');
console.log('Mobile MFA/refresh handover, provider identity verification and late-writer sign-out regressions passed.');
const protectedBridge = createNativeSessionBridge(client, 'owner', () => mfa.access_token);
const beforeDowngrade = nativeWrites.length;
assert.equal(await protectedBridge.adopt(basic.access_token, basic.refresh_token), false);
assert.equal(nativeWrites.length, beforeDowngrade, 'A delayed web AAL1 message cannot downgrade native MFA');
