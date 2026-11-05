// ==========================================================================
// Research — Upload Data: mengirim file sungguhan ke POST /api/upload
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileSelectedRow = document.getElementById("fileSelectedRow");
  const fileNameEl = document.getElementById("fileName");
  const runBtn = document.getElementById("runBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const errorBox = document.getElementById("uploadError");

  const MAX_BYTES = 10 * 1024 * 1024;
  let selectedFile = null;

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  function reset() {
    selectedFile = null;
    fileInput.value = "";
    fileSelectedRow.style.display = "none";
    runBtn.disabled = true;
  }

  function handleFile(file) {
    showError("");
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    if (!["csv", "xlsx"].includes(ext)) {
      reset();
      showError("Format file tidak didukung. Gunakan file .csv atau .xlsx.");
      return;
    }
    if (file.size > MAX_BYTES) {
      reset();
      showError("Ukuran file melebihi batas 10 MB.");
      return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSelectedRow.style.display = "flex";
    runBtn.disabled = false;
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      try {
        fileInput.files = e.dataTransfer.files;
      } catch (err) {}
      handleFile(file);
    }
  });

  cancelBtn.addEventListener("click", () => {
    showError("");
    reset();
  });

  runBtn.addEventListener("click", async () => {
    if (runBtn.disabled || !selectedFile) return;

    showError("");
    runBtn.disabled = true;
    const label = runBtn.textContent;
    runBtn.textContent = "Mengunggah…";

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const data = await Api.upload("/api/upload", form);

      RS.reset();
      RS.save({
        datasetId: data.dataset_id,
        filename: selectedFile.name,
        profile: data.profile,
        readInfo: data.read_info || null,
        cleaned: false,
        selection: null,
        result: null,
        resultKey: null,
      });
      window.location.href = "research-validation.html";
    } catch (err) {
      showError(err.message);
      runBtn.disabled = false;
      runBtn.textContent = label;
    }
  });

  // ---- Hasil analisis sebelumnya (tersimpan di browser ini) ----
  const last = RS.getLast();
  if (last && last.result) {
    const r = last.result;
    const bar = document.getElementById("lastResultBar");
    const meta = document.getElementById("lastResultMeta");
    meta.innerHTML =
      `Hasil sebelumnya: <strong>${RS.esc(r.method.code)}</strong> pada ` +
      `<strong>${RS.esc(r.dataset.filename)}</strong> · ${RS.esc(RS.fmtDate(last.savedAt))}`;
    bar.hidden = false;

    document.getElementById("clearLastBtn").addEventListener("click", () => {
      RS.clearLast();
      bar.hidden = true;
    });
  }
});
