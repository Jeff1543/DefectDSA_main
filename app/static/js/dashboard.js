// ==========================================================================
// Dashboard Peneliti / Admin — data dari /api/admin/* (admin) dan /api/me/* (peneliti)
// ==========================================================================

(function () {
  const esc = RS.esc;
  const PAGE = 15;
  const KECAMATAN = ["Batu", "Bumiaji", "Junrejo"];

  const $ = (id) => document.getElementById(id);
  const panel = $("panel");
  const tabsEl = $("dashTabs");
  const errBox = $("dashError");

  let user = null;
  let isAdmin = false;
  let currentTab = null;
  const paging = { analyses: 0, questionnaires: 0 };

  // ------------------------------------------------------------------
  // Util
  // ------------------------------------------------------------------
  function showError(msg) {
    errBox.textContent = msg || "";
    errBox.hidden = !msg;
  }

  function handleApiError(err) {
    if (err.status === 401) {
      Auth.clear();
      window.location.href = "Authentication.html";
      return;
    }
    showError(err.message);
  }

  const num = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("id-ID"));
  const pct = (n) => (n === null || n === undefined ? "–" : `${Number(n).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
  const score = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function levelClass(label) {
    if (label === "Kurang" || label === "Sangat Kurang") return "low";
    if (label === "Cukup") return "mid";
    return "";
  }

  function bars(items) {
    // items: [{name, value (0-100), text, cls}]
    if (!items.length) return '<div class="empty">Belum ada data.</div>';
    return items
      .map(
        (i) => `<div class="bar-row">
          <span class="name" title="${esc(i.name)}">${esc(i.name)}</span>
          <span class="bar-track"><span class="bar-fill ${i.cls || ""}" style="width:${Math.max(0, Math.min(100, i.value || 0))}%"></span></span>
          <span class="val">${esc(i.text)}</span>
        </div>`
      )
      .join("");
  }

  function pager(kind, total) {
    const from = total ? paging[kind] + 1 : 0;
    const to = Math.min(paging[kind] + PAGE, total);
    return `<div class="pager">
      <span>Menampilkan ${from}–${to} dari ${num(total)}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-page="prev" ${paging[kind] === 0 ? "disabled" : ""}>Sebelumnya</button>
      <button type="button" class="btn btn-secondary btn-sm" data-page="next" ${to >= total ? "disabled" : ""}>Berikutnya</button>
    </div>`;
  }

  function wirePager(kind) {
    panel.querySelectorAll("[data-page]").forEach((btn) =>
      btn.addEventListener("click", () => {
        paging[kind] = Math.max(0, paging[kind] + (btn.dataset.page === "next" ? PAGE : -PAGE));
        renderTab(currentTab);
      })
    );
  }

  async function downloadCsv(path, filename) {
    try {
      const res = await Api.raw(path);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      handleApiError(err);
    }
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------
  const modal = $("modal");
  let lastFocus = null;

  function openModal(title, html) {
    lastFocus = document.activeElement;
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    modal.hidden = false;
    $("modalClose").focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  $("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // ------------------------------------------------------------------
  // Ringkasan (admin)
  // ------------------------------------------------------------------
  function activityChart(rows) {
    const W = 560, H = 170, padB = 22, padT = 8;
    const max = Math.max(1, ...rows.map((r) => r.analisis + r.kuesioner));
    const bw = W / rows.length;
    const cols = rows
      .map((r, i) => {
        const x = i * bw + bw * 0.18;
        const w = bw * 0.64;
        const ha = ((H - padB - padT) * r.analisis) / max;
        const hq = ((H - padB - padT) * r.kuesioner) / max;
        const yq = H - padB - hq;
        const ya = yq - ha;
        const label = r.tanggal.slice(8) + "/" + r.tanggal.slice(5, 7);
        return `<g><title>${esc(r.tanggal)}: ${r.analisis} analisis, ${r.kuesioner} kuesioner</title>
          <rect class="q" x="${x}" y="${yq}" width="${w}" height="${hq}" rx="2"/>
          <rect class="a" x="${x}" y="${ya}" width="${w}" height="${ha}" rx="2"/>
          ${i % 2 === 0 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${label}</text>` : ""}</g>`;
      })
      .join("");
    return `<svg class="act-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Aktivitas 14 hari terakhir">${cols}</svg>
      <div class="legend"><span><i style="background:var(--slate-900)"></i>Analisis</span><span><i style="background:var(--slate-400)"></i>Kuesioner</span></div>`;
  }

  async function renderOverview() {
    const d = await Api.get("/api/admin/overview");
    const q = d.kuesioner;
    const a = d.analisis;
    const overallPct = q.rata_total === null ? null : (q.rata_total / 5) * 100;

    const perKat = q.per_kategori
      .filter((k) => k.rata !== null)
      .map((k) => ({
        name: k.singkat,
        value: k.persen,
        text: score(k.rata),
        cls: levelClass(k.rata >= 3.4 ? "Baik" : k.rata >= 2.6 ? "Cukup" : "Kurang"),
      }));
    const maxDist = Math.max(1, ...q.distribusi.map((x) => x.jumlah));
    const dist = q.distribusi.map((x) => ({
      name: x.label,
      value: (x.jumlah / maxDist) * 100,
      text: num(x.jumlah),
      cls: levelClass(x.label),
    }));
    const maxKec = Math.max(1, ...q.per_kecamatan.map((x) => x.jumlah));
    const kec = q.per_kecamatan.map((x) => ({
      name: x.kecamatan,
      value: (x.jumlah / maxKec) * 100,
      text: `${num(x.jumlah)}${x.rata !== null ? " · " + score(x.rata) : ""}`,
    }));
    const maxM = Math.max(1, ...a.per_metode.map((x) => x.jumlah));
    const met = a.per_metode.map((x) => ({ name: x.metode, value: (x.jumlah / maxM) * 100, text: num(x.jumlah) }));

    const recentA = d.terbaru.analisis
      .map(
        (r) => `<tr><td class="nowrap">${esc(RS.fmtDate(r.created_at))}</td><td>${esc(r.user_name || "Tamu")}</td><td><span class="type-tag">${esc(r.method)}</span></td><td>${esc(r.filename || "–")}</td><td><button class="link-btn" data-open-analysis="${r.id}">Detail</button></td></tr>`
      )
      .join("");
    const recentQ = d.terbaru.kuesioner
      .map(
        (r) => `<tr><td class="nowrap">${esc(RS.fmtDate(r.created_at))}</td><td>${esc(r.nama)}</td><td>${esc(r.kecamatan)}</td><td>${pct(r.persen_total)}</td><td><button class="link-btn" data-open-quest="${r.id}">Detail</button></td></tr>`
      )
      .join("");

    panel.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="k">Pengguna terdaftar</div><div class="v">${num(d.totals.pengguna)}</div><div class="s">peneliti &amp; administrator</div></div>
        <div class="stat-card"><div class="k">Analisis ragam</div><div class="v">${num(d.totals.analisis)}</div><div class="s">${num(a.dengan_efek_signifikan)} dengan efek signifikan</div></div>
        <div class="stat-card"><div class="k">Responden kuesioner</div><div class="v">${num(d.totals.kuesioner)}</div><div class="s">${q.rata_umur !== null ? "rata-rata umur " + num(q.rata_umur) + " tahun" : "belum ada responden"}</div></div>
        <div class="stat-card"><div class="k">Indeks rata-rata kuesioner</div><div class="v">${pct(overallPct)}</div><div class="s">${q.rata_total !== null ? score(q.rata_total) + " dari 5" : "–"}</div></div>
      </div>

      <div class="dash-grid">
        <div class="dash-card wide"><h3>Skor rata-rata per aspek</h3><p class="sub">Rata-rata seluruh responden, skala 1–5.</p>${bars(perKat)}</div>
        <div class="dash-card"><h3>Distribusi kategori responden</h3><p class="sub">Berdasarkan indeks keseluruhan masing-masing responden.</p>${bars(dist)}</div>
        <div class="dash-card"><h3>Responden per kecamatan</h3><p class="sub">Jumlah responden · rata-rata skor.</p>${bars(kec)}</div>
        <div class="dash-card"><h3>Analisis per metode</h3><p class="sub">${a.asumsi_dievaluasi ? `${num(a.asumsi_terpenuhi)} dari ${num(a.asumsi_dievaluasi)} analisis memenuhi seluruh asumsi.` : "Belum ada analisis."}</p>${bars(met)}</div>
        <div class="dash-card"><h3>Aktivitas 14 hari terakhir</h3><p class="sub">Jumlah analisis dan kuesioner per hari.</p>${activityChart(d.aktivitas)}</div>
      </div>

      <div class="dash-grid">
        <div class="dash-card"><div class="tbl-head"><h3>Analisis terbaru</h3><button class="link-btn" data-goto="analyses">Lihat semua</button></div>
          <div class="dash-table-wrap">${recentA ? `<table class="dash-table"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Metode</th><th>File</th><th></th></tr></thead><tbody>${recentA}</tbody></table>` : '<div class="empty">Belum ada analisis.</div>'}</div></div>
        <div class="dash-card"><div class="tbl-head"><h3>Kuesioner terbaru</h3><button class="link-btn" data-goto="questionnaires">Lihat semua</button></div>
          <div class="dash-table-wrap">${recentQ ? `<table class="dash-table"><thead><tr><th>Waktu</th><th>Responden</th><th>Kecamatan</th><th>Indeks</th><th></th></tr></thead><tbody>${recentQ}</tbody></table>` : '<div class="empty">Belum ada respons.</div>'}</div></div>
      </div>`;
  }

  // ------------------------------------------------------------------
  // Analisis
  // ------------------------------------------------------------------
  async function renderAnalyses() {
    const base = isAdmin ? "/api/admin/analyses" : "/api/me/analyses";
    const d = await Api.get(`${base}?limit=${PAGE}&offset=${paging.analyses}`);
    if (stepBackIfEmpty("analyses", d)) return renderAnalyses();

    const rows = d.items
      .map(
        (r) => `<tr>
          <td class="nowrap">${esc(RS.fmtDate(r.created_at))}</td>
          ${isAdmin ? `<td>${esc(r.user_name || "Tamu")}${r.user_email ? `<div class="muted">${esc(r.user_email)}</div>` : ""}</td>` : ""}
          <td><span class="type-tag">${esc(r.method)}</span></td>
          <td>${esc(r.filename || "–")}<div class="muted">${num(r.n_rows)} baris</div></td>
          <td>${r.method === "STATDES"
            ? `<div class="muted">Variabel: ${esc(r.dependent_vars.join(", "))}</div>${r.independent_vars.length ? `<div class="muted">Kelompok: ${esc(r.independent_vars.join(", "))}</div>` : ""}`
            : `<div class="muted">Y: ${esc(r.dependent_vars.join(", "))}</div><div class="muted">X: ${esc(r.independent_vars.join(", "))}${r.covariates.length ? `</div><div class="muted">Z: ${esc(r.covariates.join(", "))}` : ""}</div>`}</td>
          <td>${r.assumptions_met === null ? "–" : r.assumptions_met ? "Terpenuhi" : "Ada yang tidak"}</td>
          <td>${num(r.significant_effects)}</td>
          <td><div class="row-actions"><button class="link-btn" data-open-analysis="${r.id}">Detail</button>${
            isAdmin ? `<button class="link-btn danger" data-del-analysis="${r.id}" data-label="${esc(r.method)} · ${esc(r.filename || "tanpa file")}">Hapus</button>` : ""
          }</div></td>
        </tr>`
      )
      .join("");

    panel.innerHTML = `<div class="dash-card">
      <div class="tbl-head"><h3>${isAdmin ? "Semua analisis ragam" : "Riwayat analisis saya"}</h3>
        ${isAdmin ? '<button type="button" class="btn btn-secondary btn-sm" id="csvA">Ekspor CSV</button>' : '<a href="research-choose.html" class="btn btn-primary btn-sm">Analisis Baru</a>'}</div>
      <div class="dash-table-wrap">${
        rows
          ? `<table class="dash-table"><thead><tr><th>Waktu</th>${isAdmin ? "<th>Pengguna</th>" : ""}<th>Metode</th><th>File</th><th>Variabel</th><th>Asumsi</th><th>Efek signifikan</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : '<div class="empty">Belum ada analisis yang tersimpan.</div>'
      }</div>
      ${pager("analyses", d.total)}
    </div>`;
    wirePager("analyses");
    $("csvA")?.addEventListener("click", () => downloadCsv("/api/admin/export/analyses.csv", "analisis.csv"));
  }

  async function openAnalysis(id) {
    try {
      const path = isAdmin ? `/api/admin/analyses/${id}` : `/api/me/analyses/${id}`;
      const { item } = await Api.get(path);
      const r = item.result || {};

      if (item.method === "STATDES") {
        const vars = r.variables || [];
        const numVars = vars.filter((v) => v.type === "numeric" && !v.empty);
        const catVars = vars.filter((v) => v.type === "categorical");
        const f2 = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 }));
        const numRows = numVars.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${f2(v.n)}</td><td>${f2(v.mean)}</td><td>${f2(v.median)}</td><td>${f2(v.std)}</td><td>${f2(v.min)}</td><td>${f2(v.max)}</td></tr>`).join("");
        const catRows = catVars.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${f2(v.n)}</td><td>${f2(v.unique)}</td><td>${esc(v.mode ?? "–")}</td></tr>`).join("");
        openModal(
          `Statistika Deskriptif #${item.id}`,
          `<dl class="kv">
            <div><dt>Waktu</dt><dd>${esc(RS.fmtDate(item.created_at))}</dd></div>
            <div><dt>Pengguna</dt><dd>${esc(item.user_name || "Tamu")}</dd></div>
            <div><dt>File</dt><dd>${esc(item.filename || "–")} (${num(item.n_rows)} baris)</dd></div>
            <div><dt>Pengelompokan</dt><dd>${esc(item.independent_vars.join(", ") || "–")}</dd></div>
          </dl>
          ${numRows ? `<h4>Variabel numerik</h4><div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Variabel</th><th>n</th><th>Rata-rata</th><th>Median</th><th>Simp. baku</th><th>Min</th><th>Maks</th></tr></thead><tbody>${numRows}</tbody></table></div>` : ""}
          ${catRows ? `<h4>Variabel kategorik</h4><div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Variabel</th><th>n</th><th>Kategori</th><th>Terbanyak</th></tr></thead><tbody>${catRows}</tbody></table></div>` : ""}`
        );
        return;
      }

      const tests = (r.mancova && r.mancova.tests) || [];
      const mv = r.method && r.method.multivariate;
      const effects = (r.effects || []).filter((e) => e.effect_type !== "intercept");
      const assumptions = (r.assumptions && r.assumptions.tests) || [];
      const stat = { met: "Terpenuhi", not_met: "Tidak terpenuhi", info: "Dinilai mandiri", not_evaluated: "Tidak dievaluasi" };

      const effRows = effects
        .map((e) => `<tr><td><strong>${esc(e.effect_label)}</strong></td><td>${esc(e.statistic)}</td><td>${RS.fmtP(e.p_value)}</td><td>${e.significant ? '<span class="pill-sig">Signifikan</span>' : '<span class="pill-ns">Tidak signifikan</span>'}</td></tr>`)
        .join("");
      const asRows = assumptions
        .map((t) => `<tr><td><strong>${esc(t.label)}</strong><div class="muted">${esc(t.explanation)}</div></td><td class="nowrap">${stat[t.status] || esc(t.status)}</td></tr>`)
        .join("");

      openModal(
        `Analisis #${item.id} · ${item.method}`,
        `<dl class="kv">
          <div><dt>Waktu</dt><dd>${esc(RS.fmtDate(item.created_at))}</dd></div>
          <div><dt>Pengguna</dt><dd>${esc(item.user_name || "Tamu")}</dd></div>
          <div><dt>File</dt><dd>${esc(item.filename || "–")} (${num(item.n_rows)} baris)</dd></div>
          <div><dt>Dependen (Y)</dt><dd>${esc(item.dependent_vars.join(", "))}</dd></div>
          <div><dt>Independen (X)</dt><dd>${esc(item.independent_vars.join(", "))}</dd></div>
          <div><dt>Kovariat (Z)</dt><dd>${esc(item.covariates.join(", ") || "–")}</dd></div>
        </dl>
        <p><a class="btn btn-secondary btn-sm" href="laporan.html?id=${item.id}" >Buka laporan lengkap</a></p>
        <h4>Ringkasan efek ${mv ? "(Pillai's trace)" : "(uji F)"}</h4>
        <div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Efek</th><th>Statistik</th><th>p</th><th>Keputusan</th></tr></thead><tbody>${effRows || '<tr><td colspan="4" class="muted">Tidak ada.</td></tr>'}</tbody></table></div>
        <h4>Uji asumsi</h4>
        <div class="dash-table-wrap"><table class="dash-table"><tbody>${asRows}</tbody></table></div>
        <h4>Interpretasi</h4>
        <p>${esc((r.ai_insight && r.ai_insight.narrative) || "–")}</p>
        ${r.ai_insight && r.ai_insight.assumption_caveat ? `<p class="muted" style="margin-top:8px;">⚠ ${esc(r.ai_insight.assumption_caveat)}</p>` : ""}
        <p class="muted" style="margin-top:12px;">Jumlah baris hasil uji lengkap: ${tests.length}.</p>`
      );
    } catch (err) {
      handleApiError(err);
    }
  }

  // ------------------------------------------------------------------
  // Kuesioner (admin)
  // ------------------------------------------------------------------
  async function renderQuestionnaires() {
    const d = await Api.get(`/api/admin/questionnaires?limit=${PAGE}&offset=${paging.questionnaires}`);
    if (stepBackIfEmpty("questionnaires", d)) return renderQuestionnaires();
    const rows = d.items
      .map(
        (r) => `<tr>
          <td class="nowrap">${esc(RS.fmtDate(r.created_at))}</td>
          <td><strong>${esc(r.nama)}</strong></td>
          <td>${esc(r.kecamatan)}</td>
          <td>${esc(r.jk)}${r.umur ? ` · ${esc(r.umur)} th` : ""}</td>
          <td>${pct(r.persen_total)} <span class="muted">(${score(r.rata_total)})</span></td>
          <td><span class="type-tag">${esc(r.label_total)}</span></td>
          <td><div class="row-actions"><button class="link-btn" data-open-quest="${r.id}">Detail</button>
            <button class="link-btn" data-edit-quest="${r.id}">Edit</button>
            <button class="link-btn danger" data-del-quest="${r.id}" data-label="${esc(r.nama)}">Hapus</button></div></td>
        </tr>`
      )
      .join("");

    panel.innerHTML = `<div class="dash-card">
      <div class="tbl-head"><h3>Respons kuesioner peternak</h3><button type="button" class="btn btn-secondary btn-sm" id="csvQ">Ekspor CSV</button></div>
      <div class="dash-table-wrap">${
        rows
          ? `<table class="dash-table"><thead><tr><th>Waktu</th><th>Responden</th><th>Kecamatan</th><th>Profil</th><th>Indeks</th><th>Kategori</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : '<div class="empty">Belum ada respons kuesioner.</div>'
      }</div>
      ${pager("questionnaires", d.total)}
    </div>`;
    wirePager("questionnaires");
    $("csvQ").addEventListener("click", () => downloadCsv("/api/admin/export/questionnaires.csv", "kuesioner.csv"));
  }

  async function openQuestionnaire(id) {
    try {
      const { item } = await Api.get(`/api/admin/questionnaires/${id}`);
      const w = item.identitas || {};
      const kat = (item.skor && item.skor.kategori) || [];
      const list = bars(
        kat.map((k) => ({ name: k.judul, value: k.persen, text: score(k.rata), cls: levelClass(k.label) }))
      );
      openModal(
        `Responden: ${item.nama}`,
        `<dl class="kv">
          <div><dt>Waktu</dt><dd>${esc(RS.fmtDate(item.created_at))}</dd></div>
          <div><dt>Umur / jenis kelamin</dt><dd>${esc(w.umur)} th · ${esc(w.jk)}</dd></div>
          <div><dt>Telepon / WhatsApp</dt><dd>${esc(w.telepon)}</dd></div>
          <div><dt>Kecamatan</dt><dd>${esc(w.kecamatan)}</dd></div>
          <div><dt>Pengalaman beternak</dt><dd>${esc(w.pengalaman)}</dd></div>
          <div><dt>Alamat peternakan</dt><dd>${esc(w.alamat)}</dd></div>
          <div><dt>Indeks keseluruhan</dt><dd>${pct(item.persen_total)} · ${esc(item.label_total)}</dd></div>
        </dl>
        <h4>Skor per aspek (1–5)</h4>${list}`
      );
    } catch (err) {
      handleApiError(err);
    }
  }

  function deleteAnalysis(btn) {
    const id = btn.dataset.delAnalysis;
    confirmDelete(
      "Hapus analisis",
      `Hapus riwayat analisis <strong>#${esc(id)}</strong> (${esc(btn.dataset.label)})? Data tidak dapat dipulihkan.`,
      async () => {
        await Api.request(`/api/admin/analyses/${id}`, { method: "DELETE" });
        renderTab("analyses");
      }
    );
  }

  function deleteQuestionnaire(btn) {
    const id = btn.dataset.delQuest;
    confirmDelete(
      "Hapus respons kuesioner",
      `Hapus respons dari <strong>${esc(btn.dataset.label)}</strong>? Data tidak dapat dipulihkan dan akan hilang dari statistik gabungan.`,
      async () => {
        await Api.request(`/api/admin/questionnaires/${id}`, { method: "DELETE" });
        renderTab("questionnaires");
      }
    );
  }

  async function editQuestionnaire(id) {
    try {
      const { item } = await Api.get(`/api/admin/questionnaires/${id}`);
      const w = item.identitas || {};
      formModal(
        `Edit responden #${id}`,
        `<p class="sub" style="margin:0;">Hanya identitas yang dapat diubah. Jawaban dan skor tetap, jadi indeks tidak berubah.</p>
         <label>Nama<input type="text" name="nama" value="${esc(w.nama)}"></label>
         <label>Umur<input type="number" name="umur" min="10" max="100" value="${esc(w.umur)}"></label>
         <label>Jenis kelamin<select name="jk">${optionsHtml([["Laki-laki", "Laki-laki"], ["Perempuan", "Perempuan"]], w.jk)}</select></label>
         <label>Telepon / WhatsApp<input type="text" name="telepon" value="${esc(w.telepon)}"></label>
         <label>Kecamatan<select name="kecamatan">${optionsHtml(KECAMATAN.map((k) => [k, k]), w.kecamatan)}</select></label>
         <label>Pengalaman beternak<input type="text" name="pengalaman" value="${esc(w.pengalaman)}"></label>
         <label>Alamat peternakan<input type="text" name="alamat" value="${esc(w.alamat)}"></label>`,
        "Simpan",
        async (fd) => {
          const body = {
            nama: (fd.get("nama") || "").trim(),
            umur: Number(fd.get("umur")),
            jk: fd.get("jk"),
            telepon: (fd.get("telepon") || "").trim(),
            kecamatan: fd.get("kecamatan"),
            pengalaman: (fd.get("pengalaman") || "").trim(),
            alamat: (fd.get("alamat") || "").trim(),
          };
          if (body.nama.length < 2) throw new Error("Nama minimal 2 karakter.");
          if (!(body.umur >= 10 && body.umur <= 100)) throw new Error("Umur harus antara 10 dan 100.");
          if (body.telepon.length < 8) throw new Error("Nomor telepon minimal 8 karakter.");
          if (!body.pengalaman) throw new Error("Pengalaman beternak wajib diisi.");
          if (body.alamat.length < 5) throw new Error("Alamat minimal 5 karakter.");
          await Api.request(`/api/admin/questionnaires/${id}`, { method: "PATCH", body });
          renderTab("questionnaires");
        }
      );
    } catch (err) {
      handleApiError(err);
    }
  }

  // ------------------------------------------------------------------
  // Pengguna (admin)
  // ------------------------------------------------------------------
  // ---------- dialog bantu ----------
  function formModal(title, fieldsHtml, submitLabel, onSubmit, danger) {
    openModal(
      title,
      `<form id="mForm" novalidate>
        <div class="notice notice-error" id="mErr" role="alert" hidden></div>
        <div class="form-grid">${fieldsHtml}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="mCancel">Batal</button>
          <button type="submit" class="btn btn-primary" id="mOk" ${danger ? 'style="background:#8a3329;"' : ""}>${esc(submitLabel)}</button>
        </div></form>`
    );
    $("mCancel").addEventListener("click", closeModal);
    $("mForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("mErr");
      err.hidden = true;
      $("mOk").disabled = true;
      try {
        await onSubmit(new FormData($("mForm")));
        closeModal();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        $("mOk").disabled = false;
      }
    });
  }

  const optionsHtml = (items, selected) =>
    items.map(([v, label]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(label)}</option>`).join("");

  function confirmDelete(title, message, onDelete) {
    formModal(title, `<p>${message}</p>`, "Ya, hapus", onDelete, true);
  }

  // Bila halaman terakhir jadi kosong setelah hapus, mundur satu halaman.
  function stepBackIfEmpty(kind, d) {
    if (!d.items.length && paging[kind] > 0) {
      paging[kind] = Math.max(0, paging[kind] - PAGE);
      return true;
    }
    return false;
  }

  async function renderUsers() {
    const d = await Api.get("/api/admin/users");
    const rows = d.items
      .map((u) => {
        const own = u.id === user.id;
        const actions = `<div class="row-actions">
            <button class="link-btn" data-user-edit="${u.id}">Edit</button>
            ${own ? "" : `<button class="link-btn" data-user-role="${u.id}" data-role="${u.role === "admin" ? "peneliti" : "admin"}" data-name="${esc(u.name)}">Jadikan ${u.role === "admin" ? "Peneliti" : "Admin"}</button>`}
            <button class="link-btn" data-user-pw="${u.id}" data-name="${esc(u.name)}">Reset sandi</button>
            ${own ? '<span class="muted">Akun Anda</span>' : `<button class="link-btn danger" data-user-del="${u.id}" data-name="${esc(u.name)}">Hapus</button>`}</div>`;
        return `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td>
          <td><span class="role-pill ${u.role}">${u.role === "admin" ? "Admin" : "Peneliti"}</span></td>
          <td class="nowrap">${esc(RS.fmtDate(u.created_at))}</td><td>${num(u.analyses)}</td><td>${num(u.questionnaires)}</td><td>${actions}</td></tr>`;
      })
      .join("");
    usersCache = Object.fromEntries(d.items.map((u) => [u.id, u]));
    panel.innerHTML = `<div class="dash-card"><div class="tbl-head"><h3>Pengguna terdaftar</h3>
        <button type="button" class="btn btn-primary btn-sm" id="addUser">+ Tambah pengguna</button></div>
      <p class="sub">Tambahkan akun baru, ubah nama/email/peran, atur ulang kata sandi, atau hapus akun. Riwayat analisis dan kuesioner milik akun yang dihapus tetap tersimpan (tanpa nama pengguna).</p>
      <div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Bergabung</th><th>Analisis</th><th>Kuesioner</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $("addUser").addEventListener("click", addUser);
  }

  let usersCache = {};

  function addUser() {
    formModal(
      "Tambah pengguna",
      `<label>Nama lengkap<input type="text" name="name" autocomplete="off"></label>
       <label>Email<input type="email" name="email" autocomplete="off"></label>
       <label>Kata sandi (min. 8 karakter)<input type="password" name="pw" autocomplete="new-password"></label>
       <label>Peran<select name="role">${optionsHtml([["peneliti", "Peneliti"], ["admin", "Admin"]], "peneliti")}</select></label>`,
      "Tambah",
      async (fd) => {
        const name = (fd.get("name") || "").trim();
        const email = (fd.get("email") || "").trim();
        const pw = fd.get("pw") || "";
        if (name.length < 2) throw new Error("Nama minimal 2 karakter.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email belum valid.");
        if (pw.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
        await Api.post("/api/admin/users", { name, email, password: pw, role: fd.get("role") });
        renderTab("users");
      }
    );
  }

  function userAction(btn) {
    const id = btn.dataset.userEdit || btn.dataset.userRole || btn.dataset.userPw || btn.dataset.userDel;
    const name = btn.dataset.name;

    if (btn.dataset.userEdit) {
      const u = usersCache[id] || {};
      formModal(
        "Edit pengguna",
        `<label>Nama lengkap<input type="text" name="name" value="${esc(u.name)}"></label>
         <label>Email<input type="email" name="email" value="${esc(u.email)}"></label>`,
        "Simpan",
        async (fd) => {
          const newName = (fd.get("name") || "").trim();
          const email = (fd.get("email") || "").trim();
          if (newName.length < 2) throw new Error("Nama minimal 2 karakter.");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email belum valid.");
          await Api.request(`/api/admin/users/${id}`, { method: "PATCH", body: { name: newName, email } });
          if (Number(id) === user.id) {
            user.name = newName;
            $("userName").textContent = newName;
          }
          renderTab("users");
        }
      );
    } else if (btn.dataset.userRole) {
      const role = btn.dataset.role;
      formModal(
        "Ubah peran",
        `<p>Ubah peran <strong>${esc(name)}</strong> menjadi <strong>${role === "admin" ? "Admin" : "Peneliti"}</strong>?${role === "admin" ? " Admin dapat melihat data seluruh pengguna dan mengelola akun." : ""}</p>`,
        "Ya, ubah",
        async () => {
          await Api.request(`/api/admin/users/${id}`, { method: "PATCH", body: { role } });
          renderTab("users");
        }
      );
    } else if (btn.dataset.userPw) {
      formModal(
        "Reset kata sandi",
        `<p>Atur kata sandi baru untuk <strong>${esc(name)}</strong>. Sampaikan kata sandi ini kepada yang bersangkutan.</p>
         <label>Kata sandi baru (min. 8 karakter)<input type="password" name="pw" autocomplete="new-password"></label>`,
        "Simpan",
        async (fd) => {
          const pw = fd.get("pw") || "";
          if (pw.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
          await Api.request(`/api/admin/users/${id}`, { method: "PATCH", body: { password: pw } });
        }
      );
    } else {
      confirmDelete(
        "Hapus akun",
        `Hapus akun <strong>${esc(name)}</strong>? Akun tidak dapat dipulihkan. Riwayat analisis dan kuesioner miliknya tetap tersimpan tanpa nama.`,
        async () => {
          await Api.request(`/api/admin/users/${id}`, { method: "DELETE" });
          renderTab("users");
        }
      );
    }
  }

  // ------------------------------------------------------------------
  // Tab
  // ------------------------------------------------------------------
  const RENDER = { overview: renderOverview, analyses: renderAnalyses, questionnaires: renderQuestionnaires, users: renderUsers };

  async function renderTab(tab) {
    currentTab = tab;
    showError("");
    tabsEl.querySelectorAll(".dash-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    try {
      await RENDER[tab]();
    } catch (err) {
      panel.innerHTML = "";
      handleApiError(err);
    }
  }

  panel.addEventListener("click", (e) => {
    const a = e.target.closest("[data-open-analysis]");
    if (a) return openAnalysis(a.dataset.openAnalysis);
    const q = e.target.closest("[data-open-quest]");
    if (q) return openQuestionnaire(q.dataset.openQuest);
    const g = e.target.closest("[data-goto]");
    if (g) return renderTab(g.dataset.goto);
    const da = e.target.closest("[data-del-analysis]");
    if (da) return deleteAnalysis(da);
    const dq = e.target.closest("[data-del-quest]");
    if (dq) return deleteQuestionnaire(dq);
    const eq = e.target.closest("[data-edit-quest]");
    if (eq) return editQuestionnaire(eq.dataset.editQuest);
    const u = e.target.closest("[data-user-edit],[data-user-role],[data-user-pw],[data-user-del]");
    if (u) userAction(u);
  });

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  $("pwBtn").addEventListener("click", () => {
    formModal(
      "Ubah kata sandi",
      `<label>Kata sandi saat ini<input type="password" name="cur" autocomplete="current-password"></label>
       <label>Kata sandi baru (min. 8 karakter)<input type="password" name="new" autocomplete="new-password"></label>
       <label>Ulangi kata sandi baru<input type="password" name="new2" autocomplete="new-password"></label>`,
      "Simpan",
      async (fd) => {
        if ((fd.get("new") || "").length < 8) throw new Error("Kata sandi baru minimal 8 karakter.");
        if (fd.get("new") !== fd.get("new2")) throw new Error("Pengulangan kata sandi tidak sama.");
        await Api.post("/api/auth/change-password", { current_password: fd.get("cur") || "", new_password: fd.get("new") });
      }
    );
  });

  $("logoutBtn").addEventListener("click", () => {
    Auth.clear();
    window.location.href = "Authentication.html";
  });

  (async function init() {
    if (!Auth.getToken()) {
      window.location.href = "Authentication.html";
      return;
    }
    try {
      const me = await Api.get("/api/auth/me");
      user = me.user;
    } catch (err) {
      Auth.clear();
      window.location.href = "Authentication.html";
      return;
    }

    isAdmin = user.role === "admin";
    $("userName").textContent = user.name;
    const role = $("userRole");
    role.textContent = isAdmin ? "Admin" : "Peneliti";
    role.classList.toggle("peneliti", !isAdmin);

    $("dashTitle").textContent = isAdmin ? "Dashboard Administrator" : "Dashboard Peneliti";
    $("dashSub").textContent = isAdmin
      ? "Pantau dan kelola seluruh aktivitas: pengguna, hasil analisis ragam, dan respons kuesioner (tambah, ubah, hapus)."
      : "Lihat riwayat analisis Anda yang tersimpan.";

    const tabs = isAdmin
      ? [["overview", "Ringkasan"], ["analyses", "Analisis"], ["questionnaires", "Kuesioner"], ["users", "Pengguna"]]
      : [["analyses", "Riwayat Analisis"]];
    tabsEl.innerHTML = tabs
      .map(([k, label]) => `<button type="button" class="dash-tab" role="tab" data-tab="${k}" aria-selected="false">${label}</button>`)
      .join("");
    tabsEl.querySelectorAll(".dash-tab").forEach((b) => b.addEventListener("click", () => renderTab(b.dataset.tab)));

    $("dashLoading").hidden = true;
    $("dashMain").hidden = false;
    renderTab(tabs[0][0]);
  })();
})();
