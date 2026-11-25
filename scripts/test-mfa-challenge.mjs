// Actual React security gate in Chromium; Auth is inert and external traffic blocked.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const mock = `
const w=window; w.mode=new URLSearchParams(location.search).get('mode')??'ok';w.listCalls=0;w.challengeCalls=0;w.verifyCalls=0;w.signOutCalls=0;w.enrollCalls=0;w.cancelCalls=0;w.toasts=[];
const factors=()=>({data:{totp:w.mode.startsWith('settings')&&!w.enabled?[]:[{id:'fixture-factor',status:'verified'}]},error:null});
export const supabase={auth:{
  mfa:{
    listFactors(){w.listCalls++;if(w.mode==='load-reject')return Promise.reject(new Error('PRIVATE_PROVIDER_BODY'));if(w.mode==='load-error')return Promise.resolve({error:new Error('PRIVATE_PROVIDER_BODY')});if(w.mode==='load-hang')return new Promise(r=>w.finishList=()=>r(factors()));if(w.mode==='no-factor')return Promise.resolve({data:{totp:[{id:'unverified',status:'unverified'}]},error:null});return Promise.resolve(factors())},
    challenge(args){w.challengeCalls++;w.challengeArgs=args;if(w.mode==='challenge-hang')return new Promise(r=>w.finishChallenge=()=>r({data:{id:'fixture-challenge'},error:null}));if(w.mode==='challenge-missing')return Promise.resolve({data:null,error:null});if(w.mode==='challenge-reject')return Promise.reject(new Error('PRIVATE_PROVIDER_BODY'));return Promise.resolve({data:{id:'fixture-challenge'},error:null})},
    verify(args){w.verifyCalls++;w.verifyArgs=args;if(w.mode==='verify-error')return Promise.resolve({error:new Error('PRIVATE_PROVIDER_BODY')});if(w.mode.endsWith('verify-hang'))return new Promise(r=>w.finishVerify=()=>r({error:null}));return Promise.resolve({error:null})},
    enroll(){w.enrollCalls++;return Promise.resolve({data:{id:'fixture-factor',totp:{qr_code:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'FICTITIOUS-SETUP-KEY'}},error:null})},
    unenroll(){w.cancelCalls++;return Promise.resolve({error:w.mode==='settings-cancel-error'?new Error('PRIVATE_PROVIDER_BODY'):null})}
  },signOut(){w.signOutCalls++;if(w.mode==='signout-error')return Promise.resolve({error:new Error('PRIVATE_PROVIDER_BODY')});return Promise.resolve({error:null})}
}};
export async function verifyCurrentSessionMfa({factorId,code,signal}){
  try {
    signal?.throwIfAborted(); const challenge=await supabase.auth.mfa.challenge({factorId});
    if(challenge.error||!challenge.data?.id)throw new Error('bad challenge');
    signal?.throwIfAborted(); const result=await supabase.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
    signal?.throwIfAborted();if(result.error)throw result.error;w.enabled=true;
  }catch{throw new Error('We could not complete verification. Please try again.')}
}`;
const clientPath = resolve("src/integrations/supabase/client").replaceAll(
  "\\",
  "/",
);
const server = await createServer({
  configFile: false,
  plugins: [
    {
      name: "mfa-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "sonner") return "\0fixture-toast";
        if (
          id === "@/integrations/supabase/client" ||
          id.replaceAll("\\", "/") === clientPath
        )
          return "\0fixture-auth";
      },
      load(id) {
        if (id === "\0fixture-toast")
          return "export const toast={error:message=>window.toasts.push(['error',message]),success:message=>window.toasts.push(['success',message])};";
        if (id === "\0fixture-auth") return mock;
      },
    },
    react(),
  ],
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: resolve("src") + "/$1" }],
  },
  optimizeDeps: { entries: ["tests/fixtures/mfa-challenge.html"] },
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
await server.listen();
let browser,
  checks = 0;
const same = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/mfa-challenge.html`;
  const open = async (mode) => {
    await page.goto(base + "?mode=" + mode);
    await page.waitForFunction(() => window.listCalls === 1);
  };
  const verify = () =>
    page.getByRole("button", { name: "Verify", exact: true });
  const enter = () =>
    page.getByLabel("Six-digit authentication code").fill("123456");
  for (const mode of ["load-reject", "load-error", "no-factor"]) {
    await open(mode);
    await page.getByRole("alert").waitFor();
    same(await verify().isDisabled(), true);
    same(
      await page
        .locator("body")
        .innerText()
        .then((text) => text.includes("PRIVATE_PROVIDER_BODY")),
      false,
    );
    await page.evaluate(() => (window.mode = "ok"));
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(() => window.listCalls === 2);
    await enter();
    await verify().click();
    await page.waitForFunction(
      () => document.querySelector("output").textContent === "1",
    );
    checks++;
  }
  await page.clock.install();
  await open("load-hang");
  await page.clock.fastForward(15_100);
  await page.getByRole("alert").waitFor();
  same(await verify().isDisabled(), true);
  await page.evaluate(() => (window.mode = "ok"));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await enter();
  await page.evaluate(() => window.finishList());
  await verify().click();
  await page.waitForFunction(
    () => document.querySelector("output").textContent === "1",
  );
  same(await page.evaluate(() => window.verifyCalls), 1);
  for (const mode of [
    "challenge-missing",
    "challenge-reject",
    "verify-error",
  ]) {
    await open(mode);
    await enter();
    await verify().click();
    await page.getByRole("alert").waitFor();
    same(await page.locator("output").innerText(), "0");
    same(
      await page.getByLabel("Six-digit authentication code").inputValue(),
      "",
    );
    same(
      await page
        .locator("body")
        .innerText()
        .then((text) => text.includes("PRIVATE_PROVIDER_BODY")),
      false,
    );
    await page.evaluate(() => (window.mode = "ok"));
    await enter();
    await verify().click();
    await page.waitForFunction(
      () => document.querySelector("output").textContent === "1",
    );
    checks++;
  }
  await open("challenge-hang");
  await enter();
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  same(await page.evaluate(() => window.challengeCalls), 1);
  same(
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .isDisabled(),
    true,
  );
  await page.evaluate(() => window.finishChallenge());
  await page.waitForFunction(
    () => document.querySelector("output").textContent === "1",
  );
  same(await page.evaluate(() => window.verifyArgs), {
    factorId: "fixture-factor",
    challengeId: "fixture-challenge",
    code: "123456",
  });
  await open("challenge-hang");
  await enter();
  await verify().click();
  await page.getByRole("button", { name: "Unmount gate" }).click();
  await page.evaluate(() => window.finishChallenge());
  await page.waitForTimeout(50);
  same(await page.evaluate(() => window.verifyCalls), 0);
  same(await page.locator("output").innerText(), "0");
  await open("verify-hang");
  await enter();
  await verify().click();
  await page.waitForFunction(() => window.verifyCalls === 1);
  await page.clock.fastForward(15_100);
  await page.getByRole("alert").waitFor();
  same(await verify().isDisabled(), true);
  same(
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .isDisabled(),
    true,
  );
  same(await page.evaluate(() => window.signOutCalls), 0);
  await page.evaluate(() => window.finishVerify());
  await page.waitForFunction(
    () => document.querySelector("output").textContent === "1",
  );
  same(await page.locator("output").innerText(), "1");
  await open("signout-error");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("alert").waitFor();
  same(new URL(page.url()).pathname, "/tests/fixtures/mfa-challenge.html");
  same(
    await page
      .getByRole("button", { name: "Sign out", exact: true })
      .isEnabled(),
    true,
  );
  await page.evaluate(() => (window.mode = "ok"));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/auth");
  checks++;
  await open("settings-verify-hang");
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByLabel("Six-digit setup code").fill("123456");
  await page
    .getByRole("button", { name: "Verify & enable", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await page.waitForFunction(() => window.verifyCalls === 1);
  same(
    await page
      .getByRole("button", { name: "Cancel", exact: true })
      .isDisabled(),
    true,
  );
  same(await page.evaluate(() => window.challengeCalls), 1);
  await page.evaluate(() => window.finishVerify());
  await page.getByText("Enabled", { exact: true }).waitFor();
  same(
    await page.evaluate(
      () => window.toasts.filter((t) => t[0] === "success").length,
    ),
    1,
  );
  await open("settings-cancel-error");
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(() => window.toasts.length > 0);
  same(await page.getByLabel("Six-digit setup code").count(), 1);
  same(
    await page.evaluate(() =>
      window.toasts.some((t) => t[1].includes("PRIVATE_PROVIDER_BODY")),
    ),
    false,
  );
  await page.evaluate(() => (window.mode = "settings"));
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).waitFor();
  checks++;
  same(errors, []);
  console.log(
    `MFA challenge: ${checks} actual-browser assertions passed; bounded loading, delayed verification stays locked, retries, missing factors, failed sign-out, duplicate submits and unmounted/late callbacks. Auth calls mocked; no external requests.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
