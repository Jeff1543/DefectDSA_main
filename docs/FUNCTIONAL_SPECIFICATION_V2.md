# Functional Specification — Sistem Informasi Manajemen Data Defek Kulit Sapi

**Version:** V2.0
**Status:** Draft — Updated Workflow (Validasi Struktur Variabel + Uji Asumsi MANCOVA)
**Purpose:** Mendefinisikan fungsi beserta perilaku aplikasi dari sisi pengguna beserta sistem.

> **Changelog dari V1.0:**
> - Menambahkan tahap **Validasi Struktur Variabel** setelah pemilihan variabel (Halaman 2), sebelum MANCOVA dijalankan.
> - Menambahkan tahap **Uji Asumsi MANCOVA** (5 pemeriksaan) sebelum MANCOVA dijalankan. Uji asumsi bersifat **tidak memblokir** (*non-blocking*) — jika asumsi tidak terpenuhi, sistem menampilkan warning/rekomendasi, namun pengguna tetap dapat melanjutkan ke MANCOVA.
> - Mengubah ketentuan minimum pemilihan variabel: Dependent minimal **2** (numerik), Independent minimal **1** (kategorik), Covariates minimal **1** (numerik) — sebelumnya Covariates opsional.
> - Data Cleaning **tetap** berada di tahap Data Validation (Halaman 1), dijalankan sebelum pengguna masuk ke Halaman 2 (Pilih Variabel), tidak berubah dari V1.

---

## 1. Deskripsi Aplikasi

**Sistem Informasi Manajemen Data Defek Kulit Sapi (Penyakit Kaskado)** merupakan aplikasi web yang mengotomatisasi pemodelan **MANCOVA** beserta interpretasi hasil menggunakan **Generative AI**, guna membantu peternak, penyuluh, beserta dinas terkait dalam menganalisis faktor penyebab defek kulit sapi tanpa perlu memahami proses statistika secara teknis.

Pengguna dapat:

- Mengunggah dataset dalam format CSV atau XLSX (maksimal 10 MB).
- Melihat hasil *data profiling* otomatis (preview tabel, jumlah baris/kolom, deteksi *missing value*).
- Membersihkan data melalui imputasi otomatis (mean/median/modus) atau penghapusan baris.
- Mengelompokkan variabel ke dalam kategori Dependent, Independent, beserta Covariates melalui mekanisme *drag-and-drop*, sesuai ketentuan jumlah/tipe minimum per kolom.
- Melihat hasil **validasi struktur variabel** beserta **uji asumsi MANCOVA** sebelum analisis dijalankan.
- Menjalankan analisis MANCOVA, baik saat seluruh asumsi terpenuhi maupun saat terdapat asumsi yang tidak terpenuhi (dengan warning).
- Melihat hasil *Multivariate Tests*, status uji asumsi, peta risiko defek (*Defect Risk Map*) pada siluet sapi, beserta grafik luas defek berdasarkan ketinggian tempat.
- Mendapatkan narasi interpretasi otomatis (*AI Insights*) dari Generative AI.

Aplikasi tidak menyediakan penyimpanan data secara permanen atau histori analisis pada V1/V2.

---

## 2. Tujuan Pengguna

Pengguna cukup:

1. Mengunggah dataset defek kulit sapi.
2. Membersihkan data yang mengandung *missing value* (imputasi atau *drop*) di Halaman 1 (Data Validation).
3. Mengelompokkan variabel ke kolom Dependent (≥2), Independent (≥1, kategorik), beserta Covariates (≥1, numerik).
4. Melihat hasil validasi struktur variabel beserta uji asumsi MANCOVA.
5. Menjalankan analisis MANCOVA — baik saat asumsi terpenuhi, maupun tetap melanjutkan meski ada warning asumsi tidak terpenuhi.
6. Melihat hasil analisis beserta narasi rekomendasi dari Generative AI.

---

## 3. Workflow Utama

```text
User
  ↓
Halaman 1 — Upload CSV/XLSX (maks. 10 MB)
  ↓
Data Validation
  (Data Profiling Otomatis: preview, n_rows, n_cols, missing value
   + Data Cleaning: imputasi mean/median/modus, atau drop baris)
  ↓
Halaman 2 — Pilih Variabel (Drag-and-Drop)
  ├── Dependent    (≥ 2, numerik)
  ├── Independent  (≥ 1, kategorik)
  └── Covariates   (≥ 1, numerik)
  ↓
Validasi Struktur Variabel
  ↓
Uji Asumsi MANCOVA
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
     YA             TIDAK
       ↓             ↓
  Run MANCOVA   Tampilkan warning/
  langsung      rekomendasi, pengguna
       │        tetap dapat melanjutkan
       │        ke MANCOVA (hasil ditandai
       │        "asumsi tidak terpenuhi")
       └──────┬──────┘
              ↓
   Core Analytics Engine (MANCOVA)
              ↓
   Statistik Uji (Wilks' Lambda, Pillai's Trace,
   Hotelling-Lawley Trace, Roy's Greatest Root) + p-value
              ↓
   Generative AI (AI Insights)
              ↓
Halaman 3 — Dashboard Hasil
  (Multivariate Tests, status Uji Asumsi,
   Defect Risk Map, Defect Area by Altitude, AI Insights)
```

> *Independensi pengamatan bersifat asumsi desain penelitian (bukan sesuatu yang dapat diuji langsung dari dataset secara statistik). Sistem menampilkannya sebagai catatan informasional, bukan hasil uji numerik — lihat FR-06.

---

## 4. Functional Requirements

### FR-01 — Upload Dataset (Halaman 1)

Sistem harus memungkinkan pengguna mengunggah dataset berformat `.csv` atau `.xlsx`, dengan ukuran maksimal 10 MB. Sistem harus menolak file di luar format beserta ukuran tersebut, disertai pesan kesalahan yang jelas.

---

### FR-02 — Data Profiling Otomatis (Halaman 1 — Data Validation)

Setelah file berhasil diunggah, sistem harus menampilkan secara otomatis:

- pratinjau (*preview*) tabel data;
- informasi jumlah baris beserta kolom;
- deteksi *missing value* (data kosong/NaN) per kolom, termasuk jumlah beserta persentasenya.

---

### FR-03 — Data Cleaning (Halaman 1 — Data Validation)

Sistem harus menyediakan dua opsi pembersihan data bagi pengguna, dijalankan sebagai bagian dari tahap **Data Validation** di Halaman 1, sebelum pengguna lanjut ke Halaman 2 (Pilih Variabel):

1. **Imputasi Otomatis** — mengisi nilai kosong pada kolom numerik dengan mean atau median, beserta kolom kategorik dengan modus.
2. **Drop Baris** — menghapus baris data yang mengandung *missing value*.

Pengguna memilih salah satu opsi sebelum data dianggap siap (bersih) untuk tahap pemilihan variabel. Data yang belum melalui salah satu opsi cleaning ini tidak dapat dilanjutkan ke Halaman 2.

---

### FR-04 — Pemilihan Variabel Berbasis Drag-and-Drop (Halaman 2)

Sistem harus menampilkan daftar "*Detected Variables*" hasil deteksi otomatis (dari dataset yang sudah bersih), lengkap dengan tipe data terdeteksi (numerik/kategorik), yang dapat di-*drag* oleh pengguna ke salah satu dari tiga kolom:

- **Dependent** — variabel respons (Y), **numerik**, **minimal 2 variabel**: luas defek pada lokasi tubuh sapi (pipi, pundak, badan, pinggul, perut).
- **Independent** — variabel perlakuan (X), **kategorik**, **minimal 1 variabel**: ketinggian kandang, waktu pengamatan.
- **Covariates** — variabel kovariat (Z), **numerik**, **minimal 1 variabel**: kelimpahan lalat, suhu udara, kelembapan udara.

Sistem harus memvalidasi bahwa ketiga ketentuan minimum di atas terpenuhi sebelum tombol **"Lanjutkan"** dapat ditekan. Jika suatu variabel dipilih ke kolom yang tidak sesuai tipenya (mis. variabel kategorik dimasukkan ke kolom Dependent), sistem harus menolak penempatan tersebut beserta pesan yang menjelaskan tipe yang diharapkan.

---

### FR-05 — Validasi Struktur Variabel (BARU)

Setelah pengguna menekan tombol **"Lanjutkan"** dari Halaman 2, sistem harus menjalankan validasi struktur variabel sebelum Uji Asumsi MANCOVA dijalankan, meliputi pengecekan:

- jumlah variabel Dependent ≥ 2 beserta seluruhnya bertipe numerik;
- jumlah variabel Independent ≥ 1 beserta seluruhnya bertipe kategorik;
- jumlah variabel Covariates ≥ 1 beserta seluruhnya bertipe numerik;
- tidak ada variabel yang dipilih pada lebih dari satu kolom sekaligus (tidak boleh duplikat lintas kolom Dependent/Independent/Covariates);
- seluruh variabel yang dipilih berasal dari daftar *Detected Variables* hasil cleaning (bukan nama kolom yang tidak dikenal sistem).

Jika validasi struktur gagal, sistem **menghentikan proses** (tidak lanjut ke Uji Asumsi maupun MANCOVA) beserta menampilkan pesan kesalahan spesifik per kolom yang belum memenuhi syarat, agar pengguna dapat memperbaiki pemilihan variabel di Halaman 2.

Validasi struktur ini bersifat **memblokir** (*blocking*) — berbeda dari Uji Asumsi MANCOVA pada FR-06 yang bersifat *non-blocking*.

---

### FR-06 — Uji Asumsi MANCOVA (BARU)

Setelah struktur variabel dinyatakan valid (FR-05), sistem harus menjalankan lima pemeriksaan asumsi MANCOVA atas dataset bersih beserta variabel terpilih, sebelum MANCOVA dijalankan:

1. **Independensi pengamatan\*** — merupakan asumsi berbasis desain pengumpulan data, tidak dapat diuji secara statistik langsung dari dataset. Sistem menampilkan catatan informasional (bukan hasil uji numerik) yang mengingatkan pengguna untuk memastikan independensi antar unit pengamatan secara desain penelitian.
2. **Linearitas kovariat → dependen** — memeriksa hubungan linear antara masing-masing kovariat dengan variabel dependen.
3. **Normalitas multivariat** — memeriksa distribusi normal multivariat pada variabel dependen.
4. **Homogenitas matriks kovarians** — memeriksa kesetaraan matriks kovarians antar kelompok variabel independen.
5. **Homogenitas kemiringan regresi** (*homogeneity of regression slopes*) — memeriksa interaksi antara kovariat dengan variabel independen terhadap variabel dependen.

Untuk uji nomor 2–5, sistem harus menampilkan status **"Terpenuhi"** atau **"Tidak Terpenuhi"** per asumsi (beserta nilai statistik/p-value bila relevan). Untuk uji nomor 1, sistem menampilkan status **"Informasional"** (tidak dinilai terpenuhi/tidak terpenuhi secara otomatis).

Sistem harus menentukan status keseluruhan (`assumptions_met` = true/false) berdasarkan hasil uji nomor 2–5.

> **TBD:** Metode statistik spesifik yang dipakai untuk setiap uji asumsi (mis. Shapiro-Wilk/Mardia's test untuk normalitas multivariat, Box's M test untuk homogenitas kovarians, dsb.) — didetailkan pada tahap desain teknis.

---

### FR-07 — Percabangan Hasil Uji Asumsi (BARU)

Berdasarkan hasil FR-06, sistem harus mengikuti perilaku berikut, **tanpa memblokir** pengguna dalam kedua kasus:

- **Seluruh asumsi (2–5) terpenuhi** → sistem langsung mengizinkan MANCOVA dijalankan tanpa peringatan tambahan.
- **Satu atau lebih asumsi (2–5) tidak terpenuhi** → sistem tetap mengizinkan MANCOVA dijalankan, namun menampilkan **warning/rekomendasi** kepada pengguna (mis. saran transformasi data, peninjauan ulang pemilihan variabel, atau anjuran menginterpretasikan hasil dengan hati-hati). Hasil analisis yang dihasilkan pada kondisi ini ditandai dengan flag `assumptions_met: false` agar pengguna memahami bahwa hasil kemungkinan **kurang optimal/valid secara statistik**, meskipun tetap ditampilkan.

Tombol **"Run MANCOVA Analysis"** tetap dapat ditekan pada kedua kondisi di atas; tidak ada langkah konfirmasi tambahan yang wajib.

---

### FR-08 — Menjalankan Analisis MANCOVA

Saat tombol **"Run MANCOVA Analysis"** ditekan (setelah FR-05–FR-07), sistem mengirimkan data variabel terpilih beserta hasil uji asumsi ke *Core Analytics Engine* untuk dianalisis menggunakan metode MANCOVA.

```text
Variabel Terpilih (Y, X, Z) + Hasil Uji Asumsi
  ↓
Core Analytics Engine (MANCOVA)
  ↓
Statistik Uji (Wilks' Lambda, Pillai's Trace,
 Hotelling-Lawley Trace, Roy's Greatest Root) + p-value
  ↓
Generative AI (AI Insights)
  ↓
Result (Halaman 3)
```

---

### FR-09 — MANCOVA (Core Analytics Engine)

Sistem harus menjalankan analisis MANCOVA berdasarkan variabel dependen, independen, beserta kovariat yang dipilih pengguna, lalu mengembalikan keempat statistik uji multivariat berikut beserta *p-value* masing-masing: Wilks' Lambda, Pillai's Trace, Hotelling-Lawley Trace, beserta Roy's Greatest Root.

Penurunan rumus beserta implementasi algoritma perhitungan MANCOVA berada di luar cakupan Functional Specification ini (lihat Batasan Masalah penelitian).

---

### FR-10 — AI Insights (Generative AI)

Setelah hasil MANCOVA tersedia, sistem mengirimkan nilai statistik, signifikansi, beserta status uji asumsi (FR-06/FR-07) ke komponen Generative AI, yang menghasilkan narasi rekomendasi otomatis bagi pengguna.

Contoh keluaran: *"Rekomendasi AI: Tingkatkan ventilasi kandang karena suhu berkorelasi signifikan dengan luas defek pipi."*

Apabila hasil MANCOVA disertai flag `assumptions_met: false`, narasi AI Insights harus turut menyampaikan catatan kehati-hatian terkait potensi keterbatasan validitas hasil.

Generative AI berfungsi sebagai lapisan interpretasi, bukan sebagai mesin utama perhitungan statistik — nilai MANCOVA tetap bersumber dari Core Analytics Engine, bukan dari Generative AI.

> **TBD:** Provider/model Generative AI final.
> **TBD:** Apakah narasi berupa satu paragraf gabungan atau daftar poin per variabel signifikan.

---

### FR-11 — Menampilkan Hasil (Halaman 3)

Setelah analisis selesai, sistem harus menampilkan:

- tabel hasil **Multivariate Tests** (empat statistik uji beserta *p-value*);
- **status Uji Asumsi MANCOVA** — daftar kelima asumsi beserta status masing-masing (Terpenuhi/Tidak Terpenuhi/Informasional), disertai warning bila ada asumsi yang tidak terpenuhi;
- visualisasi **Defect Risk Map** pada siluet sapi, menunjukkan tingkat risiko defek per lokasi tubuh;
- grafik batang **Defect Area by Altitude**, membandingkan luas defek antar kategori ketinggian kandang;
- narasi **AI Insights** dari Generative AI.

---

### FR-12 — Error Handling

Sistem harus menangani beserta menampilkan pesan kesalahan yang informatif (tanpa *traceback* teknis) untuk kondisi berikut:

- format atau ukuran file tidak didukung;
- file tidak dapat dibaca;
- dataset kosong atau kolom yang dibutuhkan tidak ditemukan;
- proses *data cleaning* gagal;
- struktur variabel tidak memenuhi syarat minimum (Dependent < 2, Independent tanpa variabel kategorik, atau Covariates < 1) — **memblokir** lanjut ke Uji Asumsi/MANCOVA (lihat FR-05);
- proses Uji Asumsi MANCOVA gagal dijalankan secara teknis (bukan "tidak terpenuhi", melainkan error sistem) — sistem tetap mengizinkan pengguna melanjutkan ke MANCOVA dengan catatan bahwa validitas asumsi tidak dapat dipastikan;
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
STRUCTURE_VALIDATED
  ↓
ASSUMPTION_TESTING
  ↓
ANALYZING
  ↓
RESULT
```

Catatan:

- Transisi `VARIABLES_SELECTED → STRUCTURE_VALIDATED` bersifat **blocking**: jika gagal, sistem kembali ke `VARIABLES_SELECTED` dengan pesan error (lihat FR-05, FR-12).
- Transisi `ASSUMPTION_TESTING → ANALYZING` bersifat **non-blocking**: baik status `assumptions_met = true` maupun `false`, sistem tetap lanjut ke `ANALYZING`. Status hasil uji asumsi dibawa sebagai bagian dari data yang ditampilkan pada `RESULT`.

Jika terjadi kesalahan teknis pada tahap `PROFILING`, `CLEANING`, `STRUCTURE_VALIDATED`, `ASSUMPTION_TESTING`, atau `ANALYZING`:

```text
PROFILING / CLEANING / STRUCTURE_VALIDATED /
ASSUMPTION_TESTING / ANALYZING
          ↓
        ERROR
          ↓
        RETRY
```

Saat status `ANALYZING`, sistem harus mencegah pengiriman request analisis ganda secara tidak sengaja.

---

## 6. Data dan Penyimpanan

Aplikasi tidak menyediakan: akun pengguna, database pengguna, histori analisis, arsip hasil analisis. Dataset beserta hasil analisis tidak disimpan sebagai data pengguna secara permanen (bersifat sementara selama satu sesi alur upload–bersihkan–pilih variabel–uji asumsi–analisis).

---

## 7. Batasan Scope

Fitur berikut **tidak termasuk** dalam scope V1/V2, sesuai Batasan Masalah penelitian:

- fitur prediksi (*predictive modelling*) di luar pengujian MANCOVA;
- pengembangan formulasi atau modifikasi baru terhadap metode MANCOVA;
- autentikasi/login/akun pengguna;
- database beserta histori analisis;
- fitur administrasi beserta kolaborasi multi-pengguna;
- endpoint download hasil sebagai file terpisah;
- opsi *override* manual atas hasil uji asumsi oleh pengguna (mis. mengubah status "Tidak Terpenuhi" secara manual) — sistem hanya menampilkan status apa adanya beserta warning.

Fitur-fitur tersebut dapat dipertimbangkan pada pengembangan sistem lanjutan (*sistem versi berikutnya*) di luar cakupan penelitian ini.

---

## 8. Prinsip Utama

Aplikasi mengikuti prinsip *Build the smallest architecture that solves the actual problem* — sistem cukup menyediakan tiga alur halaman inti (Upload & Data Validation, Pilih Variabel & Validasi/Uji Asumsi, View Results) yang menjembatani data lapangan dengan Core Analytics Engine MANCOVA beserta Generative AI, tanpa fitur tambahan yang di luar Batasan Masalah penelitian.

---

## 9. Status Dokumen

Dokumen ini merupakan **draft V2.0**, memperbarui `FUNCTIONAL_SPECIFICATION_V1.0` dengan penambahan tahap Validasi Struktur Variabel beserta Uji Asumsi MANCOVA. Perubahan requirement setelah development dimulai harus diikuti pembaruan versi dokumen ini beserta `API_CONTRACT_V2.md` secara konsisten, serta dikonsultasikan kembali ke dosen pembimbing apabila memengaruhi scope skripsi.
