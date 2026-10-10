import { test, expect } from "@playwright/test";

test("people: nav entry + empty state", async ({ page }) => {
  const email = `e2e-people-${Date.now()}@test.local`;

  await page.goto("/register");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/photos/);

  await page.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people/);
  await expect(page.getByText("No people yet")).toBeVisible();
});
