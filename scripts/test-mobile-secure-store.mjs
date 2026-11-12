import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../mobile/package.json', import.meta.url))('typescript');

const source = fs.readFileSync(new URL('../mobile/src/lib/secure-session-store.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { createSecureSessionStore } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const values = new Map();
let reads = 0, failWrite = false, failDeleteRoot = false;
const io = {
  async getItemAsync(key) { reads++; return values.get(key) ?? null; },
  async setItemAsync(key, value) {
    assert.match(key, /^[\w.-]+$/, 'Native storage key must use permitted characters');
    assert.ok(Buffer.byteLength(value, 'utf8') <= 1700, 'Chunk limit must count UTF-8 bytes rather than JS characters');
    if (failWrite && key.includes('.chunk.')) throw Error('Simulated interrupted write');
    values.set(key, value);
  },
  async deleteItemAsync(key) { if (failDeleteRoot && key === 'session') throw Error('Secure store unavailable'); values.delete(key); },
};
const store = createSecureSessionStore(io);
await store.setItem('session', 'small');
assert.equal(await store.getItem('session'), 'small');
const unicode = '🦋'.repeat(800) + 'é'.repeat(1100) + '漢'.repeat(900);
await store.setItem('session', unicode);
assert.equal(await store.getItem('session'), unicode);
const previousManifest = values.get('session');
const previousKeys = [...values.keys()];
failWrite = true;
await assert.rejects(store.setItem('session', 'b'.repeat(9000)), /interrupted/);
failWrite = false;
assert.equal(values.get('session'), previousManifest);
assert.equal(await store.getItem('session'), unicode, 'Failed replacement must preserve the previous entire session');
assert.deepEqual([...values.keys()], previousKeys);
await Promise.all([store.setItem('session', 'a'.repeat(5000)), store.setItem('session', 'b'.repeat(8000))]);
assert.equal(await store.getItem('session'), 'b'.repeat(8000), 'Concurrent refresh writes must not mix token generations');
await store.setItem('session', 'new-short');
assert.deepEqual([...values.entries()], [['session', 'new-short']], 'Shrinking a session must remove old chunk keys');

values.set('session', 'bookzenvo-secure-chunks:v1:2');
values.set('session.chunk.0', 'old-'); values.set('session.chunk.1', 'session');
assert.equal(await store.getItem('session'), 'old-session', 'Existing installed sessions must remain readable');
await store.setItem('session', unicode);
assert.ok(!values.has('session.chunk.0') && !values.has('session.chunk.1'));
const firstChunk = [...values.keys()].find(k => k.includes('.chunk.'));
values.delete(firstChunk);
assert.equal(await store.getItem('session'), null, 'Missing chunks must never return a partial session');
await store.removeItem('session');
assert.equal(values.size, 0);
for (const manifest of ['bookzenvo-secure-chunks:v1:1000000000', 'bookzenvo-secure-chunks:v1:-1', 'bookzenvo-secure-chunks:v2:bad/key:2', 'bookzenvo-secure-chunks:v2:g:9999999999']) {
  values.set('session', manifest); reads = 0;
  assert.equal(await store.getItem('session'), null);
  assert.equal(reads, 1, 'Corrupt manifests must not allocate or read unbounded chunk arrays');
}
await store.setItem('session', 'signout-fixture');
failDeleteRoot = true;
await assert.rejects(store.removeItem('session'), /unavailable/, 'Failed persistent sign-out must not pretend to succeed');
failDeleteRoot = false;
await store.removeItem('session');
assert.equal(await store.getItem('session'), null);
await assert.rejects(store.setItem('session', 'a'.repeat(1700 * 129)), /too large/);
assert.equal(await store.getItem('session'), null);
console.log('Mobile secure-storage UTF-8, interruption, concurrency, legacy, corruption and sign-out regressions passed.');
