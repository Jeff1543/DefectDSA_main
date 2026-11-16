// ==========================================================================
// Unggah file dengan pemilihan sheet (xlsx berisi beberapa sheet).
//   const data = await SheetPicker.upload(file, mountEl);
// Bila file punya >1 sheet berisi data, pengguna diminta memilih. Hasilnya
// sama seperti respons /api/upload biasa; null bila pengguna membatalkan.
// ==========================================================================
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function pick(mount, info) {
    return new Promise((resolve) => {
      const usable = info.sheets.filter((s) => !s.empty);
      let chosen = info.suggested || (usable[0] && usable[0].name);

      const card = (s) => {
        const rows = s.preview
          .map((r, i) => `<tr>${r.map((c) => `<${i === 0 ? "th" : "td"}>${esc(c)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`)
          .join("");
        const badge = s.name === info.suggested ? `<span class="sp-badge">Disarankan</span>` : s.note ? `<span class="sp-badge muted">Mungkin catatan</span>` : "";
        return `
          <label class="sp-card${s.empty ? " disabled" : ""}${s.name === chosen ? " on" : ""}">
            <input type="radio" name="sheetChoice" value="${esc(s.name)}" ${s.empty ? "disabled" : ""} ${s.name === chosen ? "checked" : ""}>
            <div class="sp-head"><strong>${esc(s.name)}</strong>${badge}${s.empty ? `<span class="sp-badge muted">Kosong</span>` : ""}</div>
            ${rows ? `<div class="sp-preview"><table>${rows}</table></div>` : `<div class="sp-empty">Tidak ada data di sheet ini.</div>`}
          </label>`;
      };

      mount.innerHTML = `
        <div class="sheet-picker" role="group" aria-label="Pilih sheet">
          <h3>File ini punya ${info.sheets.length} sheet. Pilih yang berisi data Anda:</h3>
          <p class="sp-sub"><strong>${esc(info.filename)}</strong>. Pratinjau menampilkan beberapa baris teratas tiap sheet.</p>
          <div class="sp-list">${info.sheets.map(card).join("")}</div>
          <div class="sp-actions">
            <button type="button" class="btn btn-secondary" data-act="cancel">Batal</button>
            <button type="button" class="btn btn-primary" data-act="ok">Gunakan Sheet Ini</button>
          </div>
        </div>`;
      mount.hidden = false;
      mount.scrollIntoView({ behavior: "smooth", block: "nearest" });

      mount.addEventListener("change", (e) => {
        if (e.target.name !== "sheetChoice") return;
        chosen = e.target.value;
        mount.querySelectorAll(".sp-card").forEach((c) => c.classList.toggle("on", c.querySelector("input").value === chosen));
      });
      mount.querySelector('[data-act="cancel"]').addEventListener("click", () => {
        mount.hidden = true;
        mount.innerHTML = "";
        resolve(null);
      });
      mount.querySelector('[data-act="ok"]').addEventListener("click", () => {
        mount.hidden = true;
        mount.innerHTML = "";
        resolve(chosen);
      });
    });
  }

  async function upload(file, mount) {
    const form = new FormData();
    form.append("file", file);
    let data = await Api.upload("/api/upload", form);

    if (data && data.needs_sheet) {
      const sheet = await pick(mount, data);
      if (!sheet) return null;
      const form2 = new FormData();
      form2.append("token", data.token); // file tidak diunggah ulang
      form2.append("sheet", sheet);
      data = await Api.upload("/api/upload", form2);
    }
    return data;
  }

  window.SheetPicker = { upload };
})();
