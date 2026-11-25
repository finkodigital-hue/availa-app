// Browser test of actual website components. Billing/provider calls are mocked;
// no network request can reach a real account, checkout or payment provider.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { isNativeCompanion } from "../src/lib/native-companion.ts";

assert.equal(isNativeCompanion(), false, "Server rendering has no window");
const mocks = {
  "@tanstack/react-router": `import React from 'react'; export const Link=({to,search,...props})=>React.createElement('a',{...props,href:to});`,
  "@/lib/billing.functions": `const record=async name=>{window.fixtureBilling.push(name);throw new Error('Fixture only')}; export const startStudioCheckout=()=>record('checkout');export const openBillingPortal=()=>record('portal');export const switchManagedStudioToSolo=()=>record('downgrade');export const finalizeStudioCheckout=()=>record('finalize');`,
  "@/lib/stripe-connect.functions": `export const startStripeOnboarding=async()=>{window.fixtureMerchant.push('connect');throw new Error('Fixture only')};export const refreshStripeAccount=async()=>{window.fixtureMerchant.push('refresh');return {chargesEnabled:true}};export const saveNoShowPolicy=async()=>{};export const getStripeEnvironment=async()=>({mode:'test'});`,
  "@/lib/server-fn-auth": `export const getServerFnAuthHeaders=async()=>({});`,
  "@/integrations/supabase/client": `export const supabase={};`,
  "@/lib/image": `export const compressImage=async value=>value;`,
  "@/components/page-builder-wizard/wizard-page-preview": `export const WizardPagePreview=()=>null;`,
};
for (const [key, value] of Object.entries(mocks))
  if (key.startsWith("@/"))
    mocks[resolve("src", key.slice(2)).replaceAll("\\", "/")] = value;
const server = await createServer({
  configFile: false,
  optimizeDeps: { entries: ["tests/fixtures/native-companion.html"] },
  plugins: [
    {
      name: "companion-mocks",
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
    port: 4198,
    strictPort: true,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
await server.listen();
let browser;
let checks = 1;
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
    window.fixtureBilling = [];
    window.fixtureMerchant = [];
    const mode = new URLSearchParams(location.search).get("native");
    if (mode === "bridge") window.__bookzenvoNativeBridge = true;
    if (mode === "early") window.ReactNativeWebView = { postMessage() {} };
  });
  const open = (query) =>
    page.goto(
      "http://127.0.0.1:4198/tests/fixtures/native-companion.html?" + query,
    );
  for (const native of ["bridge", "early"]) {
    for (const plan of ["free", "studio"]) {
      await open(
        `native=${native}&plan=${plan}&billing=success&session_id=cs_fixture`,
      );
      await page.getByText("Current plan", { exact: true }).waitFor();
      same(
        await page
          .getByRole("button", {
            name: /Upgrade|Manage subscription|Switch to Solo/,
          })
          .count(),
        0,
        "Native cannot start SaaS checkout/portal/downgrade",
      );
      same(
        await page
          .getByRole("link", { name: /Upgrade|View Studio plan/ })
          .count(),
        0,
        "Native feature gates do not steer to purchase",
      );
      same(
        (await page.locator("main").innerText()).includes("£22"),
        false,
        "Native shows no subscription offer price",
      );
      same(
        await page.evaluate(() => window.fixtureBilling),
        [],
        "Native does not finalise query-string SaaS checkout",
      );
      same(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        "Native companion screen fits a 390px phone viewport",
      );
      same(
        await page
          .getByRole("link", { name: "contact support" })
          .getAttribute("href"),
        "mailto:help@bookzenvo.com?subject=Account%20support",
        "Neutral account/cancellation support remains reachable",
      );
      await page
        .getByRole("button", { name: "Connect Stripe", exact: true })
        .click();
      await page.waitForFunction(() => window.fixtureMerchant.length === 1);
      same(
        await page.evaluate(() => window.fixtureMerchant),
        ["connect"],
        "Merchant Stripe setup remains usable in native companion",
      );
      await page
        .getByRole("button", { name: "Scan photo", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      same(
        await page
          .getByRole("dialog")
          .getByRole("link", { name: "View Studio plan" })
          .count(),
        0,
        "Stock scanner modal has no native purchase steering",
      );
      same(
        (await page.getByRole("dialog").innerText()).includes("Upgrade"),
        false,
      );
    }
  }
  await open("native=bridge&plan=studio&merchant=ready");
  await page.getByText("Ready for test payments", { exact: true }).waitFor();
  same(
    await page
      .getByRole("status")
      .getByText("Test payments only. No real money moves.", { exact: true })
      .count(),
    1,
    "Native merchant status explicitly identifies test payments",
  );
  await page.getByRole("button", { name: "Refresh Stripe status" }).click();
  await page
    .getByText("Stripe is ready for test payments. No real money moves.", {
      exact: true,
    })
    .waitFor();
  same(
    await page.evaluate(() => window.fixtureMerchant),
    ["refresh"],
    "Test-mode refresh remains usable and never implies live payments",
  );
  mkdirSync("test-results/native-companion", { recursive: true });
  await page.screenshot({
    path: "test-results/native-companion/plan-390.png",
    fullPage: true,
  });
  await open("plan=free");
  const upgrade = page.getByRole("button", {
    name: "Upgrade to Studio — £22/month",
  });
  await upgrade.waitFor();
  await upgrade.click();
  await page.waitForFunction(() => window.fixtureBilling.length === 1);
  same(
    await page.evaluate(() => window.fixtureBilling),
    ["checkout"],
    "Ordinary website still starts Studio checkout",
  );
  same(
    await page
      .getByRole("link", { name: "Upgrade to Studio", exact: true })
      .count(),
    2,
    "Website feature and AI upgrade links remain",
  );
  await open("plan=studio");
  await page
    .getByRole("button", { name: "Manage subscription / cancel" })
    .click();
  await page.waitForFunction(() => window.fixtureBilling.length === 1);
  same(
    await page.evaluate(() => window.fixtureBilling),
    ["portal"],
    "Website account management still opens billing portal",
  );
  same(errors, [], "No uncaught component errors");
  console.log(
    `Native companion UI: ${checks} assertions passed, before-render bridge/early WebView flags, Solo/Studio status, no SaaS purchase steering/calls, support and merchant onboarding preserved; website checkout/portal unchanged. All providers mocked.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
