import { test, expect } from "@playwright/test";

// 1×1 transparent PNG (payload smoke-tested against the backend).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("critical path: register → upload → gallery → viewer", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.local`;

  await page.goto("/register");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/photos/);
  await expect(page.getByText("No photos yet")).toBeVisible();

  // Upload through the dialog's picker path (filechooser opens from the
  // hidden input, exactly like a real user clicking Browse).
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Browse files" }).click(),
  ]);
  await chooser.setFiles([
    { name: "e2e-photo.png", mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(page.getByText("Uploaded").first()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Browse files" })).toBeHidden();

  // Gallery shows the new photo; the viewer opens from the cell and closes
  // on Escape (one of its two exits).
  await expect(page.getByRole("img", { name: "e2e-photo.png" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Open e2e-photo.png" }).click();
  await expect(page.getByRole("button", { name: "Download original" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Download original" })).toBeHidden();
});

test("login rejects bad credentials with a neutral message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("nobody@test.local");
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid e-mail or password.")).toBeVisible();
});

test("no horizontal overflow at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/login", "/register"]) {
    await page.goto(route);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${route} overflows horizontally`).toBeLessThanOrEqual(390);
  }
});
