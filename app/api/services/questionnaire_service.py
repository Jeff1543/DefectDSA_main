from app.api.utils.errors import ValidationError

# Harus sama dengan app/static/js/kuesioner-data.js (id, urutan, jumlah pertanyaan).
KATEGORI = [
    ("formula_pakan", "Formula Pakan", "Formula Pakan"),
    ("bibit_unggul", "Bibit Unggul", "Bibit Unggul"),
    ("kesehatan", "Praktik Kesehatan dan Manajemen Penyakit", "Kesehatan"),
    ("produksi", "Produksi Daging & Susu", "Produksi"),
    ("nutrisi", "Pengetahuan tentang Kebutuhan Nutrisi", "Nutrisi"),
    ("wilayah", "Wilayah Peternakan", "Wilayah"),
    ("pemeliharaan", "Aspek Pemeliharaan", "Pemeliharaan"),
    ("peluang", "Identifikasi Peluang Usaha", "Peluang Usaha"),
]

PERTANYAAN_PER_KATEGORI = 3
KECAMATAN = ["Batu", "Bumiaji", "Junrejo"]


def klasifikasi(rata: float) -> dict:
    if rata >= 4.2:
        return {"label": "Sangat Baik", "level": "sb"}
    if rata >= 3.4:
        return {"label": "Baik", "level": "b"}
    if rata >= 2.6:
        return {"label": "Cukup", "level": "c"}
    if rata >= 1.8:
        return {"label": "Kurang", "level": "k"}
    return {"label": "Sangat Kurang", "level": "sk"}


def hitung_skor(jawaban: dict) -> dict:
    kategori = []

    for kid, judul, singkat in KATEGORI:
        nilai = jawaban.get(kid)

        if (
            not isinstance(nilai, list)
            or len(nilai) != PERTANYAAN_PER_KATEGORI
            or any(
                isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 5
                for v in nilai
            )
        ):
            raise ValidationError(
                f"Jawaban kategori '{judul}' harus berisi "
                f"{PERTANYAAN_PER_KATEGORI} nilai bulat 1-5."
            )

        rata = sum(nilai) / len(nilai)
        kategori.append(
            {
                "id": kid,
                "judul": judul,
                "singkat": singkat,
                "rata": round(rata, 4),
                "persen": round(rata / 5 * 100, 2),
                **klasifikasi(rata),
            }
        )

    rata_total = sum(k["rata"] for k in kategori) / len(kategori)
    klas = klasifikasi(rata_total)

    return {
        "kategori": kategori,
        "rata_total": round(rata_total, 4),
        "persen_total": round(rata_total / 5 * 100, 2),
        "label_total": klas["label"],
        "level_total": klas["level"],
    }
