# API Contract — Sistem Informasi Manajemen Data Defek Kulit Sapi

**Version:** V2.0
**Status:** Draft — Updated to match FUNCTIONAL_SPECIFICATION_V2.md
**Base Path:** `/api`

Dokumen ini mendefinisikan kontrak komunikasi antara frontend dan backend untuk Sistem Informasi Manajemen Data Defek Kulit Sapi (Penyakit Kaskado), yang mengotomatisasi pemodelan MANCOVA beserta interpretasi hasil menggunakan Generative AI.

> **Changelog dari V1.0:**
> - `POST /api/analyze` sekarang menjalankan **Validasi Struktur Variabel** beserta **Uji Asumsi MANCOVA** sebelum MANCOVA dijalankan, dalam satu kali panggilan endpoint (tidak menambah endpoint baru — sesuai prinsip *smallest architecture*).
> - `dependent_vars` minimal **2** item, `independent_vars` minimal **1** item (harus kategorik), `covariates` sekarang **wajib diisi minimal 1** item (harus numerik) — sebelumnya `covariates` opsional.
> - Response `POST /api/analyze` menambahkan objek `variable_structure` beserta `assumption_tests`.
> - `error_code` menambahkan skenario baru terkait struktur variabel di bawah `VARIABLE_ERROR`; uji asumsi yang "tidak terpenuhi" **bukan** error (non-blocking), hanya kegagalan teknis proses uji asumsi yang dapat memicu error.

API Contract berfokus pada:

- endpoint;
- request;
- response;
- status/error;
- struktur data yang dipertukarkan.

Detail implementasi internal backend (algoritma MANCOVA, metode statistik uji asumsi, prompt Generative AI) tidak termasuk dalam dokumen ini.

---

## 1. API Overview

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/` | Menyajikan halaman utama aplikasi |
| GET | `/api/health` | Mengecek status backend |
| POST | `/api/upload` | Mengunggah dataset, menjalankan data profiling awal |
| POST | `/api/clean` | Menjalankan data cleaning (imputasi/drop) atas dataset yang diunggah |
| POST | `/api/analyze` | Memvalidasi struktur variabel, menjalankan Uji Asumsi MANCOVA, MANCOVA, beserta interpretasi Generative AI atas variabel terpilih |

Endpoint tambahan hanya dibuat apabila benar-benar diperlukan. Validasi struktur variabel beserta uji asumsi **tidak** dipecah menjadi endpoint terpisah pada V2 — keduanya dijalankan sebagai bagian dari `POST /api/analyze` agar frontend tidak perlu melakukan banyak *round-trip* (lihat Open Decision #8 di bagian 12 apabila ke depannya dibutuhkan langkah konfirmasi terpisah).

---

## 2. GET `/`

Menyajikan halaman utama aplikasi (frontend application). Endpoint ini bukan endpoint analisis dan tidak menerima dataset.

---

## 3. GET `/api/health`

### Success Response — HTTP 200

```json
{
  "success": true,
  "status": "ok"
}
```

Digunakan untuk kebutuhan health check dan development.

---

## 4. POST `/api/upload`

### Purpose

Menerima dataset dari pengguna (Halaman 1: Upload & Data Validation), lalu menjalankan data profiling otomatis: preview tabel, informasi jumlah baris/kolom, beserta deteksi *missing value*.

### Request

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---:|---|
| `file` | File | Yes | Dataset `.csv` atau `.xlsx`, maksimal 10 MB |

### File Validation

- Backend menerima `.csv` dan `.xlsx` saja.
- Ukuran file maksimal 10 MB.
- File harus dapat dibaca oleh backend.
- Jika file tidak valid, request dihentikan sebelum profiling dijalankan.

### Success Response — HTTP 200

```json
{
  "success": true,
  "dataset_id": "string",
  "profile": {
    "n_rows": 0,
    "n_columns": 0,
    "columns": [
      {
        "name": "string",
        "dtype": "numeric | categorical",
        "missing_count": 0,
        "missing_percentage": 0.0
      }
    ],
    "preview": []
  }
}
```

| Field | Type | Description |
|---|---|---|
| `dataset_id` | String | Identifier sementara dataset di sesi berjalan, dipakai pada `/api/clean` beserta `/api/analyze` |
| `profile.n_rows` / `n_columns` | Integer | Jumlah baris/kolom dataset |
| `profile.columns` | Array of Object | Daftar kolom beserta tipe data, jumlah, beserta persentase *missing value* per kolom |
| `profile.preview` | Array of Object | Cuplikan baris data untuk pratinjau tabel di frontend |

> **TBD:** Jumlah baris maksimum yang ditampilkan pada `preview`.

---

## 5. POST `/api/clean`

### Purpose

Menjalankan *data cleaning* atas dataset yang sudah diunggah, sesuai pilihan pengguna di Halaman 1 (tahap Data Validation): imputasi otomatis atau penghapusan baris (*drop*). Endpoint ini **tidak berubah** dari V1 — cleaning tetap dijalankan sebelum pengguna masuk ke Halaman 2 (Pilih Variabel).

### Request

**Content-Type:** `application/json`

```json
{
  "dataset_id": "string",
  "strategy": "impute | drop",
  "impute_rules": {
    "numeric": "mean | median",
    "categorical": "mode"
  }
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `dataset_id` | String | Yes | Identifier dataset dari `/api/upload` |
| `strategy` | String | Yes | `"impute"` (isi otomatis) atau `"drop"` (hapus baris ber-*missing value*) |
| `impute_rules` | Object | Required jika `strategy = "impute"` | Aturan imputasi: numerik pakai mean/median, kategorik pakai modus |

### Success Response — HTTP 200

```json
{
  "success": true,
  "dataset_id": "string",
  "n_rows_after": 0,
  "columns_detected": {
    "numeric": [],
    "categorical": []
  }
}
```

`columns_detected` berisi daftar nama kolom bersih hasil deteksi sistem beserta tipenya (numerik/kategorik), dipakai sebagai sumber untuk mekanisme *drag-and-drop* di Halaman 2 sekaligus acuan validasi tipe pada `POST /api/analyze` (lihat bagian 6).

---

## 6. POST `/api/analyze`

### Purpose

Menjalankan seluruh proses analisis (Halaman 2 → Halaman 3) dalam satu panggilan:

1. Validasi struktur variabel (jumlah minimum beserta tipe per kolom).
2. Uji Asumsi MANCOVA (5 pemeriksaan, non-blocking).
3. MANCOVA (*Core Analytics Engine*).
4. Interpretasi Generative AI (AI Insights).

### Processing Flow

```text
Dataset Bersih (dataset_id)
  ↓
Pengelompokan Variabel
 (Dependent ≥2 numerik / Independent ≥1 kategorik / Covariates ≥1 numerik)
  ↓
Validasi Struktur Variabel  ── gagal ──▶ 400 VARIABLE_ERROR (berhenti di sini)
  ↓ lolos
Uji Asumsi MANCOVA (5 pemeriksaan)
  ↓
Asumsi (2–5) terpenuhi semua?
  ├── YA    → lanjut langsung, assumptions_met = true
  └── TIDAK → tetap lanjut, assumptions_met = false
              (warning disertakan di response, TIDAK menghentikan proses)
  ↓
MANCOVA (Core Analytics Engine)
  ↓
Generative AI (AI Insights — turut menyampaikan
 catatan kehati-hatian bila assumptions_met = false)
  ↓
Result
```

### Request

**Content-Type:** `application/json`

```json
{
  "dataset_id": "string",
  "dependent_vars": ["luas_defek_pipi", "luas_defek_pundak", "luas_defek_badan", "luas_defek_pinggul", "luas_defek_perut"],
  "independent_vars": ["ketinggian_kandang"],
  "covariates": ["kelimpahan_lalat", "suhu_udara", "kelembapan_udara"]
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `dataset_id` | String | Yes | Identifier dataset bersih dari `/api/clean` |
| `dependent_vars` | Array of String | Yes | Variabel respons (Y), **numerik**, **minimal 2 item** — luas defek pada lokasi tubuh sapi |
| `independent_vars` | Array of String | Yes | Variabel perlakuan (X), **kategorik**, **minimal 1 item** — mis. ketinggian kandang |
| `covariates` | Array of String | **Yes** (berubah dari V1: sebelumnya `No`) | Variabel kovariat (Z), **numerik**, **minimal 1 item** — mis. kelimpahan lalat, suhu, kelembapan |

Backend harus menolak request (`VARIABLE_ERROR`, HTTP 400) apabila salah satu ketentuan jumlah/tipe minimum di atas tidak terpenuhi, atau apabila ada nama variabel yang muncul di lebih dari satu array sekaligus, atau nama variabel tidak terdaftar pada `columns_detected` hasil `/api/clean`.

> **TBD:** Aturan jumlah maksimum variabel per kategori (jumlah minimum sudah ditetapkan pada V2: Dependent ≥2, Independent ≥1, Covariates ≥1).

### Success Response — HTTP 200

```json
{
  "success": true,
  "variable_structure": {
    "dependent_vars": ["luas_defek_pipi", "luas_defek_pundak", "luas_defek_badan", "luas_defek_pinggul", "luas_defek_perut"],
    "independent_vars": ["ketinggian_kandang"],
    "covariates": ["kelimpahan_lalat", "suhu_udara", "kelembapan_udara"],
    "valid": true
  },
  "assumption_tests": {
    "assumptions_met": true,
    "tests": [
      {
        "name": "independensi_pengamatan",
        "type": "informational",
        "status": "info",
        "message": "string"
      },
      {
        "name": "linearitas_kovariat_dependen",
        "type": "statistical",
        "status": "met | not_met",
        "detail": "string"
      },
      {
        "name": "normalitas_multivariat",
        "type": "statistical",
        "status": "met | not_met",
        "statistic": 0.0,
        "p_value": 0.0
      },
      {
        "name": "homogenitas_matriks_kovarians",
        "type": "statistical",
        "status": "met | not_met",
        "statistic": 0.0,
        "p_value": 0.0
      },
      {
        "name": "homogenitas_kemiringan_regresi",
        "type": "statistical",
        "status": "met | not_met",
        "statistic": 0.0,
        "p_value": 0.0
      }
    ],
    "warning_message": "string | null"
  },
  "mancova": {
    "tests": [
      {
        "statistic": "Wilks Lambda | Pillai Trace | Hotelling-Lawley Trace | Roy Greatest Root",
        "value": 0.0,
        "df": 0,
        "p_value": 0.0,
        "significant": true
      }
    ]
  },
  "dashboard": {
    "defect_risk_map": [
      { "location": "pipi | pundak | badan | pinggul | perut", "mean_area_cm2": 0.0, "risk_level": "low | medium | high" }
    ],
    "defect_by_altitude": [
      { "altitude_category": "Tinggi | Sedang | Rendah", "mean_area_cm2": 0.0 }
    ]
  },
  "ai_insight": {
    "narrative": "string",
    "assumption_caveat": "string | null"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `variable_structure` | Object | Echo variabel terpilih beserta hasil validasi struktur (`valid`) — dikembalikan sebagai konfirmasi ke frontend |
| `assumption_tests.assumptions_met` | Boolean | `true` jika seluruh uji asumsi statistik (nomor 2–5) terpenuhi; `false` jika minimal satu tidak terpenuhi. Tidak menghentikan proses pada kedua kasus |
| `assumption_tests.tests` | Array of Object | Hasil kelima pemeriksaan asumsi (lihat FR-06 pada Functional Specification V2) |
| `assumption_tests.warning_message` | String / null | Pesan warning/rekomendasi yang ditampilkan ke pengguna bila `assumptions_met = false`; `null` bila seluruh asumsi terpenuhi |
| `mancova.tests` | Array of Object | Empat statistik uji multivariat (Wilks' Lambda, Pillai's Trace, Hotelling-Lawley Trace, Roy's Greatest Root) beserta *p-value* masing-masing |
| `dashboard.defect_risk_map` | Array of Object | Data untuk visualisasi peta risiko defek pada siluet sapi, per lokasi tubuh |
| `dashboard.defect_by_altitude` | Array of Object | Data untuk grafik batang luas defek berdasarkan ketinggian tempat kandang |
| `ai_insight.narrative` | String | Narasi rekomendasi otomatis dari Generative AI berdasarkan hasil MANCOVA yang signifikan |
| `ai_insight.assumption_caveat` | String / null | Catatan kehati-hatian tambahan dari Generative AI bila `assumptions_met = false`; `null` bila seluruh asumsi terpenuhi |

> **TBD:** Apakah `ai_insight.narrative` berupa satu paragraf gabungan atau daftar poin per temuan signifikan.
> **TBD:** Provider beserta model Generative AI yang dipakai (mis. Claude, GPT, atau model lain).
> **TBD:** Metode statistik spesifik per uji asumsi (lihat FR-06 Functional Specification V2).

---

## 7. Error Response

```json
{
  "success": false,
  "error_code": "FILE_ERROR | VALIDATION_ERROR | VARIABLE_ERROR | CLEANING_ERROR | ASSUMPTION_TEST_ERROR | MANCOVA_ERROR | AI_INSIGHT_ERROR | INTERNAL_ERROR",
  "message": "Pesan error yang dapat dipahami pengguna."
}
```

### Contoh — Struktur variabel tidak memenuhi syarat minimum

```json
{
  "success": false,
  "error_code": "VARIABLE_ERROR",
  "message": "Minimal 2 variabel dependen (numerik), 1 variabel independen (kategorik), dan 1 variabel kovariat (numerik) harus dipilih sebelum menjalankan analisis."
}
```

### Contoh — Uji Asumsi gagal dijalankan secara teknis (bukan "tidak terpenuhi")

```json
{
  "success": false,
  "error_code": "ASSUMPTION_TEST_ERROR",
  "message": "Proses uji asumsi MANCOVA gagal dijalankan. Silakan coba lagi."
}
```

Catatan: `ASSUMPTION_TEST_ERROR` hanya dipakai untuk kegagalan **teknis** pada proses uji asumsi (mis. exception saat menghitung statistik). Kondisi "asumsi tidak terpenuhi" (`assumptions_met: false`) **bukan** error — itu adalah hasil valid yang tetap dikembalikan dengan HTTP 200 beserta warning di `assumption_tests.warning_message`.

---

## 8. HTTP Status

| Status | Meaning |
|---|---|
| `200` | Request berhasil (termasuk kasus `assumptions_met: false` — tetap 200, bukan error) |
| `400` | Request atau konfigurasi variabel tidak valid (termasuk struktur variabel tidak memenuhi syarat minimum) |
| `413` | File melebihi 10 MB |
| `422` | Format/tipe data tidak sesuai |
| `500` | Internal server error |
| `503` | Core Analytics Engine, komponen uji asumsi, atau layanan Generative AI tidak tersedia |

---

## 9. Frontend ↔ Backend Contract

**Frontend bertanggung jawab untuk:**
- memilih file beserta menampilkan hasil profiling (Halaman 1 — Data Validation);
- menampilkan drag-and-drop pemilihan variabel beserta indikasi ketentuan minimum per kolom (Halaman 2);
- mengirim request `/api/analyze`;
- menampilkan status validasi struktur variabel, status uji asumsi (beserta warning bila `assumptions_met: false`), loading, beserta hasil/error (Halaman 3).

**Backend bertanggung jawab untuk:**
- validasi final file beserta variabel (jumlah, tipe, duplikasi);
- data profiling beserta cleaning;
- validasi struktur variabel beserta uji asumsi MANCOVA (non-blocking untuk hasil "tidak terpenuhi");
- pemanggilan Core Analytics Engine (MANCOVA);
- pemanggilan Generative AI;
- formatting response.

Frontend tidak boleh menganggap input valid hanya karena validasi frontend berhasil — backend tetap menjadi sumber kebenaran validasi. Frontend juga tidak boleh memblokir pengiriman `/api/analyze` hanya karena hasil uji asumsi diperkirakan tidak terpenuhi di sisi klien — keputusan final tetap berasal dari response backend.

---

## 10. Stateless Behavior

API tidak menggunakan sesi login atau database permanen untuk menyimpan histori analisis. `dataset_id` bersifat sementara (berlaku selama satu alur unggah → bersihkan → pilih variabel → analisis).

Tidak ada kontrak API untuk: login, user account, analysis history, saved result, saved dataset.

---

## 11. Di Luar Scope

Fitur berikut **tidak termasuk** dalam scope Sistem Informasi Manajemen Data Defek Kulit Sapi V1/V2, sesuai Batasan Masalah penelitian:

- Fitur prediksi (*predictive modelling*) di luar pengujian MANCOVA.
- Autentikasi/login/akun pengguna.
- Database penyimpanan histori analisis.
- Endpoint download hasil sebagai file terpisah.
- Endpoint terpisah untuk validasi struktur variabel atau uji asumsi (digabung dalam `/api/analyze`, lihat bagian 1).
- Opsi *override* manual atas status uji asumsi oleh pengguna melalui API.

---

## 12. Open Decisions / TBD

1. Aturan jumlah **maksimum** variabel per kategori (minimum sudah ditetapkan pada V2).
2. Jumlah baris maksimum pada `preview` di `/api/upload`.
3. Struktur final `ai_insight` (satu narasi vs daftar poin).
4. Provider beserta model Generative AI yang dipakai.
5. Apakah daftar `error_code` di atas sudah final atau perlu ditambah.
6. Metode statistik spesifik untuk masing-masing uji asumsi MANCOVA (uji normalitas multivariat, Box's M, dsb).
7. Apakah "Independensi pengamatan" perlu direpresentasikan sebagai objek terpisah di `assumption_tests.tests`, atau cukup sebagai dokumentasi/disclaimer statis di frontend.
8. Apakah ke depannya dibutuhkan langkah konfirmasi eksplisit dari pengguna ("Tetap Lanjutkan?") saat `assumptions_met: false`, sebagai endpoint/flow terpisah — desain V2 saat ini memilih pendekatan otomatis (satu kali panggilan `/api/analyze`, warning ditampilkan bersamaan dengan hasil) demi menjaga arsitektur tetap sederhana.

Keputusan tersebut dikunci setelah implementasi backend beserta konsultasi lebih lanjut dengan dosen pembimbing ditentukan.

---

## 13. Status Dokumen

Dokumen ini merupakan **draft V2.0**, memperbarui `API_CONTRACT_V1.0` agar konsisten dengan `FUNCTIONAL_SPECIFICATION_V2.md` (penambahan Validasi Struktur Variabel beserta Uji Asumsi MANCOVA pada `POST /api/analyze`). Contract dapat diperbarui selama development apabila terdapat requirement baru yang telah dikonfirmasi ke dosen pembimbing.
