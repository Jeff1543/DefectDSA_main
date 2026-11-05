"""
Menjalankan server FastAPI khusus untuk tes e2e:
database sementara yang selalu bersih + akun admin yang kredensialnya diketahui tes.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / "tests" / ".tmp"
TMP.mkdir(parents=True, exist_ok=True)

db = TMP / "e2e.db"
for suffix in ("", "-wal", "-shm"):
    f = Path(str(db) + suffix)
    if f.exists():
        f.unlink()

os.environ["APP_DB_PATH"] = str(db)
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "TestAdmin123"
os.environ.pop("ANTHROPIC_API_KEY", None)

sys.path.insert(0, str(ROOT))
import uvicorn  # noqa: E402

# Data awal untuk tes dashboard admin: beberapa riwayat analisis (STATDES) yang bisa dihapus.
from app.api.core.db import init_db  # noqa: E402
from app.api.services import history_service as hs  # noqa: E402

init_db()
for i in range(1, 9):
    hs.save_descriptive(None, f"seed-{i}.csv", 10 + i, ["Y1", "Y2"], None, {"variables": []})

port = int(os.environ.get("E2E_PORT", "8765"))
uvicorn.run("app.api.main:app", host="127.0.0.1", port=port, log_level="warning")
