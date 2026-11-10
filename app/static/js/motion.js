// ==========================================================================
// Motion — animasi seluruh situs (dipasang di tiap halaman). Aman bila gagal:
// bila sesuatu tidak didukung, halaman tampil normal tanpa animasi.
// ==========================================================================
(function () {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Elemen yang dianimasikan saat muncul. Arah dibedakan agar tidak monoton.
  const SPECIFIC = [
    ".section-head", ".page-head", ".research-head", ".kq-head", ".ft-head", ".who-head", ".gal-head", ".dash-head",
    ".value-card", ".ft-card", ".who-card", ".contact-card", ".choose-card", ".pick-card", ".stat-block",
    ".science-stats > div", ".doc-note", ".faq-item", ".doc-section", ".how-card", ".how-step", ".help-strip", ".pick-help",
    ".doc-table-wrap", ".doc-toc", ".ft-how", ".ft-cta", ".cf-field", ".gal-grid > *", ".card", ".panel", ".result-card",
    ".dash-panel", ".dash-tabs", ".method-list > *", ".portal-peneliti-pill", ".footer-col", ".footer-brand",
    ".form-col > *", ".plate-copy", ".mission-copy", ".science-copy", ".mission-media", ".science-media", ".method-media",
    "tbody tr",
  ];
  const GENERIC = [".container > *", ".laporan-wrap > *", ".dash-wrap > *", "main > *"];
  const SPEC_SEL = SPECIFIC.join(",");
  const GEN_SEL = GENERIC.join(",");
  const ALL_SEL = SPEC_SEL + "," + GEN_SEL;
  const LEFT = ".mission-copy, .science-copy, .method-list, .doc-toc, .plate-copy";
  const RIGHT = ".mission-media, .science-media, .method-media";
  const NEVER = ".navbar-wrap, .modal, .lb, .mo-bg, .mo-progress, script, style";

  let io = null;

  function direction(el, idx) {
    if (el.matches(LEFT)) return "left";
    if (el.matches(RIGHT)) return "zoom";
    if (el.matches(".section-head, .page-head, .research-head, .kq-head, .ft-head, .who-head, .gal-head, .dash-head")) return "blur";
    if (el.matches(".stat-block, .science-stats > div, .icon-circle")) return "zoom";
    if (el.matches("tbody tr")) return "left";
    return idx % 3 === 1 ? "up" : "up";
  }

  function tag(el, idx) {
    if (el.dataset.moDone || el.classList.contains("mo-reveal")) return;
    if (el.closest(NEVER) || (el.parentElement && el.parentElement.closest(".mo-reveal"))) return;
    if (el.matches(GEN_SEL) && !el.matches(SPEC_SEL) && el.querySelector(SPEC_SEL)) return; // anaknya sudah spesifik
    if (el.matches("tbody tr") && idx > 24) return; // tabel panjang: cukup 25 baris pertama
    el.dataset.moDone = "1";
    el.dataset.mo = direction(el, idx);
    const delay = Math.min(idx, 8) * 80;
    el.style.transitionDelay = delay + "ms";
    el.classList.add("mo-reveal");
    io.observe(el);
    el.__moDelay = delay;
  }

  function scan(root) {
    const list = [];
    if (root.matches && root.matches(ALL_SEL)) list.push(root);
    if (root.querySelectorAll) root.querySelectorAll(ALL_SEL).forEach((n) => list.push(n));
    const counter = new Map(); // urutan antar saudara -> jeda bertahap
    list.forEach((el) => {
      const p = el.parentElement;
      const i = counter.get(p) || 0;
      counter.set(p, i + 1);
      tag(el, i);
    });
  }

  function onReveal(entries) {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      io.unobserve(el);
      el.classList.add("mo-in");
      el.querySelectorAll && el.querySelectorAll(".mo-count").forEach(countUp);
      // Setelah selesai, lepas kelas agar gaya asli (hover, dll.) berlaku normal.
      setTimeout(() => {
        el.classList.remove("mo-reveal", "mo-in");
        el.style.transitionDelay = "";
        delete el.dataset.mo;
      }, 800 + (el.__moDelay || 0));
    });
  }

  // ---- Judul: kata muncul satu-satu ----
  function splitHeading(h) {
    if (h.dataset.moSplit || h.children.length || h.closest(NEVER) || !h.textContent.trim()) return;
    h.dataset.moSplit = "1";
    const text = h.textContent.trim();
    h.setAttribute("aria-label", text);
    h.textContent = "";
    text.split(/\s+/).forEach((w, i, a) => {
      const s = document.createElement("span");
      s.className = "mo-word";
      s.setAttribute("aria-hidden", "true");
      s.style.animationDelay = 0.15 + i * 0.07 + "s";
      s.textContent = w;
      h.appendChild(s);
      if (i < a.length - 1) h.appendChild(document.createTextNode(" "));
    });
  }

  // ---- Angka berhitung naik ----
  function prepCounters(root) {
    (root.querySelectorAll ? root.querySelectorAll(".stat-block strong, .science-stats strong") : []).forEach((el) => {
      if (el.dataset.moCount || el.children.length) return;
      const m = el.textContent.trim().match(/^(\d[\d.,]*)(\D*)$/);
      if (!m || /\//.test(el.textContent)) return;
      el.dataset.moCount = "1";
      el.classList.add("mo-count");
      el.dataset.target = m[1];
      el.dataset.suffix = m[2];
      el.textContent = (0).toFixed((m[1].split(".")[1] || "").length) + m[2];
    });
  }
  function countUp(el) {
    const raw = el.dataset.target;
    if (!raw || el.dataset.counting) return;
    el.dataset.counting = "1";
    const dec = (raw.split(".")[1] || "").length;
    const to = parseFloat(raw.replace(/,/g, ""));
    const suf = el.dataset.suffix || "";
    const t0 = performance.now(), dur = 1400;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ---- Latar hidup + sorotan kursor ----
  function initBackground() {
    const bg = document.createElement("div");
    bg.className = "mo-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = '<div class="mo-blob a"></div><div class="mo-blob b"></div><div class="mo-blob c"></div><div class="mo-spot"></div>';
    document.body.prepend(bg);
    if (!finePointer) return;
    const spot = bg.querySelector(".mo-spot");
    let x = 0, y = 0, raf = 0;
    window.addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY;
      spot.classList.add("on");
      if (!raf) raf = requestAnimationFrame(() => { spot.style.transform = `translate(${x}px, ${y}px)`; raf = 0; });
    }, { passive: true });
    document.addEventListener("pointerleave", () => spot.classList.remove("on"));
  }

  // ---- Scroll: progress bar, bayangan navbar, parallax gambar ----
  function initScroll() {
    const bar = document.createElement("div");
    bar.className = "mo-progress";
    document.body.appendChild(bar);
    const imgs = Array.from(document.querySelectorAll(".mission-media img, .science-media img, .method-media img"));
    let ticking = false;
    function update() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`;
      document.body.classList.toggle("mo-scrolled", window.scrollY > 8);
      imgs.forEach((im) => {
        const r = im.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const k = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        im.style.transform = `translateY(${(k * -28).toFixed(1)}px) scale(1.06)`;
      });
      ticking = false;
    }
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  // ---- Tilt 3D pada kartu ----
  function initTilt() {
    if (!finePointer) return;
    const SEL = ".value-card, .ft-card, .who-card, .contact-card, .choose-card, .pick-card, .stat-block";
    document.addEventListener("pointermove", (e) => {
      const c = e.target.closest && e.target.closest(SEL);
      if (!c || c.classList.contains("mo-reveal")) return;
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-7px)`;
    }, { passive: true });
    document.addEventListener("pointerout", (e) => {
      const c = e.target.closest && e.target.closest(SEL);
      if (c && !c.contains(e.relatedTarget)) c.style.transform = "";
    });
  }

  // ---- Ripple pada tombol ----
  function initRipple() {
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest && e.target.closest(".btn, .submit-btn, .register-btn");
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "mo-ripple";
      s.style.left = e.clientX - r.left + "px";
      s.style.top = e.clientY - r.top + "px";
      b.appendChild(s);
      setTimeout(() => s.remove(), 700);
    });
  }

  // ---- Pindah halaman: pudar lalu pergi ----
  function initLeave() {
    document.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a[href]");
      if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      if (a.target && a.target !== "_self") return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href) || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
      ev.preventDefault();
      document.body.classList.add("mo-leaving");
      setTimeout(() => { location.href = a.href; }, 200);
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) document.body.classList.remove("mo-leaving"); });
  }

  window.MO = {
    go(url) {
      if (reduce) { location.href = url; return; }
      document.body.classList.add("mo-leaving");
      setTimeout(() => { location.href = url; }, 220);
    },
  };

  function start() {
    // Ikon bergerak tidak serempak.
    document.querySelectorAll(".icon-circle").forEach((el, i) => el.style.setProperty("--mo-d", (i % 6) * -0.7 + "s"));
    initBackground();
    initScroll();
    initTilt();
    initRipple();
    initLeave();
    document.querySelectorAll("h1").forEach(splitHeading);

    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(onReveal, { threshold: 0.05 });
    prepCounters(document);
    scan(document.body);

    // Konten yang dibuat JavaScript belakangan (tabel, kartu hasil, dll.) ikut dianimasikan.
    let pending = [], queued = false;
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && !(n.className && /\bmo-/.test(String(n.className)))) pending.push(n);
      }));
      if (pending.length && !queued) {
        queued = true;
        requestAnimationFrame(() => {
          const batch = pending; pending = []; queued = false;
          batch.forEach((n) => { if (n.isConnected) { prepCounters(n); scan(n); n.querySelectorAll && n.querySelectorAll(".icon-circle").forEach((el, i) => el.style.setProperty("--mo-d", (i % 6) * -0.7 + "s")); } });
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function boot() { try { start(); } catch (err) { console.warn("motion.js:", err); } }
  if (reduce) { window.MO.go = (u) => { location.href = u; }; initLeaveSafe(); return; }
  function initLeaveSafe() { /* tanpa animasi: biarkan tautan berjalan normal */ }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
