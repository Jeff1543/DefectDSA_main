import { expect, test } from "@playwright/test";

// Font Google & gambar eksternal tidak relevan untuk tes ini; blokir agar cepat dan stabil.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com|picsum\.photos/, (r) => r.abort());
  await page.goto("/static/index.html");
});

test("root '/' mengarah ke halaman beranda", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/static\/index\.html$/);
});

test.describe("hero video", () => {
  test("video latar autoplay, muted, loop, dan benar-benar berjalan", async ({ page }) => {
    const video = page.locator(".hero-full__video");
    await expect(video).toHaveAttribute("autoplay", "");
    await expect(video).toHaveAttribute("loop", "");
    await expect(video).toHaveJSProperty("muted", true);

    await expect
      .poll(() => video.evaluate((v) => v.readyState >= 2 && !v.paused && v.currentTime > 0), {
        message: "video harus sudah dimuat dan memutar",
        timeout: 10_000,
      })
      .toBe(true);
  });

  test("hero memenuhi seluruh layar tanpa margin dan tanpa scroll horizontal", async ({ page }) => {
    const vp = page.viewportSize();
    const box = await page.locator(".hero-full").boundingBox();
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(vp.width);
    expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("judul dan dua tombol hero terlihat", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Deteksi Risiko Defek Kulit Sapi");
    await expect(page.getByRole("link", { name: "Ajukan Demo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lihat Metodologi" })).toBeVisible();
  });

  test("tombol 'Ajukan Demo' menuju halaman pilih riset", async ({ page }) => {
    await page.getByRole("link", { name: "Ajukan Demo" }).click();
    await expect(page).toHaveURL(/research-choose\.html$/);
  });
});

test.describe("navbar", () => {
  const wrap = (page) => page.locator(".hero-full .navbar-wrap");

  test("transparan di atas video (belum is-scrolled)", async ({ page }) => {
    await expect(wrap(page)).not.toHaveClass(/is-scrolled/);
  });

  test("tetap terlihat saat halaman di-scroll dan berubah jadi putih", async ({ page }) => {
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
    await expect(wrap(page)).toHaveClass(/is-scrolled/);

    const nav = page.locator(".hero-full .navbar");
    await expect(nav).toBeInViewport();
    const box = await nav.boundingBox();
    expect(box.y).toBeLessThan(40);
  });

  test("kembali transparan saat scroll ke atas", async ({ page }) => {
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
    await expect(wrap(page)).toHaveClass(/is-scrolled/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(wrap(page)).not.toHaveClass(/is-scrolled/);
  });

  test("navbar lebih lebar dari kontainer konten (1184px)", async ({ page }) => {
    const box = await page.locator(".hero-full .navbar").boundingBox();
    expect(box.width).toBeGreaterThan(1184);
  });

  test("menu 'Fitur' membuka halaman fitur", async ({ page }) => {
    await page.locator(".nav-links").getByRole("link", { name: "Fitur" }).click();
    await expect(page).toHaveURL(/features\.html$/);
  });
});
