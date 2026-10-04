// One-off themed screenshots for visual verification (dark is the default;
// this forces light to prove both themes ship styled).
const { chromium } = require("@playwright/test");

(async () => {
  const out = process.argv[2] ?? ".";
  const browser = await chromium.launch();
  for (const [name, width, height] of [
    ["light-desktop", 1280, 800],
    ["light-mobile", 390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      localStorage.setItem("iphotos.theme", "light");
    });
    const page = await context.newPage();
    await page.goto("http://localhost:3000/login");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}.png` });
    await context.close();
  }
  await browser.close();
})();
