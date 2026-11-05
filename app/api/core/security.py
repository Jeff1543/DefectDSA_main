"""
Hashing kata sandi (scrypt) dan token bertanda tangan HMAC — hanya memakai
pustaka standar Python.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from functools import lru_cache

from app.api.core.config import DATA_DIR

TOKEN_TTL_SECONDS = 7 * 24 * 3600

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


@lru_cache(maxsize=1)
def _secret() -> bytes:
    env = os.environ.get("APP_SECRET")
    if env:
        return env.encode("utf-8")

    path = DATA_DIR / "secret.key"
    if path.exists():
        return path.read_bytes()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key = secrets.token_bytes(32)
    path.write_bytes(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=32,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
        return hmac.compare_digest(digest, bytes.fromhex(hash_hex))
    except Exception:
        return False


# Hash tiruan agar waktu respons login sama baik email ada maupun tidak.
DUMMY_HASH = hash_password("dummy-password-for-timing")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: int, ttl: int = TOKEN_TTL_SECONDS) -> str:
    payload = _b64(
        json.dumps(
            {"uid": user_id, "exp": int(time.time()) + ttl},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = _b64(
        hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_token(token: str) -> int | None:
    try:
        payload, signature = token.split(".", 1)
        expected = _b64(
            hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_unb64(payload))
        if int(data["exp"]) < time.time():
            return None
        return int(data["uid"])
    except Exception:
        return None
