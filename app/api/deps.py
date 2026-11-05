from fastapi import Depends, Header

from app.api.core.security import verify_token
from app.api.services.user_service import get_by_id
from app.api.utils.errors import AuthError, ForbiddenError


def get_current_user_optional(authorization: str | None = Header(default=None)):
    """Pengguna dari header 'Authorization: Bearer <token>', atau None (tamu)."""

    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    user_id = verify_token(authorization[7:].strip())
    if user_id is None:
        return None

    row = get_by_id(user_id)
    return dict(row) if row else None


def require_user(user=Depends(get_current_user_optional)):
    if user is None:
        raise AuthError("Sesi tidak valid atau telah berakhir. Silakan masuk kembali.")
    return user


def require_admin(user=Depends(require_user)):
    if user["role"] != "admin":
        raise ForbiddenError("Fitur ini hanya untuk administrator.")
    return user
