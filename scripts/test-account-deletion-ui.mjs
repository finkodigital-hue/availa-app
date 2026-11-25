// Actual account page with inert auth/server boundaries. Remote network blocked.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
const mocks = {
  "@/lib/auth": `import {useSyncExternalStore} from 'react'; export const useAuth=()=>useSyncExternalStore(fn=>{window.addEventListener('fixture-auth',fn);return()=>window.removeEventListener('fixture-auth',fn)},()=>window.fixtureAuth);`,
  "@/lib/server-fn-auth": `export const getServerFnAuthHeaders=async()=>({});`,
  "@/integrations/supabase/client": `export const supabase={auth:{signOut:async()=>{window.fixtureAuth={loading:false,user:null};window.dispatchEvent(new Event('fixture-auth'));return {error:null}}}};`,
  "@/components/mfa-challenge-gate": `import React from 'react';export const MfaChallengeGate=()=>React.createElement('p',null,'Complete two-factor verification');`,
  "@/lib/account-deletion.functions": `
    export const getMyAccountDeletionRequest=async()=>{window.fixtureCalls.push({action:'status',user:window.fixtureAuth.user.id});if(window.fixtureLoadError)throw new Error('Fixture connection unavailable');return window.fixtureRecords[window.fixtureAuth.user.id]??null};
    export const requestMyAccountDeletion=async({data})=>{const user=window.fixtureAuth.user.id;window.fixtureCalls.push({action:'request',user,data});if(window.fixtureDeferred)await new Promise(resolve=>window.fixtureResolve=resolve);const row=window.fixtureRecords[user]??{id:'99000000-0000-4000-8000-000000000021',status:'requested',requested_at:new Date().toISOString(),completion_target_at:new Date(Date.now()+30*86400000).toISOString()};window.fixtureRecords[user]=row;if(window.fixtureLostResponse){window.fixtureLostResponse=false;throw new Error('Your request could not be confirmed. Please try again.')}return row};
    export const cancelMyAccountDeletionRequest=async({data})=>{window.fixtureCalls.push({action:'cancel',data});const row=window.fixtureRecords[window.fixtureAuth.user.id];return window.fixtureRecords[window.fixtureAuth.user.id]={...row,status:'cancelled'}};`,
};
for (const [key, value] of Object.entries(mocks))
  if (key.startsWith("@/"))
    mocks[resolve("src", key.slice(2)).replaceAll("\\", "/")] = value;
const server = await createServer({
  configFile: false,
  optimizeDeps: { entries: ["tests/fixtures/account-deletion.html"] },
  plugins: [
    {
      name: "account-fixture-mocks",
      enforce: "pre",
      resolveId(id) {
        const key = id.replaceAll("\\", "/");
        if (key in mocks) return "\0" + key;
      },
      load(id) {
        if (id.startsWith("\0")) return mocks[id.slice(1)];
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: resolve("src") + "/$1" }],
  },
  server: {
    host: "127.0.0.1",
    port: 4199,
    strictPort: true,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
await server.listen();
let browser,
  checks = 0;
const same = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    window.fixtureAuth = {
      loading: false,
      user:
        mode === "signed-out"
          ? null
          : { id: "owner-A", email: "fictional@example.invalid" },
    };
    window.fixtureRecords = {};
    window.fixtureCalls = [];
    window.fixtureLoadError = mode === "load-error";
    window.fixtureLostResponse = mode === "lost-response";
    window.fixtureDeferred = mode === "deferred";
    if (mode === "native") window.__bookzenvoNativeBridge = true;
    if (mode === "in-review")
      window.fixtureRecords["owner-A"] = {
        id: "fixture",
        status: "in_review",
        requested_at: new Date().toISOString(),
        completion_target_at: new Date().toISOString(),
        status_message: "We are reviewing the records that must be retained.",
      };
  });
  const open = (mode) =>
    page.goto(
      "http://127.0.0.1:4199/tests/fixtures/account-deletion.html?mode=" + mode,
    );
  for (const mode of ["owner", "staff", "no-workspace", "native"]) {
    await open(mode);
    await page
      .getByRole("button", { name: "Request account deletion", exact: true })
      .waitFor();
    same(
      await page
        .getByRole("button", { name: "Request account deletion", exact: true })
        .isDisabled(),
      true,
      "Explicit confirmation required",
    );
    same(
      await page
        .getByText("This is available whether you own a workspace", {
          exact: false,
        })
        .count(),
      1,
      "No owner/workspace requirement",
    );
    await page.getByLabel("Type DELETE to confirm your request").fill("DELETE");
    await page
      .getByRole("button", { name: "Request account deletion", exact: true })
      .click();
    await page.getByText("Deletion requested", { exact: true }).waitFor();
    same(
      await page.getByText("Deletion completed", { exact: true }).count(),
      0,
      "Request does not claim deletion",
    );
    same(
      await page
        .getByLabel("Account navigation")
        .getByRole("link", { name: "Back to workspace" })
        .getAttribute("href"),
      "/dashboard",
    );
    same(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "390px page fits",
    );
    await page
      .getByRole("button", { name: "Cancel deletion request", exact: true })
      .click();
    await page
      .getByText("Deletion request cancelled", { exact: true })
      .waitFor();
    same(
      await page
        .getByRole("button", { name: "Request account deletion", exact: true })
        .count(),
      1,
      "Cancelled request can be requested again deliberately",
    );
  }
  await open("load-error");
  await page.getByRole("alert").waitFor();
  same(
    await page
      .getByRole("button", { name: "Request account deletion", exact: true })
      .count(),
    0,
    "Unknown status cannot look like no request",
  );
  await page.evaluate(() => (window.fixtureLoadError = false));
  await page.getByRole("button", { name: "Try again" }).click();
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .waitFor();
  checks++;
  await open("lost-response");
  await page.getByLabel("Type DELETE to confirm your request").fill("DELETE");
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .click();
  await page.getByText("Deletion requested", { exact: true }).waitFor();
  const keys = await page.evaluate(() =>
    window.fixtureCalls
      .filter((c) => c.action === "request")
      .map((c) => c.data.requestKey),
  );
  same(keys.length, 2);
  same(keys[0], keys[1], "Uncertain network result retries original identity");
  await open("in-review");
  await page
    .getByText("Deletion request under review", { exact: true })
    .waitFor();
  same(
    await page
      .getByRole("button", { name: "Cancel deletion request", exact: true })
      .count(),
    0,
  );
  same(
    await page
      .getByRole("link", { name: "contact support", exact: true })
      .count(),
    1,
  );
  await open("deferred");
  await page.getByLabel("Type DELETE to confirm your request").fill("DELETE");
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .click();
  await page.waitForFunction(() => !!window.fixtureResolve);
  same(
    await page.getByRole("button", { name: "Submitting…" }).isDisabled(),
    true,
  );
  same(
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .isDisabled(),
    true,
  );
  await page.evaluate(() => {
    window.fixtureAuth = {
      loading: false,
      user: { id: "staff-B", email: "other@example.invalid" },
    };
    window.dispatchEvent(new Event("fixture-auth"));
    window.fixtureResolve();
  });
  await page.getByText("other@example.invalid", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .waitFor();
  same(
    await page.getByText("Deletion requested", { exact: true }).count(),
    0,
    "Old-account late response cannot populate new-account request",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  same(
    await page
      .getByRole("button", { name: "Request account deletion", exact: true })
      .count(),
    0,
  );
  await open("signed-out");
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  same(
    await page.evaluate(() => window.fixtureCalls),
    [],
    "Signed-out page never fetches another account status",
  );
  await open("native");
  await page
    .getByRole("button", { name: "Request account deletion", exact: true })
    .waitFor();
  mkdirSync("test-results/account-deletion", { recursive: true });
  await page.screenshot({
    path: "test-results/account-deletion/account-data-390.png",
    fullPage: true,
  });
  same(errors, [], "No uncaught component errors");
  console.log(
    `Account deletion UI: ${checks} assertions passed; owner/staff/no-workspace/native presentation, confirmation, request/cancel, retry identity, load failure, review state, 390px, late-account isolation and sign-out. All server calls inert.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
