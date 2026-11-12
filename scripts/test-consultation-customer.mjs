// Actual consultation handler with fictional data and real PostgreSQL ILIKE semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
await pg.exec(
  "create table customers (id text, business_id text, email text);",
);
let targetEmail;
const database = {
  from(table) {
    let filters = [],
      after = null,
      limit = 1000;
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters.push([k, v]);
        return q;
      },
      ilike(k, v) {
        filters.push([k, v, "ilike"]);
        return q;
      },
      is() {
        return q;
      },
      order() {
        return q;
      },
      limit(n) {
        limit = n;
        return q;
      },
      gt(k, v) {
        after = v;
        return q;
      },
      maybeSingle() {
        return result(true);
      },
      then(a, b) {
        return result(false).then(a, b);
      },
    };
    async function result(single) {
      if (table === "businesses")
        return { data: { id: "tenant-a", name: "Fictional" }, error: null };
      if (table === "consultation_templates")
        return { data: { id: "template-a" }, error: null };
      if (table === "consultation_submissions")
        return {
          data: { id: filters.find(([k]) => k === "customer_id")[1] },
          error: null,
        };
      assert.equal(table, "customers");
      const args = [],
        parts = [];
      for (const [k, v, op] of filters) {
        assert.ok(["business_id", "email", "id"].includes(k));
        args.push(op === "ilike" ? v.replace(/\*/g, "%") : v);
        parts.push(`${k} ${op === "ilike" ? "ilike" : "="} $${args.length}`);
      }
      if (after) {
        args.push(after);
        parts.push(`id > $${args.length}`);
      }
      args.push(limit);
      const { rows } = await pg.query(
        `select * from customers where ${parts.join(" and ")} order by id limit $${args.length}`,
        args,
      );
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    return q;
  },
};
function load(file) {
  const exports = {};
  const source = fs.readFileSync(file, "utf8");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
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
                handler(run) {
                  return { validate, run };
                },
              };
              return b;
            },
          };
        if (name.endsWith("auth-middleware"))
          return { requireSupabaseAuth: {} };
        if (name.endsWith("plan.server"))
          return { assertStudio: async () => {} };
        if (name.endsWith("client.server")) return { supabaseAdmin: database };
        if (name.endsWith("customer-export"))
          return load("src/lib/customer-export.ts");
        throw new Error("Unexpected dependency " + name);
      },
    },
  );
  return exports;
}
const handler = load(
  "src/lib/consultations.functions.ts",
).startConsultationSubmission;
for (const [email, decoy] of [
  ["a_b@example.invalid", "axb@example.invalid"],
  ["50%@example.invalid", "5000@example.invalid"],
  ["a*b@example.invalid", "axxxb@example.invalid"],
  ["a\\b@example.invalid", "ab@example.invalid"],
  ["normal@example.invalid", "someone@example.invalid"],
]) {
  targetEmail = email;
  await pg.exec("delete from customers");
  await pg.query(
    "insert into customers values ($1,$2,$3),($4,$5,$6),($7,$8,$9)",
    [
      "000-decoy",
      "tenant-a",
      decoy,
      "100-exact",
      "tenant-a",
      email.toUpperCase(),
      "000-foreign",
      "tenant-b",
      email,
    ],
  );
  const data = handler.validate({
    templateId: "11111111-1111-4111-8111-111111111111",
    customerName: "Fictional",
    customerEmail: email,
  });
  const result = await handler.run({
    data,
    context: { supabase: database, userId: "owner-a" },
  });
  assert.equal(
    result.id,
    "100-exact",
    `must attach literal case-insensitive email, never pattern match ${targetEmail}`,
  );
}
await pg.close();
console.log(
  "5 consultation email cases attach the literal customer, including %, _, *, backslash and mixed case, with tenant isolation.",
);
