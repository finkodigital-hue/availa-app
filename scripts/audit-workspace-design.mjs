import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Local, observational visual review. No booking, customer, payment, or message
// mutations. Credentials are supplied by the caller and are never persisted.
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("This visual audit must run against localhost.");
}
const email = process.env.E2E_EMAIL;
const localUrl = process.env.SUPABASE_URL;
if (
  !email?.endsWith("@bookzenvo.test") ||
  !localUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)
)
  throw new Error(
    "Supply a disposable local QA account and local Supabase environment.",
  );
const auth = createClient(localUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: link, error: linkError } = await auth.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (linkError) throw linkError;
const { data: login, error: loginError } = await auth.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (loginError) throw loginError;
const directory = "test-results/workspace-design";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript((session) => {
  if (["localhost", "127.0.0.1"].includes(location.hostname))
    localStorage.setItem("bookzenvo-auth", JSON.stringify(session));
}, login.session);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/dashboard`);
  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await page.locator("[data-workspace-shell]").waitFor({ timeout: 25000 });
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  if (await reject.isVisible()) await reject.click();
  const routes = [
    "dashboard",
    "calendar",
    "bookings",
    "customers",
    "consultations",
    "staff",
    "services",
    "stock",
    "payments",
    "gift-cards",
    "reports",
    "professionals",
    "assistant",
    "page-builder",
    "import",
    "settings",
    "preview",
    "help",
  ];
  const results = [];
  for (const width of process.env.AUDIT_DIALOGS_ONLY ? [] : [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of routes) {
      await page.goto(`${base}/${route}`);
      await page.locator("h1").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(1200);
      const result = await page.evaluate(() => ({
        path: location.pathname,
        title: document.querySelector("[data-page-title], main h1")
          ?.textContent,
        font:
          document.querySelector("[data-page-title], main h1") &&
          getComputedStyle(document.querySelector("[data-page-title], main h1"))
            .fontFamily,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        calendarThemed: !!document.querySelector(
          ".workspace-theme [data-calendar-page]",
        ),
      }));
      await page.screenshot({
        path: `${directory}/${route}-${width}.png`,
        fullPage: true,
      });
      results.push({ route, width, ...result });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, trigger] of [
    ["customers", "Add customer"],
    ["consultations", "New form"],
  ]) {
    await page.goto(`${base}/${route}`);
    await page.getByRole("button", { name: trigger, exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({
      path: `${directory}/${route}-dialog-390.png`,
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/settings`);
  await page.getByRole("button", { name: "Open Business profile settings" }).click();
  await page.getByRole("button", { name: "Back to settings" }).waitFor();
  await page.screenshot({
    path: `${directory}/settings-profile-1440.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to settings" }).click();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: `${directory}/settings-dark-1440.png`,
    fullPage: true,
  });
  await writeFile(
    `${directory}/${process.env.AUDIT_DIALOGS_ONLY ? "form-results" : "results"}.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  if (errors.length) console.log("Browser errors:", errors);
} finally {
  await browser.close();
}
