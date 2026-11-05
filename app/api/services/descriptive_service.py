"""
Statistika deskriptif: ringkasan numerik, tabel frekuensi kategorik,
perbandingan antar kelompok, dan korelasi. Tidak memerlukan data bersih:
data kosong dilaporkan apa adanya (n valid dan jumlah kosong).
"""

import numpy as np
import pandas as pd
from scipy import stats

from app.api.core.config import MAX_FACTOR_LEVELS
from app.api.utils.errors import VariableError

MAX_VARIABLES = 60
MAX_GROUPS = 20
TOP_CATEGORIES = 15


def _f(value):
    """float aman JSON (NaN/inf -> None)."""
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if np.isfinite(value) else None


def _numeric_summary(series: pd.Series) -> dict:
    total = int(len(series))
    values = pd.to_numeric(series, errors="coerce").dropna().astype(float)
    n = int(len(values))

    out = {
        "type": "numeric",
        "n": n,
        "missing": total - n,
        "missing_pct": round((total - n) / total * 100, 2) if total else 0.0,
    }

    if n == 0:
        return {**out, "empty": True}

    q1, median, q3 = (float(x) for x in np.percentile(values, [25, 50, 75]))
    iqr = q3 - q1
    mean = float(values.mean())
    std = float(values.std(ddof=1)) if n > 1 else None

    lower_fence, upper_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    inside = values[(values >= lower_fence) & (values <= upper_fence)]
    outliers = int(n - len(inside))

    modes = values.mode()
    mode = _f(modes.iloc[0]) if len(modes) and values.value_counts().iloc[0] > 1 else None

    out.update({
        "mean": _f(mean),
        "median": _f(median),
        "mode": mode,
        "std": _f(std),
        "variance": _f(std ** 2) if std is not None else None,
        "sem": _f(std / np.sqrt(n)) if std is not None else None,
        "min": _f(values.min()),
        "q1": _f(q1),
        "q3": _f(q3),
        "max": _f(values.max()),
        "range": _f(values.max() - values.min()),
        "iqr": _f(iqr),
        "sum": _f(values.sum()),
        "cv_pct": _f(std / mean * 100) if std is not None and mean != 0 else None,
        "skewness": _f(stats.skew(values, bias=False)) if n >= 3 and values.nunique() > 1 else None,
        "kurtosis": _f(stats.kurtosis(values, bias=False)) if n >= 4 and values.nunique() > 1 else None,
        "whisker_low": _f(inside.min()) if len(inside) else None,
        "whisker_high": _f(inside.max()) if len(inside) else None,
        "outliers": outliers,
    })

    # Uji normalitas sebagai informasi tambahan
    if 3 <= n <= 5000 and values.nunique() > 1:
        _, p = stats.shapiro(values)
        out["shapiro_p"] = _f(p)

    # Histogram
    if values.nunique() > 1:
        bins = int(min(20, max(5, np.ceil(np.log2(n) + 1))))
        counts, edges = np.histogram(values, bins=bins)
        out["histogram"] = {
            "counts": [int(c) for c in counts],
            "edges": [float(e) for e in edges],
        }
    else:
        out["histogram"] = None

    return out


def _categorical_summary(series: pd.Series) -> dict:
    total = int(len(series))
    valid = series.dropna().astype(str)
    n = int(len(valid))

    counts = valid.value_counts()
    top = counts.head(TOP_CATEGORIES)
    table = [
        {"value": str(k), "count": int(v), "percent": round(v / n * 100, 2)}
        for k, v in top.items()
    ]
    other = int(counts.iloc[TOP_CATEGORIES:].sum()) if len(counts) > TOP_CATEGORIES else 0
    if other:
        table.append({"value": "Lainnya", "count": other, "percent": round(other / n * 100, 2)})

    return {
        "type": "categorical",
        "n": n,
        "missing": total - n,
        "missing_pct": round((total - n) / total * 100, 2) if total else 0.0,
        "unique": int(counts.size),
        "mode": str(counts.index[0]) if len(counts) else None,
        "frequency": table,
    }


class DescriptiveService:

    @staticmethod
    def describe(df: pd.DataFrame, variables: list[str], group_by: str | None = None) -> dict:

        if len(set(variables)) != len(variables):
            raise VariableError("Variabel tidak boleh dipilih lebih dari sekali.")

        if len(variables) > MAX_VARIABLES:
            raise VariableError(f"Maksimal {MAX_VARIABLES} variabel dalam satu analisis.")

        missing = [v for v in variables + ([group_by] if group_by else []) if v not in df.columns]
        if missing:
            raise VariableError("Variabel tidak ditemukan dalam dataset: " + ", ".join(missing))

        summaries = []
        for name in variables:
            series = df[name]
            if pd.api.types.is_numeric_dtype(series):
                summaries.append({"name": name, **_numeric_summary(series)})
            else:
                summaries.append({"name": name, **_categorical_summary(series)})

        result = {
            "n_rows": int(len(df)),
            "variables": summaries,
            "groups": None,
            "correlation": None,
        }

        numeric_names = [s["name"] for s in summaries if s["type"] == "numeric" and not s.get("empty")]

        # ---- perbandingan antar kelompok ----
        if group_by:
            col = df[group_by]
            levels = col.dropna().astype(str).unique().tolist()

            if len(levels) < 2:
                raise VariableError(f"Variabel pengelompokan '{group_by}' hanya memiliki 1 kategori.")
            if len(levels) > MAX_GROUPS:
                raise VariableError(
                    f"Variabel pengelompokan '{group_by}' memiliki {len(levels)} kategori "
                    f"(maksimal {MAX_GROUPS}). Pilih kolom yang lebih ringkas."
                )
            if pd.api.types.is_numeric_dtype(col) and col.nunique(dropna=True) > MAX_FACTOR_LEVELS:
                raise VariableError(
                    f"Kolom numerik '{group_by}' memiliki terlalu banyak nilai unik untuk dijadikan kelompok."
                )

            levels = sorted(levels, key=lambda x: (len(x), x))
            keys = col.astype("string")
            table = {}
            for name in numeric_names:
                rows = []
                for lv in levels:
                    vals = pd.to_numeric(df.loc[keys == lv, name], errors="coerce").dropna()
                    rows.append({
                        "group": lv,
                        "n": int(len(vals)),
                        "mean": _f(vals.mean()) if len(vals) else None,
                        "std": _f(vals.std(ddof=1)) if len(vals) > 1 else None,
                        "min": _f(vals.min()) if len(vals) else None,
                        "median": _f(vals.median()) if len(vals) else None,
                        "max": _f(vals.max()) if len(vals) else None,
                    })
                table[name] = rows

            result["groups"] = {"by": group_by, "levels": levels, "stats": table}

        # ---- korelasi ----
        if len(numeric_names) >= 2:
            numeric_df = df[numeric_names].apply(pd.to_numeric, errors="coerce")
            matrix = []
            for a in numeric_names:
                row = []
                for b in numeric_names:
                    pair = numeric_df[[a, b]].dropna()
                    if a == b:
                        row.append(1.0)
                    elif len(pair) >= 3 and pair[a].nunique() > 1 and pair[b].nunique() > 1:
                        row.append(_f(pair[a].corr(pair[b])))
                    else:
                        row.append(None)
                matrix.append(row)
            result["correlation"] = {"variables": numeric_names, "matrix": matrix}

        return result
