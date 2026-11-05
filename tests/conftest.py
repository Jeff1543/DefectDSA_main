import os
import tempfile

_TMP = tempfile.mkdtemp()
os.environ["APP_DB_PATH"] = os.path.join(_TMP, "test.db")
os.environ["APP_SECRET"] = "test-secret"
os.environ["ADMIN_EMAIL"] = "admin@test.id"
os.environ["ADMIN_PASSWORD"] = "adminpass123"

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def frame():
    rng = np.random.default_rng(1)
    n = 90
    height = np.repeat(["Rendah", "Sedang", "Tinggi"], n // 3)
    temp = rng.normal(28, 2, n)
    hum = rng.normal(70, 5, n)
    base = np.repeat([0, 4, 9], n // 3)
    return pd.DataFrame({
        "Ketinggian": height,
        "Kode Kelompok": rng.integers(1, 3, n),
        "Suhu (C)": temp,
        "Kelembapan": hum,
        "Y1 Pipi": base + 0.8 * temp + rng.normal(0, 3, n),
        "Y2 Perut": base * 0.5 + 0.3 * hum + rng.normal(0, 3, n),
        "Y3 Badan": rng.normal(10, 3, n),
    })


def upload(client, df, name="data.csv", clean=True, **to_csv):
    if name.endswith(".xlsx"):
        import io
        buf = io.BytesIO()
        df.to_excel(buf, index=False)
        content = buf.getvalue()
    else:
        content = df.to_csv(index=False, **to_csv).encode()
    r = client.post("/api/upload", files={"file": (name, content, "application/octet-stream")})
    assert r.status_code == 200, r.text
    did = r.json()["dataset_id"]
    if clean:
        c = client.post("/api/clean", json={"dataset_id": did, "strategy": "impute", "impute_rules": {"numeric": "mean", "categorical": "mode"}})
        assert c.status_code == 200, c.text
    return did, r.json()


def register(client, email, name="Tester", password="rahasia123"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}, r.json()["user"]


def admin_headers(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.id", "password": "adminpass123"})
    return {"Authorization": "Bearer " + r.json()["token"]}
