# Functional Specification — Sistem Informasi Manajemen Data Defek Kulit Sapi

**Version:** V1.0
**Status:** Locked Baseline
**Purpose:** Mendefinisikan fungsi beserta perilaku aplikasi dari sisi pengguna beserta sistem.

---

## 1. Deskripsi Aplikasi

**Sistem Informasi Manajemen Data Defek Kulit Sapi (Penyakit Kaskado)** merupakan aplikasi web yang mengotomatisasi pemodelan **MANCOVA** beserta interpretasi hasil menggunakan **Generative AI**, guna membantu peternak, penyuluh, beserta dinas terkait dalam menganalisis faktor penyebab defek kulit sapi tanpa perlu memahami proses statistika secara teknis.

Pengguna dapat:

- Mengunggah dataset dalam format CSV atau XLSX (maksimal 10 MB).
- Melihat hasil _data profiling_ otomatis (preview tabel, jumlah baris/kolom, deteksi _missing value_).
- Membersihkan data melalui imputasi otomatis (mean/median/modus) atau penghapusan baris.
- Mengelompokkan variabel ke dalam kategori Dependent, Independent, beserta Covariates melalui mekanisme _drag-and-drop_.
- Menjalankan analisis MANCOVA.
- Melihat hasil _Multivariate Tests_, peta risiko defek (_Defect Risk Map_) pada siluet sapi, beserta grafik luas defek berdasarkan ketinggian tempat.
- Mendapatkan narasi interpretasi otomatis (_AI Insights_) dari Generative AI.

Aplikasi tidak menyediakan penyimpanan data secara permanen atau histori analisis pada V1.

---

## 2. Tujuan Pengguna

Pengguna cukup:

1. Mengunggah dataset defek kulit sapi.
2. Membersihkan data yang mengandung _missing value_ (imputasi atau _drop_).
3. Mengelompokkan variabel ke kolom Dependent, Independent, beserta Covariates.
4. Menjalankan analisis MANCOVA.
5. Melihat hasil analisis beserta narasi rekomendasi dari Generative AI.

---

## 3. Workflow Utama

```text
UPLOAD DATA
    ↓
DATA VALIDATION
    ↓
DATA CLEANING
    ↓
PILIH VARIABEL
    ├── Dependen (≥ 2)
    ├── Independen (≥ 1 kategorik)
    └── Kovariat (≥ 1 numerik)
    ↓
VALIDASI STRUKTUR VARIABEL
    ↓
UJI ASUMSI MANCOVA
    ├── Independensi pengamatan*
    ├── Linearitas kovariat → dependen
    ├── Normalitas multivariat
    ├── Homogenitas matriks kovarians
    └── Homogenitas kemiringan regresi
    ↓
┌───────────────────────────┐
│ Apakah asumsi terpenuhi?  │
└─────────────┬─────────────┘
              │
       ┌──────┴──────┐
       ↓             ↓
      YA            TIDAK
       ↓             ↓
   MANCOVA       WARNING /
       ↓         REKOMENDASI
Statistik Uji         │
       │              │
       └──────┬───────┘
              ↓
       Statistik MANCOVA
              ↓
       Wilks' Lambda
       Pillai's Trace
       Hotelling-Lawley
       Roy's Greatest Root
              ↓
       Interpretasi Hasil
              ↓
        GENERATIVE AI
              ↓
       DASHBOARD HASIL
```

---

## 4. Functional Requirements

### FR-01 — Upload Dataset (Halaman 1)

Sistem harus memungkinkan pengguna mengunggah dataset berformat `.csv` atau `.xlsx`, dengan ukuran maksimal 10 MB. Sistem harus menolak file di luar format beserta ukuran tersebut, disertai pesan kesalahan yang jelas.

---

### FR-02 — Data Profiling Otomatis (Halaman 1)

Setelah file berhasil diunggah, sistem harus menampilkan secara otomatis:

- pratinjau (_preview_) tabel data;
- informasi jumlah baris beserta kolom;
- deteksi _missing value_ (data kosong/NaN) per kolom, termasuk jumlah beserta persentasenya.

---

### FR-03 — Data Cleaning (Halaman 1)

Sistem harus menyediakan proses pembersihan dataset setelah validasi dan profiling awal berhasil.

Cleaning dilakukan sebelum pengguna memilih variabel untuk analisis.

Sistem menyediakan dua opsi:

1. **Imputasi Otomatis**
   - numerik menggunakan mean atau median;
   - kategorik menggunakan modus.

2. **Drop Baris**
   - menghapus baris yang mengandung missing value.

Setelah cleaning selesai, sistem melakukan pemeriksaan kembali terhadap struktur dataset yang akan digunakan pada tahap pemilihan variabel.

## Cleaning tidak dimaksudkan untuk menjamin seluruh asumsi MANCOVA terpenuhi. Pemeriksaan asumsi dilakukan pada tahap terpisah setelah struktur variabel dinyatakan valid.

### FR-04 — Pemilihan Variabel Berbasis Drag-and-Drop (Halaman 2)

Sistem harus menampilkan daftar "Detected Variables" dari dataset yang telah dibersihkan.

Pengguna mengelompokkan variabel ke:

- **Dependent** — minimal 2 variabel dependen.
- **Independent** — minimal 1 variabel kategorik.
- **Covariates** — minimal 1 variabel numerik.

## Sistem harus melakukan validasi tipe dan jumlah variabel sebelum pengguna dapat melanjutkan ke pengujian asumsi MANCOVA.

### FR-05 — Validasi Struktur Variabel

Sistem harus memvalidasi konfigurasi variabel yang dipilih pengguna sebelum pengujian asumsi.

Validasi minimal:

- jumlah variabel Dependent ≥ 2;
- jumlah variabel Independent ≥ 1;
- minimal satu Independent bersifat kategorik;
- jumlah Covariates ≥ 1;
- minimal satu Covariate bersifat numerik;
- variabel yang sama tidak boleh berada pada lebih dari satu kategori.

Jika struktur tidak valid, sistem harus menampilkan pesan kesalahan dan pengguna tidak dapat melanjutkan.

---

### FR-06 — Uji Asumsi MANCOVA

Sebelum menjalankan MANCOVA, sistem harus melakukan pemeriksaan terhadap asumsi yang relevan, yaitu:

1. Independensi pengamatan.
2. Linearitas hubungan kovariat terhadap variabel dependen.
3. Normalitas multivariat.
4. Homogenitas matriks kovarians.
5. Homogenitas kemiringan regresi.

Hasil pemeriksaan setiap asumsi harus ditampilkan dalam bentuk status dan pesan yang mudah dipahami pengguna.

Status yang dapat diberikan:

- `PASS`
- `WARNING`
- `FAIL`

Pelanggaran asumsi tidak secara otomatis menghentikan proses analisis. Sistem harus memberikan warning dan rekomendasi kepada pengguna, kemudian tetap menyediakan opsi untuk melanjutkan MANCOVA.

Independensi pengamatan diperlakukan secara khusus karena merupakan asumsi yang berkaitan dengan desain penelitian dan proses pengambilan data. Sistem tidak boleh mengklaim bahwa independensi pengamatan telah terbukti hanya berdasarkan pemeriksaan dataset apabila informasi desain penelitian tidak tersedia.

---

### FR-07 — Menjalankan Analisis MANCOVA

Setelah struktur variabel dinyatakan valid dan pemeriksaan asumsi selesai, pengguna dapat menjalankan analisis MANCOVA.

Jika seluruh asumsi terpenuhi:

```text
Validasi
  ↓
Asumsi PASS
  ↓
MANCOVA
```

---

### FR-08 — AI Insights (Generative AI)

Setelah MANCOVA selesai, sistem membentuk structured result yang berisi hasil statistik dan hasil prediction yang telah dihitung oleh backend.

Structured result tersebut dikirimkan kepada Generative AI menggunakan prompt engineering.

Generative AI hanya bertugas menginterpretasikan hasil yang telah tersedia.

Generative AI tidak boleh:

- menghitung ulang statistik;
- mengubah nilai statistik;
- membuat nilai statistik baru;
- mengubah status signifikansi;
- membuat kesimpulan yang tidak didukung hasil analisis.

Dataset mentah pengguna tidak dikirimkan kepada Generative AI.

Jika layanan Generative AI tidak tersedia, hasil statistik MANCOVA tetap harus dapat ditampilkan kepada pengguna.

---

### FR-09 — Menampilkan Hasil (Halaman 3)

Setelah analisis selesai, sistem harus menampilkan:

- status pengujian asumsi MANCOVA;
- warning dan rekomendasi apabila terdapat asumsi yang tidak terpenuhi;
- tabel hasil Multivariate Tests;
- Wilks' Lambda;
- Pillai's Trace;
- Hotelling-Lawley Trace;
- Roy's Greatest Root;
- p-value dan status signifikansi;
- visualisasi Defect Risk Map;
- grafik Defect Area by Altitude;
- hasil prediction apabila tersedia;
- narasi AI Insights dari Generative AI.

---

### FR-10 — Error Handling

Sistem harus menangani beserta menampilkan pesan kesalahan yang informatif (tanpa _traceback_ teknis) untuk kondisi berikut:

- format atau ukuran file tidak didukung;
- file tidak dapat dibaca;
- dataset kosong atau kolom yang dibutuhkan tidak ditemukan;
- variabel Dependent/Independent belum dipilih sebelum analisis dijalankan;
- proses _data cleaning_ gagal;
- proses MANCOVA gagal;
- proses Generative AI gagal atau tidak tersedia (sistem tetap menampilkan hasil MANCOVA meski narasi AI Insights gagal dibuat).

---

## 5. System States

```text
EMPTY
  ↓
FILE_UPLOADED
  ↓
PROFILING
  ↓
CLEANING
  ↓
VARIABLES_SELECTED
  ↓
ANALYZING
  ↓
RESULT
```

Jika terjadi kesalahan pada tahap `PROFILING`, `CLEANING`, atau `ANALYZING`:

```text
PROFILING / CLEANING / ANALYZING
          ↓
        ERROR
          ↓
        RETRY
```

Saat status `ANALYZING`, sistem harus mencegah pengiriman request analisis ganda secara tidak sengaja.

---

## 6. Data dan Penyimpanan

Pada V1, aplikasi tidak menyediakan: akun pengguna, database pengguna, histori analisis, arsip hasil analisis. Dataset beserta hasil analisis tidak disimpan sebagai data pengguna secara permanen (bersifat sementara selama satu sesi alur unggah–bersihkan–analisis).

---

## 7. Batasan Scope V1

Fitur berikut **tidak termasuk** dalam scope V1, sesuai Batasan Masalah penelitian:

- fitur prediksi (_predictive modelling_) di luar pengujian MANCOVA;
- pengembangan formulasi atau modifikasi baru terhadap metode MANCOVA;
- autentikasi/login/akun pengguna;
- database beserta histori analisis;
- fitur administrasi beserta kolaborasi multi-pengguna;
- endpoint download hasil sebagai file terpisah.

Fitur-fitur tersebut dapat dipertimbangkan pada pengembangan sistem lanjutan (_sistem versi berikutnya_) di luar cakupan penelitian ini.

---

## 8. Prinsip Utama

Aplikasi mengikuti prinsip _Build the smallest architecture that solves the actual problem_ — sistem cukup menyediakan tiga alur halaman inti (Upload & Validation, Select Variables, View Results) yang menjembatani data lapangan dengan Core Analytics Engine MANCOVA beserta Generative AI, tanpa fitur tambahan yang di luar Batasan Masalah penelitian.

---

## 9. Status Dokumen

Dokumen ini merupakan **baseline V1**, disusun berdasarkan kesepakatan Bab 1–3 penelitian. Perubahan requirement setelah development dimulai harus diikuti pembaruan versi dokumen ini beserta `API_CONTRACT_V1.md` secara konsisten, serta dikonsultasikan kembali ke dosen pembimbing apabila memengaruhi scope skripsi.
