import { test, expect } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

const bookingSlug = process.env.E2E_BOOKING_SLUG;

test.beforeEach(() => {
  test.skip(
    !bookingSlug,
    "Set E2E_BOOKING_SLUG to a disposable local/staging salon with services, staff and availability.",
  );
});

test("customer can review the booking page and reach staff selection", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  await page.goto(`/book/${bookingSlug}`);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText(/Step 1 of 4\s*Service/)).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search services" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Privacy Policy/i })).toHaveCount(
    0,
  );

  const firstService = page
    .getByRole("button")
    .filter({ hasText: /£|\$/ })
    .first();
  await expect(
    firstService,
    "The pilot workspace needs at least one active service",
  ).toBeVisible();
  await firstService.click();
  await expect(page.getByText(/Step 2 of 4\s*Staff/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("customer can reach details without creating a booking", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  await page.goto(`/book/${bookingSlug}`);
  const service = page.getByRole("button").filter({ hasText: /£|\$/ }).first();
  await expect(
    service,
    "The pilot workspace needs at least one active service",
  ).toBeVisible();
  await service.click();

  const staff = page
    .locator("main button")
    .filter({ has: page.locator("div.font-medium") })
    .first();
  await expect(
    staff,
    "The selected service needs at least one active staff member",
  ).toBeVisible();
  await staff.click();
  await expect(page.getByText(/Step 3 of 4\s*Time/)).toBeVisible();

  let slot = page
    .locator("main button")
    .filter({ hasText: /^\d{1,2}:\d{2}$/ })
    .first();
  for (
    let day = 0;
    day < 14 && !(await slot.isVisible().catch(() => false));
    day += 1
  ) {
    await page.getByRole("button", { name: "Next day" }).click();
    await page.waitForTimeout(150);
    slot = page
      .locator("main button")
      .filter({ hasText: /^\d{1,2}:\d{2}$/ })
      .first();
  }
  await expect(
    slot,
    "The pilot workspace needs an available slot in the next 14 days",
  ).toBeVisible();
  await slot.click();

  await expect(page.getByText(/Step 4 of 4\s*Details/)).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Phone")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to secure payment" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Privacy Policy" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "platform terms" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "refund policy" })).toBeVisible();

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("booking journey remains usable on a salon customer's phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const safety = await installMutationGuard(page);
  await page.goto(`/book/${bookingSlug}`);
  await expect(page.getByText(/Step 1 of 4\s*Service/)).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search services" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  safety.expectNothingBlocked();
});
