import { test, expect } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

test("sign-in, reset and waitlist modes render without submitting", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  for (const [url, heading, button] of [
    ["/auth", "Welcome back", "Sign in"],
    ["/auth?mode=reset", "Reset password", "Send reset link"],
    ["/auth?mode=signup", "Join the waitlist", "Join waitlist"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: button })).toBeVisible();
  }

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("private pages redirect signed-out visitors", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth(?:\?|$)/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("sign-in stays readable and keyboard-friendly at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const safety = await installMutationGuard(page);

  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const forgotPassword = page.getByRole("link", { name: "Forgot password?" });
  await expect(forgotPassword).toBeVisible();
  expect((await forgotPassword.boundingBox())?.height).toBeGreaterThanOrEqual(40);

  const showPassword = page.getByRole("button", { name: "Show password" });
  await page.getByRole("textbox", { name: "Email", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(forgotPassword).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  ).toBe(false);
  safety.expectNothingBlocked();
});
