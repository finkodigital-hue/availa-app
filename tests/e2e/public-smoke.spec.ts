import { expect, test } from "@playwright/test";
import { collectPageErrors, installMutationGuard } from "./support/safety";

test("public navigation reaches the key launch pages", async ({ page }) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toHaveAttribute("href", "#top");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.ico",
  );

  for (const [label, path] of [
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["FAQ", "/faq"],
  ] as const) {
    await page
      .getByRole("navigation", { name: "Legal and support" })
      .getByRole("link", { name: label })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("main")).toBeVisible();
    await page.goto("/");
  }

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("FAQ answers expand and link to the help centre", async ({ page }) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  await page.goto("/faq");
  await page
    .getByText("Do I need a card reader or other hardware to take payments?")
    .click();
  await expect(
    page.getByText(/does not currently connect to a physical card reader/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Help Centre" }).click();
  await expect(page).toHaveURL(/\/help(?:\/|$)/);

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("small-screen menu remains usable and unknown routes have a recovery link", async ({
  page,
}) => {
  const safety = await installMutationGuard(page);
  const assertNoPageErrors = collectPageErrors(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/#pricing$/);
  await expect(menu).not.toBeVisible();

  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "404" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();

  safety.expectNothingBlocked();
  assertNoPageErrors();
});

test("read-only guard stops an unlisted app write", async ({ page }) => {
  const safety = await installMutationGuard(page);
  await page.goto("/");

  const outcome = await page.evaluate(async () => {
    try {
      await fetch("/api/unguarded-future-endpoint", { method: "POST" });
      return "sent";
    } catch {
      return "blocked";
    }
  });

  expect(outcome).toBe("blocked");
  expect(safety.blockedRequests()).toEqual([
    expect.stringMatching(/POST .*\/api\/unguarded-future-endpoint$/),
  ]);
});
