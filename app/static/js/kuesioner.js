// ==========================================================================
// Wizard Kuesioner — 9 langkah (Identitas + 8 kategori Likert)
// Bergantung pada js/kuesioner-data.js
// ==========================================================================

// Form selalu mulai kosong: jawaban TIDAK dipertahankan kalau pengguna keluar dari halaman
// atau me-refresh. Satu-satunya pengecualian: tombol "Ubah Jawaban" di halaman hasil
// (menandai KUESIONER_EDIT_KEY) supaya jawaban yang baru saja diisi bisa direvisi.
const KUESIONER_EDIT_KEY = "mancova_kuesioner_edit";

// Kembali lewat tombol Back browser (bfcache) -> muat ulang agar form ter-reset
window.addEventListener("pageshow", (e) => {
  if (e.persisted) window.location.reload();
});

document.addEventListener("DOMContentLoaded", () => {
  let state;
  let modeEdit = false;
  try {
    modeEdit = sessionStorage.getItem(KUESIONER_EDIT_KEY) === "1";
    sessionStorage.removeItem(KUESIONER_EDIT_KEY);
  } catch (e) {}
  if (modeEdit) {
    state = kuesionerMuat();
  } else {
    kuesionerReset();
    state = kuesionerStateAwal();
  }

  const elNote = document.getElementById("kqStepNote");
  const elTitle = document.getElementById("kqTitle");
  const elDesc = document.getElementById("kqDesc");
  const elPercent = document.getElementById("kqPercent");
  const elFill = document.getElementById("kqFill");
  const elTrack = document.getElementById("kqTrack");
  const elBody = document.getElementById("kqBody");
  const elError = document.getElementById("kqError");
  const elNav = document.getElementById("kqNav");

  const ARROW =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---------- Validasi ----------
  function normalisasiTelepon(v) {
    return String(v || "").replace(/[\s\-().]/g, "");
  }

  function validasiIdentitas(id) {
    const err = {};
    if (!id.nama || id.nama.trim().length < 2) err.nama = "Nama atau inisial wajib diisi.";
    const umur = Number(id.umur);
    if (!id.umur || !Number.isFinite(umur) || umur < 10 || umur > 100) err.umur = "Masukkan umur antara 10 dan 100 tahun.";
    if (!id.jk) err.jk = "Pilih jenis kelamin.";
    if (!/^(\+?62|0)8\d{7,12}$/.test(normalisasiTelepon(id.telepon))) err.telepon = "Masukkan nomor telepon/WhatsApp yang valid, mis. 0812...";
    if (!id.alamat || id.alamat.trim().length < 5) err.alamat = "Alamat peternakan wajib diisi.";
    if (!KUESIONER_KECAMATAN.includes(id.kecamatan)) err.kecamatan = "Pilih kecamatan.";
    if (!id.pengalaman || !id.pengalaman.trim()) err.pengalaman = "Isi lama pengalaman beternak.";
    return err;
  }

  function langkahPertamaBelumLengkap() {
    if (Object.keys(validasiIdentitas(state.identitas)).length) return 1;
    for (let i = 0; i < KUESIONER_KATEGORI.length; i++) {
      if (!kuesionerKategoriLengkap(state, KUESIONER_KATEGORI[i])) return i + 2;
    }
    return 0;
  }

  // ---------- Util tampilan ----------
  function tampilkanError(msg) {
    elError.textContent = msg;
    elError.classList.add("show");
  }
  function bersihkanError() {
    elError.textContent = "";
    elError.classList.remove("show");
  }
  function pindahLangkah(n) {
    state.langkah = n;
    kuesionerSimpan(state);
    bersihkanError();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    elTitle.setAttribute("tabindex", "-1");
    elTitle.focus({ preventScroll: true });
  }

  // ---------- Langkah 1: Identitas ----------
  function renderIdentitas() {
    elTitle.textContent = "Identitas Responden";
    elDesc.textContent = "Silakan lengkapi data diri Anda sebelum memulai kuesioner.";

    const kecOpsi = KUESIONER_KECAMATAN.map((k) => `<option value="${k}">${k}</option>`).join("");
    elBody.innerHTML = `
      <div class="kq-card">
        <div class="kq-form" id="kqForm" novalidate>
          <div class="kq-field" data-f="nama">
            <label for="f_nama">Nama Lengkap (Sesuai Inisial)</label>
            <input class="kq-input" id="f_nama" type="text" autocomplete="name" placeholder="Masukkan nama atau inisial">
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field" data-f="umur">
            <label for="f_umur">Umur</label>
            <input class="kq-input" id="f_umur" type="number" inputmode="numeric" min="10" max="100" placeholder="Tahun">
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field" data-f="jk">
            <span class="kq-label" id="lbl_jk">Jenis Kelamin</span>
            <div class="kq-seg" role="radiogroup" aria-labelledby="lbl_jk">
              <div class="kq-seg-item"><input type="radio" name="jk" id="jk_l" value="Laki-laki"><label for="jk_l">Laki-laki</label></div>
              <div class="kq-seg-item"><input type="radio" name="jk" id="jk_p" value="Perempuan"><label for="jk_p">Perempuan</label></div>
            </div>
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field" data-f="telepon">
            <label for="f_telepon">Nomor Telepon/WhatsApp</label>
            <input class="kq-input" id="f_telepon" type="tel" autocomplete="tel" placeholder="08...">
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field full" data-f="alamat">
            <label for="f_alamat">Alamat Peternakan</label>
            <textarea class="kq-textarea" id="f_alamat" placeholder="Contoh: Jl. Diponegoro No. 123"></textarea>
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field" data-f="kecamatan">
            <label for="f_kecamatan">Kecamatan</label>
            <select class="kq-select" id="f_kecamatan"><option value="">Pilih Kecamatan</option>${kecOpsi}</select>
            <span class="kq-field-msg"></span>
          </div>
          <div class="kq-field" data-f="pengalaman">
            <label for="f_pengalaman">Lama Pengalaman Beternak</label>
            <input class="kq-input" id="f_pengalaman" type="text" placeholder="Contoh: 5 Tahun">
            <span class="kq-field-msg"></span>
          </div>
        </div>
        <p class="kq-privacy">Data identitas dipakai untuk keperluan penelitian dan hanya dapat dilihat oleh peneliti dan administrator. Isi formulir terhapus bila Anda keluar dari halaman ini.</p>
      </div>`;

    // Isi nilai lewat DOM (bukan innerHTML) supaya input pengguna tidak diparse sebagai HTML
    const id = state.identitas;
    const map = { nama: "f_nama", umur: "f_umur", telepon: "f_telepon", alamat: "f_alamat", kecamatan: "f_kecamatan", pengalaman: "f_pengalaman" };
    Object.keys(map).forEach((key) => {
      const el = document.getElementById(map[key]);
      el.value = id[key] || "";
      el.addEventListener("input", () => {
        state.identitas[key] = el.value;
        kuesionerSimpan(state);
        el.closest(".kq-field").classList.remove("invalid");
      });
      el.addEventListener("change", () => {
        state.identitas[key] = el.value;
        kuesionerSimpan(state);
      });
    });
    document.querySelectorAll('input[name="jk"]').forEach((r) => {
      r.checked = r.value === id.jk;
      r.addEventListener("change", () => {
        state.identitas.jk = r.value;
        kuesionerSimpan(state);
        r.closest(".kq-field").classList.remove("invalid");
      });
    });
  }

  function tandaiErrorIdentitas(err) {
    document.querySelectorAll("#kqForm .kq-field").forEach((f) => {
      const key = f.dataset.f;
      const msg = f.querySelector(".kq-field-msg");
      if (err[key]) {
        f.classList.add("invalid");
        msg.textContent = err[key];
      } else {
        f.classList.remove("invalid");
        msg.textContent = "";
      }
    });
    const pertama = document.querySelector("#kqForm .kq-field.invalid");
    if (pertama) {
      pertama.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = pertama.querySelector("input, select, textarea");
      if (input) input.focus({ preventScroll: true });
    }
  }

  // ---------- Langkah 2–9: kategori Likert ----------
  function renderKategori(kat) {
    elTitle.textContent = kat.judul;
    elDesc.textContent = kat.deskripsi;

    const kartu = kat.pertanyaan
      .map((teks, i) => {
        const nama = `q_${kat.id}_${i}`;
        const opsi = [1, 2, 3, 4, 5]
          .map((v) => {
            const label = v === 1 ? KUESIONER_SKALA.min : v === 5 ? KUESIONER_SKALA.max : "";
            return `<label class="kq-opt">
              <input type="radio" name="${nama}" value="${v}" data-k="${kat.id}" data-i="${i}" aria-label="${v}${label ? " — " + label : ""}">
              <span class="kq-dot">${v}</span>
              <span class="kq-end-label">${label}</span>
            </label>`;
          })
          .join("");
        return `<div class="kq-card" data-q="${i}" role="radiogroup" aria-labelledby="${nama}_t">
          <p class="kq-question" id="${nama}_t">${teks}</p>
          <div class="kq-scale">${opsi}</div>
        </div>`;
      })
      .join("");

    const ringkasan = state.langkah === KUESIONER_TOTAL_LANGKAH ? '<div class="kq-summary" id="kqSummary"></div>' : "";
    elBody.innerHTML = kartu + ringkasan;

    elBody.querySelectorAll('input[type="radio"]').forEach((r) => {
      const idx = Number(r.dataset.i);
      r.checked = state.jawaban[r.dataset.k][idx] === Number(r.value);
      r.addEventListener("change", () => {
        state.jawaban[r.dataset.k][idx] = Number(r.value);
        kuesionerSimpan(state);
        r.closest(".kq-card").classList.remove("invalid");
        if (!elBody.querySelector(".kq-card.invalid")) bersihkanError();
        isiRingkasan();
      });
    });
    isiRingkasan();
  }

  function isiRingkasan() {
    const el = document.getElementById("kqSummary");
    if (!el) return;
    let terjawab = 0;
    let kategoriSelesai = 0;
    KUESIONER_KATEGORI.forEach((k) => {
      const n = state.jawaban[k.id].filter((v) => v !== null).length;
      terjawab += n;
      if (n === k.pertanyaan.length) kategoriSelesai++;
    });
    const total = KUESIONER_KATEGORI.reduce((a, k) => a + k.pertanyaan.length, 0);
    const siap = terjawab === total;
    el.innerHTML = `
      <h3>Status Respons</h3>
      <dl>
        <div><dt>Total Pertanyaan</dt><dd>${terjawab} / ${total}</dd></div>
        <div><dt>Kategori Selesai</dt><dd>${kategoriSelesai} dari ${KUESIONER_KATEGORI.length}</dd></div>
        <div><dt>Status</dt><dd>${siap ? "Siap Dilihat" : "Belum Lengkap"}</dd></div>
      </dl>
      <p>Saat Anda menekan Lihat Hasil, jawaban dan identitas dikirim ke server dan disimpan untuk keperluan penelitian; hanya peneliti dan administrator yang dapat melihatnya. Isi formulir ini sendiri akan terhapus jika Anda meninggalkan halaman.</p>`;
  }

  // ---------- Navigasi ----------
  function renderNav() {
    const awal = state.langkah === 1;
    const akhir = state.langkah === KUESIONER_TOTAL_LANGKAH;
    const kiri = awal
      ? '<a href="research-choose.html" class="btn btn-secondary">Kembali</a>'
      : '<button type="button" class="btn btn-secondary" id="kqPrev">Kembali</button>';
    const kanan = `<button type="button" class="btn btn-primary" id="kqNext">${akhir ? "Lihat Hasil" : "Selanjutnya"} ${ARROW}</button>`;
    elNav.innerHTML = kiri + kanan;

    const prev = document.getElementById("kqPrev");
    if (prev) prev.addEventListener("click", () => pindahLangkah(state.langkah - 1));
    document.getElementById("kqNext").addEventListener("click", lanjut);
  }

  async function lanjut() {
    bersihkanError();

    if (state.langkah === 1) {
      const err = validasiIdentitas(state.identitas);
      if (Object.keys(err).length) {
        tandaiErrorIdentitas(err);
        tampilkanError("Lengkapi data yang ditandai sebelum melanjutkan.");
        return;
      }
      pindahLangkah(2);
      return;
    }

    const kat = KUESIONER_KATEGORI[state.langkah - 2];
    const belum = [];
    state.jawaban[kat.id].forEach((v, i) => {
      const kartu = elBody.querySelector(`.kq-card[data-q="${i}"]`);
      if (v === null) {
        belum.push(i);
        if (kartu) kartu.classList.add("invalid");
      } else if (kartu) {
        kartu.classList.remove("invalid");
      }
    });
    if (belum.length) {
      tampilkanError(`Masih ada ${belum.length} pertanyaan yang belum dijawab.`);
      const pertama = elBody.querySelector(".kq-card.invalid");
      if (pertama) pertama.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (state.langkah < KUESIONER_TOTAL_LANGKAH) {
      pindahLangkah(state.langkah + 1);
      return;
    }

    // Langkah terakhir: pastikan semua langkah sebelumnya lengkap, lalu tampilkan hasil
    const bolong = langkahPertamaBelumLengkap();
    if (bolong) {
      pindahLangkah(bolong);
      tampilkanError("Ada bagian yang belum lengkap. Silakan lengkapi dulu sebelum melihat hasil.");
      return;
    }
    state.selesai = true;
    kuesionerSimpan(state);

    // Kirim ke server agar tercatat di dashboard peneliti. Bila gagal, hasil
    // tetap ditampilkan dan halaman hasil menawarkan kirim ulang.
    const btn = document.getElementById("kqNext");
    btn.disabled = true;
    btn.textContent = "Menyimpan…";
    try {
      await kuesionerKirim(state);
    } catch (err) {
      state.tersimpan = false;
      kuesionerSimpan(state);
    }
    window.location.href = "research-kuesioner-hasil.html";
  }

  // ---------- Render utama ----------
  function render() {
    const n = state.langkah;
    const persen = (n / KUESIONER_TOTAL_LANGKAH) * 100;
    elNote.textContent = `Langkah ${n} dari ${KUESIONER_TOTAL_LANGKAH}`;
    elPercent.textContent = `${persen.toFixed(1)}% selesai`;
    elFill.style.width = `${persen}%`;
    elTrack.setAttribute("aria-valuenow", persen.toFixed(0));

    if (n === 1) renderIdentitas();
    else renderKategori(KUESIONER_KATEGORI[n - 2]);
    renderNav();
  }

  render();
});
