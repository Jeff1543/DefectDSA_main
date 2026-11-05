// ==========================================================================
// Wawasan & Interpretasi: penjelasan awam + grafik yang sesuai tiap temuan.
// Dipakai halaman hasil dan laporan.  Bergantung pada RS dan Charts.
// ==========================================================================

const Insight = (() => {
  const esc = RS.esc;

  function boxLegend() {
    return '<p class="ch-cap">Cara membaca: kotak = 50% data di tengah, garis tebal = median, berlian = rata-rata, lingkaran kecil = nilai ekstrem.</p>';
  }

  function chartsFor(finding, viz) {
    let html = "";
    const fac = (viz.factors || []).filter((v) => v.factor === finding.effect).slice(0, 3);
    const cov = (viz.covariates || []).filter((v) => v.x === finding.effect).slice(0, 2);

    if (fac.length) {
      html += `<div class="ch-row">${fac
        .map((v) => `<div class="ch-box"><h5>Sebaran ${esc(v.dv)} menurut ${esc(v.factor)}</h5>${Charts.boxGroups(v.groups)}</div>`)
        .join("")}</div>${boxLegend()}`;
    }
    if (cov.length) {
      html += `<div class="ch-row">${cov
        .map((v) => {
          const pair = { x: v.x, y: v.y, points: v.points.map((p) => [p[0], p[1], 0]), groups: [], overall: { slope: v.slope, intercept: v.intercept }, group_lines: [] };
          return `<div class="ch-box"><h5>Hubungan ${esc(v.x)} dengan ${esc(v.y)} (r = ${RS.fmtNum(v.r, 2)})</h5>${Charts.scatter(pair)}</div>`;
        })
        .join("")}</div><p class="ch-cap">Setiap titik adalah satu data; garis putus-putus menunjukkan arah hubungan rata-ratanya.</p>`;
    }
    return html;
  }

  function fallbackFindings(result) {
    return (result.effects || [])
      .filter((e) => e.effect_type !== "intercept")
      .map((e) => ({
        effect: e.effect_label,
        title: `${e.effect_label} ${e.significant ? "berpengaruh signifikan" : "tidak berpengaruh signifikan"}`,
        explanation: `Hasil uji untuk ${e.effect_label}: ${RS.fmtP(e.p_value)} (${e.significant ? "kurang dari" : "lebih dari"} 0,05).`,
        significant: e.significant,
      }));
  }

  const GLOSSARY = [
    ["Signifikan", "Perbedaan atau hubungan yang ditemukan sangat kecil kemungkinannya terjadi hanya karena kebetulan (p kurang dari 0,05)."],
    ["p-value (nilai p)", "Peluang mendapatkan hasil seperti ini bila sebenarnya tidak ada pengaruh sama sekali. Makin kecil, makin kuat bukti adanya pengaruh."],
    ["Faktor", "Pengelompokan yang ingin dibandingkan, misalnya ketinggian kandang atau jenis perlakuan."],
    ["Kovariat", "Variabel pengganggu (mis. suhu) yang dikendalikan secara statistik agar pengaruh faktor utama lebih murni."],
    ["Asumsi", "Syarat agar uji statistik akurat. Bila terpenuhi, hasil lebih dapat dipercaya."],
    ["H0 (hipotesis nol)", "Anggapan awal bahwa tidak ada pengaruh/perbedaan (atau pada uji asumsi: syarat terpenuhi). H0 ditolak bila p kurang dari 0,05."],
  ];

  function render(result) {
    const ai = result.ai_insight || {};
    const viz = result.insight_viz || { factors: [], covariates: [] };
    const findings = (ai.findings && ai.findings.length ? ai.findings : fallbackFindings(result));
    const source = ai.source === "generative_ai" ? "Dijelaskan oleh AI berdasarkan hasil analisis" : "Penjelasan otomatis berdasarkan hasil analisis";

    const cards = findings
      .map(
        (f) => `<article class="ins-find ${f.significant ? "sig" : ""}">
          <header><span class="ins-ico" aria-hidden="true">${f.significant ? "✓" : "○"}</span><h4>${esc(f.title)}</h4>
            <span class="${f.significant ? "pill-sig" : "pill-ns"}">${f.significant ? "Signifikan" : "Tidak signifikan"}</span></header>
          <p>${esc(f.explanation)}</p>
          ${chartsFor(f, viz)}
        </article>`
      )
      .join("");

    const list = (title, arr) =>
      arr && arr.length ? `<div class="ins-block"><h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";

    const caveat = ai.caveat || ai.assumption_caveat;

    return `
      <div class="ins-summary"><p>${esc(ai.narrative || "")}</p></div>
      <div class="ins-finds">${cards}</div>
      ${list("Arti praktis untuk Anda", ai.practical)}
      ${ai.assumption_summary ? `<div class="ins-block"><h4>Tentang uji asumsi</h4><p>${esc(ai.assumption_summary)}</p></div>` : ""}
      ${caveat ? `<div class="notice notice-warn" style="margin:14px 0;"><strong>Catatan kehati-hatian:</strong> ${esc(caveat)}</div>` : ""}
      ${list("Langkah selanjutnya", ai.next_steps)}
      <details class="ins-gloss"><summary>Arti istilah yang dipakai</summary>
        <dl>${GLOSSARY.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("")}</dl></details>
      <p class="insight-source">${source}.</p>`;
  }

  return { render };
})();
