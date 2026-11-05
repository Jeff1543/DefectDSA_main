# Functional Specification — Peternakan MANCOVA

## 1. Deskripsi Aplikasi

**Peternakan MANCOVA** merupakan aplikasi web yang digunakan untuk membantu pengguna melakukan analisis data peternakan menggunakan metode **MANCOVA** dan menghasilkan prediksi berdasarkan dataset yang diberikan.

Pengguna dapat:

- Mengunggah dataset dalam format CSV atau XLSX.
- Memilih variabel yang diperlukan untuk analisis.
- Menjalankan analisis MANCOVA.
- Melakukan prediction berdasarkan data.
- Melihat hasil analisis.
- Mengunduh hasil analisis apabila diperlukan.

Data tidak disimpan secara permanen oleh sistem.

---

## 2. Workflow Pengguna

Workflow penggunaan aplikasi:

```text
Buka Website
     ↓
Upload Dataset
     ↓
Pilih Variabel Analisis
     ↓
Jalankan Analisis
     ↓
Tunggu Proses
     ↓
Lihat Hasil MANCOVA & Prediction
     ↓
Download Hasil (Opsional)
     ↓
Selesai
```

### Langkah 1 — Membuka Website

Pengguna membuka URL aplikasi melalui browser.

### Langkah 2 — Upload Dataset

Pengguna mengunggah dataset peternakan dalam format:

- CSV
- XLSX

Sistem membaca dan memvalidasi dataset.

Jika dataset tidak valid, sistem menampilkan pesan kesalahan dan pengguna dapat mengunggah file lain.

### Langkah 3 — Memilih Variabel

Setelah dataset berhasil dibaca, sistem menampilkan variabel yang tersedia.

Pengguna memilih variabel yang diperlukan untuk analisis, seperti:

- Variabel dependen
- Variabel independen
- Kovariat
- Variabel yang diperlukan untuk prediction

### Langkah 4 — Menjalankan Analisis

Pengguna menekan tombol untuk menjalankan analisis.

Proses analisis secara konseptual:

```text
Dataset
   ↓
Preprocessing
   ↓
MANCOVA
   ↓
Prediction
   ↓
Hasil
```

Pengguna menunggu sampai proses selesai.

### Langkah 5 — Melihat Hasil

Setelah proses selesai, sistem menampilkan hasil analisis pada halaman web.

Hasil dapat mencakup:

- Hasil MANCOVA
- Informasi statistik
- Hasil prediction
- Informasi pendukung lainnya

### Langkah 6 — Download Hasil

Pengguna dapat mengunduh hasil analisis jika diperlukan.

Download bersifat opsional.

---

## 3. Fungsional Utama

### 3.1 Upload Dataset

Sistem harus menerima dataset dengan format:

- `.csv`
- `.xlsx`

Sistem harus memberikan informasi kesalahan apabila file tidak dapat diproses.

### 3.2 Validasi Dataset

Sistem harus memvalidasi dataset sebelum analisis dilakukan.

Validasi mencakup kebutuhan data yang diperlukan agar proses analisis dapat dijalankan.

### 3.3 Pemilihan Variabel

Sistem harus menyediakan pilihan variabel berdasarkan kolom yang tersedia pada dataset.

Pengguna dapat menentukan variabel yang diperlukan untuk:

- MANCOVA
- Prediction

### 3.4 Analisis MANCOVA

Sistem harus menjalankan analisis MANCOVA berdasarkan dataset dan variabel yang dipilih pengguna.

### 3.5 Prediction

Sistem harus menghasilkan prediction berdasarkan data dan konfigurasi analisis yang diberikan.

### 3.6 Menampilkan Hasil

Sistem harus menampilkan hasil analisis pada halaman web setelah proses selesai.

### 3.7 Download Hasil

Sistem dapat menyediakan hasil analisis dalam bentuk file yang dapat diunduh pengguna.

---

## 4. Kondisi Sistem

### Saat Dataset Belum Dipilih

Pengguna belum dapat menjalankan analisis sebelum dataset tersedia.

### Saat Dataset Tidak Valid

Sistem menampilkan pesan kesalahan dan pengguna dapat memperbaiki atau mengunggah dataset lain.

### Saat Analisis Berlangsung

Sistem menampilkan status loading/proses dan mencegah pengguna mengirim analisis ganda secara tidak sengaja.

### Saat Analisis Berhasil

Sistem menampilkan hasil MANCOVA dan prediction.

### Saat Terjadi Error

Sistem menampilkan pesan kesalahan yang dapat dipahami pengguna.

---

## 5. Data dan Penyimpanan

Aplikasi tidak menyediakan penyimpanan data secara permanen dan tidak memiliki fitur histori analisis.

Sistem tidak menyimpan secara permanen:

- Akun pengguna
- Dataset pengguna
- Histori analisis
- Hasil analisis
- Histori prediction

Detail mengenai mekanisme file temporary dan lifecycle data merupakan bagian dari dokumentasi teknis aplikasi, bukan requirement fungsional pengguna.

---

## 6. Prinsip Penggunaan

Aplikasi dirancang agar pengguna tidak perlu memahami proses teknis di belakang sistem.

Pengguna cukup:

```text
1. Upload data
2. Pilih variabel
3. Jalankan analisis
4. Lihat hasil
5. Download jika diperlukan
```

Seluruh proses teknis analisis dilakukan oleh sistem.
