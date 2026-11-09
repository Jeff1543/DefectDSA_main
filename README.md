# Sistem Informasi Manajemen Data Defek Kulit Sapi

Sistem informasi berbasis web untuk mengotomatisasi pemodelan **MANCOVA (Multivariate Analysis of Covariance)** beserta interpretasi hasil menggunakan **Generative AI**, atas data defek kulit sapi (penyakit kaskado) yang diunggah pengguna dalam format CSV atau XLSX.

Aplikasi dirancang dengan arsitektur sederhana agar mudah dikembangkan, digunakan, dan di-deploy tanpa infrastruktur yang tidak diperlukan.

Untuk requirement dan workflow pengguna, lihat `FUNCTIONAL_SPECIFICATION_V1.md`. Untuk kontrak request/response API, lihat `API_CONTRACT_V1.md`.

---

## 1. Architecture

Aplikasi berjalan sebagai satu service FastAPI saat dikembangkan secara lokal.
Untuk deployment Cloudflare, frontend dapat disajikan oleh Worker Alchemy dan
request API diteruskan ke backend FastAPI yang di-host secara terpisah.

```text
┌─────────────────────────────────────────┐
│                BROWSER                  │
│                                         │
│  HTML + CSS + Vanilla JavaScript        │
└───────────────────┬─────────────────────┘
                    │
                    │ HTTP / JSON / File
                    ▼
         Local: FastAPI serves the UI and API

         Cloudflare: Worker serves the UI
                     and proxies /api to FastAPI
```

For local development, FastAPI serves both the UI and API. For Cloudflare
deployment, the static UI can be served by Alchemy while the Python API stays
on a host that supports its numerical dependencies.

---

## 2. Technology Stack

### Frontend

- HTML
- CSS
- Vanilla JavaScript

Tidak menggunakan frontend framework seperti:

- React
- Vue
- Angular
- Svelte
- jQuery
- Bootstrap
- Tailwind CSS

### Backend

- Python
- FastAPI
- Uvicorn

### Data Processing dan Statistik

Library Python digunakan sesuai kebutuhan analisis:

- pandas
- NumPy
- SciPy
- statsmodels
- openpyxl untuk membaca file XLSX

Daftar dependency final terdapat pada `requirements.txt`.

### Generative AI

- Provider: Groq (model Llama, API kompatibel OpenAI), dipanggil langsung lewat REST API menggunakan `httpx` (tanpa SDK tambahan).
- Diaktifkan dengan mengeset environment variable `GROQ_API_KEY`.
- Apabila `GROQ_API_KEY` tidak diset, atau pemanggilan API gagal, sistem otomatis memakai narasi interpretasi fallback berbasis aturan (_rule-based_), sehingga hasil MANCOVA tetap dapat ditampilkan.

### Infrastructure

- GitHub sebagai source-code repository
- FastAPI dapat di-host pada Python web service
- Frontend dapat di-host pada Cloudflare Workers menggunakan Alchemy
- PostgreSQL (via `DATABASE_URL`) menyimpan akun dan riwayat; SQLite dipakai otomatis untuk pengembangan lokal
- Tidak menggunakan Docker
- Tidak menggunakan Redis
- Tidak menggunakan Celery
- Tidak menggunakan message queue
- Tidak menggunakan microservice

---

## 3. Project Structure

```text
Farmer_Information_System/
│
├── app/
│   ├── api/
│   │   ├── main.py
│   │   ├── core/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── utils/
│   └── static/
│       ├── index.html
│       ├── css/
│       └── js/
│
├── cloudflare/worker.ts
├── alchemy.run.ts
├── requirements.txt
└── README.md
```

### `app/api/main.py`

Berisi konfigurasi aplikasi FastAPI, exception handler global, penyajian file statis, beserta _root endpoint_ frontend.

### `app/api/analysis.py`

Berisi seluruh endpoint API (`/api/health`, `/api/upload`, `/api/clean`, `/api/analyze`), merangkai pemanggilan service-service di bawah.

### `app/api/core/config.py`

Berisi konfigurasi aplikasi: batas ukuran file, ekstensi yang diizinkan, jumlah baris preview, TTL dataset, batas minimum variabel per kategori.

### `app/api/schemas/analysis.py`

Berisi skema Pydantic untuk request beserta validasi kontrak (mis. `CleanRequest`, `AnalyzeRequest`).

### `app/api/services/file_service.py`

Berisi penyimpanan dataset sementara di memori, data profiling, beserta mekanisme TTL.

### `app/api/services/preprocessing_service.py`

Berisi logika _data cleaning_ (imputasi mean/median/modus, _drop_ baris) beserta fungsi `clean_dataset()` yang menyatukan hasilnya kembali ke penyimpanan dataset.

### `app/api/services/mancova_service.py`

Berisi validasi struktur variabel, pengujian asumsi (linieritas, normalitas, Box's M, homogenitas kemiringan regresi), perhitungan MANCOVA, beserta penyusunan data _dashboard_.

### `app/api/services/interpretation_service.py`

Berisi pemanggilan Generative AI (Groq API) beserta narasi _fallback_ berbasis aturan.

### `app/api/utils/errors.py`

Berisi kelas-kelas _custom exception_ (`FileError`, `CleaningError`, `VariableError`, dst.) yang ditangkap oleh _exception handler_ di `main.py`.

### `app/static/`

Berisi file frontend yang disajikan FastAPI saat lokal atau Cloudflare Worker
saat deployment terpisah.

---

## 4. Data Processing

Dataset diproses selama request berlangsung.

```text
Upload
   ↓
Temporary Processing
   ↓
Read Dataset
   ↓
Validation
   ↓
Analysis
   ↓
Return Result
   ↓
Cleanup
```

Backend melakukan validasi terhadap:

- format file,
- ukuran file,
- file yang dapat dibaca,
- kolom yang dibutuhkan,
- tipe data,
- missing value yang relevan,
- nilai yang tidak valid untuk analisis.

Validasi frontend hanya digunakan untuk meningkatkan pengalaman pengguna. Validasi backend tetap wajib dilakukan.

---

## 5. Data Persistence

Dataset unggahan diproses sementara di memori dan memiliki TTL. Akun pengguna,
riwayat analisis, dan respons kuesioner disimpan di PostgreSQL (atau SQLite bila `DATABASE_URL` tidak diset).

Request diproses dengan pola:

```text
Request User
     ↓
Upload Dataset
     ↓
Data Profiling & Cleaning
     ↓
Run MANCOVA
     ↓
Generate AI Interpretation
     ↓
Return Response
     ↓
Request Finished
     ↓
Dataset Dihapus Otomatis Setelah TTL
```

Dataset unggahan tidak disimpan permanen. Set `DATABASE_URL` ke database
PostgreSQL cloud (Neon, Supabase, Render Postgres, dst.) agar akun dan riwayat
tetap ada setelah restart/redeploy. Gunakan `APP_SECRET` yang stabil agar token login tidak berubah.

Jika pengguna memilih download, hasil dibuat untuk kebutuhan download dan tidak dijadikan arsip permanen aplikasi.

---

## 6. API

API dibuat sesederhana mungkin, dipecah menjadi tiga endpoint utama sesuai tiga tahap alur pengguna. Detail lengkap request/response tersedia pada `API_CONTRACT_V1.md`.

### `GET /`

Menyajikan halaman utama aplikasi.

### `GET /api/health`

Mengecek status backend.

### `POST /api/upload`

Menerima dataset CSV/XLSX, mengembalikan `dataset_id` beserta hasil _data profiling_ (preview, jumlah baris/kolom, deteksi _missing value_).

### `POST /api/clean`

Menjalankan _data cleaning_ (imputasi mean/median/modus, atau _drop_ baris) atas dataset dari `/api/upload`.

### `POST /api/analyze`

Menjalankan alur:

```text
Cek dataset sudah cleaned
  → Validasi struktur variabel
  → Uji asumsi (linieritas, normalitas, Box's M, homogenitas slope)
  → MANCOVA
  → Dashboard
  → Interpretasi Generative AI
  → Result
```

Response menggunakan JSON. Contoh:

```json
{
  "success": true,
  "assumptions": {},
  "mancova": {},
  "dashboard": {},
  "ai_insight": {}
}
```

Endpoint tambahan hanya dibuat jika benar-benar dibutuhkan.

---

## 7. Concurrency

Aplikasi dapat digunakan oleh lebih dari satu user.

```text
User A ──┐
User B ──┤
User C ──┼──> FastAPI
User D ──┘
```

Request diproses menggunakan resource server yang tersedia.

Karena ukuran dataset relatif kecil dan proses analisis diperkirakan ringan, aplikasi menggunakan synchronous request processing pada tahap awal.

Tidak menggunakan:

- Celery
- Redis
- background worker
- job queue

selama belum ada kebutuhan berdasarkan hasil pengujian performa.

Jika pengujian di masa depan menunjukkan bahwa proses analisis terlalu lama atau jumlah user meningkat secara signifikan, arsitektur dapat dievaluasi kembali.

---

## 8. Local Development

### Requirements

- Python 3.x
- pip
- Git

### Membuat Virtual Environment

Windows:

```bash
python -m venv .venv
```

Aktifkan:

```bash
.venv\Scriptsctivate
```

Linux/macOS:

```bash
python3 -m venv .venv
```

Aktifkan:

```bash
source .venv/bin/activate
```

### Environment Variables

| Variable            | Wajib | Keterangan                                                                                                                                                                           |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GROQ_API_KEY` | Tidak | Apabila diset, `/api/analyze` memanggil Generative AI (Groq) sungguhan untuk narasi _AI Insights_. Apabila tidak diset, sistem otomatis memakai narasi _fallback_ berbasis aturan. |

Linux/macOS:

```bash
export GROQ_API_KEY="gsk_..."
```

Windows (PowerShell):

```powershell
$env:GROQ_API_KEY = "gsk_..."
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Menjalankan Aplikasi

```bash
uvicorn app.api.main:app --reload
```

Buka browser:

```text
http://127.0.0.1:8000
```

Dokumentasi API FastAPI tersedia di:

```text
http://127.0.0.1:8000/docs
```

## Cloudflare frontend deployment

Alchemy deploys `app/static` to a Cloudflare Worker and proxies `/api`
requests to a separately hosted FastAPI backend. Configure the backend URL
as `API_ORIGIN`; deployment steps and backend persistence requirements are in
[docs/DEPLOY_CLOUDFLARE.md](./docs/DEPLOY_CLOUDFLARE.md).

---

## 9. Production Start

Command untuk menjalankan aplikasi pada hosting:

```bash
uvicorn app.api.main:app --host 0.0.0.0 --port $PORT
```

`$PORT` disediakan oleh platform hosting.

---

## 10. Deployment

GitHub digunakan sebagai tempat menyimpan source code.

GitHub bukan server aplikasi.

Alur deployment:

```text
Local Development
       ↓
      Git
       ↓
    GitHub
       ↓
Cloud Web Service
       ↓
  Public URL
```

Hosting awal menggunakan platform yang mendukung Python/FastAPI, seperti Render.

### Build Command

```bash
pip install -r requirements.txt
```

### Start Command

```bash
uvicorn app.api.main:app --host 0.0.0.0 --port $PORT
```

Pada deployment Cloudflare, frontend berjalan pada Worker dan `/api` diproxy
ke backend FastAPI terpisah. Lihat `docs/DEPLOY_CLOUDFLARE.md`.

---

## 11. Error Handling

Error harus ditampilkan dalam bentuk yang mudah dipahami pengguna.

Jangan menampilkan Python traceback atau informasi internal server kepada pengguna.

Contoh response:

```json
{
  "success": false,
  "message": "Kolom variabel dependen tidak ditemukan pada dataset."
}
```

Informasi teknis dapat dicatat pada server log untuk kebutuhan debugging.

---

## 12. Frontend State

Frontend tidak menggunakan state-management library.

State utama:

```text
EMPTY
  ↓
FILE_SELECTED
  ↓
VALIDATING
  ↓
READY
  ↓
ANALYZING
  ↓
RESULT
```

Jika terjadi error:

```text
VALIDATING / ANALYZING
          ↓
        ERROR
          ↓
        RETRY
```

Saat proses analisis berlangsung, tombol Analyze harus dinonaktifkan agar user tidak mengirim request ganda secara tidak sengaja.

---

## 13. Design System

Panduan desain UI terdapat pada:

```text
DESIGN_SYSTEM.md
```

Design system mengatur:

- warna,
- typography,
- spacing,
- button,
- input,
- file upload,
- card,
- table,
- status,
- responsive design,
- accessibility,
- frontend state.

---

## 14. Development Principles

### Keep It Simple

Jangan menambahkan teknologi hanya karena teknologi tersebut umum digunakan pada aplikasi yang lebih besar.

### No Premature Optimization

Jangan menambahkan Redis, Celery, queue, caching, atau worker sebelum terdapat masalah performa yang terukur.

### No Unnecessary Persistence

Simpan hanya data yang diperlukan aplikasi. Akun dan riwayat menggunakan PostgreSQL;
dataset unggahan tetap sementara di memori.

### One Service First

FastAPI menyajikan frontend dan API saat lokal. Deployment Cloudflare dapat
memisahkan frontend Worker dari backend Python.

### Backend Owns Validation

Frontend membantu user, tetapi backend tetap menjadi pihak yang menentukan apakah input valid.

### Measure Before Scaling

Jika sistem terasa lambat ketika digunakan banyak user, lakukan pengujian terlebih dahulu sebelum mengubah arsitektur.

---

## 15. Future Development

Fitur berikut secara eksplisit **di luar scope V1** (lihat `API_CONTRACT_V1.md` beserta `FUNCTIONAL_SPECIFICATION_V1.md`), dan dapat dipertimbangkan pada versi sistem berikutnya apabila memang dibutuhkan beserta dikonfirmasi ulang ke dosen pembimbing:

- fitur prediksi (_predictive modelling_) di luar pengujian MANCOVA,
- pengembangan formulasi/modifikasi baru terhadap metode MANCOVA,
- visualisasi tambahan,
- export laporan sebagai endpoint download terpisah,
- integrasi hosting/database terkelola tambahan.

Penambahan infrastructure harus dilakukan berdasarkan requirement nyata, bukan asumsi.

---

## 16. Current Architecture

```text
Frontend
  HTML
  CSS
  Vanilla JavaScript

Backend
  FastAPI
  Uvicorn

Data Processing
  pandas
  NumPy
  SciPy
  statsmodels

Database
  PostgreSQL (SQLite fallback for local dev) for users, histories, and questionnaires

Persistent Storage
  Provided by the managed PostgreSQL database (DATABASE_URL)

Task Queue
  None

Redis
  None

Celery
  None

Docker
  None

Microservices
  None

Deployment
  Local: FastAPI serves frontend and API
  Cloudflare: Alchemy Worker frontend proxies to FastAPI
```

---

## 17. Known Gaps

Deployment still requires a public Python backend URL in `API_ORIGIN`.

- **`_DATASETS` di memori** tidak cocok untuk deployment multi-worker/multi-instance. Cukup untuk prototipe single-worker.
- **`risk_level` pada Defect Risk Map** dihitung dengan pendekatan sederhana (deviasi terhadap rata-rata antar lokasi), bukan hasil klasifikasi statistik formal.

---

## 18. Guiding Principle

> Build the smallest architecture that solves the actual problem.

Sistem harus tetap sederhana sampai kebutuhan nyata membuktikan bahwa kompleksitas tambahan memang diperlukan.

---

## Versi 2.1 — Portal peneliti, dashboard admin, analisis fleksibel

### Menjalankan

```bash
pip install -r requirements.txt
python run.py            # atau: uvicorn app.api.main:app --reload
# buka http://127.0.0.1:8000/  (otomatis diarahkan ke /static/index.html)
```

> **Penting:** halaman HARUS dibuka lewat server ini. Jika dibuka lewat Live Server, `python -m http.server`, atau klik dua kali file HTML, upload dan login akan gagal (error HTTP 405/404/501) karena API tidak ada di sana.

### Akun & database

- Bila `DATABASE_URL` diset, tabel dibuat otomatis di PostgreSQL; bila tidak, database SQLite dibuat di `data/app.db` (akun, riwayat analisis, respons kuesioner). Isi dataset yang diunggah **tidak** disimpan; hanya ringkasan hasil.
- Akun administrator dibuat saat server pertama kali jalan. Atur `ADMIN_EMAIL` dan `ADMIN_PASSWORD` di environment untuk akun Anda sendiri. Bila tidak diatur, `admin@mancova.local` dibuat dengan kata sandi acak yang **dicetak sekali di console**.
- Token login ditandatangani dengan `APP_SECRET` (atau kunci acak yang disimpan di `data/secret.key`). Di produksi, set `APP_SECRET`, jalankan lewat HTTPS, dan jangan commit folder `data/`.
- Halaman login: `/static/Authentication.html` → dashboard di `/static/dashboard.html`.

### Struktur variabel fleksibel

| Dependen | Kovariat  | Metode  |
| -------- | --------- | ------- |
| 1        | tidak ada | ANOVA   |
| 1        | ada       | ANCOVA  |
| >= 2     | tidak ada | MANOVA  |
| >= 2     | ada       | MANCOVA |

Independen minimal 1 (kategorik atau numerik dengan 2–10 nilai unik). Uji asumsi menyesuaikan metode (Shapiro-Wilk, Levene, Box's M, linearitas, homogenitas kemiringan regresi).

### Endpoint tambahan

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/questionnaire`, `GET /api/me/analyses[/{id}]`, `GET /api/admin/{overview,analyses,questionnaires,users}` dan `GET /api/admin/export/{analyses,questionnaires}.csv` (khusus admin).

### Mengelola login (akun)

Ada dua peran: **admin** (melihat & mengelola semuanya) dan **peneliti** (hanya riwayat analisisnya sendiri).

| Kebutuhan                                          | Cara                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Peneliti baru                                      | Daftar sendiri di `/static/Authentication.html` (tombol _Daftar_), otomatis berperan peneliti |
| Jadikan seseorang admin / kembalikan jadi peneliti | Dashboard admin → tab **Pengguna** → _Jadikan Admin_                                          |
| Peneliti lupa kata sandi                           | Dashboard admin → tab **Pengguna** → _Reset sandi_, lalu beri tahu sandi barunya              |
| Ganti sandi sendiri                                | Dashboard → tombol **Ubah Sandi** (kanan atas)                                                |
| Hapus akun                                         | Dashboard admin → tab **Pengguna** → _Hapus_ (riwayatnya tetap ada tanpa nama)                |
| Admin sendiri lupa sandi / belum punya admin       | Terminal: `python manage.py reset-password EMAIL` atau `python manage.py create-admin EMAIL`  |

Perintah terminal lain: `python manage.py users` (daftar akun), `python manage.py set-role EMAIL admin|peneliti`, `python manage.py db` (ringkasan isi database). Kata sandi ditanya interaktif sehingga tidak tersimpan di riwayat terminal.

Aturan keamanan: admin tidak bisa mengubah peran atau menghapus akunnya sendiri (supaya tidak terkunci); kata sandi minimal 8 karakter dan disimpan sebagai hash scrypt; login dibatasi setelah 8 kali gagal dalam 10 menit.

### Membuka database

**PostgreSQL (cloud / produksi)** — aktif bila environment `DATABASE_URL` diset, mis.
`postgresql://user:sandi@host:5432/nama_db?sslmode=require`. Tabel dibuat otomatis saat server pertama jalan.

1. **GUI**: DBeaver, TablePlus, atau pgAdmin dengan kredensial dari dashboard penyedia (Neon/Supabase/dll.).
2. **Terminal**: `psql "$DATABASE_URL"` lalu `\dt`, `\d users`, `SELECT * FROM analyses;`.
3. **Python**: `python manage.py db` untuk ringkasan cepat.

Memindahkan data dari SQLite lama: `DATABASE_URL=... python scripts/migrate_sqlite_to_postgres.py [path/app.db]` (aman dijalankan ulang).
Cadangan: gunakan backup bawaan penyedia atau `pg_dump "$DATABASE_URL" > cadangan.sql`.

**SQLite (lokal, tanpa `DATABASE_URL`)** — satu file `data/app.db` (lokasi bisa diganti dengan `APP_DB_PATH`); bisa dibuka dengan DB Browser for SQLite, ekstensi SQLite di VS Code, atau `sqlite3 data/app.db`.

Tabel, kolom, dan contoh query ada di `docs/DATABASE.md`. Jangan commit folder `data/`, dan jangan mengedit kolom `password_hash` secara manual (pakai Reset sandi).

### Statistika Deskriptif, Dokumentasi (galeri foto), dan interpretasi AI

- **Statistika Deskriptif** (`/static/statdes.html`): unggah file, pilih variabel, opsional bandingkan antar kelompok. Menampilkan ringkasan angka, histogram, boxplot, frekuensi kategori, perbandingan kelompok, dan korelasi. Tersimpan juga di dashboard admin (metode `STATDES`).
- **Galeri Dokumentasi** (`/static/dokumentasi.html`): letakkan foto (.jpg/.png/.webp) di `static/img/dokumentasi/`. Urutan mengikuti nama file (`01-...`, `02-...`). Keterangan opsional lewat `static/img/dokumentasi/captions.json`, mis. `{"01-pembukaan.jpg": "Pembukaan kegiatan"}`. Tanpa foto, halaman menampilkan kerangka kosong. Disarankan sisi terpanjang 1600-2400 px dan di bawah 1 MB per foto.
- **Panduan penggunaan** pindah ke `/static/panduan.html`.
- **Uji asumsi** menampilkan hipotesis, keputusan H0, grafik, saran perbaikan, dan transformasi data (log, log(x+1), akar kuadrat, kebalikan, kuadrat, Box-Cox).
- **Interpretasi**: bila `GROQ_API_KEY` diset, penjelasan ditulis oleh model AI (`GROQ_MODEL` untuk mengganti model) dengan prompt rinci berbahasa awam; bila tidak diset atau gagal, sistem memakai penjelasan otomatis yang sama detailnya dari data sebenarnya.

### Menjalankan tes otomatis

```bash
pip install pytest
python -m pytest tests -q
```

=======

# DefectDSA_main

> > > > > > > 440b28db07c9604c7f14a562a9eac48b98213316
