import { test, expect } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

const pages = [
  ["/dashboard", /Good |Dashboard|Today/i],
  ["/calendar", /^Calendar$/i],
  ["/bookings", /^All bookings$/i],
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

test("owner can open a new booking and an issue report without submitting", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "New booking" }).click();
  await expect(
    page.getByRole("dialog").getByText("New booking", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Share feedback" }).click();
  const feedback = page.getByRole("dialog");
  await expect(
    feedback.getByText("Share feedback", { exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByRole("button", { name: "Something isn't right" }),
  ).toBeVisible();
  await expect(
    feedback.getByPlaceholder("What would you like us to know?"),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  safety.expectNothingBlocked();
  assertNoPageErrors();
});
