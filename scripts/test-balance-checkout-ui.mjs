// Fully mocked module dependencies. No auth, database or Stripe requests.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
const mocks = {
  "@tanstack/react-router": `import React from 'react'; export const Link = React.forwardRef(({to,search,...props},ref) => React.createElement('a',{...props,href:to,ref}));`,
  "@/lib/cash-payment.functions": `export async function recordCashPayment({data}) { window.cashCalls = [...(window.cashCalls ?? []), data]; if(window.cashError) throw new Error('Could not confirm cash payment'); return {id:'fixture-booking',payment_status:'paid',amount_paid_cents:3500}; }`,
  "@/lib/stripe-connect.functions": `export async function startBalanceCheckout() { return {checkoutUrl: 'https://checkout.stripe.com/c/pay/fictional'}; }`,
  "@/lib/server-fn-auth": `export async function getServerFnAuthHeaders() { return {}; }`,
  "@/lib/business": `export function useWorkspaceAccess() { return {isOwner:!!window.fixtureOwner}; }`,
  "@/lib/format": `export const fmtMoney = (cents,currency) => new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(cents/100);`,
  "@/integrations/supabase/client": `export const supabase = {from() { const query = {select(){return query},eq(){return query},async single(){return {data:{id:'fixture-booking',payment_status:window.fixturePaid?'paid':'unpaid'},error:null}}};return query;}};`,
};
const server = await createServer({
  configFile: false,
  optimizeDeps: { entries: ["tests/fixtures/balance-checkout.html"] },
  plugins: [
    {
      name: "checkout-mocks",
      enforce: "pre",
      resolveId(id) {
        if (id in mocks) return "\0" + id;
      },
      load(id) {
        if (id.startsWith("\0")) return mocks[id.slice(1)];
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: "@/components", replacement: resolve("src/components") },
      { find: "@/lib/utils", replacement: resolve("src/lib/utils") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4192,
    strictPort: true,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("http://127.0.0.1:4192/tests/fixtures/balance-checkout.html");
  await page
    .getByRole("button", { name: "Prepare payment", exact: true })
    .click();
  const link = page.getByRole("link", { name: /Open secure payment/ });
  await link.waitFor();
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await page.locator("output").innerText(), "unpaid");
  assert.equal(
    await page.getByRole("link", { name: "Apply gift card" }).count(),
    0,
    "staff should not see owner-only gift card redemption",
  );
  assert.equal(
    await page.getByRole("button", { name: "Cash", exact: true }).count(),
    0,
    "staff cannot record owner-only payments",
  );
  await page.getByRole("button", { name: "Check payment status" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "not confirmed yet" })
    .waitFor();
  assert.equal(await page.locator("output").innerText(), "unpaid");
  await page.evaluate(() => {
    window.fixturePaid = true;
  });
  await page.getByRole("button", { name: "Check payment status" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Payment confirmed" })
    .waitFor();
  assert.equal(await page.locator("output").innerText(), "paid");
  assert.match(
    await page.getByRole("heading").innerText(),
    /Appointment stays open/,
  );
  await page.addInitScript(() => {
    window.fixtureOwner = true;
  });
  await page.reload();
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.cashCalls?.length ?? 0),
    0,
    "choosing cash does not mark paid",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator("output").innerText(), "unpaid");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await page.evaluate(() => {
    window.cashError = true;
  });
  await page
    .getByRole("button", { name: "Confirm £35.00 cash received", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Could not confirm cash payment" })
    .waitFor();
  assert.equal(await page.locator("output").innerText(), "unpaid");
  await page.evaluate(() => {
    window.cashError = false;
  });
  await page
    .getByRole("button", { name: "Confirm £35.00 cash received", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Cash payment recorded" })
    .waitFor();
  assert.equal(await page.locator("output").innerText(), "paid");
  const calls = await page.evaluate(() => window.cashCalls);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[0],
    calls[1],
    "uncertain payment retries use the same identity and amount",
  );
  assert.equal(calls[0].amountCents, 3500);
  assert.equal(calls[0].currency, "GBP");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "cash confirmation fits a phone screen",
  );
  await page.screenshot({
    path: "test-results/cash-payment-mobile.png",
    fullPage: true,
  });
  console.log(
    "Cash UI: owner access, explicit amount confirmation, cancellation, failed request and idempotent retry passed.",
  );
  console.log(
    "Checkout UI: explicit external link, retained appointment and database-only payment confirmation passed.",
  );
} finally {
  await browser?.close();
  await server.close();
}
