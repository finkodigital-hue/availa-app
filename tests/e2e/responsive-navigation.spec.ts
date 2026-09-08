import { test, expect } from "@playwright/test";
import { installMutationGuard } from "./support/safety";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

for (const viewport of viewports) {
  test(`${viewport.name} navigation is usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const safety = await installMutationGuard(page);
    await page.goto("/dashboard");
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

    if (viewport.width < 768) {
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "More menu" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "Dashboard" }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Customers" }).first(),
      ).toBeVisible();
    }

    safety.expectNothingBlocked();
  });
}
