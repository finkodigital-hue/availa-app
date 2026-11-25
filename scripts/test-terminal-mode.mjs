import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/stripe-terminal.server.ts", import.meta.url), "utf8")
  .replace(/\bexport /g, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let assertions = 0;
for (const [key, test] of [["sk_test_fictional", true], ["rk_test_fictional", true],
  ["sk_live_fictional", false], ["rk_live_fictional", false], ["pk_test_fictional", false], ["invalid", false]]) {
  const calls = [];
  const api = new Function("process", "fetch", compiled + ";return {isStripeTestMode,presentSimulatedTerminalPayment,createSimulatedReader};")(
    { env: { STRIPE_SECRET_KEY: key } },
    async (url, init) => {
      calls.push({ url, init });
      assert.equal(new URL(url).origin, "https://api.stripe.com");
      assert.equal(init.headers.Authorization, `Bearer ${key}`);
      assert.equal(init.headers["Stripe-Account"], "acct_fictional");
      return Response.json({ id: url.endsWith("/locations") ? "tml_fictional" : "tmr_fictional" });
    },
  );
  assert.equal(api.isStripeTestMode(), test); assertions++;
  if (test) {
    await api.presentSimulatedTerminalPayment("acct_fictional", "tmr_fictional");
    await api.createSimulatedReader("acct_fictional", "business_fictional", "Fictional reader");
    assert.equal(calls.length, 3); assertions++;
    assert.equal(calls[0].url, "https://api.stripe.com/v1/test_helpers/terminal/readers/tmr_fictional/present_payment_method"); assertions++;
    assert.equal(calls[2].init.body.get("registration_code"), "simulated-wpe"); assertions++;
  } else {
    assert.throws(() => api.presentSimulatedTerminalPayment("acct_fictional", "tmr_fictional"), /only available in test mode/); assertions++;
    await assert.rejects(api.createSimulatedReader("acct_fictional", "business_fictional", "Fictional reader"), /only available in Stripe test mode/); assertions++;
    assert.equal(calls.length, 0); assertions++;
  }
}
console.log(`Terminal key modes: ${assertions} behavioural assertions passed; restricted test keys support simulation, live/invalid keys cannot invoke simulation; no external requests.`);
