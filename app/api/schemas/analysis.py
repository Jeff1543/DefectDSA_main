from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ============================================================
# CLEANING
# ============================================================

class ImputeRules(BaseModel):
    numeric: Literal["mean", "median"]
    categorical: Literal["mode"]


class CleanRequest(BaseModel):
    dataset_id: str
    strategy: Literal["impute", "drop"]
    impute_rules: ImputeRules | None = None

    @model_validator(mode="after")
    def _require_impute_rules_when_imputing(self) -> "CleanRequest":
        # Dokumentasi API contract menyatakan impute_rules wajib
        # diisi ketika strategy="impute". Sebelumnya field ini
        # optional tanpa validasi tambahan, sehingga permintaan
        # strategy="impute" tanpa impute_rules tetap lolos dan
        # jatuh ke nilai default ("mean"/"mode") secara diam-diam.
        if self.strategy == "impute" and self.impute_rules is None:
            raise ValueError(
                "impute_rules wajib diisi ketika strategy='impute'."
            )
        return self


# ============================================================
# ANALYSIS
# ============================================================

class AnalyzeRequest(BaseModel):
    dataset_id: str

    # Uji yang dipilih pengguna lebih dulu di FE (langkah "Pilih Uji").
    # Opsional agar klien lama tetap jalan; bila diisi, struktur variabel
    # harus cocok dengan uji ini (divalidasi di endpoint /analyze).
    method: Literal[
        "ANOVA", "ANCOVA", "MANOVA", "MANCOVA", "Regresi Linier"
    ] | None = None

    dependent_vars: list[str] = Field(
        ...,
        min_length=1,
    )

    # Kosong + kovariat/prediktor terisi + 1 dependen -> Regresi Linier
    independent_vars: list[str] = Field(default_factory=list)

    # Opsional: tanpa kovariat -> ANOVA / MANOVA
    covariates: list[str] = Field(default_factory=list)

    # Opsional: {"nama kolom": "log" | "log1p" | "sqrt" | "inverse" | "square" | "boxcox"}
    transformations: dict[str, str] = Field(default_factory=dict)


# ============================================================
# BASIC RESPONSE
# ============================================================

class SuccessResponse(BaseModel):
    success: bool = True

# ============================================================
# STATISTIKA DESKRIPTIF
# ============================================================

class DescriptiveRequest(BaseModel):
    dataset_id: str
    variables: list[str] = Field(..., min_length=1, max_length=60)
    group_by: str | None = None
