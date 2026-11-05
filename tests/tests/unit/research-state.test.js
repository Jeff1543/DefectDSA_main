import { beforeEach, describe, expect, it } from "vitest";
import { loadScript } from "./helpers/load-script.js";

const { RS } = loadScript("research-state.js", ["RS"]);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("RS.esc", () => {
  it("meloloskan karakter HTML berbahaya", () => {
    expect(RS.esc(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;"
    );
  });
  it("mengubah null/undefined menjadi string kosong", () => {
    expect(RS.esc(null)).toBe("");
    expect(RS.esc(undefined)).toBe("");
  });
  it("tetap bekerja untuk angka", () => {
    expect(RS.esc(42)).toBe("42");
  });
});

describe("RS.fmtNum / RS.fmtP", () => {
  it("memakai format angka Indonesia", () => {
    expect(RS.fmtNum(1234.5678, 2)).toBe("1.234,57");
  });
  it("mengembalikan '-' untuk nilai kosong atau NaN", () => {
    expect(RS.fmtNum(null)).toBe("-");
    expect(RS.fmtNum(undefined)).toBe("-");
    expect(RS.fmtNum(NaN)).toBe("-");
    expect(RS.fmtP(null)).toBe("-");
  });
  it("menampilkan p sangat kecil sebagai < 0,001", () => {
    expect(RS.fmtP(0.0004)).toBe("< 0,001");
  });
  it("menampilkan p lain dengan 3 desimal", () => {
    expect(RS.fmtP(0.04)).toBe("0,040");
    expect(RS.fmtP(0.5)).toBe("0,500");
  });
});

describe("RS.ruleText", () => {
  it.each([
    [{ min: 0, max: 0 }, "tidak dipakai"],
    [{ min: 1, max: 1 }, "tepat 1"],
    [{ min: 2, max: null }, "minimal 2"],
  ])("%j -> %s", (rule, text) => {
    expect(RS.ruleText(rule)).toBe(text);
  });
});

describe("RS.identifyMethod", () => {
  it.each([
    [1, 0, 1, "ANOVA"],
    [1, 2, 1, "ANCOVA"],
    [3, 0, 1, "MANOVA"],
    [2, 1, 1, "MANCOVA"],
  ])("dep=%i cov=%i ind=%i -> %s", (dep, cov, ind, code) => {
    const m = RS.identifyMethod(dep, cov, ind);
    expect(m.code).toBe(code);
    expect(m.isRegression).toBe(false);
    expect(m.multivariate).toBe(dep >= 2);
    expect(m.hasCov).toBe(cov >= 1);
  });

  it("tanpa faktor tetapi ada kovariat -> Regresi Linier", () => {
    const m = RS.identifyMethod(1, 2, 0);
    expect(m.code).toBe("Regresi Linier");
    expect(m.isRegression).toBe(true);
  });
});

describe("RS.validateSelection", () => {
  it("ANOVA valid: 1 dependen + 1 faktor", () => {
    const r = RS.validateSelection("ANOVA", { dependent: ["Y1"], independent: ["Lokasi"], covariates: [] });
    expect(r).toEqual({ ok: true, missing: [], errors: [] });
  });

  it("ANOVA tidak boleh memakai kovariat", () => {
    const r = RS.validateSelection("ANOVA", { dependent: ["Y1"], independent: ["A"], covariates: ["Suhu"] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/tidak memakai/);
  });

  it("ANOVA hanya boleh 1 dependen", () => {
    const r = RS.validateSelection("ANOVA", { dependent: ["Y1", "Y2"], independent: ["A"], covariates: [] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/hanya memakai 1/);
  });

  it("MANCOVA kekurangan variabel dilaporkan di `missing`", () => {
    const r = RS.validateSelection("MANCOVA", { dependent: ["Y1"], independent: [], covariates: [] });
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(3);
  });

  it("Regresi Linier valid: 1 dependen + kovariat, tanpa faktor", () => {
    const r = RS.validateSelection("Regresi Linier", { dependent: ["Y"], independent: [], covariates: ["Suhu", "Lembab"] });
    expect(r.ok).toBe(true);
  });

  it("uji tidak dikenal -> tidak ok", () => {
    const r = RS.validateSelection("XYZ", {});
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["uji yang akan dipakai"]);
  });
});

describe("RS.METHODS", () => {
  it("setiap uji punya field lengkap", () => {
    for (const [key, m] of Object.entries(RS.METHODS)) {
      expect(m.code).toBe(key);
      expect(m.rules).toHaveProperty("dep");
      expect(m.rules).toHaveProperty("ind");
      expect(m.rules).toHaveProperty("cov");
    }
  });
});

describe("RS penyimpanan status", () => {
  it("load() kosong bila belum ada data", () => {
    expect(RS.load()).toEqual({});
  });
  it("save() menggabungkan patch dan tersimpan di sessionStorage", () => {
    RS.save({ datasetId: "abc" });
    const state = RS.save({ filename: "data.xlsx" });
    expect(state).toEqual({ datasetId: "abc", filename: "data.xlsx" });
    expect(RS.load()).toEqual(state);
  });
  it("load() tahan terhadap JSON rusak", () => {
    sessionStorage.setItem(RS.KEY, "{bukan json");
    expect(RS.load()).toEqual({});
  });
  it("reset() menghapus status", () => {
    RS.save({ a: 1 });
    RS.reset();
    expect(RS.load()).toEqual({});
  });
  it("setLast/getLast/clearLast menyimpan hasil analisis terakhir", () => {
    expect(RS.getLast()).toBeNull();
    RS.setLast({ method: "ANOVA" });
    expect(RS.getLast().result).toEqual({ method: "ANOVA" });
    expect(typeof RS.getLast().savedAt).toBe("string");
    RS.clearLast();
    expect(RS.getLast()).toBeNull();
  });
});
