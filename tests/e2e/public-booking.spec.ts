import { test, expect } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

test("public booking can be explored without creating a booking", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);
  const slug = process.env.E2E_BOOKING_SLUG ?? "testshop";

  await page.goto(`/book/${slug}`);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/Step 1 of 4\s*Service/)).toBeVisible();

  const firstService = page
    .getByRole("button")
    .filter({ hasText: /£|\$/ })
    .first();
  if (await firstService.isVisible().catch(() => false)) {
    await firstService.click();
    await expect(page.getByText(/Step 2 of 4\s*Staff/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  }

  safety.expectNothingBlocked();
  assertNoPageErrors();
});
