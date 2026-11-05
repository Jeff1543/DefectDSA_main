import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com|picsum\.photos/, (r) => r.abort());
});

test("beranda di HP: hero penuh layar, tanpa scroll horizontal", async ({ page }) => {
  await page.goto("/static/index.html");
  const vp = page.viewportSize();
  const box = await page.locator(".hero-full").boundingBox();
  expect(box.width).toBe(vp.width);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("login di HP: formulir tampil dan tidak melebar", async ({ page }) => {
  await page.goto("/static/Authentication.html");
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
