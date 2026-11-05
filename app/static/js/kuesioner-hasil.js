// ==========================================================================
// Hasil Analisis Kuesioner — skor per aspek, grafik radar, rekomendasi
// Bergantung pada js/kuesioner-data.js
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("resRoot");
  const state = kuesionerMuat();

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

  const lengkap =
    state.selesai && KUESIONER_KATEGORI.every((k) => kuesionerKategoriLengkap(state, k));

  if (!lengkap) {
    root.innerHTML = `
      <div class="res-empty">
        <h2>Belum ada hasil untuk ditampilkan</h2>
        <p>Kuesioner belum diisi lengkap di sesi ini. Isi kuesioner terlebih dahulu untuk melihat skor dan interpretasinya.</p>
        <a href="research-kuesioner.html" class="btn btn-primary" style="padding:11px 26px;">Isi Kuesioner</a>
      </div>`;
    return;
  }

  const skor = kuesionerHitungSkor(state);
  const urut = skor.kategori.slice().sort((a, b) => a.rata - b.rata);
  const terendah = urut[0];
  const tertinggi = urut[urut.length - 1];
  const perluPerhatian = urut.filter((k) => k.rata < 3.4).slice(0, 3);

  // ---------- Grafik radar (SVG murni, tanpa library) ----------
  function radarSvg(kategori) {
    const W = 560, H = 460, cx = 280, cy = 230, R = 150, n = kategori.length;
    const titik = (i, r) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const poligon = (r) => kategori.map((_, i) => titik(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");

    const cincin = [1, 2, 3, 4, 5].map((l) => `<polygon class="radar-ring" points="${poligon((R * l) / 5)}"/>`).join("");
    const sumbu = kategori
      .map((_, i) => {
        const [x, y] = titik(i, R);
        return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
      })
      .join("");
    const bentuk = kategori.map((k, i) => titik(i, (R * k.rata) / 5).map((v) => v.toFixed(1)).join(",")).join(" ");
    const dots = kategori
      .map((k, i) => {
        const [x, y] = titik(i, (R * k.rata) / 5);
        return `<circle class="radar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"><title>${esc(k.singkat)}: ${fmt(k.rata)} / 5</title></circle>`;
      })
      .join("");
    const label = kategori
      .map((k, i) => {
        const [x, y] = titik(i, R + 18);
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const c = Math.cos(a), s = Math.sin(a);
        const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        const dy = s > 0.5 ? 12 : s < -0.5 ? -4 : 4;
        return `<text class="radar-label" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(k.singkat)}</text>`;
      })
      .join("");
    const tick = [1, 2, 3, 4, 5]
      .map((l) => `<text class="radar-tick" x="${cx + 5}" y="${(cy - (R * l) / 5 - 3).toFixed(1)}">${l}</text>`)
      .join("");

    const ringkas = kategori.map((k) => `${k.singkat} ${fmt(k.rata)}`).join(", ");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik radar skor rata-rata per aspek, skala 1 sampai 5. ${esc(ringkas)}">
      ${cincin}${sumbu}${tick}
      <polygon class="radar-shape" points="${bentuk}"/>
      ${dots}${label}
    </svg>`;
  }

  // ---------- Susun halaman ----------
  const id = state.identitas;
  const tabel = skor.kategori
    .map(
      (k) => `<tr>
        <td class="name">${esc(k.judul)}</td>
        <td class="num">${fmt(k.rata)} / 5</td>
        <td><div class="res-bar" role="presentation"><span data-level="${k.klas.level}" style="width:${k.persen.toFixed(1)}%"></span></div></td>
        <td><span class="res-pill" data-level="${k.klas.level}">${k.klas.label}</span></td>
      </tr>`
    )
    .join("");

  const rekomendasi = perluPerhatian.length
    ? perluPerhatian.map((k) => `<li><h4>${esc(k.judul)} <span style="font-weight:500;color:var(--slate-500);">(${fmt(k.rata)} / 5)</span></h4><p>${esc(k.saran)}</p></li>`).join("")
    : `<li><h4>Pertahankan praktik yang sudah baik</h4><p>Seluruh aspek berada pada kategori baik atau sangat baik. Aspek dengan skor terendah adalah ${esc(terendah.judul)} (${fmt(terendah.rata)} / 5); tetap pantau aspek ini secara berkala.</p></li>`;

  const iconUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l6-6 4 4 6-8M15 6h5v5"/></svg>';
  const iconDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

  root.innerHTML = `
    <div class="notice ${state.tersimpan ? "" : "notice-warn"}" id="saveNote" style="max-width:760px;margin:0 auto 20px;">
      ${state.tersimpan
        ? "Jawaban Anda sudah tersimpan untuk keperluan penelitian."
        : 'Jawaban Anda belum tersimpan di server. <button type="button" class="link-btn" id="retrySave" style="text-decoration:underline;font:inherit;background:none;border:0;cursor:pointer;color:inherit;padding:0;">Coba simpan lagi</button>'}
    </div>

    <div class="kq-head">
      <div class="kq-step-note">Analisis selesai</div>
      <h1>Hasil Analisis Kuesioner</h1>
      <p>Skor dihitung dari rata-rata jawaban skala 1–5 pada tiap aspek, lalu dikelompokkan ke dalam lima kategori.</p>
    </div>

    <div class="res-top">
      <div class="res-card res-index">
        <div>
          <h2>Indeks Keseluruhan</h2>
          <p class="res-sub">Rata-rata seluruh 24 pertanyaan.</p>
          <div class="res-index-score">
            <span class="num">${fmt(skor.persenTotal, 0)}%</span>
            <span class="of">${fmt(skor.rataTotal)} dari 5</span>
            <span class="res-pill" data-level="${skor.klasTotal.level}">${skor.klasTotal.label}</span>
          </div>
        </div>
        <dl class="res-who">
          <div><dt>Responden</dt><dd id="whoNama"></dd></div>
          <div><dt>Kecamatan</dt><dd id="whoKec"></dd></div>
          <div><dt>Umur</dt><dd id="whoUmur"></dd></div>
          <div><dt>Pengalaman beternak</dt><dd id="whoPeng"></dd></div>
        </dl>
      </div>
      <div class="res-card">
        <h2>Profil Skor per Aspek</h2>
        <p class="res-sub">Semakin jauh dari pusat, semakin tinggi skornya (skala 1–5).</p>
        <div class="res-radar">${radarSvg(skor.kategori)}</div>
      </div>
    </div>

    <div class="res-card" style="margin-bottom:24px;">
      <h2>Rincian per Aspek</h2>
      <p class="res-sub">Kategori: ≥4,20 sangat baik · 3,40–4,19 baik · 2,60–3,39 cukup · 1,80–2,59 kurang · &lt;1,80 sangat kurang.</p>
      <div class="table-scroll">
        <table class="res-table">
          <thead><tr><th>Aspek</th><th>Skor rata-rata</th><th>Capaian</th><th>Kategori</th></tr></thead>
          <tbody>${tabel}</tbody>
        </table>
      </div>
    </div>

    <div class="res-grid-2">
      <div class="res-card">
        <h2>Sorotan</h2>
        <p class="res-sub">Aspek dengan skor tertinggi dan terendah.</p>
        <div class="res-highlight">
          <div class="icon-circle">${iconUp}</div>
          <div><h4>Paling kuat: ${esc(tertinggi.judul)}</h4><p>Skor ${fmt(tertinggi.rata)} / 5 (${tertinggi.klas.label}).</p></div>
        </div>
        <div class="res-highlight">
          <div class="icon-circle">${iconDown}</div>
          <div><h4>Paling rendah: ${esc(terendah.judul)}</h4><p>Skor ${fmt(terendah.rata)} / 5 (${terendah.klas.label}).</p></div>
        </div>
      </div>
      <div class="res-card">
        <h2>Rekomendasi</h2>
        <p class="res-sub">${perluPerhatian.length ? "Aspek yang berada di bawah kategori baik." : "Ringkasan tindak lanjut."}</p>
        <ul class="res-reco">${rekomendasi}</ul>
      </div>
    </div>

    <div class="res-actions">
      <a href="research-kuesioner.html" class="btn btn-secondary" id="btnUbah">Ubah Jawaban</a>
      <div class="res-actions-right">
        <button type="button" class="btn btn-secondary" id="btnCetak">Cetak / Simpan PDF</button>
        <a href="research-choose.html" class="btn btn-primary" id="btnBaru">Analisis Lain</a>
      </div>
    </div>`;

  // Data pengguna dimasukkan lewat textContent
  document.getElementById("whoNama").textContent = id.nama || "-";
  document.getElementById("whoKec").textContent = id.kecamatan || "-";
  document.getElementById("whoUmur").textContent = id.umur ? `${id.umur} tahun` : "-";
  document.getElementById("whoPeng").textContent = id.pengalaman || "-";

  const retry = document.getElementById("retrySave");
  if (retry) {
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      retry.textContent = "Menyimpan…";
      try {
        await kuesionerKirim(state);
        const note = document.getElementById("saveNote");
        note.classList.remove("notice-warn");
        note.textContent = "Jawaban Anda sudah tersimpan untuk keperluan penelitian.";
      } catch (err) {
        retry.disabled = false;
        retry.textContent = "Coba simpan lagi";
        alert(err.message);
      }
    });
  }

  document.getElementById("btnCetak").addEventListener("click", () => window.print());
  document.getElementById("btnUbah").addEventListener("click", () => {
    state.langkah = 1;
    state.selesai = false;
    kuesionerSimpan(state);
    try { sessionStorage.setItem("mancova_kuesioner_edit", "1"); } catch (e) {}
  });
});
