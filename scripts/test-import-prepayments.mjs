import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Date,
      Map,
      Set,
      crypto,
      require(specifier) {
        return load(path.resolve(path.dirname(file), `${specifier}.ts`));
      },
    },
  );
  return exports;
}

const mapping = load("src/lib/import/mapping.ts");
const fresha = load("src/lib/import/fresha.ts");
const headers = [
  "Appt. ref.",
  "Client",
  "Team member",
  "Service",
  "Status",
  "Scheduled date",
  "Duration (mins)",
  "Net sales",
  "Prepayments",
];
const detected = mapping.autoMapHeaders(headers, "bookings");
assert.equal(detected.prepayment, "Prepayments");
const row = fresha.mapApptRow(
  mapping.applyMapping(
    {
      "Appt. ref.": "DEPOSIT-1",
      Client: "Alex Smith",
      "Team member": "Sam",
      Service: "Cut",
      Status: "New",
      "Scheduled date": "01 Oct 2030, 10:00am",
      "Duration (mins)": "60min",
      "Net sales": "45",
      Prepayments: "£10.25",
    },
    detected,
  ),
);
assert.equal(row.priceCents, 4500);
assert.equal(row.prepaymentCents, 1025);

console.log(
  "Fresha prepayment mapping passed: the exported Prepayments column is parsed in cents.",
);
