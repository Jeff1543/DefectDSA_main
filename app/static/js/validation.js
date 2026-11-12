// ==========================================================================
// Research — Validasi Data: profil sungguhan dari /api/upload + POST /api/clean
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const st = RS.load();
  const errBox = document.getElementById("valError");
  const card = document.getElementById("valCard");

  function showError(html) {
    errBox.innerHTML = html;
    errBox.hidden = !html;
  }

  if (!st.datasetId || !st.profile) {
    showError('Belum ada file yang diunggah. <a href="research-upload.html">Unggah file terlebih dahulu</a>.');
    return;
  }

  const profile = st.profile;
  const totalMissing = profile.columns.reduce((a, c) => a + c.missing_count, 0);
  const ext = (st.filename || "").split(".").pop().toUpperCase();

  document.getElementById("statRows").textContent = profile.n_rows.toLocaleString("id-ID");
  document.getElementById("statCols").textContent = profile.n_columns;
  document.getElementById("statFormat").textContent = "." + ext;
  document.getElementById("statMissing").textContent = totalMissing.toLocaleString("id-ID");

  const banner = document.getElementById("validationBanner");
  const title = document.getElementById("validationTitle");
  const sub = document.getElementById("validationSubtitle");
  const fname = RS.esc(st.filename);

  if (totalMissing === 0) {
    title.textContent = "Struktur Data Valid & Lengkap";
    sub.innerHTML = `File <strong>${fname}</strong> tidak memiliki data kosong dan siap untuk tahap pemilihan variabel.`;
  } else {
    banner.classList.add("warning");
    title.textContent = "Ditemukan Data Kosong";
    sub.innerHTML = `File <strong>${fname}</strong> memiliki ${totalMissing.toLocaleString("id-ID")} sel kosong. Pilih cara penanganannya di bawah ini.`;
    document.getElementById("cleanPanel").hidden = false;
  }

  // Beri tahu pengguna bila sistem otomatis melewati baris judul/keterangan
  // atau memilih sheet tertentu pada file Excel.
  const ri = st.readInfo;
  if (ri) {
    const notes = [];
    if (ri.header_row > 1) {
      notes.push(`nama kolom terdeteksi di baris ${ri.header_row} (${ri.skipped_rows} baris di atasnya dilewati)`);
    }
    if (ri.sheet) notes.push(`data dibaca dari sheet <strong>${RS.esc(ri.sheet)}</strong>`);
    if (notes.length) {
      sub.innerHTML += `<br><span style="font-size:0.88rem;opacity:0.85;">Info pembacaan: ${notes.join("; ")}.</span>`;
    }
  }

  // Tabel kolom: tipe bisa diubah (numerik <-> kategorik) lewat dropdown.
  const colTable = document.getElementById("colTable");
  const typeMsg = document.getElementById("typeMsg");

  function renderColumns() {
    colTable.innerHTML = profile.columns
      .map(
        (c) => `<tr>
        <td><strong>${RS.esc(c.name)}</strong></td>
        <td><select class="type-select" data-col="${RS.esc(c.name)}" aria-label="Tipe kolom ${RS.esc(c.name)}">
          <option value="numeric"${c.dtype === "numeric" ? " selected" : ""}>Numerik</option>
          <option value="categorical"${c.dtype === "numeric" ? "" : " selected"}>Kategorik</option>
        </select></td>
        <td>${c.unique_count}</td>
        <td>${c.missing_count ? `${c.missing_count} (${c.missing_percentage}%)` : "0"}</td>
      </tr>`
      )
      .join("");
  }
  renderColumns();
  document.getElementById("colDetails").open = true;

  function setTypeMsg(html, kind) {
    typeMsg.innerHTML = html;
    typeMsg.className = "type-msg" + (kind ? " " + kind : "");
    typeMsg.hidden = !html;
  }

  colTable.addEventListener("change", async (ev) => {
    const sel = ev.target.closest(".type-select");
    if (!sel) return;
    const name = sel.dataset.col;
    const to = sel.value;
    const prev = profile.columns.find((c) => c.name === name);
    sel.disabled = true;
    setTypeMsg("");
    try {
      const res = await Api.post("/api/convert-type", { dataset_id: st.datasetId, column: name, to });
      profile.columns = res.profile.columns;
      // Tipe berubah: pilihan variabel & hasil lama tidak berlaku lagi.
      RS.save({ profile: Object.assign({}, st.profile, res.profile), cleaned: false, selection: null, result: null, resultKey: null });
      renderColumns();
      setTypeMsg(`Kolom <strong>${RS.esc(name)}</strong> sekarang bertipe <strong>${to === "numeric" ? "Numerik" : "Kategorik"}</strong>.`, "ok");
    } catch (err) {
      sel.value = prev ? prev.dtype : sel.value; // kembalikan pilihan
      const expired = /sesi dataset|tidak ditemukan/i.test(err.message);
      setTypeMsg(RS.esc(err.message) + (expired ? ' <a href="research-upload.html">Unggah ulang file</a>.' : ""), "err");
    } finally {
      sel.disabled = false;
    }
  });

  card.hidden = false;

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.addEventListener("click", async () => {
    showError("");
    const strategy = totalMissing === 0 ? "impute" : document.querySelector('input[name="clean"]:checked').value;
    const numeric = document.getElementById("numRule").value;

    const body = { dataset_id: st.datasetId, strategy };
    if (strategy === "impute") body.impute_rules = { numeric, categorical: "mode" };

    nextBtn.disabled = true;
    const label = nextBtn.textContent;
    nextBtn.textContent = "Memproses…";

    try {
      const res = await Api.post("/api/clean", body);
      RS.save({
        cleaned: true,
        nRowsAfter: res.n_rows_after,
        selection: null,
        result: null,
        resultKey: null,
      });
      window.location.href = "research-methods.html";
    } catch (err) {
      const expired = /sesi dataset|tidak ditemukan/i.test(err.message);
      showError(
        RS.esc(err.message) +
          (expired ? ' <a href="research-upload.html">Unggah ulang file</a>.' : "")
      );
      nextBtn.disabled = false;
      nextBtn.textContent = label;
    }
  });
});
