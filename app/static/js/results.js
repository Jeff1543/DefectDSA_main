// ==========================================================================
// Research — Hasil Analisis: menampilkan hasil nyata dari /api/analyze
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const st = RS.load();
  const last = RS.getLast();

  let result = null;
  let fromLast = false;

  if (params.get("last") === "1") {
    result = last && last.result;
    fromLast = true;
  } else {
    result = st.result || null;
    if (!result && last) {
      result = last.result;
      fromLast = true;
    }
  }

  if (!result) {
    document.getElementById("resEmpty").hidden = false;
    return;
  }

  const m = result.method;
  const a = result.assumptions;
  const tests = result.mancova.tests;
  const effects = (result.effects || []).filter((e) => e.effect_type !== "intercept");
  const sigEffects = effects.filter((e) => e.significant);
  const multivariate = m.multivariate;

  const isReg = !!(result.mancova && result.mancova.regression);
  const TYPE_LABEL = { factor: "Faktor", covariate: isReg ? "Prediktor" : "Kovariat", interaction: "Interaksi", intercept: "Intercept" };

  // ---- Catatan sumber hasil ----
  const note = document.getElementById("resSavedNote");
  if (fromLast && last) {
    note.textContent = `Menampilkan hasil analisis tersimpan di browser ini (${RS.fmtDate(last.savedAt)}).`;
    note.hidden = false;
  } else if (result.analysis_id) {
    note.textContent = `Analisis ini tercatat sebagai #${result.analysis_id} pada ${RS.fmtDate(result.created_at)}.`;
    note.hidden = false;
  }

  // ---- Banner ----
  const metCount = a.tests.filter((t) => t.status === "met").length;
  const manualCount = a.tests.filter((t) => t.status === "info" || t.status === "not_evaluated").length;
  const metText = isReg
    ? ""
    : a.tests.length
    ? `${metCount} dari ${a.tests.length} asumsi terpenuhi${manualCount ? ` (${manualCount} dinilai mandiri)` : ""}${a.assumptions_met ? "." : ". Lihat catatan kehati-hatian."}`
    : "Asumsi tidak dapat diuji otomatis.";
  document.getElementById("resBanner").innerHTML =
    `<span class="check">✓</span> Analisis ${RS.esc(m.code)} selesai. ` +
    (sigEffects.length
      ? `Efek signifikan terdeteksi pada: ${sigEffects.map((e) => RS.esc(e.effect_label)).join(", ")}.`
      : "Tidak ada efek yang signifikan pada taraf 5%.") +
    (metText ? ` <span style="font-weight:600; margin-left:6px;">(${metText})</span>` : "");

  // ---- Tabel uji ----
  document.getElementById("resTestsTitle").textContent = isReg ? "Hasil Regresi Linier" : `${multivariate ? "Uji Multivariat" : "Uji Univariat"} (${m.code})`;

  const groups = [];
  tests.forEach((t) => {
    let g = groups.find((x) => x.effect === t.effect);
    if (!g) {
      g = { effect: t.effect, label: t.effect_label, type: t.effect_type, rows: [] };
      groups.push(g);
    }
    g.rows.push(t);
  });

  const statusPill = (sig) =>
    sig
      ? '<span class="pill-sig">Signifikan</span>'
      : '<span class="pill-ns">Tidak signifikan</span>';

  function tableFor(g) {
    const head = multivariate
      ? "<th>Statistik</th><th>Nilai</th><th>F</th><th>df</th><th>p</th><th>Keputusan</th>"
      : "<th>Statistik</th><th>F</th><th>df</th><th>p</th><th>η² parsial</th><th>Keputusan</th>";
    const body = g.rows
      .map((t) => {
        const df = t.den_df != null ? `${RS.fmtNum(t.df, 0)}, ${RS.fmtNum(t.den_df, 0)}` : RS.fmtNum(t.df, 0);
        return multivariate
          ? `<tr><td><strong>${RS.esc(t.statistic)}</strong></td><td>${RS.fmtNum(t.value)}</td><td>${RS.fmtNum(t.f_value, 3)}</td><td>${df}</td><td>${RS.fmtP(t.p_value)}</td><td>${statusPill(t.significant)}</td></tr>`
          : `<tr><td><strong>Uji F</strong></td><td>${RS.fmtNum(t.f_value, 3)}</td><td>${df}</td><td>${RS.fmtP(t.p_value)}</td><td>${RS.fmtNum(t.partial_eta_sq, 3)}</td><td>${statusPill(t.significant)}</td></tr>`;
      })
      .join("");
    return `<div class="table-scroll"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  const main = groups.filter((g) => g.type !== "intercept");
  const intercept = groups.find((g) => g.type === "intercept");

  document.getElementById("resTests").innerHTML =
    (isReg ? RS.regressionHtml(result.mancova.regression) : "") +
    main
      .map(
        (g) => `<div class="res-effect">
          <div class="res-effect-head"><h4>${RS.esc(g.label)}</h4><span class="type-tag">${TYPE_LABEL[g.type] || ""}</span></div>
          ${tableFor(g)}
        </div>`
      )
      .join("") +
    (multivariate
      ? `<p class="res-note">Pillai's trace adalah statistik yang paling robust bila asumsi tidak sepenuhnya terpenuhi.</p>`
      : "") +
    (intercept
      ? `<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:0.88rem;color:var(--slate-500);">Tampilkan baris Intercept (teknis)</summary>${tableFor(intercept)}</details>`
      : "");

  // ---- Wawasan ----
  document.getElementById("resInsight").innerHTML = Insight.render(result);

  // ---- Variabel ----
  const v = result.variables;
  const list = (arr) => (arr.length ? arr.map(RS.esc).join(", ") : "–");
  document.getElementById("resVars").innerHTML = `
    <div><dt>File</dt><dd>${RS.esc(result.dataset.filename)} (${result.dataset.n_rows.toLocaleString("id-ID")} baris)</dd></div>
    <div><dt>Dependen (Y)</dt><dd>${list(v.dependent)}</dd></div>
    <div><dt>Independen (X)</dt><dd>${list(v.independent)}</dd></div>
    <div><dt>${isReg ? "Prediktor (Z)" : "Kovariat (Z)"}</dt><dd>${list(v.covariates)}</dd></div>
    ${Object.keys(result.transformations || {}).length ? `<div><dt>Transformasi data</dt><dd>${Object.entries(result.transformations).map(([k, t]) => `${RS.esc(k)}: ${RS.esc(t.label)}`).join("; ")}</dd></div>` : ""}`;

  // ---- Grafik sederhana ----
  const fmtArea = (n) => RS.fmtNum(n, 2);

  const risk = result.dashboard.defect_risk_map || [];
  document.getElementById("resRisk").innerHTML = risk.length ? Charts.riskPanel(risk) : '<p class="res-note">Tidak ada data.</p>';

  const alt = result.dashboard.defect_by_altitude || [];
  const maxAlt = Math.max(...alt.map((r) => r.mean_area_cm2), 0.0001);
  document.getElementById("resAlt").innerHTML = alt.length
    ? alt
        .map(
          (r) => `<div class="risk-row">
            <span>${RS.esc(r.altitude_category)}</span>
            <div class="bar"><span class="lv-low" style="width:${Math.max(2, (r.mean_area_cm2 / maxAlt) * 100)}%"></span></div>
            <span>${fmtArea(r.mean_area_cm2)}</span>
          </div>`
        )
        .join("")
    : '<p class="res-note">Grafik ini tampil bila salah satu variabel independen bernama mengandung kata "ketinggian" atau "altitude".</p>';

  if (fromLast) document.getElementById("repLink").href = "laporan.html?last=1";
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("resContent").hidden = false;
});
