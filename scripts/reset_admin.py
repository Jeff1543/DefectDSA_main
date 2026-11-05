"""
Reset / buat akun admin tanpa perlu tahu kata sandi lama.

Pemakaian (jalankan dari folder proyek, yang berisi folder app/ dan static/):

    python scripts/reset_admin.py                         # email admin@mancova.local
    python scripts/reset_admin.py kamu@email.com          # pakai email sendiri
    python scripts/reset_admin.py kamu@email.com SandiBaru123

- Jika sandi tidak diberikan, dibuat sandi acak lalu dicetak di layar.
- Jika email itu sudah ada, sandinya diganti dan role-nya dijadikan admin.
- Jika belum ada, akun admin baru dibuat.
"""
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.core.db import connect, init_db  # noqa: E402
from app.api.services import user_service  # noqa: E402


def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else "admin@mancova.local").strip().lower()
    password = sys.argv[2] if len(sys.argv) > 2 else secrets.token_urlsafe(9)
    if len(password) < 8:
        sys.exit("Kata sandi minimal 8 karakter.")

    init_db()
    row = user_service.get_by_email(email)
    if row:
        user_service.set_password(row["id"], password)
        with connect() as conn:
            conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (row["id"],))
        aksi = "diperbarui"
    else:
        user_service.create_user("Administrator", email, password, role="admin")
        aksi = "dibuat"

    print("=" * 56)
    print(f" Akun admin {aksi}")
    print(f"   Email     : {email}")
    print(f"   Kata sandi: {password}")
    print("=" * 56)


if __name__ == "__main__":
    main()