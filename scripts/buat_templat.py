"""
Membuat berkas templat data untuk halaman Unggah:

  static/templat-data.xlsx   -> templat GENERIK kosong (nama kolom bebas, tanpa peran/fitur tetap)
  static/templat-data.csv    -> templat GENERIK kosong format CSV
  static/contoh-data.xlsx    -> contoh data TERISI (24 sapi) untuk mencoba alur analisis

Jalankan ulang bila struktur kolom berubah:
    python scripts/buat_templat.py
"""
from pathlib import Path

import numpy as np
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

STATIC = Path(__file__).resolve().parents[1] / "static"

# (nama kolom, peran, lebar, keterangan singkat, contoh)
COLUMNS = [
    ("Ketinggian", "Faktor", 16, "Kelompok lokasi/perlakuan (teks). Pilih dari daftar: Rendah, Sedang, Tinggi.", "Rendah"),
    ("Suhu", "Kovariat", 12, "Suhu kandang/lingkungan dalam °C (angka).", "27.5"),
    ("Kelembapan", "Kovariat", 14, "Kelembapan udara dalam % (angka 0-100).", "68"),
    ("Y1_Pipi", "Dependen", 12, "Skor defek kulit pada area pipi (angka ≥ 0).", "12.4"),
    ("Y2_Perut", "Dependen", 12, "Skor defek kulit pada area perut (angka ≥ 0).", "8.1"),
    ("Y3_Badan", "Dependen", 12, "Skor defek kulit pada area badan (angka ≥ 0).", "5.0"),
]

ROLE_COLOR = {"Faktor": "2E2E37", "Kovariat": "4F7A5A", "Dependen": "B5651D"}
ROLE_DESC = {
    "Faktor": "variabel pengelompok (kategori) — membandingkan antar kelompok",
    "Kovariat": "variabel pengganggu yang dikendalikan secara statistik (angka)",
    "Dependen": "variabel hasil yang diukur — skor defek kulit (angka)",
}

thin = Side(style="thin", color="D9D5D0")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
ZEBRA = PatternFill("solid", fgColor="F7F3EA")


def sample_rows(n_per_group=8, seed=7):
    rng = np.random.default_rng(seed)
    spec = {  # suhu, kelembapan, y1, y2, y3
        "Rendah": (28.0, 68, 13.0, 8.5, 5.5),
        "Sedang": (25.5, 74, 8.5, 5.5, 3.8),
        "Tinggi": (22.0, 81, 4.0, 2.6, 1.2),
    }
    rows = []
    for level, (t, h, y1, y2, y3) in spec.items():
        for _ in range(n_per_group):
            temp = rng.normal(t, 1.0)
            hum = rng.normal(h, 2.5)
            rows.append([
                level,
                round(temp, 1),
                round(hum, 1),
                round(max(0.2, y1 + 0.35 * (temp - t) + rng.normal(0, 1.1)), 1),
                round(max(0.2, y2 + 0.25 * (temp - t) + rng.normal(0, 0.8)), 1),
                round(max(0.2, y3 + 0.20 * (temp - t) + rng.normal(0, 0.6)), 1),
            ])
    return rows


def style_data_sheet(ws, n_rows, with_validation=True):
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 26

    for idx, (name, role, width, desc, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=idx, value=name)
        cell.font = Font(bold=True, color="FFFFFF", size=11, name="Calibri")
        cell.fill = PatternFill("solid", fgColor=ROLE_COLOR[role])
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
        cell.comment = Comment(f"{role}: {desc}", "DefectDSA", width=260, height=90)
        ws.column_dimensions[cell.column_letter].width = width

    last = max(n_rows + 1, 200)  # rapikan sampai baris 200 agar enak diisi
    for r in range(2, last + 1):
        for c in range(1, len(COLUMNS) + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = BORDER
            cell.alignment = Alignment(horizontal="left" if c == 1 else "center")
            if c > 1:
                cell.number_format = "0.0"
            if r % 2 == 1:
                cell.fill = ZEBRA

    if with_validation:
        dv_level = DataValidation(
            type="list", formula1='"Rendah,Sedang,Tinggi"', allow_blank=True,
            errorStyle="warning", showErrorMessage=True,
            errorTitle="Nilai di luar daftar",
            error="Biasanya diisi Rendah, Sedang, atau Tinggi. Lanjutkan hanya bila kelompok Anda memang berbeda.",
        )
        dv_level.add(f"A2:A{last}")

        def number_rule(lo, hi, label):
            dv = DataValidation(
                type="decimal", operator="between", formula1=str(lo), formula2=str(hi),
                allow_blank=True, errorStyle="warning", showErrorMessage=True,
                errorTitle="Periksa nilai", error=f"{label} biasanya antara {lo} dan {hi}.",
            )
            return dv

        dv_temp = number_rule(0, 60, "Suhu (°C)")
        dv_hum = number_rule(0, 100, "Kelembapan (%)")
        dv_y = number_rule(0, 1000, "Skor defek")
        dv_temp.add(f"B2:B{last}")
        dv_hum.add(f"C2:C{last}")
        dv_y.add(f"D2:F{last}")
        for dv in (dv_level, dv_temp, dv_hum, dv_y):
            ws.add_data_validation(dv)


def add_guide_sheet(wb, filled):
    ws = wb.create_sheet("Petunjuk")
    ws.sheet_view.showGridLines = False
    for col, w in zip("ABCD", (18, 14, 12, 70)):
        ws.column_dimensions[col].width = w

    ws["A1"] = "Petunjuk Pengisian Templat Data"
    ws["A1"].font = Font(bold=True, size=16, color="2E2E37")
    ws.row_dimensions[1].height = 28
    ws["A2"] = (
        "Templat ini untuk DefectDSA — analisis ANOVA / ANCOVA / MANOVA / MANCOVA / Regresi Linier pada skor defek kulit sapi."
    )
    ws["A2"].font = Font(italic=True, color="6B7280")

    steps = [
        "1. Buka sheet “Data”. " + (
            "Baris contoh sudah terisi — hapus lalu ganti dengan data Anda."
            if filled else "Isi mulai baris 2 (baris 1 adalah nama kolom, jangan dihapus)."
        ),
        "2. Satu baris = satu pengamatan (misalnya satu ekor sapi). Satu kolom = satu variabel.",
        "3. Kosongkan sel bila data memang tidak ada (jangan isi 0). Sistem akan menawarkan cara menanganinya.",
        "4. Angka desimal boleh memakai titik atau koma. Jangan tambahkan satuan di dalam sel (tulis 27.5, bukan “27,5 C”).",
        "5. Nama kolom boleh diganti/ditambah sesuai kebutuhan; sistem membaca semua kolom pada sheet “Data”.",
        "6. Simpan sebagai .xlsx (atau .csv), lalu unggah di halaman Unggah Data (maks. 10 MB).",
    ]
    for i, text in enumerate(steps, start=4):
        ws.cell(row=i, column=1, value=text).alignment = Alignment(wrap_text=False)
    ws["A3"] = "Cara mengisi"
    ws["A3"].font = Font(bold=True, size=12, color="2E2E37")

    r0 = 4 + len(steps) + 1
    ws.cell(row=r0, column=1, value="Arti setiap kolom").font = Font(bold=True, size=12, color="2E2E37")
    heads = ["Nama kolom", "Peran", "Contoh", "Keterangan"]
    for j, h in enumerate(heads, start=1):
        c = ws.cell(row=r0 + 1, column=j, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2E2E37")
        c.border = BORDER
    for k, (name, role, _, desc, example) in enumerate(COLUMNS, start=r0 + 2):
        vals = [name, role, example, desc]  # contoh ditulis sebagai teks
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=k, column=j, value=v)
            c.border = BORDER
            c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=k, column=2).font = Font(bold=True, color=ROLE_COLOR[role])

    r1 = r0 + 2 + len(COLUMNS) + 1
    ws.cell(row=r1, column=1, value="Peran variabel").font = Font(bold=True, size=12, color="2E2E37")
    for k, (role, text) in enumerate(ROLE_DESC.items(), start=r1 + 1):
        a = ws.cell(row=k, column=1, value=role)
        a.font = Font(bold=True, color="FFFFFF")
        a.fill = PatternFill("solid", fgColor=ROLE_COLOR[role])
        ws.cell(row=k, column=2, value=text)

    r2 = r1 + len(ROLE_DESC) + 2
    ws.cell(row=r2, column=1, value="Metode yang dipilih otomatis").font = Font(bold=True, size=12, color="2E2E37")
    methods = [
        "ANOVA   : 1 variabel dependen, tanpa kovariat",
        "ANCOVA  : 1 variabel dependen, dengan kovariat",
        "MANOVA  : ≥ 2 variabel dependen, tanpa kovariat",
        "MANCOVA : ≥ 2 variabel dependen, dengan kovariat",
    ]
    for k, text in enumerate(methods, start=r2 + 1):
        ws.cell(row=k, column=1, value=text)


def build_xlsx(path, rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"

    # 1) header + format sel (baris 1..200) lebih dulu,
    # 2) baru isi nilai ke sel yang sudah berformat.
    style_data_sheet(ws, len(rows) + 1)
    for r_idx, row in enumerate(rows, start=2):
        for c_idx, value in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=value)

    add_guide_sheet(wb, filled=bool(rows))
    wb.save(path)


def build_csv(path, rows):
    header = ",".join(c[0] for c in COLUMNS)
    lines = [header] + [",".join(str(v) for v in row) for row in rows]
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


GENERIC_COLS = [f"Variabel_{i}" for i in range(1, 7)]


def build_generic_xlsx(path):
    """Templat polos: hanya nama kolom placeholder, tanpa peran, validasi, atau contoh isi."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.freeze_panes = "A2"
    for idx, name in enumerate(GENERIC_COLS, start=1):
        cell = ws.cell(row=1, column=idx, value=name)
        cell.font = Font(bold=True, color="FFFFFF", name="Calibri")
        cell.fill = PatternFill("solid", fgColor="2E2E37")
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[cell.column_letter].width = 16
    g = wb.create_sheet("Petunjuk")
    g.column_dimensions["A"].width = 100
    g["A1"] = "Petunjuk Pengisian Templat Data"
    g["A1"].font = Font(bold=True, size=14, color="2E2E37")
    for i, t in enumerate([
        "1. Ganti nama kolom (baris 1) sesuai variabel penelitian Anda; tambah atau hapus kolom sesuka Anda.",
        "2. Satu baris = satu pengamatan, satu kolom = satu variabel. Isi data mulai baris 2.",
        "3. Kosongkan sel bila data tidak ada (jangan isi 0) dan jangan tulis satuan di dalam sel.",
        "4. Peran variabel (faktor, kovariat, dependen) dipilih nanti di langkah Pilih Variabel.",
        "5. Simpan sebagai .xlsx atau .csv lalu unggah di halaman Unggah Data (maks. 10 MB).",
    ], start=3):
        g.cell(row=i, column=1, value=t)
    wb.save(path)


if __name__ == "__main__":
    data = sample_rows()
    build_generic_xlsx(STATIC / "templat-data.xlsx")
    build_xlsx(STATIC / "contoh-data.xlsx", data)
    Path(STATIC / "templat-data.csv").write_text(",".join(GENERIC_COLS) + "\n", encoding="utf-8")
    print("OK: templat-data.xlsx & templat-data.csv (generik), contoh-data.xlsx (24 baris)")
