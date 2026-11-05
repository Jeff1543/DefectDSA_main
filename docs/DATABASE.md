# Database (PostgreSQL / SQLite)

- **Produksi / cloud**: PostgreSQL, aktif bila environment `DATABASE_URL` diset
  (`postgresql://user:sandi@host:5432/nama_db?sslmode=require`).
- **Lokal / test**: file SQLite `data/app.db` (atau lokasi dari `APP_DB_PATH`) bila `DATABASE_URL` kosong.

Tabel dibuat otomatis saat server pertama kali dijalankan. Skema untuk kedua database ada di `app/api/core/db.py`.
Perbedaan skema: Postgres memakai `BIGINT ... AS IDENTITY`, `DOUBLE PRECISION`, dan indeks unik `lower(email)`
(setara `COLLATE NOCASE` di SQLite). Kolom JSON dan `created_at` tetap `TEXT` di kedua database.

## Tabel

**users** — `id, name, email (unik), password_hash, role ('admin'|'peneliti'), created_at`

**analyses** — satu baris per analisis ragam yang dijalankan
`id, user_id (NULL = tamu), method (ANOVA|ANCOVA|MANOVA|MANCOVA), filename, n_rows, dependent_vars, independent_vars, covariates (JSON), assumptions_met (1/0/NULL), significant_effects, result_json (hasil lengkap), created_at`
Isi dataset yang diunggah TIDAK disimpan; hanya ringkasan hasil (`result_json`).

**questionnaires** — satu baris per responden
`id, user_id, respondent (JSON identitas), answers (JSON jawaban 1-5), scores (JSON skor per aspek), kecamatan, jenis_kelamin, overall_mean, overall_label, edit_key_hash, created_at`

## Contoh query

```sql
-- jumlah baris per tabel
SELECT 'users', COUNT(*) FROM users UNION ALL
SELECT 'analyses', COUNT(*) FROM analyses UNION ALL
SELECT 'questionnaires', COUNT(*) FROM questionnaires;

-- analisis terbaru beserta penggunanya
SELECT a.id, a.created_at, COALESCE(u.name, 'Tamu') AS pengguna, a.method, a.filename, a.significant_effects
FROM analyses a LEFT JOIN users u ON u.id = a.user_id
ORDER BY a.id DESC LIMIT 20;

-- rata-rata skor kuesioner per kecamatan
SELECT kecamatan, COUNT(*) AS responden, ROUND(AVG(overall_mean), 2) AS rata_skor
FROM questionnaires GROUP BY kecamatan;

-- siapa saja admin
SELECT id, name, email FROM users WHERE role = 'admin';

-- isi JSON — SQLite
SELECT id, json_extract(respondent, '$.nama') AS nama, json_extract(scores, '$.persen_total') AS persen
FROM questionnaires;

-- isi JSON — PostgreSQL (kolom TEXT di-cast ke jsonb)
SELECT id, respondent::jsonb ->> 'nama' AS nama, scores::jsonb ->> 'persen_total' AS persen
FROM questionnaires;
```

## Catatan

- Mengubah peran / kata sandi sebaiknya lewat dashboard atau `python manage.py`, bukan edit manual.
- Cadangan Postgres: backup bawaan penyedia, atau `pg_dump "$DATABASE_URL" > cadangan.sql`. Cadangan SQLite: salin file `app.db` saat server dimatikan.
- Pindah dari SQLite ke Postgres: `DATABASE_URL=... python scripts/migrate_sqlite_to_postgres.py [path/app.db]`.
- Ukuran pool koneksi Postgres diatur dengan `DB_POOL_MAX` (default 5).
