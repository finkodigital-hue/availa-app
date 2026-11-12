import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { createHash } from "node:crypto";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/lib/consultations.functions.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText,
  {
    exports,
    require(name) {
      if (name === "node:crypto") return { createHash };
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
      if (name.endsWith("auth-middleware")) return { requireSupabaseAuth: {} };
      if (name.endsWith("customer-export"))
        return {
          fetchCustomerExportRows() {
            throw new Error("Unexpected database access");
          },
        };
      if (name.endsWith("plan.server"))
        return {
          assertStudio() {
            throw new Error("Unexpected DB access");
          },
        };
      throw new Error("Unexpected dependency " + name);
    },
  },
);
const validate = exports.signConsultationSubmission.validate;
const valid = {
  id: "11111111-1111-4111-8111-111111111111",
  answers: {},
  signerName: "Fictional Client",
  signatureData: "data:image/png;base64,fixture",
  explicitHealthConsent: true,
  adultConfirmed: true,
};
assert.equal(validate(valid).explicitHealthConsent, true);
let rejected = 0;
for (const key of ["explicitHealthConsent", "adultConfirmed"]) {
  for (const value of [false, "false", "true", 1, 0, null, undefined, {}, []]) {
    assert.throws(
      () => validate({ ...valid, [key]: value }),
      /consent|18 or over/,
    );
    rejected++;
  }
}
console.log(
  `${rejected} malformed consent/age confirmations rejected; literal affirmative confirmations accepted (no real signature or database access).`,
);
