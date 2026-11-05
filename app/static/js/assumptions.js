// ==========================================================================
// Research — Uji Asumsi: menjalankan POST /api/analyze, lalu menampilkan tiap
// asumsi lengkap dengan hipotesis (H0/H1), keputusan, visualisasi, dan saran
// perbaikan (termasuk transformasi data + uji ulang).
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const st = RS.load();
  const sel = st.selection;
  const esc = RS.esc;
  const errBox = document.getElementById("asError");
  const loading = document.getElementById("asLoading");
  const content = document.getElementById("asContent");

  const showError = (html) => {
    errBox.innerHTML = html;
    errBox.hidden = !html;
  };

  if (!st.datasetId || !sel || !sel.dependent || !sel.dependent.length || !sel.independent || (!sel.independent.length && !(sel.covariates && sel.covariates.length))) {
    showError('Variabel belum dipilih. <a href="research-variables.html">Pilih variabel</a> terlebih dahulu.');
    return;
  }

  // Uji dipilih lebih dulu; pilihan variabel harus cocok dengan syarat uji tersebut.
  if (!st.method || !RS.METHODS[st.method]) {
    showError('Uji statistik belum dipilih. <a href="research-methods.html">Pilih uji</a> terlebih dahulu.');
    return;
  }
  const chk = RS.validateSelection(st.method, sel);
  if (!chk.ok) {
    showError(`Pilihan variabel belum sesuai untuk ${esc(st.method)}. ${esc([...chk.errors, ...chk.missing.map((m) => "Butuh " + m + ".")].join(" "))} <a href="research-variables.html">Ubah variabel</a>.`);
    return;
  }

  const transformsNow = () => (RS.load().selection && RS.load().selection.transformations) || {};
  const keyFor = () => JSON.stringify([st.datasetId, RS.load().selection]);

  async function run(transformations) {
    showError("");
    content.hidden = true;
    loading.hidden = false;

    const nextSel = Object.assign({}, RS.load().selection, { transformations });
    RS.save({ selection: nextSel });

    try {
      const result = await Api.post("/api/analyze", {
        dataset_id: st.datasetId,
        method: st.method,
        dependent_vars: nextSel.dependent,
        independent_vars: nextSel.independent,
        covariates: nextSel.covariates || [],
        transformations,
      });
      RS.save({ result, resultKey: keyFor() });
      RS.setLast(result);
      // Regresi Linier tidak memakai uji asumsi: langsung ke halaman hasil.
      if (result.method && result.method.code === "Regresi Linier") {
        window.location.replace("research-results.html");
        return;
      }
      loading.hidden = true;
      render(result);
    } catch (err) {
      loading.hidden = true;
      const expired = /sesi dataset|belum melalui/i.test(err.message);
      showError(
        `<strong>Analisis tidak dapat dijalankan.</strong> ${esc(err.message)} ` +
          (expired
            ? '<a href="research-upload.html">Unggah ulang file</a>.'
            : '<a href="research-variables.html">Ubah variabel</a>, <a href="#" id="resetTr">kembalikan data asli</a>, atau <a href="#" id="retryLink">coba lagi</a>.')
      );
      document.getElementById("retryLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        run(transformsNow());
      });
      document.getElementById("resetTr")?.addEventListener("click", (e) => {
        e.preventDefault();
        run({});
      });
    }
  }

  // ------------------------------------------------------------------
  // Visualisasi per jenis uji
  // ------------------------------------------------------------------
  function vizHtml(t) {
    const v = t.viz;
    if (!v) return "";

    if (v.type === "normality") {
      return `<div class="as-viz"><div class="ch-row">${v.series
        .map(
          (s) => `<div class="ch-box"><h5>${esc(s.label)}: histogram &amp; kurva normal</h5>${Charts.histNormal(s)}
            <p class="ch-cap">Batang = sebaran data. Kurva merah = bentuk distribusi normal ideal. Makin mirip, makin normal.</p></div>
            <div class="ch-box"><h5>${esc(s.label)}: Q-Q plot</h5>${Charts.qq(s)}
            <p class="ch-cap">Bila titik mengikuti garis putus-putus, data berdistribusi normal.</p></div>`
        )
        .join("")}</div></div>`;
    }
    if (v.type === "group_box") {
      return `<div class="as-viz"><div class="ch-box"><h5>Sebaran ${esc(v.variable)} tiap kelompok</h5>${Charts.boxGroups(v.groups)}
        <p class="ch-cap">Bila tinggi kotak (sebaran data) tiap kelompok mirip, ragamnya homogen. Kotak yang jauh lebih tinggi/pendek menandakan ragam berbeda.</p></div></div>`;
    }
    if (v.type === "group_sd") {
      return `<div class="as-viz"><div class="ch-box"><h5>Simpangan baku tiap kelompok</h5>${Charts.groupSd(v)}
        <p class="ch-cap">Bila tinggi batang tiap kelompok mirip untuk setiap variabel, keragaman antar kelompok sebanding.</p></div></div>`;
    }
    if (v.type === "scatter") {
      const lines = t.name === "homogenitas_kemiringan_regresi";
      return `<div class="as-viz"><div class="ch-row">${v.pairs
        .map(
          (p) => `<div class="ch-box"><h5>${esc(p.x)} terhadap ${esc(p.y)}</h5>${Charts.scatter(p, { groupLines: lines })}
          <p class="ch-cap">${lines ? "Satu garis per kelompok: bila garis-garisnya hampir sejajar, pengaruh kovariat sama di semua kelompok." : "Bila titik-titik mengikuti garis lurus (bukan melengkung), hubungannya linear."}</p></div>`
        )
        .join("")}</div></div>`;
    }
    return "";
  }

  function statsRow(t) {
    const items = [];
    if (t.test_name) items.push(`<span>Uji: <b>${esc(t.test_name)}</b></span>`);
    if (t.statistic !== null && t.statistic !== undefined) items.push(`<span>Statistik: <b>${RS.fmtNum(t.statistic, 3)}</b></span>`);
    if (t.p_value !== null && t.p_value !== undefined) items.push(`<span>p-value: <b>${RS.fmtP(t.p_value)}</b></span>`);
    if (t.alpha) items.push(`<span>α: <b>${RS.fmtNum(t.alpha, 2)}</b></span>`);
    return items.length ? `<div class="as-stats">${items.join("")}</div>` : "";
  }

  function remediesHtml(t) {
    if (!t.remedies || !t.remedies.length) return "";
    return `<div class="as-fix"><h5>Bagaimana agar asumsi ini terpenuhi?</h5><ul>${t.remedies
      .map(
        (r) => `<li><strong>${esc(r.title)}</strong>${esc(r.text)}${
          r.action === "transform" ? '<br><button type="button" class="btn btn-secondary btn-sm" data-open-transform>Coba transformasi sekarang</button>' : ""
        }</li>`
      )
      .join("")}</ul></div>`;
  }

  function card(t) {
    const kind = t.status === "met" ? "ok" : t.status === "not_met" ? "fail" : t.status === "info" ? "info" : "na";
    const badge = { ok: "TERPENUHI", fail: "TIDAK TERPENUHI", info: "PERLU DINILAI MANDIRI", na: "TIDAK DAPAT DIEVALUASI" }[kind];
    const hyp = t.h0
      ? `<div class="as-hyp"><div><b>H0</b> (hipotesis nol): ${esc(t.h0)}</div><div><b>H1</b> (hipotesis alternatif): ${esc(t.h1)}</div></div>`
      : "";
    const decision = t.decision
      ? `<div class="as-decision ${kind}"><div><strong>Keputusan: ${esc(t.decision)}</strong>${esc(t.decision_text)}</div></div>`
      : "";
    return `<div class="as-card ${kind === "fail" ? "fail" : kind === "ok" ? "ok" : ""}">
      <div class="as-head"><strong>${esc(t.label)}</strong><span class="as-badge ${kind}">${badge}</span></div>
      <p class="as-meaning">${esc(t.meaning)}</p>
      ${hyp}${decision}
      <p class="as-explain">${esc(t.explanation)}</p>
      ${statsRow(t)}${vizHtml(t)}${remediesHtml(t)}
    </div>`;
  }

  // ------------------------------------------------------------------
  // Panel transformasi
  // ------------------------------------------------------------------
  function transformPanel(result) {
    const hints = result.transform_hints || [];
    const active = result.transformations || {};
    const anyBad = result.assumptions.tests.some((t) => t.status === "not_met");
    if (!hints.length) return "";

    const rows = hints
      .map((h) => {
        const cur = active[h.variable] ? active[h.variable].method : "";
        const options =
          '<option value="">Tanpa transformasi</option>' +
          h.allowed
            .map((a) => `<option value="${a.code}" ${cur === a.code ? "selected" : ""}>${esc(a.label)}${h.recommended === a.code ? " (disarankan)" : ""}</option>`)
            .join("");
        const skew = h.skewness === null || h.skewness === undefined ? "–" : RS.fmtNum(h.skewness, 2);
        const skewNote = h.skewness === null ? "" : h.skewness > 0.75 ? " (condong kanan)" : h.skewness < -0.75 ? " (condong kiri)" : " (cukup simetris)";
        return `<tr><td><strong>${esc(h.variable)}</strong></td><td>${h.role}</td><td>${skew}${skewNote}</td>
          <td><select data-var="${esc(h.variable)}" aria-label="Transformasi untuk ${esc(h.variable)}">${options}</select></td></tr>`;
      })
      .join("");

    const chips = Object.entries(active)
      .map(([k, v]) => `<span class="tr-chip">${esc(k)}: ${esc(v.label)}${v.lambda !== null && v.lambda !== undefined ? ` (λ = ${RS.fmtNum(v.lambda, 2)})` : ""}</span>`)
      .join("");

    return `<details class="as-transform" id="asTr" ${anyBad || chips ? "open" : ""}>
      <summary>Transformasi data (untuk membantu memenuhi asumsi)</summary>
      <p class="hint">Transformasi mengubah skala angka (mis. log) agar sebaran data lebih simetris dan ragamnya lebih seragam. Pilih transformasi untuk variabel dependen atau kovariat, lalu sistem menguji ulang. Hasil pada halaman berikutnya memakai data yang sudah ditransformasi, sedangkan ringkasan dan grafik rata-rata tetap dalam satuan asli.
      ${chips ? `<span class="tr-active">Aktif sekarang: ${chips}</span>` : ""}</p>
      <div class="table-scroll" style="max-height:none;"><table><thead><tr><th>Variabel</th><th>Peran</th><th>Kemiringan (skewness)</th><th>Transformasi</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="acts">
        <button type="button" class="btn btn-primary" id="applyTr">Terapkan &amp; uji ulang</button>
        ${chips ? '<button type="button" class="btn btn-secondary" id="clearTr">Kembalikan data asli</button>' : ""}
      </div></details>`;
  }

  // ------------------------------------------------------------------
  // Render halaman
  // ------------------------------------------------------------------
  function render(result) {
    const a = result.assumptions;
    const m = result.method;
    const tests = a.tests;

    // Hitungan dari daftar yang sama dengan yang ditampilkan (selalu konsisten)
    const met = tests.filter((t) => t.status === "met");
    const bad = tests.filter((t) => t.status === "not_met");
    const manual = tests.filter((t) => t.status === "info");
    const na = tests.filter((t) => t.status === "not_evaluated");
    const total = tests.length;

    document.getElementById("asTitle").textContent = `Uji Asumsi ${m.code}`;
    document.getElementById("asMethod").textContent = m.code;
    document.getElementById("asVars").textContent =
      `${result.variables.dependent.length} dependen · ${result.variables.independent.length} faktor · ${result.variables.covariates.length} kovariat`;

    const activeTr = Object.entries(result.transformations || {});
    const banner = document.getElementById("asActive");
    banner.hidden = !activeTr.length;
    banner.innerHTML = activeTr.length
      ? `<div class="notice">Pengujian ini memakai data yang ditransformasi: ${activeTr.map(([k, v]) => `<strong>${esc(k)}</strong> (${esc(v.label)})`).join(", ")}.</div>`
      : "";

    const order = { not_met: 0, met: 1, info: 2, not_evaluated: 3 };
    document.getElementById("asList").innerHTML = tests
      .slice()
      .sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9))
      .map(card)
      .join("");

    const list = (arr) => (arr.length ? `<ul class="as-check">${arr.map((t) => `<li>${t.status === "met" ? "✓" : t.status === "not_met" ? "✕" : "•"}<span>${esc(t.label)}</span></li>`).join("")}</ul>` : "");
    const seg = (n, cls) => (n ? `<span class="${cls}" style="width:${(n / total) * 100}%"></span>` : "");

    const headline = bad.length
      ? "Ada asumsi yang belum terpenuhi"
      : met.length === 0
      ? "Belum ada asumsi yang dapat diuji otomatis"
      : "Semua asumsi yang dapat diuji terpenuhi";

    const reco = bad.length
      ? `Analisis tetap dapat dilanjutkan, tetapi hasil ${esc(m.code)} perlu ditafsirkan hati-hati. Coba <a href="#asTr" data-open-transform style="text-decoration:underline;">transformasi data</a> di bawah untuk membantu memenuhi asumsi, lalu uji ulang.`
      : `Data memenuhi seluruh asumsi yang dapat diuji, sehingga hasil ${esc(m.code)} dapat ditafsirkan dengan lebih yakin.${manual.length ? " Asumsi independensi tetap perlu Anda pastikan dari cara pengambilan data." : ""}`;

    document.getElementById("asSide").innerHTML = `
      <div class="as-sum ${bad.length ? "warn" : ""}">
        <h4>${headline}</h4>
        <div class="big">${met.length} / ${total}</div>
        <p>asumsi terpenuhi (dari seluruh asumsi di daftar kiri)</p>
        <div class="as-bar" aria-hidden="true">${seg(met.length, "b-met")}${seg(bad.length, "b-bad")}${seg(manual.length + na.length, "b-man")}</div>
        <ul class="as-counts">
          <li><span>Terpenuhi</span><b>${met.length}</b></li>
          <li><span>Tidak terpenuhi</span><b>${bad.length}</b></li>
          <li><span>Dinilai mandiri / tidak dapat diuji</span><b>${manual.length + na.length}</b></li>
          <li><span>Total asumsi</span><b>${total}</b></li>
        </ul>
        ${met.length ? `<div class="as-sub">YANG SUDAH TERPENUHI</div>${list(met)}` : ""}
        ${bad.length ? `<div class="as-sub">YANG PERLU DIPERHATIKAN</div><div class="as-check bad">${list(bad)}</div>` : ""}
        ${manual.length + na.length ? `<div class="as-sub">TIDAK DIUJI OTOMATIS</div>${list(manual.concat(na))}` : ""}
      </div>
      <div class="as-sum"><h4>Rekomendasi Sistem</h4><p>${reco}</p></div>`;

    document.getElementById("asTransformWrap").innerHTML = transformPanel(result);
    document.getElementById("asNext").textContent = bad.length ? "Lanjut dengan Peringatan →" : "Lanjut ke Hasil →";

    wireTransform(result);
    content.hidden = false;
  }

  function openTransform(e) {
    e && e.preventDefault();
    const d = document.getElementById("asTr");
    if (d) {
      d.open = true;
      d.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function wireTransform() {
    document.querySelectorAll("[data-open-transform]").forEach((b) => b.addEventListener("click", openTransform));

    document.getElementById("applyTr")?.addEventListener("click", () => {
      const t = {};
      document.querySelectorAll("#asTr select").forEach((s) => {
        if (s.value) t[s.dataset.var] = s.value;
      });
      run(t);
    });
    document.getElementById("clearTr")?.addEventListener("click", () => run({}));
  }

  const cached = st.result && st.resultKey === keyFor();
  if (cached) render(st.result);
  else run(transformsNow());
});
