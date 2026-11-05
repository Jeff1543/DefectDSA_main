"""
Perintah pengelolaan lewat terminal (tanpa perlu membuka dashboard).

  python manage.py db                      # database yang dipakai & ringkasan isinya
  python manage.py users                   # daftar akun
  python manage.py create-admin EMAIL      # buat admin baru (sandi ditanya)
  python manage.py reset-password EMAIL    # atur ulang kata sandi (sandi ditanya)
  python manage.py set-role EMAIL admin|peneliti
"""

import getpass
import sys

from app.api.core.db import DB_PATH, USE_POSTGRES, connect, describe, init_db
from app.api.services import user_service as us


def _ask_password() -> str:
    while True:
        pw = getpass.getpass("Kata sandi baru (min. 8 karakter): ")
        if len(pw) < 8:
            print("Terlalu pendek.")
            continue
        if pw != getpass.getpass("Ulangi kata sandi: "):
            print("Tidak sama, ulangi.")
            continue
        return pw


def cmd_db():
    print(f"Database      : {describe()}")
    if not USE_POSTGRES:
        print(f"Ada           : {'ya' if DB_PATH.exists() else 'belum (dibuat saat server pertama jalan)'}")
        if not DB_PATH.exists():
            return
        print(f"Ukuran        : {DB_PATH.stat().st_size / 1024:.1f} KB")
    with connect() as conn:
        for table in ("users", "analyses", "questionnaires"):
            n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table:<15}{n} baris")


def cmd_users():
    with connect() as conn:
        rows = conn.execute("SELECT id, name, email, role, created_at FROM users ORDER BY id").fetchall()
    for r in rows:
        print(f"{r['id']:>3}  {r['role']:<9} {r['email']:<32} {r['name']}  ({r['created_at']})")
    if not rows:
        print("Belum ada akun.")


def main(argv):
    init_db()
    if not argv:
        print(__doc__)
        return 1

    cmd, args = argv[0], argv[1:]

    if cmd == "db":
        cmd_db()
    elif cmd == "users":
        cmd_users()
    elif cmd == "create-admin" and len(args) == 1:
        email = args[0].strip().lower()
        if us.get_by_email(email):
            print("Email sudah terdaftar. Pakai: set-role / reset-password.")
            return 1
        us.create_user("Administrator", email, _ask_password(), role="admin")
        print(f"Admin {email} dibuat.")
    elif cmd == "reset-password" and len(args) == 1:
        row = us.get_by_email(args[0].strip().lower())
        if not row:
            print("Email tidak ditemukan.")
            return 1
        us.set_password(row["id"], _ask_password())
        print("Kata sandi diperbarui.")
    elif cmd == "set-role" and len(args) == 2 and args[1] in ("admin", "peneliti"):
        row = us.get_by_email(args[0].strip().lower())
        if not row:
            print("Email tidak ditemukan.")
            return 1
        us.set_role(row["id"], args[1])
        print(f"Peran {row['email']} sekarang: {args[1]}")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
