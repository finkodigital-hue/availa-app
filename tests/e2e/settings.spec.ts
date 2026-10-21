import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 20000 });
test.setTimeout(60000);

// Isolated settings checks: all Supabase traffic uses an in-memory fixture.
test.beforeEach(async ({ page }) => {
  const user = {
    id: "00000000-0000-0000-0000-000000000002",
    email: "owner@example.test",
    email_confirmed_at: "2026-01-01",
    app_metadata: { provider: "email" },
    user_metadata: {},
    aud: "authenticated",
    factors: [],
  };
  const claims = Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      aal: "aal1",
    }),
  ).toString("base64url");
  await page.addInitScript(
    ({ user, claims }) => {
      localStorage.setItem(
        "bookzenvo-auth",
        JSON.stringify({
          access_token: `e30.${claims}.test`,
          refresh_token: "fixture",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user, claims },
  );
  await page.route("**/api/supabase/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const business = {
      id: "00000000-0000-0000-0000-000000000001",
      owner_id: user.id,
      name: "Settings test salon",
      plan: "studio",
      timezone: "Europe/London",
      currency: "GBP",
      slug: "settings-test",
      email: "salon@example.test",
    };
    const body = path.includes("/auth/v1/user")
      ? user
      : path.includes("/rest/v1/businesses")
        ? business
        : path.includes("/rest/v1/profiles")
          ? { full_name: "Test owner", avatar_url: null }
          : path.includes("/rest/v1/calendar_connections")
            ? [
                {
                  id: "fixture-connection",
                  provider: "google",
                  account_email: user.email,
                  status: "needs_reconnect",
                },
              ]
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  // Shell notifications use a server function; never send fixture credentials upstream.
  await page.route("**/_serverFn/**", (route) =>
    route.fulfill({ status: 503, body: "Fixture: server calls disabled" }),
  );
});

test("settings search and section navigation", async ({ page }) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Open Data & privacy settings" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search settings" }).fill("deposits");
  await expect(
    page.getByRole("button", {
      name: "Open Payments & booking policies settings",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Your account settings" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search settings" }).fill("");
  await page
    .getByRole("button", { name: "Open Your account settings" })
    .click();
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue(
    "Test owner",
  );
  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search settings" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-hub.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Search settings" })
    .fill("zz-no-match");
  await expect(page.getByText(/No settings match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(
    page.getByRole("button", { name: "Open Data & privacy settings" }),
  ).toBeVisible();
});

test("mobile hours and reconnect controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?tab=hours");
  await expect(
    page.getByRole("textbox", { name: "Closure reason" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/settings-hours-mobile.png",
    fullPage: true,
  });
  await page.goto("/settings?tab=calendar");
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Reconnect required").first()).toBeVisible();
});

test("data controls require explicit closure confirmation", async ({
  page,
}) => {
  await page.goto("/settings?tab=data");
  await expect(
    page.getByRole("button", { name: "Export workspace" }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("button", { name: "Close workspace" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("notification failure offers recovery instead of showing default preferences", async ({
  page,
}) => {
  await page.goto("/settings?tab=notifications");
  await expect(
    page.getByText("Notification settings could not be loaded."),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("failed hours load cannot be saved as an empty week", async ({ page }) => {
  await page.route("**/api/supabase/rest/v1/business_hour_periods*", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fixture access denied" }),
    }),
  );
  await page.goto("/settings?tab=hours");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
});
