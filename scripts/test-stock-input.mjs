import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/stock.functions.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports,
    require(name) {
      if (name === "@tanstack/react-start")
        return {
          createServerFn() {
            let validate;
            const b = {
              middleware() {
                return b;
              },
              validator(fn) {
                validate = fn;
                return b;
              },
              handler() {
                return { validate };
              },
            };
            return b;
          },
        };
      return {};
    },
  },
);
const valid = {
  name: "Fictional stock",
  brand: null,
  category: null,
  unit: null,
  current_stock: 2.5,
  low_stock_threshold: 0,
  cost_cents: 199,
};
for (const invalid of [
  "bad",
  "12",
  NaN,
  Infinity,
  -Infinity,
  -1,
  undefined,
  null,
]) {
  assert.throws(
    () =>
      exports.setStockQuantity.validate({ id: "fixture", quantity: invalid }),
    /valid|zero|number/,
  );
  assert.throws(
    () => exports.saveStockItem.validate({ ...valid, current_stock: invalid }),
    /valid|zero|number/,
  );
}
for (const key of ["low_stock_threshold", "cost_cents"])
  for (const invalid of ["bad", NaN, Infinity, -1])
    assert.throws(
      () => exports.saveStockItem.validate({ ...valid, [key]: invalid }),
      /valid|zero|number/,
    );
assert.equal(
  exports.setStockQuantity.validate({ id: "fixture", quantity: 0 }).quantity,
  0,
);
assert.equal(exports.saveStockItem.validate(valid).current_stock, 2.5);
assert.equal(
  exports.saveStockItem.validate({ ...valid, cost_cents: null }).cost_cents,
  null,
);
console.log(
  "24 malformed stock values rejected; explicit zero, fractional stock and optional null cost retained.",
);
