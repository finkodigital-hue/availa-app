import { expect, test } from "@playwright/test";

test("reschedule link explains a passed cancellation window before offering times", async ({ page }) => {
  await page.route("**/api/booking-actions/reschedule-peek", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        reason: "window_passed",
        businessName: "Fictional Salon",
        windowHours: 24,
        contactPhone: null,
        contactEmail: "hello@example.invalid",
      }),
    });
  });

  await page.goto(`/booking-action/reschedule/${"a".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "Too close to reschedule online" })).toBeVisible();
  await expect(page.getByText(/within 24 hours/)).toBeVisible();
  await expect(page.getByText("hello@example.invalid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm new time" })).toHaveCount(0);
});
