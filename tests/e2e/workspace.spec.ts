import { test, expect } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

const pages = [
  ["/dashboard", /Good |Dashboard|Today/i],
  ["/customers", /^Customers$/i],
  ["/staff", /^Staff$/i],
  ["/services", /^Services$/i],
  ["/stock", /^Stock$/i],
  ["/consultations", /^Consultations$/i],
  ["/reports", /^Reports$/i],
  ["/payments", /^Payments$/i],
  ["/settings", /^Settings$/i],
] as const;

for (const [path, heading] of pages) {
  test(`${path.slice(1)} loads read-only`, async ({ page }) => {
    const safety = await installMutationGuard(page);
    const assertNoPageErrors = collectPageErrors(page);
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(`${path.replace("/", "\\/")}(?:\\?|$)`),
    );
    await expect(
      page.getByRole("heading", { name: heading }).first(),
    ).toBeVisible({ timeout: 20_000 });
    safety.expectNothingBlocked();
    assertNoPageErrors();
  });
}

test("payment controls remain inert until explicit confirmation", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(page.getByText(/transaction|payment/i).first()).toBeVisible();
  safety.expectNothingBlocked();
});
