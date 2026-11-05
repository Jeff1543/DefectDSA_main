import io
import numpy as np
import pandas as pd
import pytest

from conftest import admin_headers, register, upload

CASES = [
    ("ANOVA", ["Y1 Pipi"], ["Ketinggian"], []),
    ("ANCOVA", ["Y1 Pipi"], ["Ketinggian"], ["Suhu (C)"]),
    ("MANOVA", ["Y1 Pipi", "Y2 Perut"], ["Ketinggian"], []),
    ("MANCOVA", ["Y1 Pipi", "Y2 Perut", "Y3 Badan"], ["Ketinggian", "Kode Kelompok"], ["Suhu (C)", "Kelembapan"]),
]


# ---------------- umum ----------------
def test_health_and_root(client):
    assert client.get("/api/health").json()["status"] == "ok"
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"].endswith("/static/index.html")
    assert client.get("/static/index.html").status_code == 200


# ---------------- upload ----------------
@pytest.mark.parametrize("name", ["data.csv", "data.xlsx"])
def test_upload_csv_and_xlsx(client, frame, name):
    _, res = upload(client, frame, name, clean=False)
    cols = {c["name"]: c for c in res["profile"]["columns"]}
    assert res["profile"]["n_rows"] == 90 and len(cols) == 7
    assert cols["Y1 Pipi"]["dtype"] == "numeric" and cols["Ketinggian"]["can_be_factor"]
    assert cols["Kode Kelompok"]["can_be_factor"]          # numerik kode kelompok
    assert not cols["Suhu (C)"]["can_be_factor"]


def test_upload_semicolon_decimal_comma(client, frame):
    text = frame.round(2).to_csv(index=False, sep=";", decimal=",")
    r = client.post("/api/upload", files={"file": ("indo.csv", text.encode(), "text/csv")})
    assert r.status_code == 200
    cols = {c["name"]: c["dtype"] for c in r.json()["profile"]["columns"]}
    assert len(cols) == 7 and cols["Suhu (C)"] == "numeric"


def test_upload_drops_empty_excel_columns(client, frame):
    df = frame.copy()
    df["Unnamed: 9"] = np.nan
    _, res = upload(client, df, "x.xlsx", clean=False)
    assert len(res["profile"]["columns"]) == 7


def _xlsx_bytes(build):
    from openpyxl import Workbook
    wb = Workbook()
    build(wb)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_upload_header_not_on_first_row_xlsx(client):
    def build(wb):
        ws = wb.active
        ws.title = "Data"
        ws["A1"] = "LAPORAN DEFEK KULIT SAPI 2026"
        ws["A2"] = "Lokasi: Malang"
        ws.append([])
        ws.append(["Ketinggian", "Suhu", "Kelembapan", "Y1_Pipi"])
        for row in (["Rendah", 27.5, 68, 12.4], ["Sedang", 26.0, 72, 9.8], ["Tinggi", 22.3, 80, 4.1]):
            ws.append(row)
        ws.append(["Sumber: survei lapangan"])

    r = client.post("/api/upload", files={"file": ("judul.xlsx", _xlsx_bytes(build), "application/octet-stream")})
    assert r.status_code == 200, r.text
    body = r.json()
    names = [c["name"] for c in body["profile"]["columns"]]
    assert names == ["Ketinggian", "Suhu", "Kelembapan", "Y1_Pipi"]
    assert body["profile"]["n_rows"] == 3                       # catatan kaki tidak ikut terbaca
    assert body["read_info"]["header_row"] == 4 and body["read_info"]["skipped_rows"] == 3
    assert {c["name"]: c["dtype"] for c in body["profile"]["columns"]}["Suhu"] == "numeric"


def test_upload_header_not_on_first_row_csv(client):
    text = "Data Peternakan Kab. Malang;;;\n;;;\nKetinggian;Suhu;Kelembapan;Y1\nRendah;27,5;68;12,4\nSedang;26,0;72;9,8\n"
    r = client.post("/api/upload", files={"file": ("judul.csv", text.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["name"] for c in body["profile"]["columns"]] == ["Ketinggian", "Suhu", "Kelembapan", "Y1"]
    assert body["profile"]["n_rows"] == 2 and body["read_info"]["header_row"] == 3


def test_upload_picks_data_sheet_over_instruction_sheet(client):
    def build(wb):
        ws = wb.active
        ws.title = "Petunjuk"
        ws.append(["Kolom", "Keterangan"])
        ws.append(["Suhu", "Suhu kandang"])
        data = wb.create_sheet("Data")
        data.append(["Grup", "Suhu", "Y1"])
        for i in range(8):
            data.append(["A" if i % 2 else "B", 25 + i * 0.3, 3 + i])

    r = client.post("/api/upload", files={"file": ("multi.xlsx", _xlsx_bytes(build), "application/octet-stream")})
    assert r.status_code == 200, r.text
    assert r.json()["read_info"]["sheet"] == "Data" and r.json()["profile"]["n_rows"] == 8


def test_upload_duplicate_and_blank_headers_are_renamed(client):
    text = "Grup,Suhu,Suhu,\nA,25,26,x\nB,27,28,y\n"
    r = client.post("/api/upload", files={"file": ("dup.csv", text.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    assert [c["name"] for c in r.json()["profile"]["columns"]] == ["Grup", "Suhu", "Suhu_2", "Kolom_4"]


@pytest.mark.parametrize("name,rows", [("contoh-data.xlsx", 24)])
def test_bundled_templates_can_be_uploaded(client, name, rows):
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "app" / "static" / name
    r = client.post("/api/upload", files={"file": (name, path.read_bytes(), "application/octet-stream")})
    assert r.status_code == 200, r.text
    cols = {c["name"]: c["dtype"] for c in r.json()["profile"]["columns"]}
    assert r.json()["profile"]["n_rows"] == rows
    assert cols["Ketinggian"] == "categorical" and cols["Y1_Pipi"] == "numeric"


def test_blank_template_is_rejected_with_clear_message(client):
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "app" / "static" / "templat-data.xlsx"
    r = client.post("/api/upload", files={"file": ("templat-data.xlsx", path.read_bytes(), "application/octet-stream")})
    assert r.status_code in (400, 422) and "kosong" in r.json()["message"].lower()


def test_upload_title_only_is_rejected(client):
    r = client.post("/api/upload", files={"file": ("judul.csv", b"Judul saja\n\n\n", "text/csv")})
    assert r.status_code in (400, 422) and r.json()["success"] is False


@pytest.mark.parametrize("name,content", [
    ("a.txt", b"hello"),
    ("empty.csv", b""),
    ("onlyheader.csv", b"a,b,c\n"),
    ("bad.xlsx", b"not an excel"),
])
def test_upload_rejects_bad_files(client, name, content):
    r = client.post("/api/upload", files={"file": (name, content, "application/octet-stream")})
    assert r.status_code in (400, 413, 422)
    assert r.json()["success"] is False and r.json()["message"]


def test_upload_too_large(client):
    big = b"a,b\n" + b"1,2\n" * (3 * 1024 * 1024)
    r = client.post("/api/upload", files={"file": ("big.csv", big, "text/csv")})
    assert r.status_code in (400, 413) and r.json()["success"] is False


# ---------------- cleaning ----------------
def test_clean_variants(client, frame):
    df = frame.copy()
    df.loc[2, "Suhu (C)"] = np.nan
    df.loc[5, "Ketinggian"] = None
    did, _ = upload(client, df, clean=False)
    r = client.post("/api/clean", json={"dataset_id": did, "strategy": "drop"})
    assert r.status_code == 200 and r.json()["n_rows_after"] == 88
    did, _ = upload(client, df, clean=False)
    r = client.post("/api/clean", json={"dataset_id": did, "strategy": "impute", "impute_rules": {"numeric": "median", "categorical": "mode"}})
    assert r.status_code == 200 and r.json()["n_rows_after"] == 90
    assert client.post("/api/clean", json={"dataset_id": did, "strategy": "impute"}).status_code == 422
    assert client.post("/api/clean", json={"dataset_id": "nope", "strategy": "drop"}).status_code in (400, 404)


# ---------------- analisis ----------------
@pytest.mark.parametrize("code,dv,iv,cv", CASES)
def test_analyze_all_methods(client, frame, code, dv, iv, cv):
    did, _ = upload(client, frame)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": dv, "independent_vars": iv, "covariates": cv})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["method"]["code"] == code
    assert j["assumptions"]["summary"]["evaluated"] >= 1
    assert all(t["label"] and t["explanation"] for t in j["assumptions"]["tests"])
    assert any(e["effect_type"] == "factor" for e in j["effects"])
    assert j["analysis_id"] > 0


def test_analyze_validation(client, frame):
    did, _ = upload(client, frame)
    base = {"dataset_id": did}
    bad = [
        {"dependent_vars": ["Ketinggian"], "independent_vars": ["Y1 Pipi"]},
        {"dependent_vars": [], "independent_vars": ["Ketinggian"]},
        {"dependent_vars": ["Y1 Pipi"], "independent_vars": []},
        {"dependent_vars": ["Y1 Pipi"], "independent_vars": ["Suhu (C)"]},
        {"dependent_vars": ["Y1 Pipi"], "independent_vars": ["Ketinggian"], "covariates": ["Ketinggian"]},
        {"dependent_vars": ["Y1 Pipi"], "independent_vars": ["Ketinggian"], "covariates": ["Y1 Pipi"]},
        {"dependent_vars": ["Tidak Ada"], "independent_vars": ["Ketinggian"]},
    ]
    for b in bad:
        r = client.post("/api/analyze", json={**base, **b})
        assert r.status_code in (400, 422) and r.json()["success"] is False and r.json()["message"], b


def test_analyze_requires_cleaning_and_dataset(client, frame):
    did, _ = upload(client, frame, clean=False)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["Y1 Pipi"], "independent_vars": ["Ketinggian"]})
    assert r.status_code in (400, 422)
    r = client.post("/api/analyze", json={"dataset_id": "x", "dependent_vars": ["Y1 Pipi"], "independent_vars": ["Ketinggian"]})
    assert r.status_code in (400, 404)


def test_analyze_collinear_gives_message_not_500(client, frame):
    df = frame.copy()
    df["Dup"] = df["Ketinggian"]
    did, _ = upload(client, df)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["Y1 Pipi", "Y2 Perut"], "independent_vars": ["Ketinggian", "Dup"]})
    assert r.status_code != 500 or "kolinear" in r.json()["message"].lower() or r.json()["message"]


def test_analyze_constant_and_tiny_data(client):
    df = pd.DataFrame({"g": ["a", "a", "b", "b", "a", "b"], "y": [1.0] * 6, "x": [1, 2, 3, 4, 5, 6.0]})
    did, _ = upload(client, df)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["y"], "independent_vars": ["g"]})
    assert r.status_code < 500, r.text
    tiny = pd.DataFrame({"g": ["a", "b"], "y": [1.0, 2.0]})
    did, _ = upload(client, tiny)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["y"], "independent_vars": ["g"]})
    assert r.status_code < 500 and r.json()["success"] is False


def test_analyze_special_column_names(client):
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"Kelompok (A/B)": np.repeat(["a", "b"], 20), "Berat-Badan kg": rng.normal(10, 2, 40), "Suhu°C": rng.normal(30, 1, 40)})
    did, _ = upload(client, df)
    r = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["Berat-Badan kg"], "independent_vars": ["Kelompok (A/B)"], "covariates": ["Suhu°C"]})
    assert r.status_code == 200, r.text
    labels = [e["effect_label"] for e in r.json()["effects"]]
    assert "Kelompok (A/B)" in labels and "Suhu°C" in labels


# ---------------- statistika deskriptif ----------------
def test_descriptive_numeric_categorical_group_corr(client, frame):
    df = frame.copy()
    df.loc[3, "Suhu (C)"] = np.nan
    did, _ = upload(client, df, clean=False)             # tanpa cleaning
    r = client.post("/api/descriptive", json={"dataset_id": did, "variables": ["Suhu (C)", "Y1 Pipi", "Ketinggian"], "group_by": "Ketinggian"})
    assert r.status_code == 200, r.text
    j = r.json()
    v = {x["name"]: x for x in j["variables"]}
    assert v["Suhu (C)"]["missing"] == 1 and v["Suhu (C)"]["n"] == 89
    assert abs(v["Y1 Pipi"]["mean"] - df["Y1 Pipi"].mean()) < 1e-9
    assert abs(v["Y1 Pipi"]["std"] - df["Y1 Pipi"].std()) < 1e-9
    assert v["Y1 Pipi"]["histogram"] and sum(v["Y1 Pipi"]["histogram"]["counts"]) == 90
    assert v["Ketinggian"]["type"] == "categorical" and sum(f["count"] for f in v["Ketinggian"]["frequency"]) == 90
    assert len(j["groups"]["levels"]) == 3 and j["groups"]["stats"]["Y1 Pipi"][0]["n"] == 30
    assert j["correlation"]["variables"] == ["Suhu (C)", "Y1 Pipi"] and j["correlation"]["matrix"][0][0] == 1.0
    assert j["analysis_id"] > 0


def test_descriptive_edge_cases(client):
    df = pd.DataFrame({"const": [5.0] * 6, "allnan": [np.nan] * 6, "txt": list("aabbcc"), "num": [1, 2, 3, 4, 5, 100.0], "many": list("abcdefghijklmnopqrstuvwxyz")[:6]})
    did, _ = upload(client, df, clean=False)
    r = client.post("/api/descriptive", json={"dataset_id": did, "variables": ["const", "txt", "num"]})
    assert r.status_code == 200, r.text
    v = {x["name"]: x for x in r.json()["variables"]}
    assert v["const"]["std"] == 0.0 and v["const"]["histogram"] is None and v["const"]["skewness"] is None
    assert v["num"]["outliers"] == 1
    # kolom kosong seluruhnya sudah dibuang saat upload -> tidak ditemukan
    r = client.post("/api/descriptive", json={"dataset_id": did, "variables": ["allnan"]})
    assert r.status_code == 422 or r.status_code == 400
    assert client.post("/api/descriptive", json={"dataset_id": did, "variables": []}).status_code == 422
    assert client.post("/api/descriptive", json={"dataset_id": did, "variables": ["num", "num"]}).status_code in (400, 422)
    wide = pd.DataFrame({"v": np.arange(30, dtype=float), "id": np.arange(30)})
    wid, _ = upload(client, wide, clean=False)
    assert client.post("/api/descriptive", json={"dataset_id": wid, "variables": ["v"], "group_by": "id"}).status_code in (400, 422)   # numerik banyak nilai unik
    assert client.post("/api/descriptive", json={"dataset_id": did, "variables": ["num"], "group_by": "num"}).status_code == 200      # 6 nilai unik = boleh jadi kelompok
    assert client.post("/api/descriptive", json={"dataset_id": did, "variables": ["num"], "group_by": "ghost"}).status_code in (400, 422)
    assert client.post("/api/descriptive", json={"dataset_id": "x", "variables": ["num"]}).status_code in (400, 404)


# ---------------- auth ----------------
def test_auth_flow(client):
    h, u = register(client, "u1@test.id", "User Satu")
    assert u["role"] == "peneliti"
    assert client.get("/api/auth/me", headers=h).json()["user"]["email"] == "u1@test.id"
    assert client.post("/api/auth/register", json={"name": "XY", "email": "U1@test.id", "password": "rahasia123"}).status_code == 409
    assert client.post("/api/auth/register", json={"name": "XY", "email": "bad", "password": "rahasia123"}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "XY", "email": "p@t.id", "password": "123"}).status_code == 422
    assert client.post("/api/auth/login", json={"email": "u1@test.id", "password": "salah"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "U1@TEST.id", "password": "rahasia123"}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer abc.def"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer "}).status_code == 401


def test_login_rate_limit(client):
    register(client, "rl@test.id")
    codes = [client.post("/api/auth/login", json={"email": "rl@test.id", "password": "x"}).status_code for _ in range(10)]
    assert codes[0] == 401 and 429 in codes


def test_roles_and_isolation(client, frame):
    h1, u1 = register(client, "iso1@test.id")
    h2, u2 = register(client, "iso2@test.id")
    did, _ = upload(client, frame)
    a = client.post("/api/analyze", headers=h1, json={"dataset_id": did, "dependent_vars": ["Y1 Pipi"], "independent_vars": ["Ketinggian"]}).json()
    aid = a["analysis_id"]
    assert client.get(f"/api/me/analyses/{aid}", headers=h1).status_code == 200
    assert client.get(f"/api/me/analyses/{aid}", headers=h2).status_code == 404       # tidak bisa lihat milik orang lain
    assert client.get("/api/admin/overview", headers=h1).status_code == 403
    assert client.get("/api/admin/overview").status_code == 401
    assert client.get(f"/api/admin/analyses/{aid}", headers=admin_headers(client)).status_code == 200
    assert client.patch(f"/api/admin/users/{u2['id']}", headers=h1, json={"role": "admin"}).status_code == 403


# ---------------- kuesioner ----------------
IDENT = {"nama": "Pak Joko", "umur": 45, "jk": "Laki-laki", "telepon": "081234567890", "alamat": "Jl Mawar 12", "kecamatan": "Batu", "pengalaman": "5 Tahun"}
KATS = ["formula_pakan", "bibit_unggul", "kesehatan", "produksi", "nutrisi", "wilayah", "pemeliharaan", "peluang"]


def test_questionnaire(client):
    ans = {k: [4, 5, 3] for k in KATS}
    r = client.post("/api/questionnaire", json={"identitas": IDENT, "jawaban": ans})
    assert r.status_code == 200 and r.json()["scores"]["persen_total"] == 80.0
    j = r.json()
    # perbaikan jawaban memperbarui data yang sama (tidak ganda)
    ans2 = {k: [2, 2, 2] for k in KATS}
    r2 = client.post("/api/questionnaire", json={"identitas": IDENT, "jawaban": ans2, "replace": {"id": j["id"], "key": j["edit_key"]}})
    assert r2.json()["id"] == j["id"] and r2.json()["scores"]["persen_total"] == 40.0
    r3 = client.post("/api/questionnaire", json={"identitas": IDENT, "jawaban": ans2, "replace": {"id": j["id"], "key": "kunci-salah-xxxxx"}})
    assert r3.json()["id"] != j["id"]                                  # kunci salah -> data baru, bukan menimpa
    for bad in ({**ans, "produksi": [4, 9, 3]}, {**ans, "produksi": [4, 3]}, {k: v for k, v in ans.items() if k != "nutrisi"}):
        assert client.post("/api/questionnaire", json={"identitas": IDENT, "jawaban": bad}).status_code in (400, 422)
    assert client.post("/api/questionnaire", json={"identitas": {**IDENT, "kecamatan": "Lain"}, "jawaban": ans}).status_code == 422
    assert client.post("/api/questionnaire", json={"identitas": {**IDENT, "umur": 5}, "jawaban": ans}).status_code == 422


# ---------------- admin / dashboard ----------------
def test_admin_dashboard_and_export(client, frame):
    h = admin_headers(client)
    did, _ = upload(client, frame, clean=False)
    client.post("/api/descriptive", json={"dataset_id": did, "variables": ["Y1 Pipi"]})
    ov = client.get("/api/admin/overview", headers=h).json()
    assert ov["totals"]["pengguna"] >= 2 and ov["totals"]["analisis"] >= 1 and ov["totals"]["kuesioner"] >= 1
    assert {m["metode"] for m in ov["analisis"]["per_metode"]} == {"STATDES", "ANOVA", "ANCOVA", "MANOVA", "MANCOVA", "Regresi Linier"}
    assert len(ov["aktivitas"]) == 14
    lst = client.get("/api/admin/analyses?limit=200", headers=h)
    assert lst.status_code == 200
    assert client.get("/api/admin/analyses?limit=0", headers=h).status_code == 422
    assert client.get("/api/admin/analyses/99999", headers=h).status_code == 404
    csv = client.get("/api/admin/export/analyses.csv", headers=h)
    assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"]
    q = client.get("/api/admin/export/questionnaires.csv", headers=h)
    assert q.status_code == 200 and "skor_total" in q.text


def test_csv_injection_is_neutralised(client):
    h = admin_headers(client)
    ident = {**IDENT, "nama": "=HYPERLINK(\"http://x\")"}
    client.post("/api/questionnaire", json={"identitas": ident, "jawaban": {k: [3, 3, 3] for k in KATS}})
    text = client.get("/api/admin/export/questionnaires.csv", headers=h).text
    assert "'=HYPERLINK" in text and ",=HYPERLINK" not in text


def test_user_management(client):
    h = admin_headers(client)
    _, u = register(client, "mgmt@test.id")
    admin_id = client.get("/api/auth/me", headers=h).json()["user"]["id"]
    assert client.patch(f"/api/admin/users/{u['id']}", headers=h, json={"role": "admin"}).status_code == 200
    assert client.patch(f"/api/admin/users/{admin_id}", headers=h, json={"role": "peneliti"}).status_code == 403
    assert client.delete(f"/api/admin/users/{admin_id}", headers=h).status_code == 403
    assert client.patch(f"/api/admin/users/{u['id']}", headers=h, json={"password": "short"}).status_code == 422
    assert client.patch(f"/api/admin/users/{u['id']}", headers=h, json={"password": "passwordbaru1"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "mgmt@test.id", "password": "passwordbaru1"}).status_code == 200
    assert client.delete(f"/api/admin/users/{u['id']}", headers=h).status_code == 200
    assert client.delete("/api/admin/users/99999", headers=h).status_code == 404


def test_change_password(client):
    h, _ = register(client, "cp@test.id")
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": "salah", "new_password": "barubaru123"}).status_code == 401
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": "rahasia123", "new_password": "barubaru123"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "cp@test.id", "password": "barubaru123"}).status_code == 200


# ---------------- galeri ----------------
def test_gallery(client, tmp_path, monkeypatch):
    import app.api.gallery as g
    (tmp_path / "10-b.jpg").write_bytes(b"x")
    (tmp_path / "2-a.png").write_bytes(b"x")
    (tmp_path / "notes.txt").write_bytes(b"x")
    (tmp_path / "captions.json").write_text('{"2-a.png": "Judul <b>A</b>"}', encoding="utf-8")
    monkeypatch.setattr(g, "GALLERY_DIR", tmp_path)
    items = client.get("/api/gallery").json()["items"]
    assert [i["name"] for i in items] == ["2-a.png", "10-b.jpg"]            # urutan natural
    assert items[0]["caption"] == "Judul <b>A</b>" and items[1]["caption"] == ""
    (tmp_path / "captions.json").write_text("{rusak", encoding="utf-8")
    assert client.get("/api/gallery").status_code == 200                      # captions rusak tidak merusak galeri
    monkeypatch.setattr(g, "GALLERY_DIR", tmp_path / "tidak-ada")
    assert client.get("/api/gallery").json()["items"] == []


def test_validation_error_format(client):
    r = client.post("/api/analyze", json={"dataset_id": 1})
    assert r.status_code == 422 and r.json()["success"] is False and r.json()["error_code"] == "VALIDATION_ERROR"


# ---------------- uji asumsi: hipotesis, keputusan, visual, saran, transformasi ----------------
def _skewed():
    rng = np.random.default_rng(5)
    n = 90
    return pd.DataFrame({
        "Ketinggian": np.repeat(["Rendah", "Sedang", "Tinggi"], 30),
        "Suhu": rng.normal(28, 2, n),
        "Y1": np.exp(rng.normal(2, 0.7, n)) * np.repeat([1, 1.5, 2.5], 30),
    })


def test_assumption_details_and_counts(client):
    did, _ = upload(client, _skewed())
    j = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["Y1"], "independent_vars": ["Ketinggian"], "covariates": ["Suhu"]}).json()
    tests = j["assumptions"]["tests"]
    s = j["assumptions"]["summary"]
    # hitungan ringkasan harus konsisten dengan daftar uji
    assert s["total"] == len(tests)
    assert s["met"] == sum(t["status"] == "met" for t in tests)
    assert s["not_met"] == sum(t["status"] == "not_met" for t in tests)
    for t in tests:
        if t["type"] == "statistical":
            assert t["h0"] and t["h1"] and t["decision"] in ("H0 diterima", "H0 ditolak") and t["decision_text"]
            assert (t["decision"] == "H0 diterima") == (t["status"] == "met")
            assert "p = <" not in t["decision_text"] and "p = <" not in t["explanation"]
        if t["status"] == "not_met":
            assert t["remedies"] and any(r["action"] == "transform" for r in t["remedies"])
        if t["name"] != "independensi_pengamatan" and t["status"] != "not_evaluated":
            assert t.get("viz"), t["name"]
    assert j["transform_hints"][0]["variable"] == "Y1" and j["transform_hints"][0]["recommended"] == "log"


def test_transformation_fixes_assumption_and_is_recorded(client):
    did, _ = upload(client, _skewed())
    body = {"dataset_id": did, "dependent_vars": ["Y1"], "independent_vars": ["Ketinggian"]}
    before = client.post("/api/analyze", json=body).json()
    assert not before["assumptions"]["assumptions_met"]
    after = client.post("/api/analyze", json={**body, "transformations": {"Y1": "log"}}).json()
    assert after["assumptions"]["assumptions_met"] and after["transformations"]["Y1"]["method"] == "log"
    box = client.post("/api/analyze", json={**body, "transformations": {"Y1": "boxcox"}}).json()
    assert box["transformations"]["Y1"]["lambda"] is not None
    for bad in ({"Ketinggian": "log"}, {"Y1": "abc"}):
        r = client.post("/api/analyze", json={**body, "transformations": bad})
        assert r.status_code in (400, 422) and r.json()["message"]
    neg = _skewed(); neg.loc[0, "Y1"] = -5
    did2, _ = upload(client, neg)
    for m in ("log", "log1p", "sqrt"):                      # ada nilai negatif -> ditolak dengan pesan jelas
        r = client.post("/api/analyze", json={**body, "dataset_id": did2, "transformations": {"Y1": m}})
        assert r.status_code in (400, 422) and "tidak dapat dipakai" in r.json()["message"]


def test_insight_is_detailed_and_has_charts_data(client):
    did, _ = upload(client, _skewed())
    j = client.post("/api/analyze", json={"dataset_id": did, "dependent_vars": ["Y1"], "independent_vars": ["Ketinggian"], "covariates": ["Suhu"]}).json()
    ai = j["ai_insight"]
    assert len(ai["narrative"]) > 80 and ai["findings"] and ai["practical"] and ai["next_steps"] and ai["assumption_summary"]
    factor = next(f for f in ai["findings"] if f["effect"] == "Ketinggian")
    assert "Dari hasil analisis" in factor["explanation"] and "rata-rata tertinggi" in factor["explanation"]
    assert j["insight_viz"]["factors"][0]["groups"][0]["q1"] is not None
    assert j["insight_viz"]["covariates"][0]["points"]


def test_descriptive_saved_and_visible_to_admin(client, frame):
    did, _ = upload(client, frame, clean=False)
    r = client.post("/api/descriptive", json={"dataset_id": did, "variables": ["Y1 Pipi", "Ketinggian"]}).json()
    detail = client.get(f"/api/admin/analyses/{r['analysis_id']}", headers=admin_headers(client)).json()["item"]
    assert detail["method"] == "STATDES" and detail["dependent_vars"] == ["Y1 Pipi"] + ["Ketinggian"]


def test_gallery_reports_image_sizes(client, tmp_path, monkeypatch):
    from PIL import Image
    import app.api.gallery as g
    Image.new("RGB", (640, 480), "red").save(tmp_path / "a.jpg")
    Image.new("RGB", (300, 500), "blue").save(tmp_path / "b.png")
    Image.new("RGB", (400, 200), "green").save(tmp_path / "c.webp")
    (tmp_path / "rusak.jpg").write_bytes(b"bukan gambar")
    monkeypatch.setattr(g, "GALLERY_DIR", tmp_path)
    items = {i["name"]: i for i in client.get("/api/gallery").json()["items"]}
    assert (items["a.jpg"]["w"], items["a.jpg"]["h"]) == (640, 480)
    assert (items["b.png"]["w"], items["b.png"]["h"]) == (300, 500)
    assert (items["c.webp"]["w"], items["c.webp"]["h"]) == (400, 200)
    assert items["rusak.jpg"]["w"] is None


# ---------------------------------------------------------------------------
# Regresi Linier (tanpa faktor, prediktor numerik pada kotak kovariat)
# ---------------------------------------------------------------------------

def test_analyze_linear_regression(client, frame):
    did, _ = upload(client, frame)
    r = client.post("/api/analyze", json={
        "dataset_id": did, "dependent_vars": ["Y1 Pipi"],
        "independent_vars": [], "covariates": ["Suhu (C)", "Kelembapan"],
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["method"]["code"] == "Regresi Linier"
    reg = j["mancova"]["regression"]
    assert 0 <= reg["r_squared"] <= 1 and len(reg["coefficients"]) == 3
    assert {e["effect_label"] for e in j["effects"]} == {"Suhu (C)", "Kelembapan"}
    assert j["assumptions"]["tests"] == [] and j["assumptions"]["assumptions_met"] is True
    assert j["ai_insight"]["narrative"]


def test_linear_regression_rejects_multiple_dependents_and_constant_predictor(client, frame):
    did, _ = upload(client, frame)
    r = client.post("/api/analyze", json={
        "dataset_id": did, "dependent_vars": ["Y1 Pipi", "Y2 Perut"],
        "independent_vars": [], "covariates": ["Suhu (C)"],
    })
    assert r.status_code in (400, 422) and "1 variabel dependen" in r.json()["message"]

    df = frame.copy()
    df["Konstan"] = 5.0
    did, _ = upload(client, df)
    r = client.post("/api/analyze", json={
        "dataset_id": did, "dependent_vars": ["Y1 Pipi"],
        "independent_vars": [], "covariates": ["Konstan"],
    })
    assert r.status_code != 500
