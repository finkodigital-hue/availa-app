// Fully mocked module dependencies. No auth, database or Stripe requests.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
const mocks = {
  "@/lib/stripe-connect.functions": `export async function startBalanceCheckout() { return {checkoutUrl: 'https://checkout.stripe.com/c/pay/fictional'}; }`,
  "@/lib/server-fn-auth": `export async function getServerFnAuthHeaders() { return {}; }`,
  "@/integrations/supabase/client": `export const supabase = {from() { const query = {select(){return query},eq(){return query},async single(){return {data:{id:'fixture-booking',payment_status:window.fixturePaid?'paid':'unpaid'},error:null}}};return query;}};`,
};
const server = await createServer({configFile:false, optimizeDeps:{entries:["tests/fixtures/balance-checkout.html"]}, plugins:[{name:"checkout-mocks",enforce:"pre",resolveId(id){if(id in mocks)return '\0'+id},load(id){if(id.startsWith('\0'))return mocks[id.slice(1)]}},react()],resolve:{alias:[{find:"@/components",replacement:resolve("src/components")},{find:"@/lib/utils",replacement:resolve("src/lib/utils")}]},server:{host:"127.0.0.1",port:4192,strictPort:true}});
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("http://127.0.0.1:4192/tests/fixtures/balance-checkout.html");
  await page.getByRole("button",{name:"Prepare payment",exact:true}).click();
  const link = page.getByRole("link",{name:/Open secure payment/});
  await link.waitFor();
  assert.equal(await link.getAttribute("target"),"_blank");
  assert.equal(await page.locator("output").innerText(),"unpaid");
  await page.getByRole("button",{name:"Check payment status"}).click();
  await page.getByRole("status").filter({hasText:"not confirmed yet"}).waitFor();
  assert.equal(await page.locator("output").innerText(),"unpaid");
  await page.evaluate(()=>{window.fixturePaid=true});
  await page.getByRole("button",{name:"Check payment status"}).click();
  await page.getByRole("status").filter({hasText:"Payment confirmed"}).waitFor();
  assert.equal(await page.locator("output").innerText(),"paid");
  assert.match(await page.getByRole("heading").innerText(),/Appointment stays open/);
  console.log("Checkout UI: explicit external link, retained appointment and database-only payment confirmation passed.");
} finally {await browser?.close();await server.close();}
