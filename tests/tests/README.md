# Tes otomatis DefectDSA

## Pertama kali
```bash
npm install
npx playwright install chromium     # unduh browser untuk e2e (sekali saja)
pip install -r requirements.txt     # dependensi backend, bila belum
```

## Menjalankan
| Perintah | Fungsi |
|---|---|
| `npm test` | Vitest: tes unit JS di `static/js` (cepat, tanpa server) |
| `npm run test:watch` | Vitest mode pantau, jalan ulang saat file berubah |
| `npm run test:e2e` | Playwright: menyalakan server sementara lalu menguji di browser |
| `npm run test:e2e:ui` | Playwright dengan UI interaktif (lihat tiap langkah) |
| `npm run test:all` | Keduanya |

Laporan HTML e2e: `npx playwright show-report tests/.report`

## Struktur
- `tests/unit/` — Vitest + jsdom. `helpers/load-script.js` memuat skrip klasik di `static/js` apa adanya.
- `tests/e2e/` — Playwright. `run_server.py` menyalakan FastAPI dengan database sementara
  dan admin `admin@test.local` / `TestAdmin123` (hanya untuk tes; data dev kamu tidak tersentuh).
- Project `mobile` (Pixel 7) hanya menjalankan `responsive.spec.js`.

## Menambah tes
- Fungsi murni baru di `static/js/foo.js` → `tests/unit/foo.test.js`, muat dengan `loadScript("foo.js", ["NamaGlobal"])`.
- Halaman/alur baru → `tests/e2e/nama.spec.js` (`baseURL` sudah diatur, cukup `page.goto("/static/halaman.html")`).
