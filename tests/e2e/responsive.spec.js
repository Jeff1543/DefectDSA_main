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

test.describe("menu navigasi mobile (hamburger)", () => {
  test("di HP: menu tertutup, terbuka lewat tombol, dan menutup setelah memilih tautan", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/static/features.html");

    const toggle = page.locator(".nav-toggle");
    const links = page.locator(".nav-links");
    await expect(toggle).toBeVisible();
    await expect(links).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(links).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await links.getByRole("link", { name: "Kontak" }).click();
    await expect(page).toHaveURL(/kontak\.html$/);
  });

  test("Escape menutup menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/static/about.html");
    await page.locator(".nav-toggle").click();
    await expect(page.locator(".nav-links")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".nav-links")).toBeHidden();
  });

  test("di desktop: tombol hamburger tersembunyi dan menu tampil biasa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/static/features.html");
    await expect(page.locator(".nav-toggle")).toBeHidden();
    await expect(page.locator(".nav-links")).toBeVisible();
  });

  for (const w of [320, 375, 768]) {
    for (const file of ["index", "features", "about", "kontak", "panduan", "dokumentasi", "Authentication", "research-choose", "research-upload"]) {
      test(`tanpa scroll horizontal: ${file}.html @${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 800 });
        await page.goto(`/static/${file}.html`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
