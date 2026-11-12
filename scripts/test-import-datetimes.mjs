import assert from "node:assert/strict";
import {
  parseFreshaDateTime,
  parseGenericDateTime,
  parseSlotTimes,
} from "../src/lib/import/parse.ts";
for (const [raw, hour] of [
  ["12/17/2026 15:30", 15],
  ["12/17/2026 12:30", 12],
  ["12/17/2026 00:30", 0],
  ["12/17/2026 11:30 pm", 23],
  ["12/17/2026 12:30 am", 0],
])
  assert.equal(parseGenericDateTime(raw)?.getHours(), hour, raw);
for (const raw of [
  "31 Feb 2026, 11:30am",
  "17 Dec 2026, 13:30pm",
  "17 Dec 2026, 11:90am",
])
  assert.equal(parseFreshaDateTime(raw), null, raw);
for (const raw of [
  "2026-02-31T10:00:00Z",
  "02/31/2026 10:00",
  "12/17/2026 25:30",
  "12/17/2026 10:90",
  "12/17/2026 13:30 pm",
])
  assert.equal(parseGenericDateTime(raw), null, raw);
for (const raw of [
  "25:00:00-26:00:00",
  "10:70:00-11:00:00",
  "10:00:99-11:00:00",
])
  assert.equal(parseSlotTimes(raw), null, raw);
assert.equal(parseGenericDateTime("02/29/2028 14:00")?.getDate(), 29);
console.log(
  "17 import date/time checks preserve 24-hour times and reject calendar/clock overflow.",
);

import * as parsing from "../src/lib/import/parse.ts";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/import/fresha.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports,
    crypto,
    require(name) {
      assert.equal(name, "./parse");
      return parsing;
    },
  },
);
const row = {
  clientName: "Fictional",
  staffName: "Team",
  serviceName: "Service",
  scheduledDate: "12/17/2026 15:30",
  duration: "30",
  price: "10",
};
for (const change of [
  { apptSlot: "25:00:00-26:00:00" },
  { apptSlot: "16:30:00-15:30:00" },
  { endDateTime: "02/31/2026 15:30" },
  { endDateTime: "12/17/2026 14:30" },
]) {
  assert.equal(
    exports.mapApptRow({ ...row, ...change }).startsAt,
    null,
    "invalid explicit timings cannot silently become a guessed booking",
  );
}
assert.equal(exports.mapApptRow(row).startsAt.getHours(), 15);
console.log(
  "5 mapped appointment cases preserve valid times and refuse invalid supplied slots/end times.",
);
