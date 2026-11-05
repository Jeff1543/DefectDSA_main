from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_current_user_optional
from app.api.services.history_service import save_questionnaire
from app.api.services.questionnaire_service import KECAMATAN, hitung_skor
from app.api.utils.errors import ValidationError

router = APIRouter(prefix="/api/questionnaire", tags=["Questionnaire"])


class Identitas(BaseModel):
    nama: str = Field(min_length=2, max_length=100)
    umur: int = Field(ge=10, le=100)
    jk: Literal["Laki-laki", "Perempuan"]
    telepon: str = Field(min_length=8, max_length=20)
    alamat: str = Field(min_length=5, max_length=300)
    kecamatan: str
    pengalaman: str = Field(min_length=1, max_length=60)

    @field_validator("kecamatan")
    @classmethod
    def _kec(cls, v: str) -> str:
        if v not in KECAMATAN:
            raise ValueError("Kecamatan tidak valid.")
        return v

    @field_validator("nama", "alamat", "pengalaman", "telepon")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class Replace(BaseModel):
    id: int
    key: str = Field(min_length=8, max_length=100)


class QuestionnaireSubmission(BaseModel):
    identitas: Identitas
    jawaban: dict[str, list[int]]
    # Diisi saat responden memperbaiki jawaban yang sudah terkirim.
    replace: Replace | None = None


@router.post("")
def submit(body: QuestionnaireSubmission, user=Depends(get_current_user_optional)):
    scores = hitung_skor(body.jawaban)  # validasi + hitung ulang di server

    qid, edit_key = save_questionnaire(
        user_id=user["id"] if user else None,
        identitas=body.identitas.model_dump(),
        jawaban=body.jawaban,
        scores=scores,
        replace_id=body.replace.id if body.replace else None,
        replace_key=body.replace.key if body.replace else None,
    )

    return {"success": True, "id": qid, "edit_key": edit_key, "scores": scores}
