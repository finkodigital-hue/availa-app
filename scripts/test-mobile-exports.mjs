import assert from 'node:assert/strict';
import { cleanWorkspaceExports, shareWorkspaceExport } from '../mobile/src/lib/workspace-export.ts';
const now = 1794528000000;
const root = 'file:///cache/bookzenvo-exports/';
let names = [], writes = [], deletes = [], shares = [];
const files = {
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: async uri => assert.equal(uri, root),
  readDirectoryAsync: async () => names,
  deleteAsync: async uri => { deletes.push(uri); },
  writeAsStringAsync: async (uri, data, options) => { writes.push({ uri, data, options }); },
};
const sharing = { isAvailableAsync: async () => true, shareAsync: async uri => { shares.push(uri); } };
await shareWorkspaceExport(files, sharing, '../../clients.csv', 'YQ==', 'text/csv', now);
await shareWorkspaceExport(files, sharing, '../../clients.csv', 'YQ==', 'text/csv', now);
assert.equal(writes.length, 2);
assert.notEqual(writes[0].uri, writes[1].uri);
assert.ok(writes.every(row => row.uri.startsWith(root) && !row.uri.slice(root.length).includes('/')));
assert.equal(shares.length, 2);
assert.equal(deletes.length, 0, 'Do not delete while receiver could still read');
names = [`${now - 86400000}-1-clients.csv`, `${now}-2-clients.csv`, '../private', 'original.csv'];
await cleanWorkspaceExports(files, now);
assert.deepEqual(deletes, [root + names[0]]);
await assert.rejects(shareWorkspaceExport(files, { ...sharing, isAvailableAsync: async () => false }, 'a.csv', 'YQ==', 'text/csv', now));
assert.equal(writes.length, 2, 'Unsupported sharing never creates plaintext');
await assert.rejects(shareWorkspaceExport({ ...files, cacheDirectory: null }, sharing, 'a.csv', 'YQ==', 'text/csv', now));
await assert.rejects(shareWorkspaceExport(files, sharing, 'a.csv', '#invalid', 'text/csv', now));
await assert.rejects(shareWorkspaceExport(files, { ...sharing, shareAsync: async () => { throw new Error('cancel/fail'); } }, 'b.csv', 'YQ==', 'text/csv', now));
assert.ok(deletes.includes(writes.at(-1).uri), 'Failed share removes its temporary copy');
console.log('Mobile export regressions passed: confined cache, expiry, concurrency, unsupported sharing, invalid content, and failure cleanup.');
