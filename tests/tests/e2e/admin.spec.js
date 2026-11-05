import { expect, test } from "@playwright/test";

// Semua tes memakai satu database; jalankan berurutan agar tidak saling menghapus data.
test.describe.configure({ mode: "serial" });

const ADMIN = { email: "admin@test.local", password: "TestAdmin123" };
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

const JAWABAN = Object.fromEntries(
  ["formula_pakan", "bibit_unggul", "kesehatan", "produksi", "nutrisi", "wilayah", "pemeliharaan", "peluang"].map(
    (k) => [k, [4, 4, 4]]
  )
);
const identitas = (nama, kecamatan = "Batu") => ({
  nama,
  umur: 40,
  jk: "Laki-laki",
  telepon: "081234567890",
  alamat: "Jl. Contoh No. 1 Batu",
  kecamatan,
  pengalaman: "5 tahun",
});

async function adminToken(request) {
  const res = await request.post("/api/auth/login", { data: ADMIN });
  return (await res.json()).token;
}
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

async function seedQuestionnaire(request, nama, kecamatan) {
  const res = await request.post("/api/questionnaire", {
    data: { identitas: identitas(nama, kecamatan), jawaban: JAWABAN },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).id;
}

// Masuk sebagai admin di browser: isi sesi lalu buka dashboard.
async function openDashboard(page, request, tab) {
  const login = await (await request.post("/api/auth/login", { data: ADMIN })).json();
  await page.addInitScript(
    ([t, u]) => {
      sessionStorage.setItem("mancova_token", t);
      sessionStorage.setItem("mancova_user", JSON.stringify(u));
    },
    [login.token, login.user]
  );
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto("/static/dashboard.html");
  await page.locator(`.dash-tab[data-tab="${tab}"]`).click();
}

// =====================================================================
// API
// =====================================================================
test.describe("API admin: pengguna (Create / Update / Delete)", () => {
  test("tambah pengguna -> 201, lalu bisa login", async ({ request }) => {
    const token = await adminToken(request);
    const email = `baru${uniq()}@test.local`;
    const res = await request.post("/api/admin/users", {
      ...auth(token),
      data: { name: "Peneliti Baru", email, password: "Sandi12345", role: "peneliti" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ name: "Peneliti Baru", email, role: "peneliti" });
    expect(body.user).not.toHaveProperty("password_hash");

    const login = await request.post("/api/auth/login", { data: { email, password: "Sandi12345" } });
    expect(login.ok()).toBe(true);
  });

  test("email ganda -> 409, sandi pendek -> 422", async ({ request }) => {
    const token = await adminToken(request);
    const dup = await request.post("/api/admin/users", {
      ...auth(token),
      data: { name: "Dobel", email: ADMIN.email.toUpperCase(), password: "Sandi12345" },
    });
    expect(dup.status()).toBe(409);

    const weak = await request.post("/api/admin/users", {
      ...auth(token),
      data: { name: "Lemah", email: `x${uniq()}@test.local`, password: "123" },
    });
    expect(weak.status()).toBe(422);
  });

  test("peneliti biasa tidak boleh mengelola pengguna (403)", async ({ request }) => {
    const token = await adminToken(request);
    const email = `peneliti${uniq()}@test.local`;
    await request.post("/api/admin/users", { ...auth(token), data: { name: "Peneliti", email, password: "Sandi12345" } });
    const pToken = (await (await request.post("/api/auth/login", { data: { email, password: "Sandi12345" } })).json()).token;

    const res = await request.post("/api/admin/users", {
      ...auth(pToken),
      data: { name: "Nakal", email: `n${uniq()}@test.local`, password: "Sandi12345" },
    });
    expect(res.status()).toBe(403);
  });

  test("tanpa login -> 401", async ({ request }) => {
    const res = await request.post("/api/admin/users", { data: { name: "X", email: "x@y.zz", password: "Sandi12345" } });
    expect(res.status()).toBe(401);
  });

  test("ubah nama dan email; email yang dipakai akun lain -> 409", async ({ request }) => {
    const token = await adminToken(request);
    const mk = async (label) => {
      const email = `${label}${uniq()}@test.local`;
      const r = await request.post("/api/admin/users", { ...auth(token), data: { name: label, email, password: "Sandi12345" } });
      return (await r.json()).user;
    };
    const a = await mk("aaa");
    const b = await mk("bbb");

    const ok = await request.patch(`/api/admin/users/${a.id}`, {
      ...auth(token),
      data: { name: "Nama Baru", email: `ganti${uniq()}@test.local` },
    });
    expect(ok.ok()).toBe(true);
    expect((await ok.json()).user.name).toBe("Nama Baru");

    const clash = await request.patch(`/api/admin/users/${a.id}`, { ...auth(token), data: { email: b.email } });
    expect(clash.status()).toBe(409);
  });

  test("admin tidak bisa mengubah peran atau menghapus akunnya sendiri", async ({ request }) => {
    const login = await (await request.post("/api/auth/login", { data: ADMIN })).json();
    const t = auth(login.token);
    const role = await request.patch(`/api/admin/users/${login.user.id}`, { ...t, data: { role: "peneliti" } });
    expect(role.status()).toBe(403);
    const del = await request.delete(`/api/admin/users/${login.user.id}`, t);
    expect(del.status()).toBe(403);
  });

  test("hapus pengguna -> 200, lalu 404", async ({ request }) => {
    const token = await adminToken(request);
    const r = await request.post("/api/admin/users", {
      ...auth(token),
      data: { name: "Dihapus", email: `del${uniq()}@test.local`, password: "Sandi12345" },
    });
    const { id } = (await r.json()).user;
    expect((await request.delete(`/api/admin/users/${id}`, auth(token))).ok()).toBe(true);
    expect((await request.delete(`/api/admin/users/${id}`, auth(token))).status()).toBe(404);
  });
});

test.describe("API admin: kuesioner dan analisis", () => {
  test("ubah identitas responden: kecamatan berubah, indeks tetap", async ({ request }) => {
    const token = await adminToken(request);
    const id = await seedQuestionnaire(request, `Responden ${uniq()}`, "Batu");
    const before = (await (await request.get(`/api/admin/questionnaires/${id}`, auth(token))).json()).item;

    const res = await request.patch(`/api/admin/questionnaires/${id}`, {
      ...auth(token),
      data: { nama: "Nama Diperbarui", kecamatan: "Junrejo", umur: 55 },
    });
    expect(res.ok()).toBe(true);
    const after = (await res.json()).item;
    expect(after.nama).toBe("Nama Diperbarui");
    expect(after.kecamatan).toBe("Junrejo");
    expect(after.identitas.umur).toBe(55);
    expect(after.identitas.alamat).toBe(before.identitas.alamat); // field lain tidak ikut berubah
    expect(after.rata_total).toBe(before.rata_total);
  });

  test("kecamatan tidak valid -> 422", async ({ request }) => {
    const token = await adminToken(request);
    const id = await seedQuestionnaire(request, `R ${uniq()}`);
    const res = await request.patch(`/api/admin/questionnaires/${id}`, { ...auth(token), data: { kecamatan: "Antah Berantah" } });
    expect(res.status()).toBe(422);
  });

  test("hapus kuesioner -> 200, lalu 404", async ({ request }) => {
    const token = await adminToken(request);
    const id = await seedQuestionnaire(request, `Hapus ${uniq()}`);
    expect((await request.delete(`/api/admin/questionnaires/${id}`, auth(token))).ok()).toBe(true);
    expect((await request.get(`/api/admin/questionnaires/${id}`, auth(token))).status()).toBe(404);
    expect((await request.delete(`/api/admin/questionnaires/${id}`, auth(token))).status()).toBe(404);
  });

  test("hapus analisis -> 200, lalu 404", async ({ request }) => {
    const token = await adminToken(request);
    const list = await (await request.get("/api/admin/analyses?limit=50", auth(token))).json();
    expect(list.items.length).toBeGreaterThan(0);
    const id = list.items[list.items.length - 1].id;

    expect((await request.delete(`/api/admin/analyses/${id}`, auth(token))).ok()).toBe(true);
    expect((await request.get(`/api/admin/analyses/${id}`, auth(token))).status()).toBe(404);
    expect((await request.delete(`/api/admin/analyses/${id}`, auth(token))).status()).toBe(404);
  });

  test("peneliti biasa tidak boleh menghapus analisis (403)", async ({ request }) => {
    const token = await adminToken(request);
    const email = `pen${uniq()}@test.local`;
    await request.post("/api/admin/users", { ...auth(token), data: { name: "Pen", email, password: "Sandi12345" } });
    const pToken = (await (await request.post("/api/auth/login", { data: { email, password: "Sandi12345" } })).json()).token;
    const res = await request.delete("/api/admin/analyses/1", auth(pToken));
    expect(res.status()).toBe(403);
  });
});

// =====================================================================
// UI dashboard admin
// =====================================================================
test.describe("UI admin: tab Pengguna", () => {
  test("tambah -> edit -> hapus pengguna lewat dialog", async ({ page, request }) => {
    await openDashboard(page, request, "users");
    const email = `ui${uniq()}@test.local`;

    // Tambah
    await page.getByRole("button", { name: "+ Tambah pengguna" }).click();
    const form = page.locator("#mForm");
    await form.locator('[name="name"]').fill("Pengguna UI");
    await form.locator('[name="email"]').fill(email);
    await form.locator('[name="pw"]').fill("Sandi12345");
    await form.locator('[name="role"]').selectOption("peneliti");
    await page.locator("#mOk").click();
    const row = page.locator("tr", { hasText: email });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Pengguna UI");

    // Edit
    await row.getByRole("button", { name: "Edit" }).click();
    await page.locator('#mForm [name="name"]').fill("Pengguna Diedit");
    await page.locator("#mOk").click();
    await expect(page.locator("tr", { hasText: email })).toContainText("Pengguna Diedit");

    // Hapus
    await page.locator("tr", { hasText: email }).getByRole("button", { name: "Hapus" }).click();
    await page.locator("#mOk").click();
    await expect(page.locator("tr", { hasText: email })).toHaveCount(0);
  });

  test("validasi form: email salah menampilkan pesan dan dialog tetap terbuka", async ({ page, request }) => {
    await openDashboard(page, request, "users");
    await page.getByRole("button", { name: "+ Tambah pengguna" }).click();
    await page.locator('#mForm [name="name"]').fill("Tanpa Email");
    await page.locator('#mForm [name="email"]').fill("bukan-email");
    await page.locator('#mForm [name="pw"]').fill("Sandi12345");
    await page.locator("#mOk").click();
    await expect(page.locator("#mErr")).toContainText("Format email");
    await expect(page.locator("#modal")).toBeVisible();
  });

  test("akun sendiri tidak punya tombol Hapus / Jadikan Peneliti", async ({ page, request }) => {
    await openDashboard(page, request, "users");
    const own = page.locator("tr", { hasText: ADMIN.email });
    await expect(own.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(own.getByRole("button", { name: "Hapus" })).toHaveCount(0);
    await expect(own.getByRole("button", { name: /Jadikan/ })).toHaveCount(0);
  });
});

test.describe("UI admin: tab Analisis dan Kuesioner", () => {
  test("hapus riwayat analisis dari tabel", async ({ page, request }) => {
    await openDashboard(page, request, "analyses");
    const firstDelete = page.locator("[data-del-analysis]").first();
    const id = await firstDelete.getAttribute("data-del-analysis");

    await firstDelete.click();
    await expect(page.locator("#modalTitle")).toHaveText("Hapus analisis");
    await page.locator("#mOk").click();
    await expect(page.locator("#modal")).toBeHidden();
    await expect(page.locator(`[data-del-analysis="${id}"]`)).toHaveCount(0);
  });

  test("batal pada dialog hapus tidak menghapus apa pun", async ({ page, request }) => {
    await openDashboard(page, request, "analyses");
    const rows = page.locator(".dash-table tbody tr");
    const before = await rows.count();
    await rows.first().getByRole("button", { name: "Hapus" }).click();
    await page.locator("#mCancel").click();
    await expect(page.locator("#modal")).toBeHidden();
    await expect(rows).toHaveCount(before);
  });

  test("edit lalu hapus respons kuesioner", async ({ page, request }) => {
    const nama = `Peternak ${uniq()}`;
    await seedQuestionnaire(request, nama, "Batu");
    await openDashboard(page, request, "questionnaires");

    const row = page.locator("tr", { hasText: nama });
    await expect(row).toContainText("Batu");

    await row.getByRole("button", { name: "Edit" }).click();
    await page.locator('#mForm [name="kecamatan"]').selectOption("Bumiaji");
    await page.locator("#mOk").click();
    await expect(page.locator("tr", { hasText: nama })).toContainText("Bumiaji");

    await page.locator("tr", { hasText: nama }).getByRole("button", { name: "Hapus" }).click();
    await page.locator("#mOk").click();
    await expect(page.locator("tr", { hasText: nama })).toHaveCount(0);
  });
});
