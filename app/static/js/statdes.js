// ==========================================================================
// Statistika Deskriptif — unggah, pilih variabel, hitung (POST /api/descriptive)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const KEY = "mancova_statdes_v1";
  const esc = RS.esc;
  const $ = (id) => document.getElementById(id);

  const load = () => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  const save = (patch) => {
    const s = Object.assign(load(), patch);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
    return s;
  };
  const clear = () => sessionStorage.removeItem(KEY);

  const errBox = $("sdError");
  const showError = (html) => {
    errBox.innerHTML = html;
    errBox.hidden = !html;
  };

  function goStep(n) {
    [1, 2, 3].forEach((i) => ($("sd" + i).hidden = i !== n));
    document.querySelectorAll(".sd-steps li").forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle("active", i === n);
      li.classList.toggle("done", i < n);
    });
    window.scrollTo({ top: 0 });
  }

  // ======================================================================
  // LANGKAH 1 — upload
  // ======================================================================
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const uploadBtn = $("uploadBtn");
  let selectedFile = null;

  function pickFile(file) {
    showError("");
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["csv", "xlsx"].includes(ext)) return showError("Format file tidak didukung. Gunakan file .csv atau .xlsx.");
    if (file.size > 10 * 1024 * 1024) return showError("Ukuran file melebihi batas 10 MB.");
    selectedFile = file;
    $("fileName").textContent = file.name;
    $("fileSelectedRow").style.display = "flex";
    uploadBtn.disabled = false;
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", (e) => pickFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => dropzone.addEventListener(t, (e) => (e.preventDefault(), dropzone.classList.add("drag-over"))));
  ["dragleave", "drop"].forEach((t) => dropzone.addEventListener(t, (e) => (e.preventDefault(), dropzone.classList.remove("drag-over"))));
  dropzone.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));

  $("cancelBtn").addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";
    $("fileSelectedRow").style.display = "none";
    uploadBtn.disabled = true;
    showError("");
  });

  uploadBtn.addEventListener("click", async () => {
    if (!selectedFile) return;
    showError("");
    uploadBtn.disabled = true;
    const label = uploadBtn.textContent;
    uploadBtn.textContent = "Mengunggah…";
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const data = await Api.upload("/api/upload", form);
      save({ datasetId: data.dataset_id, filename: selectedFile.name, profile: data.profile, result: null, selected: null, groupBy: "" });
      renderStep2();
    } catch (err) {
      showError(esc(err.message));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = label;
    }
  });

  // ======================================================================
  // LANGKAH 2 — pilih variabel
  // ======================================================================
  function renderStep2() {
    const st = load();
    const profile = st.profile;
    const totalMissing = profile.columns.reduce((a, c) => a + c.missing_count, 0);

    $("sdFileInfo").innerHTML =
      `<strong>${esc(st.filename)}</strong> · ${profile.n_rows.toLocaleString("id-ID")} baris · ${profile.columns.length} kolom · ` +
      `${totalMissing.toLocaleString("id-ID")} sel kosong. Data kosong tidak perlu dibersihkan: tiap variabel dihitung dari data yang ada.`;

    const chosen = new Set(st.selected || profile.columns.filter((c) => c.dtype === "numeric").map((c) => c.name));

    $("sdCols").innerHTML = profile.columns
      .map(
        (c, i) => `<tr class="${chosen.has(c.name) ? "sel" : ""}">
          <td><input type="checkbox" id="col${i}" data-name="${esc(c.name)}" ${chosen.has(c.name) ? "checked" : ""} aria-label="Pilih ${esc(c.name)}"></td>
          <td><label for="col${i}"><strong>${esc(c.name)}</strong></label></td>
          <td><span class="type-tag">${c.dtype === "numeric" ? "Numerik" : "Kategorik"}</span></td>
          <td>${c.unique_count}</td>
          <td>${c.missing_count ? `${c.missing_count} (${c.missing_percentage}%)` : "0"}</td>
        </tr>`
      )
      .join("");

    const groupSel = $("groupBy");
    groupSel.innerHTML =
      '<option value="">Tanpa pengelompokan</option>' +
      profile.columns
        .filter((c) => c.can_be_factor && c.unique_count <= 20)
        .map((c) => `<option value="${esc(c.name)}">${esc(c.name)} (${c.unique_count} kategori)</option>`)
        .join("");
    groupSel.value = st.groupBy || "";

    updateRunState();
    goStep(2);
  }

  const checks = () => [...document.querySelectorAll("#sdCols input[type=checkbox]")];
  const selectedNames = () => checks().filter((c) => c.checked).map((c) => c.dataset.name);

  function updateRunState() {
    const names = selectedNames();
    $("runBtn").disabled = names.length === 0;
    checks().forEach((c) => c.closest("tr").classList.toggle("sel", c.checked));
    save({ selected: names, groupBy: $("groupBy").value });
  }

  $("sdCols").addEventListener("change", updateRunState);
  $("groupBy").addEventListener("change", updateRunState);
  const setAll = (fn) => {
    const cols = (load().profile || { columns: [] }).columns;
    checks().forEach((c) => {
      const col = cols.find((x) => x.name === c.dataset.name);
      c.checked = fn(col);
    });
    updateRunState();
  };
  $("selNumeric").addEventListener("click", () => setAll((c) => c && c.dtype === "numeric"));
  $("selAll").addEventListener("click", () => setAll(() => true));
  $("selNone").addEventListener("click", () => setAll(() => false));
  $("restartBtn").addEventListener("click", () => {
    clear();
    showError("");
    goStep(1);
  });

  $("runBtn").addEventListener("click", async () => {
    const st = load();
    showError("");
    const btn = $("runBtn");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Menghitung…";
    try {
      const body = { dataset_id: st.datasetId, variables: selectedNames() };
      if ($("groupBy").value) body.group_by = $("groupBy").value;
      const result = await Api.post("/api/descriptive", body);
      save({ result });
      renderResult(result);
    } catch (err) {
      const expired = /sesi dataset|tidak ditemukan atau/i.test(err.message);
      showError(esc(err.message) + (expired ? ' <a href="#" id="reupload">Unggah ulang file</a>.' : ""));
      $("reupload")?.addEventListener("click", (e) => {
        e.preventDefault();
        clear();
        showError("");
        goStep(1);
      });
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  // ======================================================================
  // LANGKAH 3 — hasil
  // ======================================================================
  const f = (n, d = 3) => RS.fmtNum(n, d);

  function histogramSvg(h, mean) {
    const W = 420, H = 190, pl = 30, pr = 8, pt = 8, pb = 26;
    const max = Math.max(...h.counts, 1);
    const n = h.counts.length;
    const bw = (W - pl - pr) / n;
    const lo = h.edges[0], hi = h.edges[n];
    const x = (v) => pl + ((v - lo) / (hi - lo)) * (W - pl - pr);
    const bars = h.counts
      .map((c, i) => {
        const bh = ((H - pt - pb) * c) / max;
        return `<rect class="hist-bar" x="${(pl + i * bw + 1).toFixed(1)}" y="${(H - pb - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"><title>${f(h.edges[i], 2)} – ${f(h.edges[i + 1], 2)}: ${c} data</title></rect>`;
      })
      .join("");
    const meanLine = mean !== null && mean >= lo && mean <= hi ? `<line x1="${x(mean)}" x2="${x(mean)}" y1="${pt}" y2="${H - pb}" stroke="#8a3329" stroke-dasharray="4 3" stroke-width="1.5"/>` : "";
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram">
      <line class="ax" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
      <text class="tx" x="${pl - 6}" y="${pt + 8}" text-anchor="end">${max}</text>
      <text class="tx" x="${pl - 6}" y="${H - pb}" text-anchor="end">0</text>
      ${bars}${meanLine}
      <text class="tx" x="${pl}" y="${H - 8}">${f(lo, 2)}</text>
      <text class="tx" x="${W - pr}" y="${H - 8}" text-anchor="end">${f(hi, 2)}</text>
    </svg>`;
  }

  function boxplotSvg(v) {
    const W = 420, H = 64, pl = 10, pr = 10;
    const lo = v.min, hi = v.max;
    if (hi === lo) return "";
    const x = (val) => pl + ((val - lo) / (hi - lo)) * (W - pl - pr);
    const mid = 28;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Boxplot">
      <line class="box-line" x1="${x(v.whisker_low)}" x2="${x(v.q1)}" y1="${mid}" y2="${mid}"/>
      <line class="box-line" x1="${x(v.q3)}" x2="${x(v.whisker_high)}" y1="${mid}" y2="${mid}"/>
      <line class="box-line" x1="${x(v.whisker_low)}" x2="${x(v.whisker_low)}" y1="${mid - 8}" y2="${mid + 8}"/>
      <line class="box-line" x1="${x(v.whisker_high)}" x2="${x(v.whisker_high)}" y1="${mid - 8}" y2="${mid + 8}"/>
      <rect class="box-box" x="${x(v.q1)}" y="${mid - 13}" width="${Math.max(2, x(v.q3) - x(v.q1))}" height="26" rx="3"/>
      <line class="box-med" x1="${x(v.median)}" x2="${x(v.median)}" y1="${mid - 13}" y2="${mid + 13}"/>
      <polygon class="box-mean" points="${x(v.mean)},${mid - 6} ${x(v.mean) + 5},${mid} ${x(v.mean)},${mid + 6} ${x(v.mean) - 5},${mid}"/>
      <text class="tx" x="${pl}" y="${H - 6}">${f(lo, 2)}</text>
      <text class="tx" x="${W - pr}" y="${H - 6}" text-anchor="end">${f(hi, 2)}</text>
    </svg>`;
  }

  function shapeText(v) {
    const parts = [];
    if (v.skewness !== null && v.skewness !== undefined) {
      const s = v.skewness;
      parts.push(Math.abs(s) < 0.5 ? "Sebaran relatif simetris" : s > 0 ? "Sebaran condong ke kanan (ekor panjang di nilai besar)" : "Sebaran condong ke kiri (ekor panjang di nilai kecil)");
    }
    if (v.shapiro_p !== undefined && v.shapiro_p !== null) {
      parts.push(v.shapiro_p >= 0.05 ? `tidak menyimpang nyata dari normal (Shapiro-Wilk p = ${RS.fmtP(v.shapiro_p)})` : `menyimpang dari normal (Shapiro-Wilk p = ${RS.fmtP(v.shapiro_p)})`);
    }
    if (v.outliers) parts.push(`${v.outliers} pencilan menurut aturan 1,5×IQR`);
    return parts.length ? parts.join("; ") + "." : "";
  }

  const STAT_ROWS = [
    ["Data valid (n)", "n", 0], ["Data kosong", "missing", 0], ["Rata-rata", "mean"], ["Median", "median"], ["Modus", "mode"],
    ["Simpangan baku", "std"], ["Varians", "variance"], ["Galat baku rata-rata", "sem"], ["Minimum", "min"], ["Kuartil 1 (Q1)", "q1"],
    ["Kuartil 3 (Q3)", "q3"], ["Maksimum", "max"], ["Rentang", "range"], ["Rentang antarkuartil (IQR)", "iqr"],
    ["Koefisien variasi (%)", "cv_pct", 2], ["Kemiringan (skewness)", "skewness"], ["Keruncingan (kurtosis)", "kurtosis"], ["Jumlah", "sum"],
  ];

  function numericCard(v) {
    if (v.empty) {
      return `<div class="sd-var"><div class="sd-var-head"><h2>${esc(v.name)}</h2><span class="type-tag">Numerik</span></div><p class="sub">Tidak ada data valid pada kolom ini.</p></div>`;
    }
    const rows = STAT_ROWS.map(([label, key, d]) => `<tr><td>${label}</td><td>${v[key] === null || v[key] === undefined ? "–" : f(v[key], d === undefined ? 3 : d)}</td></tr>`).join("");
    return `<div class="sd-var">
      <div class="sd-var-head"><h2>${esc(v.name)}</h2><span class="type-tag">Numerik</span></div>
      <p class="sub">${v.n.toLocaleString("id-ID")} data valid${v.missing ? `, ${v.missing} kosong (${f(v.missing_pct, 1)}%)` : ""}.</p>
      <div class="sd-var-body">
        <table class="sd-stats"><tbody>${rows}</tbody></table>
        <div class="sd-charts">
          ${v.histogram ? `${histogramSvg(v.histogram, v.mean)}<p class="cap">Histogram (garis putus-putus = rata-rata)</p>` : '<p class="cap">Semua nilai sama sehingga histogram tidak dibuat.</p>'}
          ${boxplotSvg(v)}${v.max !== v.min ? '<p class="cap">Boxplot: kotak = Q1–Q3, garis tebal = median, berlian = rata-rata</p>' : ""}
          <div class="sd-read">${esc(shapeText(v)) || "Data terlalu sedikit untuk menilai bentuk sebaran."}</div>
        </div>
      </div>
    </div>`;
  }

  function categoricalCard(v) {
    const max = Math.max(...v.frequency.map((r) => r.count), 1);
    const rows = v.frequency
      .map((r) => `<div class="freq-row"><span class="lab" title="${esc(r.value)}">${esc(r.value)}</span><div class="bar"><span style="width:${(r.count / max) * 100}%"></span></div><span class="n">${r.count.toLocaleString("id-ID")} · ${f(r.percent, 1)}%</span></div>`)
      .join("");
    return `<div class="sd-var">
      <div class="sd-var-head"><h2>${esc(v.name)}</h2><span class="type-tag">Kategorik</span></div>
      <p class="sub">${v.n.toLocaleString("id-ID")} data valid${v.missing ? `, ${v.missing} kosong` : ""} · ${v.unique} kategori · terbanyak: <strong>${esc(v.mode ?? "–")}</strong></p>
      ${rows}
    </div>`;
  }

  function groupSection(g) {
    const names = Object.keys(g.stats);
    if (!names.length) return "";
    const blocks = names
      .map((name) => {
        const rows = g.stats[name];
        const maxMean = Math.max(...rows.map((r) => Math.abs(r.mean ?? 0)), 0.0001);
        return `<h3 class="sd-sub-h">${esc(name)}</h3>
          <div class="table-scroll"><table class="sd-tbl"><thead><tr><th>${esc(g.by)}</th><th class="num">n</th><th class="num">Rata-rata</th><th class="num">Simpangan baku</th><th class="num">Min</th><th class="num">Median</th><th class="num">Maks</th><th style="width:22%;">Rata-rata</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><strong>${esc(r.group)}</strong></td><td class="num">${r.n}</td><td class="num">${f(r.mean)}</td><td class="num">${f(r.std)}</td><td class="num">${f(r.min)}</td><td class="num">${f(r.median)}</td><td class="num">${f(r.max)}</td><td><div class="freq-row" style="grid-template-columns:1fr;padding:0;"><div class="bar"><span style="width:${(Math.abs(r.mean ?? 0) / maxMean) * 100}%"></span></div></div></td></tr>`).join("")}
          </tbody></table></div>`;
      })
      .join("");
    return `<div class="sd-sec"><h2>Perbandingan antar kelompok: ${esc(g.by)}</h2><p class="sub">Ringkasan tiap variabel numerik pada setiap kategori. Ini deskripsi, bukan uji perbedaan.</p>${blocks}</div>`;
  }

  function heatSection(c) {
    const head = c.variables.map((v) => `<th>${esc(v)}</th>`).join("");
    const rows = c.variables
      .map((v, i) => {
        const cells = c.matrix[i]
          .map((val) => {
            if (val === null || val === undefined) return '<td style="background:var(--surface-card);color:var(--slate-500);">–</td>';
            const a = Math.abs(val);
            const bg = `rgba(46,46,55,${(0.06 + a * 0.82).toFixed(2)})`;
            return `<td style="background:${bg};color:${a > 0.55 ? "#fff" : "var(--slate-900)"};">${f(val, 2)}</td>`;
          })
          .join("");
        return `<tr><th class="row">${esc(v)}</th>${cells}</tr>`;
      })
      .join("");
    return `<div class="sd-sec"><h2>Korelasi antar variabel numerik</h2><p class="sub">Korelasi Pearson (−1 sampai 1). Semakin pekat warnanya, semakin kuat hubungannya. Korelasi bukan bukti sebab-akibat.</p>
      <div class="table-scroll"><table class="heat"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function renderResult(r) {
    const nums = r.variables.filter((v) => v.type === "numeric");
    const cats = r.variables.filter((v) => v.type === "categorical");
    const totalMissing = r.variables.reduce((a, v) => a + v.missing, 0);

    $("sdResult").innerHTML = `<div class="sd-res">
      <div class="sd-res-head">
        <div><h1>Hasil Statistika Deskriptif</h1>
          <p>${esc(r.dataset.filename)} · ${r.n_rows.toLocaleString("id-ID")} baris · ${esc(RS.fmtDate(r.created_at))}${r.analysis_id ? ` · tercatat #${r.analysis_id}` : ""}</p></div>
        <div class="sd-res-btns">
          <button type="button" class="btn btn-secondary btn-sm" id="backBtn">Ubah variabel</button>
          <button type="button" class="btn btn-secondary btn-sm" id="csvBtn">Unduh Ringkasan (CSV)</button>
          <button type="button" class="btn btn-primary btn-sm" id="printBtn">Cetak / Simpan PDF</button>
        </div>
      </div>
      <div class="sd-overview">
        <div class="sd-ov"><div class="k">Baris data</div><div class="v">${r.n_rows.toLocaleString("id-ID")}</div></div>
        <div class="sd-ov"><div class="k">Variabel numerik</div><div class="v">${nums.length}</div></div>
        <div class="sd-ov"><div class="k">Variabel kategorik</div><div class="v">${cats.length}</div></div>
        <div class="sd-ov"><div class="k">Sel kosong (terpilih)</div><div class="v">${totalMissing.toLocaleString("id-ID")}</div></div>
      </div>
      ${nums.map(numericCard).join("")}
      ${cats.map(categoricalCard).join("")}
      ${r.groups ? groupSection(r.groups) : ""}
      ${r.correlation ? heatSection(r.correlation) : ""}
      <div style="text-align:center;margin-top:24px;"><a href="statdes.html" id="newBtn" class="btn-link" style="text-decoration:underline;">Analisis file baru</a></div>
    </div>`;

    $("backBtn").addEventListener("click", () => renderStep2());
    $("printBtn").addEventListener("click", () => window.print());
    $("newBtn").addEventListener("click", (e) => {
      e.preventDefault();
      clear();
      showError("");
      goStep(1);
    });
    $("csvBtn").addEventListener("click", () => {
      const q = (x) => {
        let t = x === null || x === undefined ? "" : String(x);
        if (/^[=+\-@\t\r]/.test(t) && isNaN(Number(t))) t = "'" + t;
        return `"${t.replace(/"/g, '""')}"`;
      };
      const keys = ["n", "missing", "mean", "median", "mode", "std", "variance", "sem", "min", "q1", "q3", "max", "range", "iqr", "cv_pct", "skewness", "kurtosis", "sum", "outliers"];
      const header = ["variabel", ...keys];
      const rows = nums.filter((v) => !v.empty).map((v) => [v.name, ...keys.map((k) => v[k])]);
      const csv = "\ufeff" + [header, ...rows].map((row) => row.map(q).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "statistika-deskriptif.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    goStep(3);
  }

  // ---- pulihkan keadaan terakhir saat halaman dimuat ulang ----
  const st = load();
  if (st.result && st.profile) renderResult(st.result);
  else if (st.profile) renderStep2();
});
