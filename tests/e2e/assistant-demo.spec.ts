import { expect, test } from "@playwright/test";

test("fictional assistant preview switches between daily and growth tasks", async ({
  page,
}) => {
  await page.goto("/assistant-demo");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Make the next move easier." })).toBeVisible();
  await expect(page.getByText("Fictional preview")).toBeVisible();
  await expect(page.getByRole("region", { name: "Example conversation" })).toContainText(
    "Alex Example",
  );

  await page.getByRole("button", { name: "Grow the salon" }).click();
  await expect(page.getByRole("button", { name: "Grow the salon" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Bring clients back" }).click();
  await expect(page.getByRole("region", { name: "Example conversation" })).toContainText(
    "Imported contacts are not assumed eligible",
  );
});
