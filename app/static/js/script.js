// ==========================================================================
// MANCOVA — Shared JS (dipakai di semua halaman)
// ==========================================================================

// --- Definisi 7 langkah alur Riset (Upload -> AI Insights): Upload, Validasi, Pilih Uji, Pilih Variabel, Uji Asumsi, Hasil, AI Insights ---
const RESEARCH_STEPS = [
  {
    label: "UPLOAD DATA",
    icon: '<path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8a4 4 0 0 1 1 7.9"/><path d="M12 12v7M9 16l3-3 3 3"/>',
  },
  {
    label: "VALIDASI DATA",
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8.5 12.5l2 2 4.5-4.5"/><path d="M9 17h6"/>',
  },
  {
    label: "PILIH UJI",
    icon: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M8 21h8M12 18v3"/>',
  },
  {
    label: "PILIH VARIABEL",
    icon: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="17" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.6" fill="currentColor" stroke="none"/>',
  },
  {
    label: "UJI ASUMSI",
    icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 15v-3M12 15V8M16 15v-5"/>',
  },
  {
    label: "HASIL ANALISIS",
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  },
  {
    label: "AI INSIGHTS",
    icon: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 14.5l.8 2.2L22 17.5l-2.2.8L19 20.5l-.8-2.2L16 17.5l2.2-.8L19 14.5z"/>',
  },
];

const RESEARCH_STEP_CHECK = '<path d="M4 12l6 6L20 6"/>';

/**
 * Render stepper 7-langkah ke dalam elemen dengan id tertentu.
 * @param {string} containerId - id elemen wrapper (mis. "researchStepper")
 * @param {number} activeStep - nomor langkah aktif, 1-based (1..7)
 */
function renderResearchStepper(containerId, activeStep) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.classList.add("step-indicator", "steps-7");
  el.innerHTML = RESEARCH_STEPS.map((step, i) => {
    const stepNo = i + 1;
    const isDone = stepNo < activeStep;
    const isActive = stepNo === activeStep;
    const state = isDone ? "done" : isActive ? "active" : "";
    const iconMarkup = isDone
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">${RESEARCH_STEP_CHECK}</svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${step.icon}</svg>`;
    const labelMarkup = isActive ? `<span class="step-label">${step.label}</span>` : "";
    const circle = `<div class="step ${state}"><div class="step-circle">${iconMarkup}</div>${labelMarkup}</div>`;
    const line =
      i < RESEARCH_STEPS.length - 1
        ? `<div class="step-line ${isDone ? "done" : ""}"></div>`
        : "";
    return circle + line;
  }).join("");
}

/**
 * Menu hamburger untuk layar kecil. Tombol disisipkan otomatis ke setiap
 * .navbar yang punya .nav-links, jadi tidak perlu mengubah HTML tiap halaman.
 */
function initMobileNav() {
  const wrap = document.querySelector(".navbar-wrap");
  const nav = wrap && wrap.querySelector(".navbar");
  const links = nav && nav.querySelector(".nav-links");
  if (!links || nav.querySelector(".nav-toggle")) return;

  if (!links.id) links.id = "navLinks";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-controls", links.id);
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", "Buka menu");
  btn.innerHTML =
    '<svg class="ico-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
    '<svg class="ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  nav.appendChild(btn);

  const setOpen = (open) => {
    wrap.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!wrap.classList.contains("nav-open"));
  });
  links.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); btn.focus(); } });
  window.matchMedia("(min-width: 901px)").addEventListener("change", (m) => { if (m.matches) setOpen(false); });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("MANCOVA page loaded:", document.title);
  initMobileNav();

  const stepperEl = document.getElementById("researchStepper");
  if (stepperEl && stepperEl.dataset.active) {
    renderResearchStepper("researchStepper", parseInt(stepperEl.dataset.active, 10));
  }
});
