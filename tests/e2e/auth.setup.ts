import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

setup("sign in with the dedicated test account", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error("E2E_EMAIL and E2E_PASSWORD are required");

  await page.goto("/auth");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  await mkdir("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
