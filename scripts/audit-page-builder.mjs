import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const base = "http://127.0.0.1:5173";
const url = process.env.SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const auth = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await auth.auth.admin.generateLink({ type: "magiclink", email: "qa-studio-salon@bookzenvo.test" });
if (error) throw error;
const { data: login, error: loginError } = await auth.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
if (loginError) throw loginError;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(session => {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) localStorage.setItem("bookzenvo-auth", JSON.stringify(session));
  }, login.session);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/page-builder`);
  await page.getByRole("heading", { name: "Make it yours." }).waitFor();
  const tools = page.getByRole("navigation", { name: "Page editing tools" });
  await page.getByText("You're up to date", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Bold & modern", exact: true }).click();
  await page.getByText("Unsaved changes · preview updated", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("You're up to date", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Expand preview", exact: true }).click();
  assert.equal(await tools.isVisible(), false);
  await page.getByRole("button", { name: "Show editing tools", exact: true }).click();
  await tools.waitFor({ state: "visible" });
  await page.locator(".builder-controls").getByText("Outline", { exact: true }).click();
  await page.getByText("Unsaved changes · preview updated", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("You're up to date", { exact: true }).waitFor();
  for (const name of ["Content", "Sections", "Share", "Ask AI", "Design"]) {
    await tools.getByRole("button", { name, exact: true }).click();
    assert.equal(await tools.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"), "true");
  }
  await page.locator('.builder-canvas [data-storefront-section="booking"]').click({ position: { x: 10, y: 10 } });
  assert.equal(await tools.getByRole("button", { name: "Sections", exact: true }).getAttribute("aria-pressed"), "true");
  await tools.getByRole("button", { name: "Design", exact: true }).click();
  await mkdir("test-results/page-builder", { recursive: true });
  await page.screenshot({ path: "test-results/page-builder/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: "test-results/page-builder/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.locator(".builder-canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await tools.waitFor({ state: "visible" });
  assert.deepEqual(errors, []);
  console.log("PASS: editing tools, draft change, undo, click-to-edit, mobile preview, no page overflow or browser errors. No page changes saved.");
} finally { await browser.close(); }
