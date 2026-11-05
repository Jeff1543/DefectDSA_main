"""
Penyimpanan & agregasi riwayat analisis ragam dan respons kuesioner.
Dipakai oleh dashboard peneliti/admin.
"""

import hashlib
import hmac
import json
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone

from app.api.core.db import connect
from app.api.services.questionnaire_service import KATEGORI, KECAMATAN
from app.api.services.user_service import now_iso
from app.api.utils.errors import NotFoundError


def _loads(text, default=None):
    try:
        return json.loads(text)
    except Exception:
        return default


# ------------------------------------------------------------------
# ANALISIS
# ------------------------------------------------------------------

def save_analysis(
    user_id,
    filename,
    n_rows,
    dependent_vars,
    independent_vars,
    covariates,
    payload: dict,
) -> int:
    method = payload["method"]["code"]
    summary = payload["assumptions"].get("summary", {})
    evaluated = summary.get("evaluated", 0)

    if evaluated:
        assumptions_met = 1 if payload["assumptions"].get("assumptions_met") else 0
    else:
        assumptions_met = None

    significant = sum(
        1
        for e in payload.get("effects", [])
        if e.get("significant") and e.get("effect_type") != "intercept"
    )

    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO analyses
              (user_id, method, filename, n_rows, dependent_vars, independent_vars,
               covariates, assumptions_met, significant_effects, result_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                method,
                filename,
                n_rows,
                json.dumps(dependent_vars),
                json.dumps(independent_vars),
                json.dumps(covariates),
                assumptions_met,
                significant,
                json.dumps(payload),
                now_iso(),
            ),
        )
        return cur.lastrowid


def save_descriptive(user_id, filename, n_rows, variables, group_by, payload: dict) -> int:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO analyses
              (user_id, method, filename, n_rows, dependent_vars, independent_vars,
               covariates, assumptions_met, significant_effects, result_json, created_at)
            VALUES (?, 'STATDES', ?, ?, ?, ?, ?, NULL, 0, ?, ?)
            """,
            (
                user_id,
                filename,
                n_rows,
                json.dumps(variables),
                json.dumps([group_by] if group_by else []),
                json.dumps([]),
                json.dumps(payload),
                now_iso(),
            ),
        )
        return cur.lastrowid


def _analysis_row(r) -> dict:
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "user_id": r["user_id"],
        "user_name": r["user_name"],
        "user_email": r["user_email"],
        "method": r["method"],
        "filename": r["filename"],
        "n_rows": r["n_rows"],
        "dependent_vars": _loads(r["dependent_vars"], []),
        "independent_vars": _loads(r["independent_vars"], []),
        "covariates": _loads(r["covariates"], []),
        "assumptions_met": (
            None if r["assumptions_met"] is None else bool(r["assumptions_met"])
        ),
        "significant_effects": r["significant_effects"],
    }


_ANALYSIS_SELECT = """
SELECT a.id, a.created_at, a.user_id, a.method, a.filename, a.n_rows,
       a.dependent_vars, a.independent_vars, a.covariates,
       a.assumptions_met, a.significant_effects,
       u.name AS user_name, u.email AS user_email
FROM analyses a LEFT JOIN users u ON u.id = a.user_id
"""


def list_analyses(user_id=None, limit=25, offset=0):
    where, args = "", []
    if user_id is not None:
        where, args = "WHERE a.user_id = ?", [user_id]

    with connect() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM analyses a {where}", args
        ).fetchone()[0]
        rows = conn.execute(
            f"{_ANALYSIS_SELECT} {where} ORDER BY a.id DESC LIMIT ? OFFSET ?",
            args + [limit, offset],
        ).fetchall()

    return [_analysis_row(r) for r in rows], total


def get_analysis(analysis_id: int, user_id=None) -> dict:
    where, args = "WHERE a.id = ?", [analysis_id]
    if user_id is not None:
        where += " AND a.user_id = ?"
        args.append(user_id)

    with connect() as conn:
        row = conn.execute(
            f"{_ANALYSIS_SELECT} {where}", args
        ).fetchone()
        result = conn.execute(
            "SELECT result_json FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()

    if row is None or result is None:
        raise NotFoundError("Analisis tidak ditemukan.")

    return {**_analysis_row(row), "result": _loads(result["result_json"], {})}


# ------------------------------------------------------------------
# KUESIONER
# ------------------------------------------------------------------

def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def save_questionnaire(
    user_id, identitas: dict, jawaban: dict, scores: dict,
    replace_id=None, replace_key=None,
):
    """
    Menyimpan respons kuesioner. Mengembalikan (id, edit_key).

    Bila replace_id + replace_key valid (kunci dikembalikan saat penyimpanan
    pertama), respons yang sama diperbarui — bukan dibuat ganda — sehingga
    responden bisa memperbaiki jawabannya tanpa menggandakan data.
    """

    fields = (
        json.dumps(identitas),
        json.dumps(jawaban),
        json.dumps(scores),
        identitas.get("kecamatan"),
        identitas.get("jk"),
        scores["rata_total"],
        scores["label_total"],
    )

    with connect() as conn:
        if replace_id is not None and replace_key:
            row = conn.execute(
                "SELECT edit_key_hash FROM questionnaires WHERE id = ?",
                (replace_id,),
            ).fetchone()

            if row and row["edit_key_hash"] and hmac.compare_digest(
                row["edit_key_hash"], _hash_key(replace_key)
            ):
                conn.execute(
                    """
                    UPDATE questionnaires SET respondent = ?, answers = ?, scores = ?,
                      kecamatan = ?, jenis_kelamin = ?, overall_mean = ?, overall_label = ?
                    WHERE id = ?
                    """,
                    fields + (replace_id,),
                )
                return replace_id, replace_key

        edit_key = secrets.token_urlsafe(16)
        cur = conn.execute(
            """
            INSERT INTO questionnaires
              (user_id, respondent, answers, scores, kecamatan, jenis_kelamin,
               overall_mean, overall_label, edit_key_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id,) + fields + (_hash_key(edit_key), now_iso()),
        )
        return cur.lastrowid, edit_key


def _quest_summary(r) -> dict:
    who = _loads(r["respondent"], {})
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "nama": who.get("nama"),
        "umur": who.get("umur"),
        "jk": r["jenis_kelamin"],
        "kecamatan": r["kecamatan"],
        "rata_total": r["overall_mean"],
        "persen_total": round(r["overall_mean"] / 5 * 100, 2),
        "label_total": r["overall_label"],
        "user_name": r["user_name"],
    }


_QUEST_SELECT = """
SELECT q.id, q.created_at, q.respondent, q.kecamatan, q.jenis_kelamin,
       q.overall_mean, q.overall_label, u.name AS user_name
FROM questionnaires q LEFT JOIN users u ON u.id = q.user_id
"""


def list_questionnaires(limit=25, offset=0):
    with connect() as conn:
        total = conn.execute("SELECT COUNT(*) FROM questionnaires").fetchone()[0]
        rows = conn.execute(
            f"{_QUEST_SELECT} ORDER BY q.id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_quest_summary(r) for r in rows], total


def get_questionnaire(qid: int) -> dict:
    with connect() as conn:
        row = conn.execute(
            f"{_QUEST_SELECT} WHERE q.id = ?", (qid,)
        ).fetchone()
        extra = conn.execute(
            "SELECT respondent, answers, scores FROM questionnaires WHERE id = ?",
            (qid,),
        ).fetchone()

    if row is None or extra is None:
        raise NotFoundError("Respons kuesioner tidak ditemukan.")

    return {
        **_quest_summary(row),
        "identitas": _loads(extra["respondent"], {}),
        "jawaban": _loads(extra["answers"], {}),
        "skor": _loads(extra["scores"], {}),
    }


def export_questionnaires() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            f"{_QUEST_SELECT} ORDER BY q.id"
        ).fetchall()
        raw = {
            r["id"]: r
            for r in conn.execute(
                "SELECT id, respondent, scores FROM questionnaires"
            ).fetchall()
        }

    out = []
    for r in rows:
        who = _loads(raw[r["id"]]["respondent"], {})
        sc = _loads(raw[r["id"]]["scores"], {})
        row = {
            "id": r["id"],
            "waktu": r["created_at"],
            "nama": who.get("nama"),
            "umur": who.get("umur"),
            "jenis_kelamin": r["jenis_kelamin"],
            "kecamatan": r["kecamatan"],
            "pengalaman_beternak": who.get("pengalaman"),
        }
        for k in sc.get("kategori", []):
            row[f"skor_{k['id']}"] = k["rata"]
        row["skor_total"] = r["overall_mean"]
        row["kategori_total"] = r["overall_label"]
        out.append(row)
    return out


def export_analyses() -> list[dict]:
    rows, _ = list_analyses(limit=100000, offset=0)
    return [
        {
            "id": a["id"],
            "waktu": a["created_at"],
            "pengguna": a["user_name"] or "Tamu",
            "metode": a["method"],
            "file": a["filename"],
            "jumlah_baris": a["n_rows"],
            "dependen": ", ".join(a["dependent_vars"]),
            "independen": ", ".join(a["independent_vars"]),
            "kovariat": ", ".join(a["covariates"]),
            "asumsi_terpenuhi": a["assumptions_met"],
            "efek_signifikan": a["significant_effects"],
        }
        for a in rows
    ]


# ------------------------------------------------------------------
# HAPUS / UBAH (admin)
# ------------------------------------------------------------------

def delete_analysis(analysis_id: int) -> None:
    with connect() as conn:
        cur = conn.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        if cur.rowcount == 0:
            raise NotFoundError("Analisis tidak ditemukan.")


def delete_questionnaire(qid: int) -> None:
    with connect() as conn:
        cur = conn.execute("DELETE FROM questionnaires WHERE id = ?", (qid,))
        if cur.rowcount == 0:
            raise NotFoundError("Respons kuesioner tidak ditemukan.")


def update_questionnaire_identity(qid: int, changes: dict) -> None:
    """
    Memperbarui identitas responden (nama, umur, jk, telepon, alamat, kecamatan,
    pengalaman). Jawaban dan skor TIDAK berubah, sehingga indeks tetap konsisten.
    """
    with connect() as conn:
        row = conn.execute(
            "SELECT respondent FROM questionnaires WHERE id = ?", (qid,)
        ).fetchone()
        if row is None:
            raise NotFoundError("Respons kuesioner tidak ditemukan.")

        who = _loads(row["respondent"], {})
        who.update(changes)

        conn.execute(
            "UPDATE questionnaires SET respondent = ?, kecamatan = ?, jenis_kelamin = ? WHERE id = ?",
            (json.dumps(who), who.get("kecamatan"), who.get("jk"), qid),
        )


# ------------------------------------------------------------------
# RINGKASAN DASHBOARD ADMIN
# ------------------------------------------------------------------

def overview() -> dict:
    with connect() as conn:
        n_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        q_rows = conn.execute(
            "SELECT respondent, scores, kecamatan, jenis_kelamin, overall_mean, "
            "overall_label, created_at FROM questionnaires"
        ).fetchall()
        a_rows = conn.execute(
            "SELECT method, assumptions_met, significant_effects, created_at FROM analyses"
        ).fetchall()

    # ---- kuesioner ----
    sums = {kid: 0.0 for kid, _, _ in KATEGORI}
    for r in q_rows:
        for k in _loads(r["scores"], {}).get("kategori", []):
            if k["id"] in sums:
                sums[k["id"]] += k["rata"]

    n_q = len(q_rows)
    avg_by_category = []
    for kid, judul, singkat in KATEGORI:
        rata = sums[kid] / n_q if n_q else None
        avg_by_category.append(
            {
                "id": kid,
                "judul": judul,
                "singkat": singkat,
                "rata": round(rata, 3) if rata is not None else None,
                "persen": round(rata / 5 * 100, 1) if rata is not None else None,
            }
        )

    labels = ["Sangat Baik", "Baik", "Cukup", "Kurang", "Sangat Kurang"]
    dist = Counter(r["overall_label"] for r in q_rows)

    by_kec = []
    for kec in KECAMATAN:
        rows = [r for r in q_rows if r["kecamatan"] == kec]
        by_kec.append(
            {
                "kecamatan": kec,
                "jumlah": len(rows),
                "rata": (
                    round(sum(r["overall_mean"] for r in rows) / len(rows), 3)
                    if rows
                    else None
                ),
            }
        )

    gender = Counter(r["jenis_kelamin"] for r in q_rows)
    ages = [
        a
        for a in (_loads(r["respondent"], {}).get("umur") for r in q_rows)
        if isinstance(a, (int, float))
    ]

    # ---- analisis ----
    by_method = Counter(r["method"] for r in a_rows)
    evaluated = [r for r in a_rows if r["assumptions_met"] is not None]

    # ---- aktivitas 14 hari terakhir ----
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    activity = {d.isoformat(): {"analisis": 0, "kuesioner": 0} for d in days}
    for r in a_rows:
        key = (r["created_at"] or "")[:10]
        if key in activity:
            activity[key]["analisis"] += 1
    for r in q_rows:
        key = (r["created_at"] or "")[:10]
        if key in activity:
            activity[key]["kuesioner"] += 1

    recent_a, _ = list_analyses(limit=5)
    recent_q, _ = list_questionnaires(limit=5)

    return {
        "totals": {
            "pengguna": n_users,
            "analisis": len(a_rows),
            "kuesioner": n_q,
        },
        "kuesioner": {
            "rata_total": (
                round(sum(r["overall_mean"] for r in q_rows) / n_q, 3) if n_q else None
            ),
            "rata_umur": round(sum(ages) / len(ages), 1) if ages else None,
            "per_kategori": avg_by_category,
            "distribusi": [{"label": l, "jumlah": dist.get(l, 0)} for l in labels],
            "per_kecamatan": by_kec,
            "per_jk": [{"jk": k, "jumlah": v} for k, v in gender.items() if k],
        },
        "analisis": {
            "per_metode": [
                {"metode": m, "jumlah": by_method.get(m, 0)}
                for m in ["STATDES", "ANOVA", "ANCOVA", "MANOVA", "MANCOVA", "Regresi Linier"]
            ],
            "asumsi_terpenuhi": sum(1 for r in evaluated if r["assumptions_met"]),
            "asumsi_dievaluasi": len(evaluated),
            "dengan_efek_signifikan": sum(
                1 for r in a_rows if r["significant_effects"] > 0
            ),
        },
        "aktivitas": [
            {"tanggal": d, **v} for d, v in activity.items()
        ],
        "terbaru": {"analisis": recent_a, "kuesioner": recent_q},
    }
