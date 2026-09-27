import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const exported = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/import/fresha.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports: exported,
    crypto: { randomUUID: () => "random" },
    require: () => ({
      cleanText: (value) => value?.trim() || null,
      parseGenericDateTime: () => null,
      parseSlotTimes: () => null,
      parseDuration: () => ({ minutes: 60 }),
      resolveApptTimes: () => null,
      parsePrice: () => ({ cents: 0 }),
    }),
  },
);

assert.equal(exported.mapApptStatus("Canceled"), "cancelled");
assert.equal(exported.mapApptStatus("no-show"), "no_show");
assert.equal(exported.mapApptStatus("booked"), "confirmed");
assert.equal(exported.isRecognizedApptStatus("scheduled"), true);
assert.equal(exported.isRecognizedApptStatus("declined"), false);
assert.equal(exported.isRecognizedApptStatus(null), false);
const noId = exported.mapApptRow(
  { clientName: "A", staffName: "B", serviceName: "C" },
  2,
  "filehash",
);
assert.equal(noId.externalId, "file:filehash:2");
const withId = exported.mapApptRow(
  { externalId: "old-17", clientName: "A", staffName: "B", serviceName: "C" },
  2,
  "filehash",
);
assert.equal(withId.externalId, "old-17");
console.log("Import status and stable booking-ID checks passed.");
