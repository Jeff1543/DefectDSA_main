import { expect, test } from "@playwright/test";

const ADMIN = { email: "admin@test.local", password: "TestAdmin123" };

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test.describe("halaman login", () => {
  test("panel kiri menampilkan slideshow foto sapi (4 foto, 1 aktif)", async ({ page }) => {
    await page.goto("/static/Authentication.html");
    const slides = page.locator(".plate-slide");
    await expect(slides).toHaveCount(4);
    await expect(page.locator(".plate-slide.is-active")).toHaveCount(1);

    // semua foto berhasil dimuat (bukan gambar rusak)
    const allLoaded = await slides.evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0));
    expect(allLoaded).toBe(true);
  });

  test("slideshow berganti foto otomatis", async ({ page }) => {
    await page.goto("/static/Authentication.html");
    const active = page.locator(".plate-slide.is-active");
    const first = await active.getAttribute("src");
    await expect.poll(() => active.getAttribute("src"), { timeout: 8_000 }).not.toBe(first);
  });

  test("password salah menampilkan pesan error dan tidak berpindah halaman", async ({ page }) => {
    await page.goto("/static/Authentication.html");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.locator("#password").fill("sandi-salah-123");
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page.locator("#statusMessage")).toBeVisible();
    await expect(page.locator("#statusMessage")).not.toBeEmpty();
    await expect(page).toHaveURL(/Authentication\.html$/);
    await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
  });

  test("login admin berhasil -> dashboard dan token tersimpan", async ({ page }) => {
    await page.goto("/static/Authentication.html");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.locator("#password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page).toHaveURL(/dashboard\.html$/);
    const token = await page.evaluate(() => sessionStorage.getItem("mancova_token"));
    expect(token).toBeTruthy();
  });
});

test.describe("API auth", () => {
  test("login admin lewat API mengembalikan token dan role admin", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: ADMIN });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("admin");
  });

  test("password salah -> 401 dengan format error terstruktur", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { email: "tidak.ada@test.local", password: "x" } });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body).toHaveProperty("error_code");
    expect(body).toHaveProperty("message");
  });

  test("input tidak valid -> 422 VALIDATION_ERROR", async ({ request }) => {
    const res = await request.post("/api/auth/register", { data: { name: "A", email: "bukan-email", password: "1" } });
    expect(res.status()).toBe(422);
    expect((await res.json()).error_code).toBe("VALIDATION_ERROR");
  });
});
