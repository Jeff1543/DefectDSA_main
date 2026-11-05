# API Contract — Sistem Informasi Manajemen Data Defek Kulit Sapi

**Version:** V1.0
**Status:** Locked Baseline
**Base Path:** `/api`

Dokumen ini mendefinisikan kontrak komunikasi antara frontend dan backend untuk Sistem Informasi Manajemen Data Defek Kulit Sapi (Penyakit Kaskado), yang mengotomatisasi pemodelan MANCOVA beserta interpretasi hasil menggunakan Generative AI.

API Contract berfokus pada:

- endpoint;
- request;
- response;
- status/error;
- struktur data yang dipertukarkan.

Detail implementasi internal backend (algoritma MANCOVA, prompt Generative AI) tidak termasuk dalam dokumen ini.

---

## 1. API Overview

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/` | Menyajikan halaman utama aplikasi |
| GET | `/api/health` | Mengecek status backend |
| POST | `/api/upload` | Mengunggah dataset, menjalankan data profiling awal |
| POST | `/api/clean` | Menjalankan data cleaning (imputasi/drop) atas dataset yang diunggah |
| POST | `/api/analyze` | Menjalankan MANCOVA beserta interpretasi Generative AI atas variabel terpilih |

Endpoint tambahan hanya dibuat apabila benar-benar diperlukan.

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

Menjalankan *data cleaning* atas dataset yang sudah diunggah, sesuai pilihan pengguna di Halaman 1: imputasi otomatis atau penghapusan baris (*drop*).

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

`columns_detected` berisi daftar nama kolom bersih hasil deteksi sistem, dipakai sebagai sumber untuk mekanisme *drag-and-drop* di Halaman 2.

---

## 6. POST `/api/analyze`

### Purpose

Menjalankan seluruh proses analisis (Halaman 2 → Halaman 3): memanggil *Core Analytics Engine* MANCOVA atas variabel yang dikelompokkan pengguna, lalu meneruskan hasilnya ke komponen Generative AI untuk interpretasi otomatis.

### Processing Flow

```text
Dataset Bersih (dataset_id)
  ↓
Pengelompokan Variabel (Dependent / Independent / Covariates)
  ↓
MANCOVA (Core Analytics Engine)
  ↓
Generative AI (AI Insights)
  ↓
Result
```

### Request

**Content-Type:** `application/json`

```json
{
  "dataset_id": "string",
  "dependent_vars": ["luas_defek_pipi", "luas_defek_pundak", "luas_defek_badan", "luas_defek_pinggul", "luas_defek_perut"],
  "independent_vars": ["ketinggian_kandang", "waktu_pengamatan"],
  "covariates": ["kelimpahan_lalat", "suhu_udara", "kelembapan_udara"]
}
```

| Field | Type | Required | Description |
|---|---|---:|---|
| `dataset_id` | String | Yes | Identifier dataset bersih dari `/api/clean` |
| `dependent_vars` | Array of String | Yes | Variabel respons (Y) — luas defek pada lima lokasi tubuh sapi |
| `independent_vars` | Array of String | Yes | Variabel perlakuan (X) — ketinggian kandang, waktu pengamatan |
| `covariates` | Array of String | No | Variabel kovariat (Z) — kelimpahan lalat, suhu, kelembapan |

> **TBD:** Aturan jumlah minimum/maksimum variabel per kategori (misalnya batas minimal 1 variabel dependen).

### Success Response — HTTP 200

```json
{
  "success": true,
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
    "narrative": "string"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `mancova.tests` | Array of Object | Empat statistik uji multivariat (Wilks' Lambda, Pillai's Trace, Hotelling-Lawley Trace, Roy's Greatest Root) beserta *p-value* masing-masing |
| `dashboard.defect_risk_map` | Array of Object | Data untuk visualisasi peta risiko defek pada siluet sapi, per lokasi tubuh |
| `dashboard.defect_by_altitude` | Array of Object | Data untuk grafik batang luas defek berdasarkan ketinggian tempat kandang |
| `ai_insight.narrative` | String | Narasi rekomendasi otomatis dari Generative AI berdasarkan hasil MANCOVA yang signifikan |

> **TBD:** Apakah `ai_insight.narrative` berupa satu paragraf gabungan atau daftar poin per temuan signifikan.
> **TBD:** Provider beserta model Generative AI yang dipakai (mis. Claude, GPT, atau model lain).

---

## 7. Error Response

```json
{
  "success": false,
  "error_code": "FILE_ERROR | VALIDATION_ERROR | VARIABLE_ERROR | CLEANING_ERROR | MANCOVA_ERROR | AI_INSIGHT_ERROR | INTERNAL_ERROR",
  "message": "Pesan error yang dapat dipahami pengguna."
}
```

### Contoh

```json
{
  "success": false,
  "error_code": "VARIABLE_ERROR",
  "message": "Minimal satu variabel dependen harus dipilih sebelum menjalankan analisis."
}
```

---

## 8. HTTP Status

| Status | Meaning |
|---|---|
| `200` | Request berhasil |
| `400` | Request atau konfigurasi variabel tidak valid |
| `413` | File melebihi 10 MB |
| `422` | Format/tipe data tidak sesuai |
| `500` | Internal server error |
| `503` | Core Analytics Engine atau layanan Generative AI tidak tersedia |

---

## 9. Frontend ↔ Backend Contract

**Frontend bertanggung jawab untuk:**
- memilih file beserta menampilkan hasil profiling (Halaman 1);
- menampilkan drag-and-drop pemilihan variabel (Halaman 2);
- mengirim request `/api/analyze`;
- menampilkan loading beserta hasil/error (Halaman 3).

**Backend bertanggung jawab untuk:**
- validasi final file beserta variabel;
- data profiling beserta cleaning;
- pemanggilan Core Analytics Engine (MANCOVA);
- pemanggilan Generative AI;
- formatting response.

Frontend tidak boleh menganggap input valid hanya karena validasi frontend berhasil — backend tetap menjadi sumber kebenaran validasi.

---

## 10. Stateless Behavior

API tidak menggunakan sesi login atau database permanen untuk menyimpan histori analisis pada V1. `dataset_id` bersifat sementara (berlaku selama satu alur unggah → bersihkan → analisis).

Tidak ada kontrak API untuk: login, user account, analysis history, saved result, saved dataset.

---

## 11. Di Luar Scope V1

Fitur berikut **tidak termasuk** dalam scope Sistem Informasi Manajemen Data Defek Kulit Sapi V1, sesuai Batasan Masalah penelitian:

- Fitur prediksi (*predictive modelling*) di luar pengujian MANCOVA.
- Autentikasi/login/akun pengguna.
- Database penyimpanan histori analisis.
- Endpoint download hasil sebagai file terpisah.

---

## 12. Open Decisions / TBD

1. Aturan jumlah minimum/maksimum variabel per kategori.
2. Jumlah baris maksimum pada `preview` di `/api/upload`.
3. Struktur final `ai_insight` (satu narasi vs daftar poin).
4. Provider beserta model Generative AI yang dipakai.
5. Apakah `error_code` di atas sudah final atau perlu ditambah.

Keputusan tersebut dikunci setelah implementasi backend beserta konsultasi lebih lanjut dengan dosen pembimbing ditentukan.

---

## 13. Status Dokumen

Dokumen ini merupakan **API Contract V1 baseline**, disusun berdasarkan kesepakatan Bab 1–3 penelitian (Latar Belakang, Tujuan Penelitian, Batasan Masalah, Tinjauan Pustaka, beserta Data Penelitian). Contract dapat diperbarui selama development apabila terdapat requirement baru yang telah dikonfirmasi ke dosen pembimbing.
