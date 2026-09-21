import assert from 'node:assert/strict';
import { businessDayRange } from '../src/lib/business-day.ts';
for(const [now,zone,start,end] of [
 ['2026-09-21T23:47:00Z','Europe/London','2026-09-21T23:00:00.000Z','2026-09-22T23:00:00.000Z'],
 ['2026-03-29T12:00:00Z','Europe/London','2026-03-29T00:00:00.000Z','2026-03-29T23:00:00.000Z'],
 ['2026-10-25T12:00:00Z','Europe/London','2026-10-24T23:00:00.000Z','2026-10-26T00:00:00.000Z'],
 ['2026-01-01T01:00:00Z','America/New_York','2025-12-31T05:00:00.000Z','2026-01-01T05:00:00.000Z'],
 ['2026-01-01T01:00:00Z','Asia/Kolkata','2025-12-31T18:30:00.000Z','2026-01-01T18:30:00.000Z'],
]){const result=businessDayRange(new Date(now),zone);assert.equal(result.start.toISOString(),start);assert.equal(result.end.toISOString(),end);}
console.log('10 business-day boundary checks passed, including both UK DST changes.');
