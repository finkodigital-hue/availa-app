// Execute the shipping handler with actual Request/URL parsing; upstream is inert.
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { readBodyWithLimit } from "../src/lib/request-limits.ts";
const source = fs
  .readFileSync("src/routes/api/supabase/$.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
  .replace("export const Route", "const Route");
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
let calls = [];
const handlers = new Function(
  "createFileRoute",
  "readBodyWithLimit",
  "consumePublicRequest",
  "publicRequestLimitResponse",
  "fetch",
  "process",
  code + ";return Route.server.handlers;",
)(
  () => (x) => x,
  readBodyWithLimit,
  async () => {},
  () => new Response(null, { status: 429 }),
  async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    return new Response("{}", { status: 200 });
  },
  {
    env: {
      SUPABASE_URL: "https://database.example.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    },
  },
);
async function request(
  path,
  { method = "PATCH", body = '{"plan":"studio"}' } = {},
) {
  calls = [];
  return handlers[method]({
    request: new Request(
      "https://bookzenvo.example.invalid/api/supabase/" + path,
      { method, ...(method === "GET" ? {} : { body }) },
    ),
  });
}
assert.equal((await request("rest/v1/businesses")).status, 403);
for (const path of [
  "rest/v1/businesses%3Fid=eq.fixture",
  "rest/v1/businesses%23ignored",
  "rest/v1/businesses%00",
  "rest/v1/businesses%invalid",
  "rest/v1/%252e/businesses",
  "rest/v1/x/%252e%252e/businesses",
  "rest/v1/x%2f..%2fbusinesses",
  "rest/v1/x%5c..%5cbusinesses",
]) {
  const response = await request(path);
  assert.ok(
    [400, 403, 404].includes(response.status),
    `ambiguous path reached upstream: ${path} -> ${calls[0]?.url}`,
  );
  assert.equal(calls.length, 0);
}
assert.equal(
  (
    await request("rest/v1/businesses?id=eq.fixture", {
      body: '{"name":"New name"}',
    })
  ).status,
  200,
);
assert.equal(
  calls[0].url,
  "https://database.example.invalid/rest/v1/businesses?id=eq.fixture",
);
assert.equal(
  (
    await request("storage/v1/object/business-assets/tenant/photo%20one.jpg", {
      method: "POST",
      body: "image fixture",
    })
  ).status,
  200,
);
assert.equal(
  calls[0].url,
  "https://database.example.invalid/storage/v1/object/business-assets/tenant/photo%20one.jpg",
);
for (const filename of ["photo%20100%25.jpg", "%C3%A9quipe.jpg"]) {
  assert.equal(
    (
      await request("storage/v1/object/business-assets/tenant/" + filename, {
        method: "POST",
        body: "image fixture",
      })
    ).status,
    200,
  );
  assert.equal(
    calls[0].url,
    "https://database.example.invalid/storage/v1/object/business-assets/tenant/" +
      filename,
  );
}
assert.equal(
  (
    await request("auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: "{}",
    })
  ).status,
  200,
);
assert.equal((await request("rest/v1/payments", { body: "{}" })).status, 403);
assert.equal(
  (await request("rest/v1/businesses", { method: "DELETE", body: "{}" }))
    .status,
  403,
);
console.log(
  "Database gateway rejects ambiguous routing before forwarding; ordinary REST, auth and encoded-space storage paths pass.",
);
