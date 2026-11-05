// ==========================================================================
// Laporan Analisis — dibuat dari hasil analisis yang benar-benar dijalankan
// dari file yang diunggah. Sumber: sesi berjalan, hasil terakhir di browser
// (?last=1), atau analisis tersimpan di server (?id=N, perlu login).
// ==========================================================================

(async function () {
  const root = document.getElementById("repRoot");
  const esc = RS.esc;
  const params = new URLSearchParams(location.search);

  function empty(title, html) {
    root.innerHTML = `<div class="card" style="text-align:center;padding:48px 24px;margin:32px 0 64px;">
      <h2 style="margin-bottom:8px;">${title}</h2><p style="color:var(--slate-500);margin-bottom:20px;">${html}</p>
      <a href="research-upload.html" class="btn btn-primary">Mulai Analisis</a></div>`;
  }

  // ---------------- Ambil data ----------------
  let result = null;
  let origin = "";

  if (params.get("id")) {
    try {
      const me = await Api.get("/api/auth/me");
      const path = me.user.role === "admin" ? "/api/admin/analyses/" : "/api/me/analyses/";
      const { item } = await Api.get(path + encodeURIComponent(params.get("id")));
      result = item.result;
      result.analysis_id = item.id;
      origin = `Analisis tersimpan #${item.id}${item.user_name ? " · " + item.user_name : ""}`;
    } catch (err) {
      empty("Laporan tidak dapat dibuka", `${esc(err.message)} Masuk lewat <a href="Authentication.html" style="text-decoration:underline;">Portal Peneliti</a> bila diperlukan.`);
      return;
    }
  } else {
    const last = RS.getLast();
    if (params.get("last") === "1") {
      result = last && last.result;
      origin = last ? `Hasil tersimpan di browser · ${RS.fmtDate(last.savedAt)}` : "";
    } else {
      result = RS.load().result || (last && last.result) || null;
      origin = result && result.analysis_id ? `Analisis #${result.analysis_id}` : "";
    }
  }

  if (!result) {
    empty("Belum ada laporan", "Laporan dibuat dari hasil analisis. Unggah data dan jalankan analisis terlebih dahulu.");
    return;
  }

  // ---------------- Hitung ringkasan ----------------
  const m = result.method;
  const a = result.assumptions;
  const v = result.variables;
  const tests = result.mancova.tests;
  const effects = (result.effects || []).filter((e) => e.effect_type !== "intercept");
  const sig = effects.filter((e) => e.significant);
  const ai = result.ai_insight || {};
  const nRows = result.dataset.n_rows;
  const list = (arr) => (arr.length ? arr.map(esc).join(", ") : "–");
  const TYPE = { factor: "Faktor", covariate: "Kovariat", interaction: "Interaksi" };
  const STATUS = { met: "Terpenuhi", not_met: "Tidak terpenuhi", info: "Dinilai mandiri", not_evaluated: "Tidak dievaluasi" };
  const pill = (s) => (s ? '<span class="pill-sig">Signifikan</span>' : '<span class="pill-ns">Tidak signifikan</span>');

  document.title = `Laporan ${m.code} — ${result.dataset.filename}`;

  // ---------------- Tabel asumsi ----------------
  const asRows = a.tests
    .map(
      (t) => `<tr>
        <td><strong>${esc(t.label)}</strong>${t.h0 ? `<div class="muted">H0: ${esc(t.h0)}</div>` : ""}<div class="muted">${esc(t.decision_text || t.explanation)}</div></td>
        <td>${esc(t.test_name || "–")}</td>
        <td>${t.p_value != null ? RS.fmtP(t.p_value) : "–"}</td>
        <td><span class="as-badge ${t.status === "met" ? "ok" : t.status === "not_met" ? "fail" : "na"}">${STATUS[t.status] || esc(t.status)}</span></td>
      </tr>`
    )
    .join("");

  // ---------------- Tabel hasil ----------------
  const mv = m.multivariate;
  const resRows = tests
    .filter((t) => t.effect_type !== "intercept")
    .map((t) => {
      const df = t.den_df != null ? `${RS.fmtNum(t.df, 0)}, ${RS.fmtNum(t.den_df, 0)}` : RS.fmtNum(t.df, 0);
      return mv
        ? `<tr><td><strong>${esc(t.effect_label)}</strong> <span class="type-tag">${TYPE[t.effect_type] || ""}</span></td><td>${esc(t.statistic)}</td><td>${RS.fmtNum(t.value)}</td><td>${RS.fmtNum(t.f_value, 3)}</td><td>${df}</td><td>${RS.fmtP(t.p_value)}</td><td>${pill(t.significant)}</td></tr>`
        : `<tr><td><strong>${esc(t.effect_label)}</strong> <span class="type-tag">${TYPE[t.effect_type] || ""}</span></td><td>${RS.fmtNum(t.f_value, 3)}</td><td>${df}</td><td>${RS.fmtP(t.p_value)}</td><td>${RS.fmtNum(t.partial_eta_sq, 3)}</td><td>${pill(t.significant)}</td></tr>`;
    })
    .join("");
  const resHead = mv
    ? "<th>Efek</th><th>Statistik</th><th>Nilai</th><th>F</th><th>df</th><th>p</th><th>Keputusan</th>"
    : "<th>Efek</th><th>F</th><th>df</th><th>p</th><th>η² parsial</th><th>Keputusan</th>";

  // ---------------- Grafik batang ----------------
  const LEVEL = { high: "TINGGI", medium: "SEDANG", low: "RENDAH", not_evaluated: "—" };
  const risk = (result.dashboard.defect_risk_map || []).slice().sort((x, y) => y.mean_area_cm2 - x.mean_area_cm2);
  const alt = (result.dashboard.defect_by_altitude || []).slice().sort((x, y) => y.mean_area_cm2 - x.mean_area_cm2);
  const barRows = (rows, label, cls, max) =>
    rows
      .map(
        (r) => `<div class="risk-row"><span style="text-transform:capitalize;">${esc(label(r))}</span>
          <div class="bar"><span class="${cls(r)}" style="width:${Math.max(2, (r.mean_area_cm2 / max) * 100)}%"></span></div>
          <span>${r.risk_level ? `<span class="lv">${LEVEL[r.risk_level]}</span> · ` : ""}${RS.fmtNum(r.mean_area_cm2, 2)}</span></div>`
      )
      .join("");
  const riskHtml = risk.length ? Charts.riskPanel(result.dashboard.defect_risk_map || []) : '<p class="res-note">Tidak ada data.</p>';
  const altHtml = alt.length
    ? barRows(alt, (r) => r.altitude_category, () => "lv-low", Math.max(...alt.map((r) => r.mean_area_cm2), 0.0001))
    : '<p class="res-note">Tampil bila ada variabel independen yang namanya mengandung "ketinggian" atau "altitude".</p>';

  // ---------------- Catatan & rekomendasi (diturunkan dari hasil) ----------------
  const recs = [];
  sig.filter((e) => e.effect_type === "factor").forEach((e) => {
    recs.push([`Faktor ${e.effect_label} berpengaruh nyata`, `Perbedaan antar kategori ${e.effect_label} terbukti signifikan (${RS.fmtP(e.p_value)}). Pertimbangkan penanganan atau pemantauan yang dibedakan menurut kategori tersebut.`]);
  });
  sig.filter((e) => e.effect_type === "covariate").forEach((e) => {
    recs.push([`Kovariat ${e.effect_label} berpengaruh nyata`, `${e.effect_label} berpengaruh signifikan terhadap variabel dependen (${RS.fmtP(e.p_value)}). Pantau dan, bila memungkinkan, kendalikan faktor ini di lapangan.`]);
  });
  sig.filter((e) => e.effect_type === "interaction").forEach((e) => {
    recs.push([`Interaksi ${e.effect_label} signifikan`, "Pengaruh satu faktor bergantung pada faktor lainnya, sehingga efek utamanya perlu ditafsirkan bersama interaksi ini."]);
  });
  if (!sig.length) {
    recs.push(["Belum ada bukti pengaruh pada taraf 5%", "Pertimbangkan menambah jumlah sampel, memeriksa kualitas data, atau menyertakan variabel lain yang relevan."]);
  }
  if (risk.length > 1 && risk[0].mean_area_cm2 > 0) {
    recs.push([`Perhatikan lokasi ${risk[0].location}`, `Lokasi dengan rata-rata defek tertinggi pada data ini adalah ${risk[0].location} (${RS.fmtNum(risk[0].mean_area_cm2, 2)}). Jadikan prioritas pemeriksaan.`]);
  }
  if (alt.length > 1) {
    recs.push([`Kategori ketinggian ${alt[0].altitude_category} paling tinggi`, `Rata-rata defek tertinggi terdapat pada kategori ${alt[0].altitude_category} (${RS.fmtNum(alt[0].mean_area_cm2, 2)}).`]);
  }
  if (!a.assumptions_met) {
    recs.push(["Tafsirkan dengan hati-hati", ai.assumption_caveat || a.warning_message || "Ada asumsi yang tidak terpenuhi."]);
  }
  if (nRows < 30) {
    recs.push(["Ukuran sampel kecil", `Data hanya ${nRows} baris; uji statistik pada sampel kecil kurang stabil dan mudah berubah bila data bertambah.`]);
  }
  recs.push(["Signifikan bukan berarti sebab-akibat", "Hasil menunjukkan adanya perbedaan atau hubungan pada data ini. Kesimpulan sebab-akibat memerlukan desain penelitian yang sesuai."]);

  const recHtml = recs
    .map(
      ([t, d], i) => `<div class="rec-item"${i === recs.length - 1 ? ' style="border-bottom:none;"' : ""}>
        <div class="icon-circle" style="font-weight:700;">${i + 1}</div>
        <div><h4>${esc(t)}</h4><p>${esc(d)}</p></div></div>`
    )
    .join("");

  // ---------------- Render ----------------
  root.innerHTML = `
    <div class="laporan-head">
      <span class="badge">ANALISIS SELESAI</span>
      <h1>Laporan Analisis ${esc(m.code)}</h1>
      <p class="rep-sub">${esc(result.dataset.filename)} · ${nRows.toLocaleString("id-ID")} baris · ${esc(RS.fmtDate(result.created_at))}</p>
    </div>
    ${origin ? `<p class="rep-meta">${esc(origin)}</p>` : ""}

    <div class="card rep-sec">
      <div class="rep-summary">
        <div class="rep-big">${sig.length}/${effects.length}<small>efek signifikan (p &lt; 0,05)</small></div>
        <div>
          <div class="rep-flags">
            <span class="pill-sig">${esc(m.code)}</span>
            ${a.tests.length ? `<span class="${a.assumptions_met ? "pill-sig" : "pill-ns"}">${a.tests.filter((t) => t.status === "met").length}/${a.tests.length} asumsi terpenuhi</span>` : ""}
          </div>
          <p>${esc(ai.narrative || "")}</p>
          ${ai.assumption_caveat ? `<p style="color:#8a3329;font-size:0.9rem;margin-top:8px;"><strong>Catatan:</strong> ${esc(ai.assumption_caveat)}</p>` : ""}
        </div>
      </div>
    </div>

    <div class="card rep-sec">
      <h3>Data &amp; Metode</h3>
      <p class="rep-hint">${esc(m.full_name)} — ${esc(m.reason)}</p>
      <dl class="vars-summary">
        <div><dt>File</dt><dd>${esc(result.dataset.filename)}</dd></div>
        <div><dt>Dependen (Y)</dt><dd>${list(v.dependent)}</dd></div>
        <div><dt>Independen (X)</dt><dd>${list(v.independent)}</dd></div>
        <div><dt>Kovariat (Z)</dt><dd>${list(v.covariates)}</dd></div>
        ${Object.keys(result.transformations || {}).length ? `<div><dt>Transformasi data</dt><dd>${Object.entries(result.transformations).map(([k, t]) => `${esc(k)}: ${esc(t.label)}`).join("; ")}</dd></div>` : ""}
      </dl>
    </div>

    <div class="card rep-sec">
      <h3>Wawasan &amp; Interpretasi</h3>
      <p class="rep-hint">Penjelasan hasil dalam bahasa sehari-hari, lengkap dengan grafik pendukung.</p>
      ${Insight.render(result)}
    </div>

    ${a.tests.length ? `<div class="card rep-sec">
      <h3>Uji Asumsi</h3>
      <p class="rep-hint">${a.assumptions_met ? "Seluruh asumsi yang dapat diuji terpenuhi." : "Ada asumsi yang belum terpenuhi; lihat catatan pada setiap baris."}</p>
      <div class="table-scroll"><table class="rep-table"><thead><tr><th>Asumsi dan keputusan</th><th>Uji</th><th>p</th><th>Status</th></tr></thead><tbody>${asRows}</tbody></table></div>
    </div>` : ""}

    ${result.mancova && result.mancova.regression ? `<div class="card rep-sec"><h3>Model Regresi Linier</h3>${RS.regressionHtml(result.mancova.regression)}</div>` : ""}

    <div class="card rep-sec">
      <h3>${result.mancova && result.mancova.regression ? "Hasil Uji Koefisien" : `Hasil Uji ${mv ? "Multivariat" : "Univariat"}`}</h3>
      <p class="rep-hint">Signifikan bila p &lt; 0,05.${mv ? " Pillai's trace paling robust bila asumsi tidak sepenuhnya terpenuhi." : ""}</p>
      <div class="table-scroll"><table class="rep-table"><thead><tr>${resHead}</tr></thead><tbody>${resRows}</tbody></table></div>
    </div>

    <div class="rep-two rep-sec" style="grid-template-columns:1.4fr 1fr;">
      <div class="card"><h3>Peta Risiko Defek per Lokasi</h3><p class="rep-hint">Warna menunjukkan tingkat rata-rata defek pada tiap bagian tubuh.</p>${riskHtml}</div>
      <div class="card"><h3>Rata-rata Defek per Ketinggian</h3><p class="rep-hint">Berdasarkan variabel independen ketinggian, bila ada.</p>${altHtml}</div>
    </div>

    <div class="rec-title">Catatan &amp; Rekomendasi</div>
    <div class="card" style="padding:8px 24px; margin-bottom:24px;">${recHtml}</div>

    <div class="laporan-footer-actions">
      <a href="research-results.html${params.get("last") === "1" ? "?last=1" : ""}" class="btn btn-secondary">Kembali ke Hasil</a>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" id="csvBtn">Unduh Tabel (CSV)</button>
        <button type="button" class="btn btn-primary" id="printBtn">Cetak / Simpan PDF</button>
      </div>
    </div>`;

  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("downloadPdfBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.print();
  });

  document.getElementById("csvBtn").addEventListener("click", () => {
    const safe = (x) => {
      let t = x === null || x === undefined ? "" : String(x);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const header = ["efek", "jenis", "statistik", "nilai", "f", "df", "df_penyebut", "p", "signifikan", "eta_parsial"];
    const rows = tests
      .filter((t) => t.effect_type !== "intercept")
      .map((t) => [t.effect_label, t.effect_type, t.statistic, t.value, t.f_value, t.df, t.den_df, t.p_value, t.significant ? "ya" : "tidak", t.partial_eta_sq ?? ""]);
    const csv = "\ufeff" + [header, ...rows].map((r) => r.map(safe).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `hasil-${m.code.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
})();
