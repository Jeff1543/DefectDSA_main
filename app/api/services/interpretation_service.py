import json
import os


def _n(x, d=2):
    """Angka berformat Indonesia (koma desimal)."""
    if x is None:
        return "-"
    try:
        return f"{float(x):,.{d}f}".replace(",", "§").replace(".", ",").replace("§", ".")
    except (TypeError, ValueError):
        return str(x)


def _p(p):
    if p is None:
        return "tidak tersedia"
    return "p < 0,001" if p < 0.001 else f"p = {_n(p, 3)}"


def _join(items, last="dan"):
    items = [str(i) for i in items]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {last} " + items[-1]


def _eta_word(e):
    if e is None:
        return None
    return "kecil" if e < 0.06 else "sedang" if e < 0.14 else "besar"


class InterpretationService:
    """
    Interpretasi hasil analisis dalam bahasa awam. Menggunakan Generative AI
    bila ANTHROPIC_API_KEY diset; bila tidak, atau bila gagal, memakai
    narasi berbasis aturan yang sama detailnya (FR-09: hasil tetap tampil).
    """

    _ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
    _ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    _REQUEST_TIMEOUT_SECONDS = 45
    _MAX_TOKENS = 3000

    # ------------------------------------------------------------------
    @staticmethod
    def generate(mancova_result: dict, assumption_result: dict, facts: dict | None = None) -> dict:
        api_key = os.environ.get("ANTHROPIC_API_KEY")

        if not api_key:
            out = InterpretationService.generate_fallback(mancova_result, assumption_result, facts)
            out["source"] = "fallback_rule_based"
            out["fallback_reason"] = "ANTHROPIC_API_KEY tidak diset pada environment server."
            return out

        try:
            data = InterpretationService._call_anthropic(mancova_result, assumption_result, facts, api_key)
            out = InterpretationService._normalize(data)
            out["source"] = "generative_ai"
            return out
        except Exception as exc:
            out = InterpretationService.generate_fallback(mancova_result, assumption_result, facts)
            out["source"] = "fallback_rule_based"
            out["fallback_reason"] = f"Pemanggilan Generative AI gagal ({exc.__class__.__name__}): {exc}"
            return out

    # ------------------------------------------------------------------
    @staticmethod
    def _context(mancova_result, assumption_result, facts) -> dict:
        facts = facts or {}
        return {
            "metode": (mancova_result.get("method") or {}).get("code"),
            "jumlah_data": facts.get("n_rows"),
            "variabel_dependen": mancova_result.get("dependent_vars"),
            "faktor": mancova_result.get("independent_vars"),
            "kovariat": mancova_result.get("covariates"),
            "transformasi_data": mancova_result.get("transformations") or None,
            "efek": [
                {
                    "nama": e["effect_label"], "jenis": e["effect_type"],
                    "statistik_utama": e["statistic"], "p_value": e["p_value"],
                    "signifikan": e["significant"],
                    "eta_kuadrat_parsial": (facts.get("eta") or {}).get(e["effect_label"]),
                }
                for e in mancova_result.get("effects", []) if e.get("effect_type") != "intercept"
            ],
            "rata_rata_per_kelompok": [
                {
                    "faktor": f["factor"], "variabel": f["dv"],
                    "kelompok": [{"nama": g["label"], "n": g["n"], "rata_rata": g["mean"], "sd": g["sd"]} for g in f["groups"]],
                }
                for f in facts.get("factors", [])
            ],
            "hubungan_kovariat": facts.get("covariate_relations", []),
            "model_regresi": mancova_result.get("regression"),
            "uji_asumsi": [
                {
                    "nama": t["label"], "status": t["status"], "p_value": t.get("p_value"),
                    "keputusan": t.get("decision"),
                }
                for t in assumption_result.get("tests", [])
            ],
        }

    @staticmethod
    def build_prompt(mancova_result, assumption_result, facts=None) -> str:
        ctx = json.dumps(InterpretationService._context(mancova_result, assumption_result, facts), ensure_ascii=False, indent=1)
        return f"""Anda adalah pendamping analisis data untuk peternak, mahasiswa, dan peneliti yang TIDAK terbiasa membaca hasil uji statistik. Jelaskan hasil analisis di bawah ini serinci dan sejelas mungkin dalam Bahasa Indonesia yang sederhana.

ATURAN:
1. Gunakan HANYA angka yang ada pada DATA di bawah. Jangan mengarang angka, nama variabel, atau kesimpulan.
2. Hindari istilah teknis tanpa penjelasan. Bila memakai istilah (p-value, signifikan, kovariat, asumsi), jelaskan maknanya dengan kalimat sehari-hari.
3. Untuk setiap efek, tulis pola kalimat seperti: "Dari hasil analisis, <faktor> berpengaruh secara signifikan terhadap <variabel> (p ...). Artinya <makna sehari-hari>. Rata-rata <variabel> tertinggi pada <kelompok> (<angka>) dan terendah pada <kelompok> (<angka>), selisih <angka> atau sekitar <persen>%." Jika tidak signifikan, jelaskan bahwa perbedaan yang terlihat kemungkinan hanya kebetulan dan bukan bukti adanya pengaruh.
4. Untuk kovariat, jelaskan arah hubungan (makin tinggi X cenderung makin tinggi/rendah Y) hanya jika datanya tersedia, dan jelaskan bahwa kovariat dikendalikan agar pengaruh faktor utama lebih murni.
5. Jelaskan arti praktis bagi pengguna (apa yang sebaiknya diperhatikan atau dilakukan), tetapi jangan menyimpulkan sebab-akibat.
6. Jelaskan status uji asumsi secara awam. Jika ada asumsi yang tidak terpenuhi, jelaskan dampaknya terhadap kepercayaan hasil dan sarankan langkah (mis. transformasi data, periksa pencilan, tambah sampel).
7. Bila ada transformasi data, sebutkan bahwa uji dilakukan pada data yang sudah ditransformasi sedangkan rata-rata di atas dalam satuan asli.
8. Bila "metode" adalah Regresi Linier: kovariat adalah PREDIKTOR (bukan pengendali). Jelaskan R² (berapa persen keragaman variabel dependen yang dijelaskan model), arti koefisien b (perubahan variabel dependen per kenaikan 1 satuan prediktor, prediktor lain tetap), arah hubungan, dan prediktor mana yang signifikan. Jangan menyebut faktor, kelompok, atau post-hoc.
9. Jawab HANYA dengan satu objek JSON valid (tanpa teks lain, tanpa markdown) dengan bentuk:
{{
  "narrative": "ringkasan 3-5 kalimat: apa yang diuji, hasil utamanya, dan kesimpulannya",
  "findings": [{{"effect": "<nama efek persis seperti pada DATA>", "title": "judul singkat", "explanation": "penjelasan rinci 3-6 kalimat", "significant": true}}],
  "practical": ["saran praktis 1", "saran praktis 2"],
  "assumption_summary": "penjelasan awam tentang uji asumsi dan dampaknya",
  "next_steps": ["langkah lanjutan 1", "langkah lanjutan 2"],
  "caveat": "catatan kehati-hatian atau null"
}}

DATA:
{ctx}
"""

    @staticmethod
    def _call_anthropic(mancova_result, assumption_result, facts, api_key) -> dict:
        import httpx

        prompt = InterpretationService.build_prompt(mancova_result, assumption_result, facts)

        response = httpx.post(
            InterpretationService._ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": InterpretationService._ANTHROPIC_MODEL,
                "max_tokens": InterpretationService._MAX_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=InterpretationService._REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()

        text = "\n".join(
            b["text"] for b in response.json().get("content", []) if b.get("type") == "text"
        ).strip()
        if not text:
            raise ValueError("Respons Generative AI tidak memuat teks.")

        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("Respons Generative AI bukan JSON.")
        return json.loads(text[start:end + 1])

    @staticmethod
    def _normalize(data: dict) -> dict:
        def s(v, limit=1500):
            return str(v).strip()[:limit] if v else ""

        findings = []
        for f in (data.get("findings") or [])[:12]:
            if isinstance(f, dict) and f.get("explanation"):
                findings.append({
                    "effect": s(f.get("effect"), 200),
                    "title": s(f.get("title"), 200),
                    "explanation": s(f.get("explanation"), 2500),
                    "significant": bool(f.get("significant")),
                })
        if not findings and not data.get("narrative"):
            raise ValueError("Isi JSON dari Generative AI tidak lengkap.")

        caveat = data.get("caveat")
        return {
            "narrative": s(data.get("narrative"), 2500),
            "findings": findings,
            "practical": [s(x, 600) for x in (data.get("practical") or []) if x][:8],
            "assumption_summary": s(data.get("assumption_summary"), 2000),
            "next_steps": [s(x, 600) for x in (data.get("next_steps") or []) if x][:8],
            "caveat": s(caveat, 1200) if caveat and str(caveat).lower() != "null" else None,
            "highlights": [f["title"] for f in findings if f["title"]],
            "assumption_caveat": s(caveat, 1200) if caveat and str(caveat).lower() != "null" else None,
        }

    # ------------------------------------------------------------------
    # Narasi berbasis aturan (tanpa AI), memakai fakta data sebenarnya
    # ------------------------------------------------------------------
    @staticmethod
    def generate_fallback(mancova_result: dict, assumption_result: dict, facts: dict | None = None) -> dict:
        facts = facts or {}
        method = (mancova_result.get("method") or {}).get("code", "Analisis")
        dvs = mancova_result.get("dependent_vars") or []
        ivs = mancova_result.get("independent_vars") or []
        cvs = mancova_result.get("covariates") or []
        dv_text = _join(dvs) or "variabel dependen"
        n_rows = facts.get("n_rows")
        eta = facts.get("eta") or {}
        transformations = mancova_result.get("transformations") or {}

        effects = [e for e in mancova_result.get("effects", []) if e.get("effect_type") != "intercept"]
        sig = [e for e in effects if e.get("significant")]

        factor_facts = {}
        for f in facts.get("factors", []):
            factor_facts.setdefault(f["factor"], []).append(f)
        cov_facts = {}
        for c in facts.get("covariate_relations", []):
            cov_facts.setdefault(c["cov"], []).append(c)

        findings, practical = [], []
        reg = mancova_result.get("regression")

        for e in effects:
            label, kind, p, ok = e["effect_label"], e["effect_type"], e.get("p_value"), e.get("significant")
            parts = []

            if kind == "factor":
                title = (f"{label} berpengaruh nyata terhadap {dv_text}" if ok
                         else f"{label} belum terbukti berpengaruh terhadap {dv_text}")
                if ok:
                    parts.append(
                        f"Dari hasil analisis, faktor {label} berpengaruh secara signifikan terhadap {dv_text} ({_p(p)}, "
                        "lebih kecil dari batas 0,05). Artinya, perbedaan antar kategori "
                        f"{label} sangat kecil kemungkinannya terjadi hanya karena kebetulan.")
                else:
                    parts.append(
                        f"Dari hasil analisis, faktor {label} tidak menunjukkan pengaruh yang signifikan terhadap {dv_text} "
                        f"({_p(p)}, lebih besar dari batas 0,05). Perbedaan yang terlihat antar kategori kemungkinan hanya kebetulan, "
                        "bukan bukti adanya pengaruh nyata.")

                for f in factor_facts.get(label, [])[:3]:
                    if f["diff"] is None:
                        continue
                    pct = f" atau sekitar {_n(abs(f['diff_pct']), 1)}% dari kategori terendah" if f.get("diff_pct") is not None else ""
                    parts.append(
                        f"Pada {f['dv']}, rata-rata tertinggi ada pada kategori {f['top']} "
                        f"({_n(next(g['mean'] for g in f['groups'] if g['label'] == f['top']))}) dan terendah pada kategori "
                        f"{f['low']} ({_n(next(g['mean'] for g in f['groups'] if g['label'] == f['low']))}); selisihnya {_n(f['diff'])}{pct}.")
                    if ok:
                        practical.append(
                            f"Prioritaskan pemantauan pada kategori {f['top']} untuk {label}, karena rata-rata {f['dv']} paling tinggi di sana.")

                e_eta = eta.get(label)
                if e_eta is not None and ok:
                    parts.append(f"Besar pengaruhnya tergolong {_eta_word(e_eta)} (η² parsial = {_n(e_eta, 3)}), "
                                 f"yaitu sekitar {_n(e_eta * 100, 1)}% keragaman data dijelaskan oleh {label}.")
                if ok:
                    parts.append("Uji ini hanya menyatakan bahwa ada perbedaan; untuk mengetahui pasangan kategori mana yang "
                                 "berbeda diperlukan uji lanjut (post-hoc).")
                else:
                    parts.append("Ini bukan berarti pasti tidak ada pengaruh: jumlah data yang terbatas dapat membuat pengaruh kecil tidak terdeteksi.")

            elif kind == "covariate" and reg:
                coef = next((c for c in reg["coefficients"] if c["term"] == label), None)
                title = (f"{label} berpengaruh nyata terhadap {dv_text}" if ok
                         else f"{label} belum terbukti berpengaruh terhadap {dv_text}")
                if coef:
                    arah = "naik" if coef["estimate"] > 0 else "turun"
                    parts.append(
                        f"Dari hasil regresi, prediktor {label} " + ("berpengaruh signifikan" if ok else "tidak berpengaruh signifikan")
                        + f" terhadap {dv_text} ({_p(p)}). Setiap kenaikan 1 satuan {label}, "
                        f"{dv_text} diperkirakan {arah} sekitar {_n(abs(coef['estimate']), 3)} satuan, dengan prediktor lain dianggap tetap "
                        f"(rentang kepercayaan 95%: {_n(coef['ci_low'], 3)} sampai {_n(coef['ci_high'], 3)}).")
                    if coef.get("beta") is not None:
                        parts.append(f"Koefisien terstandar (beta) = {_n(coef['beta'], 3)}; makin besar nilai mutlaknya, makin kuat pengaruh relatif prediktor ini.")
                    if not ok:
                        parts.append("Pengaruh yang tampak kemungkinan hanya kebetulan; jumlah data yang terbatas dapat menyembunyikan pengaruh kecil.")
                if ok:
                    practical.append(f"Pantau {label}: perubahannya berkaitan dengan perubahan {dv_text}.")

            elif kind == "covariate":
                title = (f"Kovariat {label} berpengaruh nyata terhadap {dv_text}" if ok
                         else f"Kovariat {label} belum terbukti berpengaruh")
                parts.append(
                    f"Kovariat adalah variabel pengganggu yang dikendalikan agar pengaruh faktor utama lebih murni. "
                    f"Hasilnya, {label} " + (f"berpengaruh signifikan ({_p(p)})." if ok else f"tidak berpengaruh signifikan ({_p(p)})."))
                for c in cov_facts.get(label, [])[:2]:
                    if c.get("r") is None:
                        continue
                    arah = "positif" if c["r"] > 0 else "negatif"
                    cenderung = "tinggi" if c["r"] > 0 else "rendah"
                    kuat = "lemah" if abs(c["r"]) < 0.3 else "sedang" if abs(c["r"]) < 0.6 else "kuat"
                    parts.append(
                        f"Hubungannya dengan {c['dv']} bersifat {arah} dan {kuat} (r = {_n(c['r'])}): makin tinggi {label}, "
                        f"{c['dv']} cenderung makin {cenderung}.")
                if ok:
                    practical.append(f"Pantau dan, bila memungkinkan, kendalikan {label} di lapangan karena memengaruhi {dv_text}.")

            else:  # interaksi
                title = f"Interaksi {label} " + ("signifikan" if ok else "tidak signifikan")
                parts.append(
                    (f"Pengaruh gabungan {label} signifikan ({_p(p)}): pengaruh satu faktor berbeda tergantung level faktor lainnya, "
                     "sehingga keduanya tidak boleh dibaca terpisah.") if ok else
                    f"Tidak ada bukti bahwa pengaruh {label} saling bergantung ({_p(p)}).")

            findings.append({"effect": label, "title": title, "explanation": " ".join(parts), "significant": bool(ok)})

        # ---- ringkasan ----
        what = []
        if reg:
            what.append(f"prediktor {_join(cvs)}")
        elif ivs:
            what.append(f"faktor {_join(ivs)}")
        if cvs and not reg:
            what.append(f"kovariat {_join(cvs)}")
        narrative = (
            f"Analisis {method} dilakukan pada {_n(n_rows, 0) if n_rows else 'seluruh'} data untuk menguji pengaruh {_join(what)} terhadap {dv_text}. "
        )
        if reg:
            narrative += (
                f"Model menjelaskan sekitar {_n(reg['r_squared'] * 100, 1)}% keragaman {dv_text} (R² = {_n(reg['r_squared'], 3)}; "
                f"R² disesuaikan = {_n(reg['adj_r_squared'], 3)}), dan model secara keseluruhan "
                + ("signifikan" if reg.get("significant") else "tidak signifikan") + f" ({_p(reg.get('f_p_value'))}). ")
        if effects:
            if sig:
                narrative += (f"Dari {len(effects)} efek yang diuji, {len(sig)} berpengaruh signifikan: "
                              f"{_join([e['effect_label'] for e in sig])}. ")
            else:
                narrative += f"Dari {len(effects)} efek yang diuji, tidak ada yang menunjukkan pengaruh signifikan pada taraf 5%. "
        if transformations:
            narrative += ("Uji dilakukan pada data yang ditransformasi (" +
                          ", ".join(f"{k}: {v['label']}" for k, v in transformations.items()) +
                          "), sedangkan rata-rata di bawah memakai satuan asli. ")

        # ---- asumsi ----
        tests = assumption_result.get("tests", [])
        met = [t for t in tests if t["status"] == "met"]
        bad = [t for t in tests if t["status"] == "not_met"]
        manual = [t for t in tests if t["status"] in ("info", "not_evaluated")]
        if reg:
            asum = ""
            bad = []
        else:
          asum = (f"Dari {len(tests)} asumsi, {len(met)} terpenuhi"
                  + (f", {len(bad)} tidak terpenuhi" if bad else "")
                  + (f", dan {len(manual)} tidak diuji otomatis (perlu dinilai dari cara pengambilan data)" if manual else "") + ". ")
          if bad:
              asum += (f"Asumsi yang tidak terpenuhi ({_join([t['label'] for t in bad])}) membuat hasil perlu dibaca lebih hati-hati karena "
                       "angka p-value bisa kurang akurat. Anda dapat mencoba transformasi data pada halaman Uji Asumsi lalu menguji ulang.")
          elif met:
              asum += "Karena asumsi yang dapat diuji terpenuhi, hasil di atas dapat dipercaya lebih yakin."

        caveat = None if assumption_result.get("assumptions_met", False) else (
            assumption_result.get("warning_message")
            or f"Satu atau lebih asumsi {method} tidak terpenuhi sehingga hasil perlu ditafsirkan dengan hati-hati.")

        # ---- langkah lanjut ----
        steps = []
        if bad:
            steps.append("Coba transformasi data (log, akar kuadrat, atau Box-Cox) pada halaman Uji Asumsi, lalu lihat apakah asumsi menjadi terpenuhi.")
            steps.append("Periksa pencilan (nilai ekstrem) pada data; pastikan bukan kesalahan input.")
        if any(f.get("significant") and len(next((g["groups"] for g in facts.get("factors", []) if g["factor"] == f["effect"]), [])) >= 3 for f in findings):
            steps.append("Lakukan uji lanjut (misalnya Tukey) untuk mengetahui pasangan kategori mana yang berbeda nyata.")
        if not sig:
            steps.append("Pertimbangkan menambah jumlah data atau menyertakan variabel lain yang relevan.")
        steps.append("Padukan hasil ini dengan pengetahuan lapangan; hasil statistik menunjukkan pola pada data, bukan bukti sebab-akibat.")

        if not practical:
            practical.append("Belum ada faktor yang terbukti berpengaruh pada data ini, sehingga belum ada prioritas khusus yang dapat disarankan." if not sig
                             else "Gunakan temuan di atas sebagai dasar menentukan area yang perlu dipantau lebih dulu.")

        return {
            "narrative": narrative.strip(),
            "findings": findings,
            "practical": list(dict.fromkeys(practical))[:6],
            "assumption_summary": asum.strip(),
            "next_steps": steps,
            "caveat": caveat,
            "highlights": [f["title"] for f in findings],
            "assumption_caveat": caveat,
        }
