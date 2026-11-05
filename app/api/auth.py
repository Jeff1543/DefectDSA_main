import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator

from app.api.deps import require_user
from app.api.core.security import (
    DUMMY_HASH,
    create_token,
    verify_password,
)
from app.api.services.user_service import (
    EMAIL_RE,
    check_password,
    create_user,
    get_by_email,
    public_user,
    set_password,
)
from app.api.utils.errors import AuthError, ConflictError, RateLimitError

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Pembatasan percobaan login gagal (in-memory, cukup untuk prototipe satu proses)
_FAILS: dict[str, list[float]] = defaultdict(list)
_MAX_FAILS = 8
_WINDOW = 10 * 60


def _throttle_key(request: Request, email: str) -> str:
    host = request.client.host if request.client else "?"
    return f"{host}|{email}"


def _check_throttle(key: str) -> None:
    now = time.time()
    _FAILS[key] = [t for t in _FAILS[key] if now - t < _WINDOW]
    if len(_FAILS[key]) >= _MAX_FAILS:
        raise RateLimitError(
            "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit."
        )


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Format email belum valid.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=128)


@router.post("/register")
def register(body: RegisterRequest):
    if get_by_email(body.email):
        raise ConflictError("Email sudah terdaftar. Silakan masuk.")

    row = create_user(body.name, body.email, body.password, role="peneliti")

    return {
        "success": True,
        "token": create_token(row["id"]),
        "user": public_user(row),
    }


@router.post("/login")
def login(body: LoginRequest, request: Request):
    email = body.email.strip().lower()
    key = _throttle_key(request, email)
    _check_throttle(key)

    row = get_by_email(email)
    ok = verify_password(body.password, row["password_hash"] if row else DUMMY_HASH)

    if not row or not ok:
        _FAILS[key].append(time.time())
        raise AuthError("Email atau kata sandi salah.")

    _FAILS.pop(key, None)

    return {
        "success": True,
        "token": create_token(row["id"]),
        "user": public_user(row),
    }


@router.get("/me")
def me(user=Depends(require_user)):
    return {"success": True, "user": public_user(user)}


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, user=Depends(require_user)):
    if not check_password(user["id"], body.current_password):
        raise AuthError("Kata sandi saat ini salah.")

    set_password(user["id"], body.new_password)
    return {"success": True}
