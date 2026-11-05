// ==========================================================================
// Dokumentasi — galeri foto otomatis dari folder static/img/dokumentasi/
// (daftar diambil dari GET /api/gallery) + penampil layar penuh
// ==========================================================================

(async function () {
  const grid = document.getElementById("galGrid");
  const count = document.getElementById("galCount");
  const errBox = document.getElementById("galError");
  const lb = document.getElementById("lb");
  const lbImg = document.getElementById("lbImg");
  const lbCap = document.getElementById("lbCap");
  const lbCount = document.getElementById("lbCount");

  let items = [];
  let current = 0;
  let lastFocus = null;

  // ---------- Muat daftar foto ----------
  try {
    const data = await Api.get("/api/gallery");
    items = data.items || [];
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }

  if (!items.length) {
    // Kerangka mosaik sementara foto belum ada
    const heights = [220, 300, 180, 260, 340, 200, 280, 240, 190];
    grid.innerHTML = heights.map((h) => `<div class="gal-skel" style="height:${h}px" aria-hidden="true"></div>`).join("");
    if (!errBox.hidden) return;
    const p = document.createElement("p");
    p.className = "gal-empty";
    p.textContent = "Belum ada foto dokumentasi.";
    grid.before(p);
    return;
  }

  count.textContent = `${items.length} foto`;

  // ---------- Render grid ----------
  items.forEach((it, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gal-item";
    btn.setAttribute("aria-label", it.caption ? `Buka foto: ${it.caption}` : `Buka foto ${i + 1}`);

    const img = document.createElement("img");
    if (it.w && it.h) {
      img.width = it.w;
      img.height = it.h;
    }
    img.src = it.src;
    img.alt = it.caption || `Foto dokumentasi ${i + 1}`;
    img.loading = i < 8 ? "eager" : "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => img.classList.add("loaded"));
    img.addEventListener("error", () => btn.remove());
    btn.appendChild(img);
    btn.style.animationDelay = Math.min(i, 12) * 45 + "ms";

    const zoom = document.createElement("span");
    zoom.className = "gal-zoom";
    zoom.setAttribute("aria-hidden", "true");
    zoom.textContent = "⤢";
    btn.appendChild(zoom);

    if (it.caption) {
      const cap = document.createElement("span");
      cap.className = "gal-cap";
      cap.textContent = it.caption;
      btn.appendChild(cap);
    }

    btn.addEventListener("click", () => open(i, btn));
    grid.appendChild(btn);
  });

  // ---------- Penampil ----------
  function show(i) {
    current = (i + items.length) % items.length;
    const it = items[current];
    lbImg.src = it.src;
    lbImg.alt = it.caption || `Foto dokumentasi ${current + 1}`;
    lbCap.textContent = it.caption || "";
    lbCount.textContent = `${current + 1} / ${items.length}`;

    // pramuat tetangga
    [current + 1, current - 1].forEach((n) => {
      const pre = new Image();
      pre.src = items[(n + items.length) % items.length].src;
    });

    const single = items.length < 2;
    document.getElementById("lbPrev").hidden = single;
    document.getElementById("lbNext").hidden = single;
  }

  function open(i, trigger) {
    lastFocus = trigger || document.activeElement;
    lb.hidden = false;
    document.body.classList.add("lb-open");
    show(i);
    document.getElementById("lbClose").focus();
  }

  function close() {
    lb.hidden = true;
    document.body.classList.remove("lb-open");
    lbImg.removeAttribute("src");
    if (lastFocus) lastFocus.focus();
  }

  document.getElementById("lbClose").addEventListener("click", close);
  document.getElementById("lbPrev").addEventListener("click", () => show(current - 1));
  document.getElementById("lbNext").addEventListener("click", () => show(current + 1));
  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });

  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "Tab") {
      // jaga fokus tetap di dalam penampil
      const focusables = [...lb.querySelectorAll("button:not([hidden])")];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // geser jari di layar sentuh
  let startX = null;
  lb.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    startX = null;
  });
})();
