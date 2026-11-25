// Real installed Supabase SDK, real two-tab Web Locks/storage/BroadcastChannel.
// All provider responses are inert; the browser blocks external requests.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";

let checks = 0;
const same = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const server = await createServer({
  configFile: false,
  cacheDir: resolve(`node_modules/.vite-mfa-session-commit-${process.pid}`),
  optimizeDeps: { entries: ["tests/fixtures/mfa-session-commit.html"] },
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/mfa-session-commit.html`;
  const fixture = async () => {
    const context = await browser.newContext();
    await context.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    const first = await context.newPage();
    await first.goto(base);
    await first.waitForFunction(() => window.ready);
    await first.evaluate(() => window.seed());
    const second = await context.newPage();
    await second.goto(base);
    await second.waitForFunction(() => window.ready);
    return { context, first, second };
  };
  const finish = async (page, expected) => {
    await page.waitForFunction(() => window.status !== "pending");
    same(await page.evaluate(() => window.status), expected);
    same(
      await page.evaluate(() => String(window.error).includes("PRIVATE_")),
      false,
    );
  };
  {
    const { context, first, second } = await fixture();
    await first.evaluate(() => window.begin());
    await finish(first, "done");
    same(
      await first.evaluate(
        () => JSON.parse(atob(window.current().access_token.split(".")[1])).aal,
      ),
      "aal2",
    );
    await second.waitForFunction(() =>
      window.accepted.some(
        (e) => e.event === "SIGNED_IN" && e.user === "owner",
      ),
    );
    checks++;
    await second.evaluate(() => window.signOut());
    same(await first.evaluate(() => window.current()), null);
    await context.close();
  }
  for (const phase of ["verify", "commit"]) {
    for (const action of ["signout", "switch", "new-token", "aba", "abort"]) {
      const { context, first, second } = await fixture();
      await first.evaluate((phase) => {
        window[phase === "verify" ? "pauseVerify" : "pauseCommit"] = true;
        window.begin();
      }, phase);
      await first.waitForFunction((phase) => window[phase + "Started"], phase);
      let expected = "owner";
      if (action === "signout") {
        await second.evaluate(() => window.signOut());
        expected = null;
      }
      if (action === "switch") {
        await second.evaluate(() => window.signIn("other"));
        expected = "other";
      }
      if (action === "new-token")
        await second.evaluate(() => window.signIn("owner", "new"));
      if (action === "aba")
        await second.evaluate(async () => {
          await window.signOut();
          await window.seed();
        });
      if (action === "abort") await first.evaluate(() => window.abort.abort());
      const before = await second.evaluate(() =>
        localStorage.getItem("bookzenvo-auth"),
      );
      await first.evaluate((phase) => window[phase + "Release"](), phase);
      await finish(first, "rejected");
      same(
        await first.evaluate(() => localStorage.getItem("bookzenvo-auth")),
        before,
      );
      same(
        await first.evaluate(() => window.current()?.user.id ?? null),
        expected,
      );
      same(
        await first.evaluate(
          () =>
            window.accepted.filter((e) => e.event === "MFA_CHALLENGE_VERIFIED")
              .length,
        ),
        0,
      );
      await context.close();
    }
  }
  for (const option of [
    "expired",
    "malformed",
    "wrongUser",
    "wrongSubject",
    "wrongAal",
    "missingAal",
    "providerError",
    "noLocks",
  ]) {
    const { context, first } = await fixture();
    const before = await first.evaluate(() =>
      localStorage.getItem("bookzenvo-auth"),
    );
    await first.evaluate((option) => {
      window[option] = true;
      window.begin(option === "noLocks");
    }, option);
    await finish(first, "rejected");
    same(
      await first.evaluate(() => localStorage.getItem("bookzenvo-auth")),
      before,
    );
    same(
      await first.evaluate(
        () => window.calls.filter((c) => c.path.includes("/token")).length,
      ),
      0,
    );
    await context.close();
  }
  {
    const { context, first, second } = await fixture();
    await first.evaluate(() => {
      window.pauseVerify = true;
      window.begin();
    });
    await first.waitForFunction(() => window.verifyStarted);
    await second.evaluate(() => {
      void navigator.locks.request(
        "bookzenvo-auth:commit",
        () =>
          new Promise((resolve) => {
            window.lockHeld = true;
            window.releaseLock = resolve;
          }),
      );
    });
    await second.waitForFunction(() => window.lockHeld);
    await second.evaluate(() => {
      window.signoutSettled = false;
      void window.signOut().then(() => (window.signoutSettled = true));
    });
    await second.waitForFunction(
      async () => (await navigator.locks.query()).pending.length === 1,
    );
    same(await first.evaluate(() => window.current().user.id), "owner");
    same(await second.evaluate(() => window.signoutSettled), false);
    await first.evaluate(() => window.verifyRelease());
    await first.waitForFunction(
      async () => (await navigator.locks.query()).pending.length === 2,
    );
    same(await first.evaluate(() => window.status), "pending");
    await second.evaluate(() => window.releaseLock());
    await finish(first, "rejected");
    await second.waitForFunction(() => window.signoutSettled);
    same(await first.evaluate(() => window.current()), null);
    await context.close();
  }
  {
    const { context, first, second } = await fixture();
    await first.evaluate(() => {
      window.pauseNotify = true;
      window.begin();
    });
    await first.waitForFunction(() => window.notifyStarted);
    await second.evaluate(() => window.signIn("other"));
    await first.waitForFunction(() =>
      window.accepted.some((e) => e.user === "other"),
    );
    const count = await first.evaluate(() => window.accepted.length);
    await first.evaluate(() => window.notifyRelease());
    await finish(first, "rejected");
    same(await first.evaluate(() => window.current().user.id), "other");
    same(await first.evaluate(() => window.accepted.length), count);
    same(await first.evaluate(() => window.events.at(-1)), {
      event: "SIGNED_IN",
      user: "owner",
    });
    await context.close();
  }
  console.log(
    `MFA session commit: ${checks} actual-SDK/two-tab assertions passed.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
