import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual hook with mocked reads: no network, Docker or writes.
let query;
let response = {};
let readError = false;
let reads = 0;
const source = fs.readFileSync(new URL('../src/lib/slots.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const segmentSource = fs.readFileSync(new URL('../src/lib/booking-segments.ts', import.meta.url), 'utf8');
const segmentExports = {};
vm.runInNewContext(ts.transpileModule(segmentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: segmentExports, Date });
const exports = {};
vm.runInNewContext(compiled, { exports, Date, require(name) {
  if (name === 'react') return { useMemo: fn => fn() };
  if (name === '@tanstack/react-query') return { useQuery: options => { query = options; return response; } };
  if (name.includes('booking-segments')) return segmentExports;
  if (name.includes('staff-hours')) return { resolveDayPeriods: () => [{ open_time: '09:00', close_time: '11:00' }] };
  if (name.includes('supabase')) return { supabase: { from() {
    reads++;
    const chain = new Proxy({}, { get(_, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: [], error: readError ? new Error('Unavailable') : null });
      return () => chain;
    } });
    return chain;
  } } };
  throw new Error(name);
} });
const date = new Date(2035, 0, 1);
const options = { businessId: 'salon', staffId: 'stylist', service: { duration_minutes: 60 }, date, searchDays: 99 };
exports.useAvailableSlots(options);
const days = await query.queryFn();
assert.equal(days.length, 14, 'Search is capped at 14 days');
assert.equal(reads, 5, 'The 14-day search shares five scoped reads');
days[0].periods = [];
response = { data: days, isError: false, isFetching: false };
let result = exports.useAvailableSlots(options);
assert.equal(new Date(result.slots[0].iso).getDate(), 2, 'Closed first day is skipped');
response.isError = true;
assert.equal(exports.useAvailableSlots(options).slots.length, 0, 'Cached results hidden after errors');
response.isError = false;
response.isFetching = true;
assert.equal(exports.useAvailableSlots(options).slots.length, 0, 'No stale selection during refetch');
readError = true;
await assert.rejects(query.queryFn(), /Unavailable/, 'Read failure must not create fake availability');
console.log('Next available slots: 6 mocked checks passed');
