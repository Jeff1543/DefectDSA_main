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

try:  # pembaca xlsx berbasis Rust: sekitar 5x lebih cepat daripada openpyxl
    from python_calamine import CalamineWorkbook
except Exception:  # pragma: no cover - cadangan bila paket tidak terpasang
    CalamineWorkbook = None

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


# Berapa baris teratas sebuah sheet yang dibaca untuk pratinjau / saran sheet.
_PREVIEW_SCAN_ROWS = 60
# Berhenti membaca bila ditemukan sekian baris kosong berturut-turut setelah
# data (sheet yang "formatnya" menjalar sampai ratusan ribu baris kosong).
_MAX_BLANK_RUN = 1000


def _clean_row(row) -> list:
    """Versi cepat _clean_cell untuk satu baris."""

    out = []

    for cell in row:
        cls = cell.__class__

        if cls is str:
            text = cell.strip()
            out.append(None if text.lower() in _NA_TOKENS else text)
        elif cell is None or (cls is float and cell != cell):
            out.append(None)
        else:
            out.append(cell)

    return out


def _trim_row(row: list) -> list:
    while row and row[-1] is None:
        row.pop()
    return row


class _XlsxBook:
    """Pembungkus workbook xlsx: calamine bila ada, openpyxl sebagai cadangan."""

    def __init__(self, content: bytes):
        self._calamine = None
        self._openpyxl = None

        if CalamineWorkbook is not None:
            try:
                self._calamine = CalamineWorkbook.from_filelike(BytesIO(content))
            except Exception:
                self._calamine = None

        if self._calamine is None:
            try:
                self._openpyxl = load_workbook(
                    BytesIO(content), read_only=True, data_only=True
                )
            except Exception as exc:
                raise FileError(
                    "File tidak dapat dibaca sebagai dataset yang valid."
                ) from exc

    def close(self):
        if self._openpyxl is not None:
            self._openpyxl.close()

    def visible_sheets(self) -> list[str]:
        if self._calamine is not None:
            return [
                m.name
                for m in self._calamine.sheets_metadata
                if getattr(m.visible, "name", str(m.visible)).endswith("Visible")
                and getattr(m.typ, "name", str(m.typ)).endswith("WorkSheet")
            ]

        return [
            ws.title
            for ws in self._openpyxl.worksheets
            if getattr(ws, "sheet_state", "visible") == "visible"
        ]

    def rows(self, name: str, limit: int | None = None) -> list[list]:
        """Baris sheet (sel sudah dibersihkan). Baris kosong dipertahankan
        sebagai [] agar nomor baris tetap sama dengan yang tampak di Excel."""

        if self._calamine is not None:
            sheet = self._calamine.get_sheet_by_name(name)
            start_row = sheet.start[0] if sheet.start else 0
            raw = (
                sheet.iter_rows()
                if limit is not None
                else iter(sheet.to_python(skip_empty_area=True))
            )
            lead = [[] for _ in range(start_row)]
        else:
            ws = self._openpyxl[name]
            if hasattr(ws, "reset_dimensions"):
                ws.reset_dimensions()  # abaikan dimensi gembung akibat format sel
            raw = ws.iter_rows(values_only=True)
            lead = []

        grid: list[list] = list(lead)
        blank_run = 0

        for row in raw:
            cleaned = _trim_row(_clean_row(row))

            if cleaned:
                blank_run = 0
            else:
                blank_run += 1
                if blank_run > _MAX_BLANK_RUN:
                    break

            grid.append(cleaned)

            if limit is not None and len(grid) >= limit:
                break

        while grid and not grid[-1]:
            grid.pop()

        return grid


def _grid_score(grid: list[list]) -> int:
    """Skor isi sheet: sel numerik lebih berharga daripada sel teks."""

    score = 0

    for row in grid:
        for cell in row:
            if cell is None:
                continue
            score += 2 if isinstance(cell, (int, float)) and not isinstance(cell, bool) else 1

    return score


def _preview_cells(grid: list[list], max_rows: int = 4, max_cols: int = 8) -> list[list[str]]:
    shown = []

    for row in grid:
        if not any(c is not None for c in row):
            continue

        cells = []
        for cell in row[:max_cols]:
            text = "" if cell is None else str(cell)
            cells.append(text if len(text) <= 22 else text[:21] + "…")

        shown.append(cells)

        if len(shown) >= max_rows:
            break

    return shown


def inspect_xlsx(content: bytes) -> list[dict]:
    """
    Daftar sheet yang terlihat beserta pratinjau singkatnya, untuk
    ditampilkan sebagai pilihan. Hanya ~60 baris teratas tiap sheet
    yang dibaca, jadi cepat walaupun sheet-nya besar.
    """

    book = _XlsxBook(content)

    try:
        sheets = []

        for name in book.visible_sheets():
            grid = book.rows(name, limit=_PREVIEW_SCAN_ROWS)
            score = _grid_score(grid)

            sheets.append(
                {
                    "name": name,
                    "empty": score <= 0,
                    "note": bool(_NOTE_SHEET.search(name)),
                    "score": score,
                    "preview": _preview_cells(grid),
                }
            )

        return sheets
    finally:
        book.close()


def _suggest_sheet(sheets: list[dict]) -> str | None:
    usable = [s for s in sheets if not s["empty"]]
    pool = [s for s in usable if not s["note"]] or usable

    if not pool:
        return None

    return max(pool, key=lambda s: s["score"])["name"]


def _xlsx_grid(content: bytes, sheet: str | None = None) -> tuple[list[list], str]:
    """Membaca SATU sheet (yang dipilih pengguna, atau yang disarankan)."""

    book = _XlsxBook(content)

    try:
        if sheet is None:
            sheet = _suggest_sheet(inspect_xlsx(content))
            if sheet is None:
                raise FileError("Dataset kosong.")

        if sheet not in book.visible_sheets():
            raise FileError(f"Sheet '{sheet}' tidak ditemukan pada file.")

        grid = book.rows(sheet)

        if _grid_score(grid) <= 0:
            raise FileError(f"Sheet '{sheet}' kosong. Pilih sheet lain.")

        return grid, sheet
    finally:
        book.close()


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
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
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


def _read_dataset(
    content: bytes, extension: str, sheet_name: str | None = None
) -> tuple[pd.DataFrame, dict]:

    try:
        sheet = None

        if extension == ".csv":
            grid = _csv_grid(content)
        elif extension == ".xlsx":
            grid, sheet = _xlsx_grid(content, sheet_name)
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


# Berkas xlsx yang menunggu pengguna memilih sheet (agar tidak diunggah dua kali).
_PENDING_UPLOADS: dict[str, dict] = {}
_PENDING_TTL_SECONDS = 15 * 60
_PENDING_MAX = 20


def _purge_pending() -> None:
    now = time.time()

    for token in [
        t for t, v in _PENDING_UPLOADS.items() if now - v["created_at"] > _PENDING_TTL_SECONDS
    ]:
        del _PENDING_UPLOADS[token]

    while len(_PENDING_UPLOADS) > _PENDING_MAX:
        oldest = min(_PENDING_UPLOADS, key=lambda t: _PENDING_UPLOADS[t]["created_at"])
        del _PENDING_UPLOADS[oldest]


def get_pending_upload(token: str) -> dict:
    _purge_pending()

    pending = _PENDING_UPLOADS.get(token)

    if pending is None:
        raise FileError(
            "Sesi unggahan sudah berakhir. Silakan pilih dan unggah ulang file Anda."
        )

    return pending


def upload_dataset(
    filename: str,
    content: bytes,
    sheet: str | None = None,
    token: str | None = None,
) -> dict:
    """
    Membaca file menjadi dataset. Untuk .xlsx dengan lebih dari satu sheet
    berisi data, bila `sheet` belum dipilih, yang dikembalikan adalah daftar
    sheet (needs_sheet=True) supaya pengguna yang memilih, bukan ditebak.
    """

    if not filename:
        raise FileError("Nama file tidak ditemukan.")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise FileError(
            f"Ukuran file melebihi batas maksimum "
            f"{MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB."
        )

    extension = _validate_extension(filename)

    # Percayai isi file, bukan ekstensinya: xlsx asli adalah arsip ZIP ("PK").
    # File teks (TSV/CSV) yang cuma diberi nama .xlsx tetap dibaca sebagai teks.
    is_zip = content[:2] == b"PK"

    if extension == ".xlsx" and not is_zip:
        extension = ".csv"
    elif extension == ".csv" and is_zip:
        extension = ".xlsx"

    if extension == ".xlsx" and sheet is None:
        sheets = inspect_xlsx(content)
        usable = [x for x in sheets if not x["empty"]]
        # Sheet petunjuk/catatan tidak dihitung sebagai pilihan bila ada sheet data.
        choices = [x for x in usable if not x["note"]] or usable

        if len(choices) > 1:
            _purge_pending()
            token = token or uuid.uuid4().hex
            _PENDING_UPLOADS[token] = {
                "filename": filename,
                "content": content,
                "created_at": time.time(),
            }

            return {
                "needs_sheet": True,
                "token": token,
                "filename": filename,
                "sheets": sheets,
                "suggested": _suggest_sheet(sheets),
            }

        if len(choices) == 1:
            sheet = choices[0]["name"]

    df, read_info = _read_dataset(content, extension, sheet)

    if df.empty:
        raise FileError("Dataset kosong.")

    dataset_id = _generate_dataset_id()

    _DATASETS[dataset_id] = {
        "data": df,
        "filename": filename,
        "cleaned": False,
        "created_at": time.time(),
    }

    if token:
        _PENDING_UPLOADS.pop(token, None)

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


def _format_number_as_text(value) -> str:
    """Angka -> teks kategori: 1.0 menjadi "1", 2.5 tetap "2.5"."""

    number = float(value)
    return str(int(number)) if number.is_integer() else repr(number)


def convert_column_type(dataset_id: str, column: str, to: str) -> dict:
    """
    Mengubah tipe satu kolom (numerik <-> kategorik) pada dataset di memori,
    lalu mengembalikan profil terbaru. Bila ada nilai yang tidak bisa diubah,
    kolom dibiarkan apa adanya dan pengguna diberi tahu nilai yang bermasalah.
    """

    if to not in {"numeric", "categorical"}:
        raise FileError("Tipe tujuan harus 'numeric' atau 'categorical'.")

    df = get_dataset(dataset_id)

    if column not in df.columns:
        raise FileError(f"Kolom '{column}' tidak ditemukan pada dataset.")

    series = df[column]
    is_numeric = pd.api.types.is_numeric_dtype(series)

    if (to == "numeric") == is_numeric:
        return profile_dataset(df)  # sudah bertipe itu

    if to == "categorical":
        converted = pd.Series(
            [None if pd.isna(v) else _format_number_as_text(v) for v in series],
            index=series.index,
            dtype="object",
        )
    else:
        values, bad = [], []

        for v in series:
            if pd.isna(v):
                values.append(None)
                continue

            text = str(v).strip()

            if _NUMBER.match(text):
                values.append(float(text.replace(",", ".")))
            else:
                values.append(None)
                bad.append(text)

        if bad:
            examples = ", ".join(f"'{b}'" for b in list(dict.fromkeys(bad))[:5])
            raise FileError(
                f"Kolom '{column}' tidak dapat dijadikan numerik karena berisi "
                f"{len(bad)} nilai yang bukan angka, mis. {examples}. "
                "Perbaiki nilai tersebut di file lalu unggah ulang, atau biarkan kolom ini kategorik."
            )

        converted = pd.to_numeric(
            pd.Series(values, index=series.index, dtype="object"), errors="coerce"
        )

    new_df = df.copy()
    new_df[column] = converted

    _DATASETS[dataset_id]["data"] = new_df
    # Tipe berubah, jadi pembersihan data harus diulang pada langkah berikutnya.
    _DATASETS[dataset_id]["cleaned"] = False

    return profile_dataset(new_df)
