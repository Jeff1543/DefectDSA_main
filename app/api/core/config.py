from pathlib import Path

# Muat file .env (bila ada) sebelum modul lain membaca os.environ.
# Variabel yang sudah diset di hosting tidak ditimpa.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
except ImportError:
    pass


# ============================================================
# BASE PATH
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

STATIC_DIR = BASE_DIR / "static"

DATA_DIR = BASE_DIR / "data"


# ============================================================
# FILE CONFIGURATION
# ============================================================

ALLOWED_EXTENSIONS = {".csv", ".xlsx"}

MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

PREVIEW_ROWS = 10


# ============================================================
# MANCOVA VARIABLE REQUIREMENTS
# ============================================================

# Struktur variabel fleksibel: metode (ANOVA/ANCOVA/MANOVA/MANCOVA)
# ditentukan otomatis dari jumlah variabel dependen dan ada tidaknya kovariat.
MIN_DEPENDENT_VARS = 1
MIN_INDEPENDENT_VARS = 1
MIN_COVARIATE_VARS = 0

# Kolom numerik dengan jumlah nilai unik <= batas ini boleh dipakai sebagai
# faktor (mis. kode kelompok 1/2/3).
MAX_FACTOR_LEVELS = 10


# ============================================================
# DATASET LIFETIME
# ============================================================

# Temporary in-memory dataset storage.
# No permanent database is used.
DATASET_TTL_SECONDS = 3600