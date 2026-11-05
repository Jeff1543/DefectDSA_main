// ==========================================================================
// Research — Pilih Variabel: kolom diambil dari file yang benar-benar diunggah.
// Uji (ANOVA/ANCOVA/MANOVA/MANCOVA/Regresi Linier) sudah dipilih di langkah
// sebelumnya; syarat jumlah variabel tiap kotak mengikuti RS.METHODS[uji].
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const st = RS.load();
  const guard = document.getElementById("varGuard");
  const main = document.getElementById("varMain");

  if (!st.datasetId || !st.cleaned || !st.profile) {
    guard.innerHTML = 'Belum ada data yang siap dianalisis. <a href="research-upload.html">Unggah file</a> dan selesaikan validasi terlebih dahulu.';
    guard.hidden = false;
    return;
  }
  const METHOD = st.method;
  const M = RS.METHODS[METHOD];
  if (!M) {
    guard.innerHTML = 'Uji statistik belum dipilih. <a href="research-methods.html">Pilih uji</a> terlebih dahulu.';
    guard.hidden = false;
    return;
  }
  main.hidden = false;

  // ---- Bilah uji terpilih + syarat tiap kotak ----
  document.getElementById("varMethodBar").innerHTML =
    `<span>Uji yang dipilih: <span class="vm-code">${RS.esc(M.code)}</span><span class="vm-full">(${RS.esc(M.full)})</span></span>` +
    `<a href="research-methods.html" class="btn-link" style="text-decoration:underline;">Ganti uji</a>`;

  const ZONE_KEY = { "dz-dependent": "dep", "dz-independent": "ind", "dz-covariates": "cov" };
  const ZONE_NAME = { dep: "variabel Dependen", ind: "variabel Independen (faktor)", cov: METHOD === "Regresi Linier" ? "Kovariat (prediktor)" : "Kovariat" };
  const setSub = (id, base, r) => {
    document.getElementById(id).textContent = r.max === 0 ? `${base} — tidak dipakai pada ${METHOD}` : `${base} — ${RS.ruleText(r)}`;
  };
  setSub("subDep", "(Respons) numerik", M.rules.dep);
  setSub("subInd", "(Faktor) kategorik", M.rules.ind);
  setSub("subCov", METHOD === "Regresi Linier" ? "(Prediktor) numerik" : "(Kontrol) numerik", M.rules.cov);
  Object.entries(ZONE_KEY).forEach(([id, k]) => {
    const dz = document.getElementById(id);
    if (M.rules[k].max === 0) {
      dz.classList.add("disabled");
      dz.dataset.example = `Tidak dipakai pada ${METHOD}`;
      dz.dataset.hint = "Kotak ini dinonaktifkan";
    }
  });

  const cols = st.profile.columns;
  const colByName = Object.fromEntries(cols.map((c) => [c.name, c]));

  // ---- Pratinjau data ----
  const isNum = (c) => c.dtype === "numeric";
  document.getElementById("previewHead").innerHTML =
    '<th class="rn">#</th>' +
    cols.map((c) => `<th class="${isNum(c) ? "num" : ""}">${RS.esc(c.name)}<span class="th-type">${isNum(c) ? "numerik" : "kategorik"}</span></th>`).join("");
  document.getElementById("previewBody").innerHTML = st.profile.preview
    .map((row, i) => {
      const cells = cols
        .map((c) => {
          const v = row[c.name];
          if (v === null || v === undefined || v === "") return '<td class="na">kosong</td>';
          const shown = isNum(c) && typeof v === "number" ? RS.fmtNum(v, 3) : RS.esc(v);
          return `<td class="${isNum(c) ? "num" : ""}">${shown}</td>`;
        })
        .join("");
      return `<tr><td class="rn">${i + 1}</td>${cells}</tr>`;
    })
    .join("");
  document.getElementById("previewCaption").textContent =
    `${st.profile.preview.length} baris pertama dari ${st.filename} (${st.profile.n_rows.toLocaleString("id-ID")} baris, ${cols.length} kolom). Geser tabel untuk melihat kolom lainnya.`;

  // ---- Chip variabel ----
  const pool = document.getElementById("pool");
  const dropzones = [...document.querySelectorAll(".dropzone")];
  let dragged = null;
  let selected = null;

  const RULES = {
    "dz-dependent": {
      ok: (c) => c.dtype === "numeric",
      msg: (c) => `"${c.name}" bukan kolom numerik, sehingga tidak bisa menjadi variabel dependen.`,
    },
    "dz-independent": {
      ok: (c) => c.can_be_factor,
      msg: (c) => `"${c.name}" tidak cocok sebagai faktor: kolom numerik hanya bisa dipakai bila berupa kode kelompok (2–10 nilai unik).`,
    },
    "dz-covariates": {
      ok: (c) => c.dtype === "numeric",
      msg: (c) => `"${c.name}" bukan kolom numerik, sehingga tidak bisa menjadi kovariat.`,
    },
  };

  function makeChip(c) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.draggable = true;
    chip.tabIndex = 0;
    chip.dataset.var = c.name;
    const dots = document.createElement("span");
    dots.className = "drag-dots";
    dots.textContent = "⠿";
    const label = document.createElement("span");
    label.textContent = " " + c.name;
    const type = document.createElement("span");
    type.className = "chip-type";
    type.textContent = c.dtype === "numeric" ? (c.can_be_factor ? "angka · bisa faktor" : "angka") : "kategori";
    chip.append(dots, label, type);

    chip.addEventListener("dragstart", (e) => {
      // Firefox mensyaratkan data di-set agar drag dimulai
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", c.name);
        e.dataTransfer.effectAllowed = "move";
      }
      dragged = chip;
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
      dragged = null;
    });
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".chip-remove")) return;
      // Variabel terpilih + klik pada kotak yang sudah berisi variabel lain = letakkan ke kotak itu
      const hostZone = chip.closest(".dropzone");
      if (hostZone && selected && selected !== chip) {
        place(selected, hostZone);
        return;
      }
      if (selected === chip) {
        chip.classList.remove("selected");
        selected = null;
      } else {
        if (selected) selected.classList.remove("selected");
        selected = chip;
        chip.classList.add("selected");
      }
    });
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chip.click();
      }
    });
    return chip;
  }

  cols.forEach((c) => pool.appendChild(makeChip(c)));

  // ---- Dropzone ----
  function renderEmpty(dz) {
    if (dz.querySelector(".dropzone-chips")?.children.length) return;
    dz.classList.remove("has-items");
    dz.innerHTML = "";
    const ex = document.createElement("div");
    ex.className = "dz-example";
    ex.textContent = dz.dataset.example;
    const hint = document.createElement("div");
    hint.className = "dz-hint";
    hint.textContent = dz.dataset.hint;
    dz.append(ex, hint);
  }

  function returnToPool(chip) {
    chip.classList.remove("in-dropzone", "selected");
    chip.querySelector(".chip-remove")?.remove();
    pool.appendChild(chip);
  }

  function place(chip, dz) {
    const col = colByName[chip.dataset.var];
    const rule = RULES[dz.id];
    if (!rule.ok(col)) {
      setHint(rule.msg(col), true);
      dz.classList.add("invalid");
      setTimeout(() => dz.classList.remove("invalid"), 1200);
      return;
    }

    const k = ZONE_KEY[dz.id];
    const rl = M.rules[k];
    if (rl.max === 0) {
      setHint(`${METHOD} tidak memakai ${ZONE_NAME[k]}.`, true);
      return;
    }
    const oldDz = chip.closest(".dropzone");
    const othersInZone = [...dz.querySelectorAll(".chip")].filter((c) => c !== chip).length;
    if (rl.max !== null && othersInZone >= rl.max) {
      setHint(`${METHOD} hanya memakai ${rl.max} ${ZONE_NAME[k]}. Keluarkan variabel yang ada dulu, lalu coba lagi.`, true);
      dz.classList.add("invalid");
      setTimeout(() => dz.classList.remove("invalid"), 1200);
      return;
    }
    let wrap = dz.querySelector(".dropzone-chips");
    if (!wrap) {
      dz.innerHTML = "";
      wrap = document.createElement("div");
      wrap.className = "dropzone-chips";
      dz.appendChild(wrap);
    }

    chip.classList.add("in-dropzone");
    chip.classList.remove("selected");
    selected = null;

    if (!chip.querySelector(".chip-remove")) {
      const btn = document.createElement("button");
      btn.className = "chip-remove";
      btn.type = "button";
      btn.setAttribute("aria-label", "Keluarkan variabel");
      btn.textContent = "✕";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const from = chip.closest(".dropzone");
        returnToPool(chip);
        if (from) renderEmpty(from);
        refresh();
      });
      chip.appendChild(btn);
    }

    wrap.appendChild(chip);
    dz.classList.add("has-items");
    if (oldDz && oldDz !== dz) renderEmpty(oldDz);
    refresh();
  }

  dropzones.forEach((dz) => {
    renderEmpty(dz);
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("drag-over");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("drag-over");
      if (dragged) place(dragged, dz);
    });
    dz.addEventListener("click", (e) => {
      if (selected && !e.target.closest(".chip")) place(selected, dz);
    });
  });

  pool.addEventListener("dragover", (e) => e.preventDefault());
  pool.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragged) return;
    const from = dragged.closest(".dropzone");
    returnToPool(dragged);
    if (from) renderEmpty(from);
    refresh();
  });

  // ---- Validasi struktur terhadap uji yang dipilih ----
  const runBtn = document.getElementById("runAnalysisBtn");
  const hint = document.getElementById("varHint");

  function setHint(text, warn) {
    hint.textContent = text;
    hint.classList.toggle("warn", !!warn);
    hint.style.color = warn ? "" : "var(--slate-500)";
  }

  function selection() {
    const get = (id) => [...document.querySelectorAll(`#${id} .chip`)].map((c) => c.dataset.var);
    return {
      method: METHOD,
      dependent: get("dz-dependent"),
      independent: get("dz-independent"),
      covariates: get("dz-covariates"),
    };
  }

  function refresh() {
    const v = RS.validateSelection(METHOD, selection());
    runBtn.disabled = !v.ok;
    if (v.errors.length) {
      setHint(v.errors.join(" "), true);
    } else if (v.missing.length) {
      setHint(`Untuk ${METHOD}, lengkapi dahulu: ${v.missing.join("; ")}.`, false);
    } else {
      setHint(`Struktur variabel sesuai untuk ${METHOD}. Silakan jalankan analisis.`, false);
    }
  }

  // ---- Pulihkan pilihan sebelumnya ----
  if (st.selection && st.selection.method === METHOD) {
    const map = { dependent: "dz-dependent", independent: "dz-independent", covariates: "dz-covariates" };
    Object.entries(map).forEach(([key, id]) => {
      (st.selection[key] || []).forEach((name) => {
        const chip = pool.querySelector(`.chip[data-var="${CSS.escape(name)}"]`);
        if (chip) place(chip, document.getElementById(id));
      });
    });
  }
  refresh();

  runBtn.addEventListener("click", () => {
    if (runBtn.disabled) return;
    RS.save({ selection: selection(), result: null, resultKey: null });
    window.location.href = "research-assumptions.html";
  });
});
