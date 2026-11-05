import csv
import io
import math
import re
import time
import uuid
from collections import Counter
from datetime import date, datetime
from io import BytesIO

import pandas as pd
from openpyxl import load_workbook

from app.api.core.config import (
    ALLOWED_EXTENSIONS,
    DATASET_TTL_SECONDS,
    MAX_FACTOR_LEVELS,
    MAX_FILE_SIZE_BYTES,
    PREVIEW_ROWS,
)
from app.api.utils.errors import FileError


# ============================================================
# IN-MEMORY DATASET STORAGE
# ============================================================
#
# CATATAN ARSITEKTUR (prototipe, single-worker):
# Dictionary di memori ini TIDAK cocok untuk deployment dengan
# banyak worker/proses (mis. `uvicorn --workers 4`) maupun untuk
# server yang di-restart, karena setiap worker/proses punya
# memori terpisah dan dataset_id dari satu request bisa "hilang"
# apabila request berikutnya ditangani worker lain.
#
# Untuk V1/prototipe (single worker, tanpa load balancer) ini
# masih dapat diterima. Apabila aplikasi perlu berjalan dengan
# banyak worker/instance, storage ini WAJIB diganti dengan
# penyimpanan eksternal bersama (mis. Redis, atau tabel sementara
# di database) sebelum deployment produksi.
_DATASETS: dict[str, dict] = {}


def _generate_dataset_id() -> str:
    return uuid.uuid4().hex


def _validate_extension(filename: str) -> str:
    extension = "." + filename.lower().split(".")[-1]

    if extension not in ALLOWED_EXTENSIONS:
        raise FileError(
            "Format file tidak didukung. "
            "Gunakan file CSV atau XLSX."
        )

    return extension


_NUMBER = re.compile(r"^-?\d+([.,]\d+)?$")

# Teks yang dianggap "sel kosong" saat membaca file.
_NA_TOKENS = {"", "na", "n/a", "#n/a", "nan", "null", "none", "-", "--"}

# Nama sheet yang lazimnya berisi petunjuk/catatan, bukan data.
_NOTE_SHEET = re.compile(
    r"petunjuk|panduan|instruksi|cara|catatan|keterangan|readme|info|about|notes?",
    re.IGNORECASE,
)

# Berapa baris teratas yang dipindai untuk mencari baris header.
_HEADER_SCAN_ROWS = 40


# ============================================================
# PEMBACAAN FILE -> GRID MENTAH
# ============================================================
#
# File dibaca dulu menjadi "grid mentah" (list of list) TANPA
# mengasumsikan baris pertama adalah header. Setelah itu baris
# header dicari otomatis, sehingga file yang punya judul laporan,
# keterangan, atau baris kosong di atas tabel tetap terbaca benar.


def _clean_cell(value):
    """Normalisasi satu sel: strip teks, ubah token kosong menjadi None."""

    if value is None:
        return None

    if isinstance(value, str):
        text = value.strip()
        return None if text.lower() in _NA_TOKENS else text

    if isinstance(value, float) and value != value:  # NaN
        return None

    return value


def _decode_csv(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue

    raise FileError("File tidak dapat dibaca sebagai dataset yang valid.")


def _detect_delimiter(text: str) -> str:
    """
    Memilih pemisah kolom (, ; tab |) berdasarkan keseragaman jumlah
    kolom pada baris-baris awal. Baris judul yang tidak berisi pemisah
    tidak mengganggu pemilihan.
    """

    sample = "\n".join(text.splitlines()[:60])

    best, best_score = ",", (0, 0)

    for delimiter in (",", ";", "\t", "|"):
        try:
            rows = list(csv.reader(io.StringIO(sample), delimiter=delimiter))
        except csv.Error:
            continue

        widths = [len(r) for r in rows if any(c.strip() for c in r)]
        if not widths:
            continue

        mode_width, mode_count = Counter(widths).most_common(1)[0]
        if mode_width < 2:
            continue

        score = (mode_count, mode_width)
        if score > best_score:
            best, best_score = delimiter, score

    return best


def _csv_grid(content: bytes) -> list[list]:
    text = _decode_csv(content)
    delimiter = _detect_delimiter(text)

    try:
        return [
            [_clean_cell(c) for c in row]
            for row in csv.reader(io.StringIO(text), delimiter=delimiter)
        ]
    except csv.Error as exc:
        raise FileError(
            "File tidak dapat dibaca sebagai dataset yang valid."
        ) from exc


def _sheet_grid(worksheet) -> list[list]:
    return [
        [_clean_cell(c) for c in row]
        for row in worksheet.iter_rows(values_only=True)
    ]


def _grid_score(grid: list[list]) -> int:
    """Skor isi sheet: sel numerik lebih berharga daripada sel teks."""

    score = 0

    for row in grid:
        for cell in row:
            if cell is None:
                continue
            score += 2 if isinstance(cell, (int, float)) and not isinstance(cell, bool) else 1

    return score


def _xlsx_grid(content: bytes) -> tuple[list[list], str]:
    """
    Membaca workbook dan memilih sheet yang paling mungkin berisi data
    (sheet tersembunyi dan sheet kosong dilewati). Dengan begitu sheet
    "Petunjuk"/catatan di depan sheet data tidak ikut terbaca.
    """

    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise FileError(
            "File tidak dapat dibaca sebagai dataset yang valid."
        ) from exc

    try:
        best_grid, best_name, best_score = None, "", -1

        visible = [
            sheet
            for sheet in workbook.worksheets
            if getattr(sheet, "sheet_state", "visible") == "visible"
        ]

        # Sheet bernama "Petunjuk"/"Panduan"/dst. hanya dilewati bila masih
        # ada sheet lain; kalau hanya itu satu-satunya sheet, tetap dibaca.
        candidates = [s for s in visible if not _NOTE_SHEET.search(s.title)] or visible

        for sheet in candidates:
            grid = _sheet_grid(sheet)
            score = _grid_score(grid)

            if score > best_score:
                best_grid, best_name, best_score = grid, sheet.title, score

        if best_grid is None or best_score <= 0:
            raise FileError("Dataset kosong.")

        return best_grid, best_name
    finally:
        workbook.close()


# ============================================================
# DETEKSI BARIS HEADER
# ============================================================


def _is_text(cell) -> bool:
    return isinstance(cell, str) and not _NUMBER.match(cell)


def _filled(row: list) -> int:
    return sum(1 for c in row if c is not None)


def _find_header_row(grid: list[list]) -> int:
    """
    Mengembalikan indeks baris header di dalam grid.

    Baris header adalah baris PERTAMA yang (a) cukup lebar dibanding
    baris-baris data, (b) hampir seluruh selnya berupa teks, (c) tidak
    punya nama kolom ganda, dan (d) diikuti minimal satu baris data.
    Baris judul / keterangan (biasanya hanya 1-2 sel terisi) dilewati.
    Bila tidak ada yang memenuhi, dipakai baris pertama yang tidak kosong.
    """

    scan = grid[:_HEADER_SCAN_ROWS]
    widths = [_filled(r) for r in scan]
    max_width = max(widths, default=0)

    if max_width == 0:
        return 0

    min_width = 1 if max_width == 1 else max(2, math.ceil(0.6 * max_width))

    for i, row in enumerate(scan):
        cells = [c for c in row if c is not None]

        if len(cells) < min_width:
            continue

        text_ratio = sum(_is_text(c) for c in cells) / len(cells)
        if text_ratio < 0.8:
            continue

        if len({str(c).strip().lower() for c in cells}) < len(cells):
            continue

        if not any(_filled(r) > 0 for r in grid[i + 1 : i + 6]):
            continue

        return i

    return next((i for i, w in enumerate(widths) if w > 0), 0)


# ============================================================
# GRID -> DATAFRAME
# ============================================================


def _coerce_column(values: list) -> pd.Series:
    """
    Mengubah satu kolom menjadi numerik bila SELURUH nilai yang terisi
    berupa angka (termasuk koma desimal ala Excel Indonesia "12,5").
    Selain itu kolom diperlakukan sebagai teks/kategori.
    """

    present = [v for v in values if v is not None]

    def is_number(v) -> bool:
        if isinstance(v, bool):
            return False
        if isinstance(v, (int, float)):
            return True
        return isinstance(v, str) and bool(_NUMBER.match(v))

    if present and all(is_number(v) for v in present):
        numbers = [
            None
            if v is None
            else float(v.replace(",", ".")) if isinstance(v, str) else v
            for v in values
        ]
        return pd.to_numeric(pd.Series(numbers, dtype="object"), errors="coerce")

    def to_text(v):
        if v is None:
            return None
        if isinstance(v, (datetime, date)):
            return v.isoformat(sep=" ") if isinstance(v, datetime) else v.isoformat()
        return str(v)

    return pd.Series([to_text(v) for v in values], dtype="object")


def _unique_names(names: list) -> list[str]:
    seen: dict[str, int] = {}
    result = []

    for index, name in enumerate(names):
        base = str(name).strip() if name is not None else ""
        if not base:
            base = f"Kolom_{index + 1}"

        if base in seen:
            seen[base] += 1
            base = f"{base}_{seen[base]}"
        else:
            seen[base] = 1

        result.append(base)

    return result


def _grid_to_frame(grid: list[list]) -> tuple[pd.DataFrame, dict]:
    # Buang baris & kolom yang sepenuhnya kosong, tetapi ingat nomor
    # baris aslinya (1-based) agar info "header di baris N" cocok dengan
    # nomor baris yang dilihat pengguna di Excel.
    numbered = [(i + 1, row) for i, row in enumerate(grid) if _filled(row) > 0]

    if not numbered:
        raise FileError("Dataset kosong.")

    original_rows = [n for n, _ in numbered]
    grid = [row for _, row in numbered]

    width = max(len(row) for row in grid)
    grid = [row + [None] * (width - len(row)) for row in grid]

    keep = [j for j in range(width) if any(row[j] is not None for row in grid)]
    grid = [[row[j] for j in keep] for row in grid]

    header_index = _find_header_row(grid)
    header = grid[header_index]
    body = grid[header_index + 1 :]

    # Buang catatan kaki: baris di bawah data yang hanya berisi 1 sel teks.
    n_cols = len(header)
    while body and n_cols >= 3 and _filled(body[-1]) <= 1:
        only = next((c for c in body[-1] if c is not None), None)
        if only is None or _is_text(only):
            body.pop()
        else:
            break

    if not body:
        raise FileError(
            "Dataset kosong: tidak ada baris data di bawah nama kolom. "
            "Isi data mulai dari baris di bawah header, lalu unggah kembali."
        )

    # Kolom tanpa nama dan tanpa data (hanya header) dibuang; kolom
    # bernama tapi seluruh datanya kosong juga dibuang seperti sebelumnya.
    columns = [
        j for j in range(n_cols) if any(row[j] is not None for row in body)
    ]

    names = _unique_names([header[j] for j in columns])
    data = {
        name: _coerce_column([row[j] for row in body])
        for name, j in zip(names, columns)
    }

    df = pd.DataFrame(data).reset_index(drop=True)

    header_row = original_rows[header_index]

    info = {
        "header_row": header_row,
        "skipped_rows": header_row - 1,
    }

    return df, info


def _read_dataset(content: bytes, extension: str) -> tuple[pd.DataFrame, dict]:

    try:
        sheet = None

        if extension == ".csv":
            grid = _csv_grid(content)
        elif extension == ".xlsx":
            grid, sheet = _xlsx_grid(content)
        else:
            raise FileError("Format file tidak didukung.")

        df, info = _grid_to_frame(grid)

    except FileError:
        raise
    except Exception as exc:
        raise FileError(
            "File tidak dapat dibaca sebagai dataset yang valid."
        ) from exc

    info["sheet"] = sheet
    return df, info


def upload_dataset(
    filename: str,
    content: bytes,
) -> dict:

    if not filename:
        raise FileError("Nama file tidak ditemukan.")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise FileError(
            f"Ukuran file melebihi batas maksimum "
            f"{MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB."
        )

    extension = _validate_extension(filename)

    df, read_info = _read_dataset(content, extension)

    if df.empty:
        raise FileError("Dataset kosong.")

    dataset_id = _generate_dataset_id()

    _DATASETS[dataset_id] = {
        "data": df,
        "filename": filename,
        "cleaned": False,
        "created_at": time.time(),
    }

    return {
        "dataset_id": dataset_id,
        "profile": profile_dataset(df),
        "read_info": read_info,
    }


def profile_dataset(df: pd.DataFrame) -> dict:

    columns = []

    for column in df.columns:

        series = df[column]

        if pd.api.types.is_numeric_dtype(series):
            dtype = "numeric"
        else:
            dtype = "categorical"

        missing_count = int(series.isna().sum())

        missing_percentage = (
            missing_count / len(df) * 100
            if len(df) > 0
            else 0
        )

        unique_count = int(series.nunique(dropna=True))

        columns.append(
            {
                "name": str(column),
                "dtype": dtype,
                "unique_count": unique_count,
                "can_be_factor": (
                    dtype == "categorical" or 2 <= unique_count <= MAX_FACTOR_LEVELS
                ),
                "missing_count": missing_count,
                "missing_percentage": round(
                    missing_percentage,
                    2,
                ),
            }
        )

    # BUG FIX: `.where(pd.notna(...), None)` tidak benar-benar
    # mengubah NaN menjadi None pada kolom bertipe numerik, sebab
    # pandas mengembalikan None menjadi NaN lagi untuk menjaga
    # dtype float. Akibatnya endpoint /api/upload gagal dengan
    # "ValueError: Out of range float values are not JSON
    # compliant: nan" setiap kali dataset yang diunggah memiliki
    # missing value pada kolom numerik - suatu kondisi yang justru
    # menjadi kasus utama yang perlu ditangani modul data
    # profiling ini. Perbaikannya: konversi eksplisit per nilai
    # setelah to_dict(), bukan mengandalkan .where() pada DataFrame.
    raw_preview = df.head(PREVIEW_ROWS).to_dict(orient="records")

    preview = [
        {
            key: (None if pd.isna(value) else value)
            for key, value in row.items()
        }
        for row in raw_preview
    ]

    return {
        "n_rows": len(df),
        "n_columns": len(df.columns),
        "columns": columns,
        "preview": preview,
    }


def _purge_expired() -> None:
    """
    Menghapus dataset yang telah melewati DATASET_TTL_SECONDS.

    Dipanggil secara opportunistic (setiap kali dataset diakses),
    bukan melalui scheduler terpisah, karena ini merupakan
    prototipe single-worker tanpa background job runner.
    """

    now = time.time()

    expired_ids = [
        dataset_id
        for dataset_id, dataset in _DATASETS.items()
        if now - dataset.get("created_at", now) > DATASET_TTL_SECONDS
    ]

    for dataset_id in expired_ids:
        del _DATASETS[dataset_id]


def get_dataset(dataset_id: str) -> pd.DataFrame:

    _purge_expired()

    dataset = _DATASETS.get(dataset_id)

    if dataset is None:
        raise FileError(
            "Dataset tidak ditemukan atau sesi dataset telah berakhir."
        )

    return dataset["data"]


def get_filename(dataset_id: str) -> str:

    _purge_expired()

    dataset = _DATASETS.get(dataset_id)

    if dataset is None:
        raise FileError(
            "Dataset tidak ditemukan atau sesi dataset telah berakhir."
        )

    return dataset.get("filename", "")


def is_cleaned(dataset_id: str) -> bool:

    _purge_expired()

    dataset = _DATASETS.get(dataset_id)

    if dataset is None:
        raise FileError(
            "Dataset tidak ditemukan atau sesi dataset telah berakhir."
        )

    return dataset["cleaned"]


def set_dataset(dataset_id: str, df: pd.DataFrame) -> None:
    """
    Menyimpan kembali dataset yang telah melalui proses cleaning,
    menggantikan dataset mentah sebelumnya pada dataset_id yang sama.
    """

    if dataset_id not in _DATASETS:
        raise FileError("Dataset tidak ditemukan.")

    _DATASETS[dataset_id]["data"] = df


def mark_cleaned(dataset_id: str):
    if dataset_id not in _DATASETS:
        raise FileError("Dataset tidak ditemukan.")

    _DATASETS[dataset_id]["cleaned"] = True