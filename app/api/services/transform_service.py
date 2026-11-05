"""
Transformasi data untuk membantu memenuhi asumsi (normalitas, homogenitas ragam, dst).
Transformasi diterapkan hanya pada salinan data yang dianalisis; ringkasan visual
dan statistik deskriptif tetap memakai nilai asli.
"""

import numpy as np
import pandas as pd
from scipy import stats

from app.api.utils.errors import VariableError

LABELS = {
    "log": "log(x)",
    "log1p": "log(x + 1)",
    "sqrt": "akar kuadrat (√x)",
    "inverse": "kebalikan (1/x)",
    "square": "kuadrat (x²)",
    "boxcox": "Box-Cox",
}


def allowed_for(series: pd.Series) -> list[str]:
    values = pd.to_numeric(series, errors="coerce").dropna()
    if values.empty:
        return []

    lo = float(values.min())
    allowed = []
    if lo > 0:
        allowed.append("log")
    if lo > -1:
        allowed.append("log1p")
    if lo >= 0:
        allowed.append("sqrt")
    if lo != 0 and (values != 0).all():
        allowed.append("inverse")
    allowed.append("square")
    if lo > 0 and values.nunique() > 1:
        allowed.append("boxcox")
    return allowed


def _recommend(series: pd.Series, allowed: list[str]) -> str | None:
    values = pd.to_numeric(series, errors="coerce").dropna()
    if len(values) < 3 or values.nunique() < 3:
        return None

    skew = float(stats.skew(values, bias=False))
    if skew > 0.75:
        for choice in ("log", "log1p", "sqrt"):
            if choice in allowed:
                return choice
    if skew < -0.75 and "square" in allowed:
        return "square"
    return None


def hints(df: pd.DataFrame, dependent: list[str], covariates: list[str]) -> list[dict]:
    out = []
    for role, names in (("dependen", dependent), ("kovariat", covariates)):
        for name in names:
            values = pd.to_numeric(df[name], errors="coerce").dropna()
            allowed = allowed_for(df[name])
            skew = (
                float(stats.skew(values, bias=False))
                if len(values) >= 3 and values.nunique() > 1
                else None
            )
            out.append({
                "variable": name,
                "role": role,
                "skewness": skew,
                "recommended": _recommend(df[name], allowed),
                "allowed": [{"code": c, "label": LABELS[c]} for c in allowed],
            })
    return out


def apply(df: pd.DataFrame, transforms: dict[str, str], numeric_roles: set[str]):
    """Mengembalikan (df baru, info). Kolom yang tidak valid memunculkan VariableError."""

    if not transforms:
        return df, {}

    out = df.copy()
    info = {}

    for name, method in transforms.items():
        if method in ("", "none", None):
            continue

        if name not in numeric_roles:
            raise VariableError(
                f"Transformasi hanya untuk variabel dependen atau kovariat numerik: '{name}'."
            )
        if method not in LABELS:
            raise VariableError(f"Jenis transformasi '{method}' tidak dikenal.")

        series = pd.to_numeric(out[name], errors="coerce")
        if method not in allowed_for(series):
            raise VariableError(
                f"Transformasi {LABELS[method]} tidak dapat dipakai pada '{name}' "
                "karena ada nilai yang tidak memenuhi syaratnya (mis. nol atau negatif)."
            )

        lam = None
        if method == "log":
            out[name] = np.log(series)
        elif method == "log1p":
            out[name] = np.log1p(series)
        elif method == "sqrt":
            out[name] = np.sqrt(series)
        elif method == "inverse":
            out[name] = 1.0 / series
        elif method == "square":
            out[name] = series ** 2
        elif method == "boxcox":
            valid = series.dropna()
            transformed, lam = stats.boxcox(valid.to_numpy())
            out.loc[valid.index, name] = transformed
            lam = float(lam)

        info[name] = {"method": method, "label": LABELS[method], "lambda": lam}

    return out, info
