import csv
import io

from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.api.deps import require_admin, require_user
from app.api.services import history_service as hs
from app.api.services.questionnaire_service import KECAMATAN
from app.api.services.user_service import (
    EMAIL_RE,
    create_user,
    delete_user,
    get_by_email,
    get_by_id,
    list_users_with_counts,
    public_user,
    set_password,
    set_role,
    update_profile,
)
from app.api.utils.errors import ConflictError, ForbiddenError, NotFoundError

router = APIRouter(prefix="/api", tags=["Dashboard"])


def _csv_response(rows: list[dict], filename: str) -> Response:
    out = io.StringIO()
    if rows:
        writer = csv.DictWriter(out, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow({k: _safe_cell(v) for k, v in row.items()})
    return Response(
        content="\ufeff" + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _safe_cell(value):
    # Cegah CSV/formula injection saat dibuka di Excel
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


# ---------- untuk semua pengguna yang login: riwayat milik sendiri ----------

@router.get("/me/analyses")
def my_analyses(
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(require_user),
):
    items, total = hs.list_analyses(user_id=user["id"], limit=limit, offset=offset)
    return {"success": True, "items": items, "total": total}


@router.get("/me/analyses/{analysis_id}")
def my_analysis_detail(analysis_id: int, user=Depends(require_user)):
    return {"success": True, "item": hs.get_analysis(analysis_id, user_id=user["id"])}


# ---------- khusus admin ----------

@router.get("/admin/overview")
def admin_overview(admin=Depends(require_admin)):
    return {"success": True, **hs.overview()}


@router.get("/admin/analyses")
def admin_analyses(
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin=Depends(require_admin),
):
    items, total = hs.list_analyses(limit=limit, offset=offset)
    return {"success": True, "items": items, "total": total}


@router.get("/admin/analyses/{analysis_id}")
def admin_analysis_detail(analysis_id: int, admin=Depends(require_admin)):
    return {"success": True, "item": hs.get_analysis(analysis_id)}


@router.get("/admin/questionnaires")
def admin_questionnaires(
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin=Depends(require_admin),
):
    items, total = hs.list_questionnaires(limit=limit, offset=offset)
    return {"success": True, "items": items, "total": total}


@router.get("/admin/questionnaires/{qid}")
def admin_questionnaire_detail(qid: int, admin=Depends(require_admin)):
    return {"success": True, "item": hs.get_questionnaire(qid)}


@router.get("/admin/users")
def admin_users(admin=Depends(require_admin)):
    return {"success": True, "items": list_users_with_counts()}


@router.get("/admin/export/questionnaires.csv")
def export_questionnaires(admin=Depends(require_admin)):
    return _csv_response(hs.export_questionnaires(), "kuesioner.csv")


@router.get("/admin/export/analyses.csv")
def export_analyses(admin=Depends(require_admin)):
    return _csv_response(hs.export_analyses(), "analisis.csv")


def _clean_email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("Format email belum valid.")
    return v


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["admin", "peneliti"] = "peneliti"

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _clean_email(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: str | None = Field(default=None, max_length=200)
    role: Literal["admin", "peneliti"] | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return None if v is None else _clean_email(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return None if v is None else v.strip()


def _target(user_id: int, admin: dict):
    row = get_by_id(user_id)
    if row is None:
        raise NotFoundError("Pengguna tidak ditemukan.")
    return row


@router.post("/admin/users", status_code=201)
def admin_create_user(body: UserCreate, admin=Depends(require_admin)):
    if get_by_email(body.email):
        raise ConflictError("Email sudah terdaftar.")
    row = create_user(body.name, body.email, body.password, role=body.role)
    return {"success": True, "user": public_user(row)}


@router.patch("/admin/users/{user_id}")
def admin_update_user(user_id: int, body: UserUpdate, admin=Depends(require_admin)):
    target = _target(user_id, admin)

    if body.role is not None and body.role != target["role"]:
        if user_id == admin["id"]:
            raise ForbiddenError("Anda tidak dapat mengubah peran akun Anda sendiri.")

    if body.email is not None and body.email != target["email"].lower():
        other = get_by_email(body.email)
        if other and other["id"] != user_id:
            raise ConflictError("Email sudah dipakai akun lain.")

    update_profile(user_id, name=body.name, email=body.email)

    if body.role is not None and body.role != target["role"]:
        set_role(user_id, body.role)

    if body.password is not None:
        set_password(user_id, body.password)

    return {"success": True, "user": public_user(get_by_id(user_id))}


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin=Depends(require_admin)):
    _target(user_id, admin)

    if user_id == admin["id"]:
        raise ForbiddenError("Anda tidak dapat menghapus akun Anda sendiri.")

    delete_user(user_id)
    return {"success": True}


# ---------- hapus analisis ----------

@router.delete("/admin/analyses/{analysis_id}")
def admin_delete_analysis(analysis_id: int, admin=Depends(require_admin)):
    hs.delete_analysis(analysis_id)
    return {"success": True}


# ---------- ubah / hapus respons kuesioner ----------

class IdentitasUpdate(BaseModel):
    nama: str | None = Field(default=None, min_length=2, max_length=100)
    umur: int | None = Field(default=None, ge=10, le=100)
    jk: Literal["Laki-laki", "Perempuan"] | None = None
    telepon: str | None = Field(default=None, min_length=8, max_length=20)
    alamat: str | None = Field(default=None, min_length=5, max_length=300)
    kecamatan: str | None = None
    pengalaman: str | None = Field(default=None, min_length=1, max_length=60)

    @field_validator("kecamatan")
    @classmethod
    def _kec(cls, v):
        if v is not None and v not in KECAMATAN:
            raise ValueError("Kecamatan tidak valid.")
        return v

    @field_validator("nama", "alamat", "pengalaman", "telepon")
    @classmethod
    def _strip(cls, v):
        return None if v is None else v.strip()


@router.patch("/admin/questionnaires/{qid}")
def admin_update_questionnaire(qid: int, body: IdentitasUpdate, admin=Depends(require_admin)):
    changes = body.model_dump(exclude_none=True)
    if changes:
        hs.update_questionnaire_identity(qid, changes)
    return {"success": True, "item": hs.get_questionnaire(qid)}


@router.delete("/admin/questionnaires/{qid}")
def admin_delete_questionnaire(qid: int, admin=Depends(require_admin)):
    hs.delete_questionnaire(qid)
    return {"success": True}
