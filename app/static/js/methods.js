// ==========================================================================
// Research — Pilih Uji: pengguna memilih ANOVA / ANCOVA / MANOVA / MANCOVA /
// Regresi Linier lebih dulu. Variabel dipilih di langkah berikutnya sesuai
// syarat uji yang dipilih (lihat RS.METHODS di research-state.js).
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const st = RS.load();
  const guard = document.getElementById("metGuard");
  const main = document.getElementById("metMain");
  const grid = document.getElementById("pickGrid");
  const nextBtn = document.getElementById("metNext");

  if (!st.datasetId || !st.cleaned || !st.profile) {
    guard.innerHTML = 'Belum ada data yang siap dianalisis. <a href="research-upload.html">Unggah file</a> dan selesaikan validasi terlebih dahulu.';
    guard.hidden = false;
    return;
  }
  main.hidden = false;

  const e = RS.esc;
  const need = (r, name) => (r.max === 0 ? `<li class="off">${name}: tidak dipakai</li>` : `<li>${name}: ${RS.ruleText(r)}</li>`);

  grid.innerHTML = Object.values(RS.METHODS)
    .map((m) => {
      const r = m.rules;
      return `<button type="button" class="pick-card" role="radio" aria-checked="false" data-method="${e(m.code)}">
        <span class="pick-top"><strong class="pick-code">${e(m.code)}</strong><span class="pick-tag">${e(m.tag)}</span></span>
        <span class="pick-full">${e(m.full)}</span>
        <span class="pick-desc">${e(m.desc)}</span>
        <ul class="pick-need">
          ${need(r.dep, "Dependen")}
          ${need(r.ind, "Independen")}
          ${need(r.cov, r.cov.min >= 1 && r.ind.max === 0 ? "Prediktor" : "Kovariat")}
        </ul>
        <span class="pick-ex">${e(m.example)}</span>
      </button>`;
    })
    .join("");

  let chosen = st.method && RS.METHODS[st.method] ? st.method : null;

  function paint() {
    grid.querySelectorAll(".pick-card").forEach((c) => {
      const on = c.dataset.method === chosen;
      c.classList.toggle("selected", on);
      c.setAttribute("aria-checked", on ? "true" : "false");
    });
    nextBtn.disabled = !chosen;
  }

  grid.addEventListener("click", (ev) => {
    const card = ev.target.closest(".pick-card");
    if (!card) return;
    chosen = card.dataset.method;
    paint();
  });
  paint();

  nextBtn.addEventListener("click", () => {
    if (!chosen) return;
    if (chosen !== st.method) {
      // Uji berganti: syarat variabelnya berbeda, jadi pilihan & hasil lama dibuang.
      RS.save({ method: chosen, selection: null, result: null, resultKey: null });
    }
    window.location.href = "research-variables.html";
  });
});
