"""
Salin data dari file SQLite lama ke PostgreSQL (sekali jalan).

Pemakaian:

    export DATABASE_URL="postgresql://user:sandi@host:5432/nama_db?sslmode=require"
    python scripts/migrate_sqlite_to_postgres.py                 # default: app/data/app.db
    python scripts/migrate_sqlite_to_postgres.py path/ke/app.db

- ID asli dipertahankan, jadi relasi user_id tetap benar.
- Setelah menyalin, urutan ID (identity) disetel ulang agar insert berikutnya
  tidak bentrok.
- Aman dijalankan ulang: baris dengan ID yang sudah ada dilewati.
- Tabel tujuan dibuat otomatis bila belum ada.
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.core import db  # noqa: E402

# Urutan penting: users dulu karena tabel lain merujuk ke users.id.
TABLES = {
    "users": ["id", "name", "email", "password_hash", "role", "created_at"],
    "analyses": [
        "id", "user_id", "method", "filename", "n_rows", "dependent_vars",
        "independent_vars", "covariates", "assumptions_met",
        "significant_effects", "result_json", "created_at",
    ],
    "questionnaires": [
        "id", "user_id", "respondent", "answers", "scores", "kecamatan",
        "jenis_kelamin", "overall_mean", "overall_label", "edit_key_hash",
        "created_at",
    ],
}


def main() -> None:
    if not db.USE_POSTGRES:
        sys.exit("DATABASE_URL belum diset — tidak ada tujuan Postgres.")

    src_path = Path(sys.argv[1]) if len(sys.argv) > 1 else db.DB_PATH
    if not src_path.exists():
        sys.exit(f"File SQLite tidak ditemukan: {src_path}")

    src = sqlite3.connect(src_path)
    src.row_factory = sqlite3.Row
    db.init_db()

    print(f"Sumber : {src_path}")
    print(f"Tujuan : {db.describe()}")

    with db.connect() as dst:
        for table, cols in TABLES.items():
            rows = src.execute(f"SELECT {', '.join(cols)} FROM {table} ORDER BY id").fetchall()
            col_list = ", ".join(cols)
            marks = ", ".join("?" for _ in cols)
            copied = 0
            for r in rows:
                cur = dst.execute(
                    f"INSERT INTO {table} ({col_list}) VALUES ({marks}) "
                    "ON CONFLICT DO NOTHING RETURNING id",
                    tuple(r),
                )
                if cur.fetchone() is not None:
                    copied += 1
            print(f"  {table:<15} {len(rows)} baris di sumber, {copied} disalin")

            # Sinkronkan urutan ID dengan data yang baru masuk.
            dst.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1), "
                f"(SELECT MAX(id) FROM {table}) IS NOT NULL)"
            )

    src.close()
    db.close_pool()
    print("Selesai.")


if __name__ == "__main__":
    main()
