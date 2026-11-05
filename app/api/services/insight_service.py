"""
Fakta dan data grafik untuk bagian "Wawasan & Interpretasi" — dihitung dari data
ASLI (satuan asli, sebelum transformasi) agar mudah dipahami pengguna.
"""

import numpy as np
import pandas as pd
from scipy import stats

MAX_GROUPS = 12
MAX_POINTS = 150


def _f(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if np.isfinite(x) else None


def _box(values: pd.Series) -> dict:
    v = values.dropna().astype(float)
    if v.empty:
        return {}
    q1, med, q3 = (float(x) for x in np.percentile(v, [25, 50, 75]))
    iqr = q3 - q1
    inside = v[(v >= q1 - 1.5 * iqr) & (v <= q3 + 1.5 * iqr)]
    return {
        "n": int(len(v)),
        "mean": _f(v.mean()),
        "sd": _f(v.std(ddof=1)) if len(v) > 1 else None,
        "min": _f(v.min()),
        "q1": q1,
        "median": med,
        "q3": q3,
        "max": _f(v.max()),
        "whisker_low": _f(inside.min()) if len(inside) else None,
        "whisker_high": _f(inside.max()) if len(inside) else None,
    }


class InsightService:

    @staticmethod
    def build(df, dependent, independent, covariates, effects, tests) -> dict:
        data = df[list(dependent) + list(independent) + list(covariates)].copy()
        for c in list(dependent) + list(covariates):
            data[c] = pd.to_numeric(data[c], errors="coerce")

        effect_map = {e["effect_label"]: e for e in effects if e.get("effect_type") != "intercept"}

        # ---- partial eta-kuadrat (hanya univariat) ----
        eta = {}
        for t in tests:
            if t.get("partial_eta_sq") is not None:
                eta[t["effect_label"]] = _f(t["partial_eta_sq"])

        factors, factor_viz = [], []
        for factor in independent:
            levels = data[factor].dropna().astype(str)
            if levels.nunique() > MAX_GROUPS:
                continue
            keys = data[factor].astype("string")
            for dv in dependent:
                groups = []
                for lv in sorted(levels.unique(), key=lambda x: (len(x), x)):
                    stat = _box(data.loc[keys == lv, dv])
                    if stat:
                        groups.append({"label": lv, **stat})
                if not groups:
                    continue
                means = [g["mean"] for g in groups if g["mean"] is not None]
                top = max(groups, key=lambda g: g["mean"])
                low = min(groups, key=lambda g: g["mean"])
                diff = top["mean"] - low["mean"]
                factors.append({
                    "factor": factor, "dv": dv, "groups": groups,
                    "top": top["label"], "low": low["label"],
                    "diff": _f(diff),
                    "diff_pct": _f(diff / abs(low["mean"]) * 100) if low["mean"] else None,
                })
                factor_viz.append({"factor": factor, "dv": dv, "groups": groups})

        covs, cov_viz = [], []
        for cov in covariates:
            for dv in dependent:
                pair = data[[cov, dv]].dropna()
                if len(pair) < 3 or pair[cov].nunique() < 2 or pair[dv].nunique() < 2:
                    continue
                reg = stats.linregress(pair[cov], pair[dv])
                sample = pair.sample(min(len(pair), MAX_POINTS), random_state=1)
                covs.append({
                    "cov": cov, "dv": dv, "r": _f(reg.rvalue), "p": _f(reg.pvalue),
                    "slope": _f(reg.slope),
                })
                cov_viz.append({
                    "x": cov, "y": dv,
                    "points": [[float(a), float(b)] for a, b in zip(sample[cov], sample[dv])],
                    "slope": _f(reg.slope), "intercept": _f(reg.intercept),
                    "r": _f(reg.rvalue), "p": _f(reg.pvalue),
                })

        return {
            "facts": {
                "n_rows": int(len(df)),
                "dependent": list(dependent),
                "independent": list(independent),
                "covariates": list(covariates),
                "factors": factors,
                "covariate_relations": covs,
                "eta": eta,
            },
            "viz": {"factors": factor_viz, "covariates": cov_viz},
        }
