import os
import re
import secrets
from datetime import datetime, timezone

from app.api.core.db import connect
from app.api.core.security import hash_password, verify_password

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "created_at": row["created_at"],
    }


def get_by_email(email: str):
    with connect() as conn:
        return conn.execute(
            # lower() di kedua sisi: perilakunya sama di SQLite dan Postgres.
            "SELECT * FROM users WHERE lower(email) = lower(?)", (email,)
        ).fetchone()


def get_by_id(user_id: int):
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def create_user(name: str, email: str, password: str, role: str = "peneliti"):
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, email, hash_password(password), role, now_iso()),
        )
        user_id = cur.lastrowid
    return get_by_id(user_id)


def list_users_with_counts() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.name, u.email, u.role, u.created_at,
                   (SELECT COUNT(*) FROM analyses a WHERE a.user_id = u.id) AS analyses,
                   (SELECT COUNT(*) FROM questionnaires q WHERE q.user_id = u.id) AS questionnaires
            FROM users u ORDER BY u.created_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def ensure_admin() -> None:
    """
    Memastikan minimal ada satu akun admin.

    - Jika ADMIN_EMAIL & ADMIN_PASSWORD diset di environment, akun itu dibuat.
    - Jika tidak, dibuat admin@mancova.local dengan kata sandi acak yang
      dicetak SEKALI ke console saat server pertama kali dijalankan.
    """

    with connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"
        ).fetchone()

    if exists:
        return

    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    generated = False

    if not email or not password:
        email = "admin@mancova.local"
        password = secrets.token_urlsafe(9)
        generated = True

    if get_by_email(email):
        return

    create_user("Administrator", email.strip().lower(), password, role="admin")

    if generated:
        print("=" * 62)
        print(" AKUN ADMIN DIBUAT (hanya ditampilkan sekali)")
        print(f"   Email     : {email}")
        print(f"   Kata sandi: {password}")
        print(" Atur ADMIN_EMAIL / ADMIN_PASSWORD untuk memakai akun sendiri.")
        print("=" * 62)


def set_role(user_id: int, role: str) -> None:
    with connect() as conn:
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))


def set_password(user_id: int, new_password: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(new_password), user_id),
        )


def check_password(user_id: int, password: str) -> bool:
    row = get_by_id(user_id)
    return bool(row) and verify_password(password, row["password_hash"])


def delete_user(user_id: int) -> None:
    """Hapus akun. Riwayat analisis/kuesioner tetap ada (user_id menjadi NULL)."""
    with connect() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def update_profile(user_id: int, name: str | None = None, email: str | None = None) -> None:
    """Ubah nama dan/atau email. Email harus unik (tanpa membedakan huruf besar/kecil)."""
    sets, args = [], []
    if name is not None:
        sets.append("name = ?")
        args.append(name)
    if email is not None:
        sets.append("email = ?")
        args.append(email)
    if not sets:
        return
    with connect() as conn:
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", (*args, user_id))
