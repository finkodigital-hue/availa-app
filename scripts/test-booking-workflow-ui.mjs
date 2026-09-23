// Isolated UI test: every data request is intercepted; no real database,
// customer, payment, email or SMS endpoint is contacted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const server = await createServer({ configFile: false, plugins: [react(), tailwindcss()], resolve: { alias: { "@": resolve("src") } }, server: { host: "127.0.0.1", port: 4188, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const service = { id: "service-qa", name: "Cut and finish", duration_minutes: 45, price_cents: 4500, buffer_before_min: 0, buffer_after_min: 0, color: null };
  const staff = { id: "staff-qa", name: "Sam", business_id: "business-qa" };
  let writes = 0;
  let submitted = null;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") {
      writes++;
      if (url.pathname.endsWith("/rpc/create_staff_booking")) {
        submitted = request.postDataJSON();
        return route.fulfill({ contentType: "application/json", body: JSON.stringify("fictional-booking") });
      }
      return route.abort();
    }
    const table = url.pathname.split("/").at(-1);
    const single = request.headers().accept?.includes("object+json");
    const rows = {
      customers: [{ id: "customer-qa", name: "Alex Test", email: "alex@example.test", phone: null, notes: "Fictional private customer note" }],
      services: [service], staff: [staff], service_staff: [{ staff_id: staff.id }],
      bookings: url.searchParams.has("customer_id") ? [{ service_id: service.id, staff_id: staff.id, starts_at: "2026-01-01T10:00:00Z" }] : [],
      business_hour_periods: [{ open_time: "09:00", close_time: "17:00" }],
      business_hours: [{ open_time: "09:00", close_time: "17:00", closed: false }],
      staff_hours: [], blocked_dates_public: [],
    }[table] ?? [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(single ? rows[0] ?? null : rows) });
  });
  await page.goto("http://127.0.0.1:4188/tests/fixtures/booking-workflow.html");
  await page.getByRole("button", { name: "Use service & stylist" }).click();
  await page.getByRole("button", { name: "In 4 weeks", exact: true }).click();
  await page.getByRole("button", { name: "9:00", exact: true }).click();
  await page.getByRole("button", { name: "unpaid", exact: true }).waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /45\.00/);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /Create booking/ }).waitFor();
  assert.equal(writes, 0, "Review must not create a booking or send a message");
  await mkdir("test-results/workflows", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `test-results/workflows/booking-${width}.png` });
  }
  await page.getByRole("switch").nth(1).uncheck();
  await page.getByRole("button", { name: /Create booking/ }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes, 1);
  assert.equal(submitted.p_customer_id, "customer-qa");
  assert.equal(submitted.p_service_id, "service-qa");
  assert.equal(submitted.p_staff_id, "staff-qa");
  assert.equal(submitted.p_payment_status, "unpaid");
  assert.equal(submitted.p_amount_paid_cents, 0);
  assert.equal(submitted.p_amount_due_cents, 4500);
  assert.equal(submitted.p_notify_customer, false);
  assert.equal(submitted.p_notes, null);
  await page.getByText("Private customer notes", { exact: true }).click();
  await page.getByText("Fictional private customer note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Open test consultation" }).click();
  await page.getByPlaceholder("Search by name", { exact: true }).fill("Alex");
  await page.getByRole("button", { name: /Alex Test alex@example.test/ }).click();
  const continueForm = page.getByRole("button", { name: "Continue to signature" });
  assert.equal(await continueForm.isDisabled(), true, "Reused details require explicit review");
  await page.getByRole("checkbox", { name: /I have checked/ }).check();
  assert.equal(await continueForm.isEnabled(), true);
  await continueForm.click();
  const formPayload = JSON.parse(await page.getByTestId("form-payload").innerText());
  assert.equal(formPayload.customerId, "customer-qa");
  assert.equal(formPayload.customerEmail, "alex@example.test");
  assert.deepEqual(Object.keys(formPayload).sort(), ["customerEmail", "customerId", "customerName", "customerPhone", "templateId"].sort());
  assert.equal(writes, 1, "Form fixture uses a callback only; no real form is created");
  assert.deepEqual(errors, []);
  console.log("Workflow UI passed: booking reuse, date shortcut, unpaid review, confirmation, mobile width, private notes, contact reuse and explicit review. One intercepted mock write; no real requests.");
} finally {
  await browser?.close();
  await server.close();
}
