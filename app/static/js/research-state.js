// ==========================================================================
// Status alur Analisis Ragam (disimpan di sessionStorage per tab) +
// hasil analisis terakhir (localStorage, agar bisa dilihat lagi)
// ==========================================================================

const RS = {
  KEY: "mancova_research_v1",
  LAST: "mancova_last_analysis_v1",

  load() {
    try {
      return JSON.parse(sessionStorage.getItem(RS.KEY)) || {};
    } catch (e) {
      return {};
    }
  },
  save(patch) {
    const state = Object.assign(RS.load(), patch);
    try {
      sessionStorage.setItem(RS.KEY, JSON.stringify(state));
    } catch (e) {}
    return state;
  },
  reset() {
    sessionStorage.removeItem(RS.KEY);
  },

  setLast(result) {
    try {
      localStorage.setItem(RS.LAST, JSON.stringify({ savedAt: new Date().toISOString(), result }));
    } catch (e) {}
  },
  getLast() {
    try {
      return JSON.parse(localStorage.getItem(RS.LAST));
    } catch (e) {
      return null;
    }
  },
  clearLast() {
    localStorage.removeItem(RS.LAST);
  },

  // ------------------------------------------------------------------
  // Daftar uji yang dipilih PENGGUNA di langkah "Pilih Uji" (sebelum memilih variabel).
  // rules.{dep|ind|cov} = jumlah variabel yang diizinkan: min, max (null = tak terbatas,
  // 0 = tidak dipakai). Struktur ini sengaja sama dengan aturan backend
  // (MancovaService.identify_method), sehingga backend menurunkan metode yang sama.
  // ------------------------------------------------------------------
  METHODS: {
    ANOVA: {
      code: "ANOVA",
      full: "Analysis of Variance",
      tag: "1 respons · tanpa kovariat",
      desc: "Membandingkan rata-rata satu variabel respons antar kelompok (faktor).",
      example: "Apakah rata-rata luas defek kulit berbeda antar lokasi?",
      rules: { dep: { min: 1, max: 1 }, ind: { min: 1, max: null }, cov: { min: 0, max: 0 } },
    },
    ANCOVA: {
      code: "ANCOVA",
      full: "Analysis of Covariance",
      tag: "1 respons · dengan kovariat",
      desc: "Seperti ANOVA, tetapi pengaruh variabel pengganggu (kovariat) dikendalikan.",
      example: "Apakah luas defek berbeda antar lokasi setelah suhu dikendalikan?",
      rules: { dep: { min: 1, max: 1 }, ind: { min: 1, max: null }, cov: { min: 1, max: null } },
    },
    MANOVA: {
      code: "MANOVA",
      full: "Multivariate Analysis of Variance",
      tag: "≥2 respons · tanpa kovariat",
      desc: "Membandingkan beberapa variabel respons sekaligus antar kelompok (faktor).",
      example: "Apakah luas defek dan pertambahan berat berbeda antar perlakuan?",
      rules: { dep: { min: 2, max: null }, ind: { min: 1, max: null }, cov: { min: 0, max: 0 } },
    },
    MANCOVA: {
      code: "MANCOVA",
      full: "Multivariate Analysis of Covariance",
      tag: "≥2 respons · dengan kovariat",
      desc: "Seperti MANOVA, tetapi pengaruh kovariat dikendalikan.",
      example: "Apakah luas defek dan berat berbeda antar perlakuan setelah suhu dikendalikan?",
      rules: { dep: { min: 2, max: null }, ind: { min: 1, max: null }, cov: { min: 1, max: null } },
    },
    "Regresi Linier": {
      code: "Regresi Linier",
      full: "Linear Regression (Regresi Linier)",
      tag: "1 respons · tanpa faktor",
      desc: "Mengukur pengaruh satu atau lebih prediktor numerik terhadap satu variabel respons.",
      example: "Seberapa besar suhu dan kelembapan memengaruhi luas defek?",
      rules: { dep: { min: 1, max: 1 }, ind: { min: 0, max: 0 }, cov: { min: 1, max: null } },
    },
  },

  // Teks syarat jumlah variabel, mis. "tepat 1", "minimal 2", "tidak dipakai"
  ruleText(r) {
    if (r.max === 0) return "tidak dipakai";
    if (r.max !== null && r.max === r.min) return `tepat ${r.min}`;
    return `minimal ${r.min}`;
  },

  // Periksa pilihan variabel terhadap uji yang dipilih.
  // Mengembalikan { ok, missing: [..], errors: [..] }
  validateSelection(code, sel) {
    const m = RS.METHODS[code];
    if (!m) return { ok: false, missing: ["uji yang akan dipakai"], errors: [] };
    const label = {
      dep: "variabel Dependen",
      ind: "variabel Independen (faktor)",
      cov: code === "Regresi Linier" ? "Kovariat (prediktor)" : "Kovariat",
    };
    const n = { dep: (sel.dependent || []).length, ind: (sel.independent || []).length, cov: (sel.covariates || []).length };
    const missing = [];
    const errors = [];
    ["dep", "ind", "cov"].forEach((k) => {
      const r = m.rules[k];
      if (r.max === 0) {
        if (n[k] > 0) errors.push(`${code} tidak memakai ${label[k]}. Keluarkan variabel dari kotak itu.`);
      } else {
        if (n[k] < r.min) missing.push(`${r.min === 1 ? "1" : "minimal " + r.min} ${label[k]}`);
        if (r.max !== null && n[k] > r.max) errors.push(`${code} hanya memakai ${r.max} ${label[k]}.`);
      }
    });
    return { ok: !missing.length && !errors.length, missing, errors };
  },

  // Aturan yang sama dengan backend (MancovaService.identify_method)
  identifyMethod(nDependent, nCovariates, nIndependent = 1) {
    if (nIndependent === 0 && nCovariates >= 1) {
      return { code: "Regresi Linier", full: "Linear Regression (Regresi Linier)", multivariate: false, hasCov: true, isRegression: true };
    }
    const multivariate = nDependent >= 2;
    const hasCov = nCovariates >= 1;
    const code = multivariate ? (hasCov ? "MANCOVA" : "MANOVA") : hasCov ? "ANCOVA" : "ANOVA";
    const full = {
      ANOVA: "Analysis of Variance",
      ANCOVA: "Analysis of Covariance",
      MANOVA: "Multivariate Analysis of Variance",
      MANCOVA: "Multivariate Analysis of Covariance",
    }[code];
    return { code, full, multivariate, hasCov, isRegression: false };
  },

  // Ringkasan model Regresi Linier (dipakai halaman Hasil dan Laporan)
  regressionHtml(reg) {
    if (!reg) return "";
    const e = RS.esc;
    const rows = reg.coefficients
      .map(
        (c) => `<tr><td><strong>${e(c.term === "Intercept" ? "Konstanta (Intercept)" : c.term)}</strong></td>
          <td>${RS.fmtNum(c.estimate, 4)}</td><td>${RS.fmtNum(c.std_error, 4)}</td><td>${RS.fmtNum(c.t_value, 3)}</td>
          <td>${RS.fmtP(c.p_value)}</td><td>${RS.fmtNum(c.ci_low, 3)} – ${RS.fmtNum(c.ci_high, 3)}</td>
          <td>${c.beta == null ? "–" : RS.fmtNum(c.beta, 3)}</td>
          <td>${c.significant ? '<span class="pill-sig">Signifikan</span>' : '<span class="pill-ns">Tidak signifikan</span>'}</td></tr>`
      )
      .join("");
    return `<div class="res-effect">
      <div class="res-effect-head"><h4>Ringkasan Model Regresi</h4><span class="type-tag">${e(reg.dependent)}</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>R²</th><th>R² disesuaikan</th><th>F model</th><th>df</th><th>p</th><th>RMSE</th><th>n</th></tr></thead>
        <tbody><tr><td>${RS.fmtNum(reg.r_squared, 3)}</td><td>${RS.fmtNum(reg.adj_r_squared, 3)}</td><td>${RS.fmtNum(reg.f_value, 3)}</td>
        <td>${RS.fmtNum(reg.df_model, 0)}, ${RS.fmtNum(reg.df_resid, 0)}</td><td>${RS.fmtP(reg.f_p_value)}</td><td>${RS.fmtNum(reg.rmse, 3)}</td><td>${RS.fmtNum(reg.n, 0)}</td></tr></tbody></table></div>
      <div class="table-scroll" style="margin-top:12px;"><table class="data-table"><thead><tr><th>Suku</th><th>Koefisien (b)</th><th>Galat baku</th><th>t</th><th>p</th><th>CI 95%</th><th>Beta</th><th>Keputusan</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="res-note">Koefisien b: perubahan ${e(reg.dependent)} bila prediktor naik 1 satuan dengan prediktor lain tetap. Beta (terstandar) membandingkan kekuatan antar prediktor.</p>
    </div>`;
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  fmtNum(n, d = 4) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: d });
  },
  fmtP(p) {
    if (p === null || p === undefined || Number.isNaN(p)) return "-";
    return p < 0.001 ? "< 0,001" : p.toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  },
  fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return iso || "";
    }
  },
};
