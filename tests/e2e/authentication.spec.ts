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
