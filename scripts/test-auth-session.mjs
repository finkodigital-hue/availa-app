// Real React/AuthProvider and QueryClient, mocked Auth only; no remote requests.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const mock = `export const supabase={auth:{onAuthStateChange(callback){window.authCallback=callback;window.subscriptions=(window.subscriptions??0)+1;return {data:{subscription:{unsubscribe(){window.unsubscribed=(window.unsubscribed??0)+1;if(window.authCallback===callback)window.authCallback=null}}}}},getSession(){return new Promise((resolve,reject)=>{window.resolveSnapshot=(id)=>resolve({data:{session:id?{user:{id},access_token:'fictional'}:null}});window.rejectSnapshot=reject})}}};`;
const server = await createServer({
  configFile: false,
  plugins: [
    {
      name: "auth-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "@/integrations/supabase/client") return "\0fixture-auth";
      },
      load(id) {
        if (id === "\0fixture-auth") return mock;
      },
    },
    react(),
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
  optimizeDeps: { entries: ["tests/fixtures/auth-session.html"] },
});
await server.listen();
let browser;
let checks = 0;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/auth-session.html`;
  const ready = () =>
    page.waitForFunction(() => window.authCallback && window.resolveSnapshot);
  const text = () => page.locator("output").innerText();
  const emit = async (event, id) => {
    await page.evaluate(
      ({ event, id }) =>
        window.authCallback(
          event,
          id ? { user: { id }, access_token: "fictional" } : null,
        ),
      { event, id },
    );
  };
  await page.goto(url);
  await ready();
  await emit("SIGNED_OUT", null);
  await page.evaluate(() => window.resolveSnapshot("old-owner"));
  await page.waitForTimeout(30);
  assert.equal(
    await text(),
    "signed-out|empty",
    "late initial session must not resurrect signed-out owner",
  );
  checks++;
  await page.reload();
  await ready();
  await emit("SIGNED_IN", "staff");
  await page.evaluate(() => window.resolveSnapshot("owner"));
  await page.waitForTimeout(30);
  assert.equal(
    await text(),
    "staff|empty",
    "new identity takes precedence over initial snapshot",
  );
  checks++;
  await emit("INITIAL_SESSION", "old-owner");
  assert.equal(
    await text(),
    "staff|empty",
    "late initial auth event cannot overwrite a live identity",
  );
  checks++;
  await page.evaluate(() => {
    window.currentClient.setQueryData(
      ["shared-business", "customers"],
      ["owner-private"],
    );
    window.currentClient
      .getMutationCache()
      .build(window.currentClient, { mutationKey: ["private"] });
    window.changeDraft("owner draft");
    window.retiredClient = window.currentClient;
    window.cancelled = false;
    window.currentClient
      .fetchQuery({
        queryKey: ["late"],
        queryFn: ({ signal }) =>
          new Promise((resolve) => {
            window.finishQuery = resolve;
            signal.addEventListener("abort", () => (window.cancelled = true));
          }),
      })
      .catch(() => {});
  });
  await page.waitForFunction(() => window.finishQuery);
  await page.evaluate(() => {
    const client = window.currentClient;
    client
      .getMutationCache()
      .build(client, {
        mutationFn: () =>
          new Promise((resolve) => (window.finishMutation = resolve)),
        onSuccess: () => {
          client.setQueryData(
            ["shared-business", "customers"],
            ["late owner mutation"],
          );
          window.mutationFinished = true;
        },
      })
      .execute({})
      .catch(() => {});
  });
  await page.waitForFunction(() => window.finishMutation);
  await emit("SIGNED_IN", "other-staff");
  assert.equal(
    await text(),
    "other-staff|empty",
    "identity change must remount private local component state",
  );
  checks++;
  assert.equal(
    await page.evaluate(() => window.cancelled),
    true,
    "retired request aborted",
  );
  checks++;
  assert.deepEqual(
    await page.evaluate(() => [
      window.retiredClient.getQueryCache().getAll().length,
      window.retiredClient.getMutationCache().getAll().length,
    ]),
    [0, 0],
  );
  checks++;
  await page.evaluate(() => {
    window.finishQuery(["late owner result"]);
    window.finishMutation("saved");
  });
  await page.waitForFunction(() => window.mutationFinished);
  assert.equal(
    await page.evaluate(
      () =>
        window.currentClient.getQueryData(["shared-business", "customers"]) ??
        null,
    ),
    null,
    "late mutation callback cannot populate new identity cache",
  );
  checks++;
  assert.equal(
    await page.evaluate(
      () => window.currentClient.getQueryData(["late"]) ?? null,
    ),
    null,
    "late query cannot populate new identity cache",
  );
  checks++;
  await page.evaluate(() => {
    window.refreshClient = window.currentClient;
    window.currentClient.setQueryData(["retained"], 42);
    window.changeDraft("staff draft");
  });
  await emit("TOKEN_REFRESHED", "other-staff");
  assert.equal(await text(), "other-staff|staff draft");
  assert.equal(
    await page.evaluate(
      () =>
        window.currentClient === window.refreshClient &&
        window.currentClient.getQueryData(["retained"]) === 42,
    ),
    true,
  );
  checks++;
  await emit("SIGNED_OUT", null);
  assert.equal(await text(), "signed-out|empty");
  assert.equal(
    await page.evaluate(
      () => window.currentClient.getQueryData(["retained"]) ?? null,
    ),
    null,
  );
  checks++;
  await emit("SIGNED_IN", "same-user");
  await page.evaluate(() => {
    window.beforeBatch = window.currentClient;
    window.currentClient.setQueryData(["private"], 42);
    window.changeDraft("private draft");
  });
  await page.evaluate(() => {
    window.authCallback("SIGNED_OUT", null);
    window.authCallback("SIGNED_IN", { user: { id: "same-user" } });
  });
  assert.equal(await text(), "same-user|empty");
  assert.equal(
    await page.evaluate(
      () =>
        window.currentClient !== window.beforeBatch &&
        window.currentClient.getQueryData(["private"]) === undefined,
    ),
    true,
  );
  checks++;
  await page.reload();
  await ready();
  await page.evaluate(() => {
    window.oldCallback = window.authCallback;
    window.setMounted(false);
  });
  await page.waitForFunction(() => !document.querySelector("output"));
  await page.evaluate(() => {
    window.resolveSnapshot("old-owner");
    window.oldCallback("SIGNED_IN", { user: { id: "old-owner" } });
  });
  await page.waitForTimeout(30);
  assert.equal(await page.locator("output").count(), 0);
  assert.equal(await page.evaluate(() => window.unsubscribed), 1);
  checks++;
  await page.evaluate(() => window.setMounted(true));
  await ready();
  await page.evaluate(() =>
    window.rejectSnapshot(new Error("fictional session unavailable")),
  );
  await page.waitForFunction(
    () => document.querySelector("output")?.textContent === "signed-out|empty",
  );
  checks++;
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `${checks} browser auth isolation checks passed: session race, identity cache/local state isolation, cancelled requests, late mutation callbacks, same-user refresh, unmount and failure.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
