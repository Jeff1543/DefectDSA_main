// ==========================================================================
// Portal Peneliti — login & pendaftaran terhubung ke API (/api/auth/*)
// ==========================================================================

const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const fullname = document.getElementById("fullname");
const nameField = document.getElementById("nameField");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const nameError = document.getElementById("nameError");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");
const togglePassword = document.getElementById("togglePassword");
const forgotLink = document.getElementById("forgotLink");
const modeToggle = document.getElementById("modeToggle");
const portalTitle = document.getElementById("portalTitle");
const portalSubtitle = document.getElementById("portalSubtitle");
const remember = document.getElementById("remember");

const SUBTITLE_LOGIN = portalSubtitle.innerHTML;
let mode = "login"; // "login" | "register"

function showStatus(text, isError) {
  statusMessage.textContent = text;
  statusMessage.classList.toggle("error", !!isError);
  statusMessage.classList.add("show");
}

function setMode(next) {
  mode = next;
  const reg = mode === "register";
  nameField.style.display = reg ? "" : "none";
  portalTitle.textContent = reg ? "Buat akun peneliti" : "Portal Peneliti";
  portalSubtitle.innerHTML = reg
    ? "Daftarkan akun untuk menyimpan riwayat analisis dan mengakses dashboard peneliti."
    : SUBTITLE_LOGIN;
  submitBtn.textContent = reg ? "Daftar" : "Masuk";
  modeToggle.textContent = reg ? "Masuk" : "Daftar";
  password.autocomplete = reg ? "new-password" : "current-password";
  clearErrors();
  statusMessage.classList.remove("show");
}

modeToggle.addEventListener("click", (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "register" : "login");
});

togglePassword.addEventListener("click", () => {
  const isPassword = password.type === "password";
  password.type = isPassword ? "text" : "password";
  togglePassword.setAttribute("aria-label", isPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
  togglePassword.classList.toggle("on", isPassword);
});

function clearErrors() {
  [emailError, passwordError, nameError].forEach((e) => (e.textContent = ""));
  [email, password, fullname].forEach((i) => (i.style.borderColor = ""));
}

function fail(input, errEl, msg) {
  errEl.textContent = msg;
  input.style.borderColor = "#8a3329";
  return false;
}

function validate() {
  clearErrors();
  let valid = true;
  const reg = mode === "register";

  if (reg && fullname.value.trim().length < 2) valid = fail(fullname, nameError, "Nama wajib diisi (minimal 2 karakter).");

  const emailValue = email.value.trim();
  if (!emailValue) valid = fail(email, emailError, "Email wajib diisi.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) valid = fail(email, emailError, "Format email belum valid.");

  if (!password.value) valid = fail(password, passwordError, "Kata sandi wajib diisi.");
  else if (reg && password.value.length < 8) valid = fail(password, passwordError, "Kata sandi minimal 8 karakter.");

  return valid;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusMessage.classList.remove("show");
  if (!validate()) return;

  const label = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.textContent = "Memproses...";

  try {
    const body = { email: email.value.trim(), password: password.value };
    let data;
    if (mode === "register") {
      body.name = fullname.value.trim();
      data = await Api.post("/api/auth/register", body);
    } else {
      data = await Api.post("/api/auth/login", body);
    }

    Auth.setSession(data.token, data.user, remember.checked);
    showStatus("Berhasil masuk. Membuka dashboard...", false);
    window.location.href = "dashboard.html";
  } catch (err) {
    showStatus(err.message, true);
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.textContent = label;
  }
});

forgotLink.addEventListener("click", (event) => {
  event.preventDefault();
  showStatus("Reset kata sandi dilakukan oleh administrator. Silakan hubungi administrator atau tim kami lewat halaman Kontak.", false);
});

[email, password, fullname].forEach((input) => {
  input.addEventListener("input", () => {
    input.style.borderColor = "";
    statusMessage.classList.remove("show");
  });
});

// Sudah login? langsung ke dashboard bila token masih valid.
(async () => {
  if (!Auth.getToken()) return;
  try {
    await Api.get("/api/auth/me");
    window.location.href = "dashboard.html";
  } catch (e) {
    Auth.clear();
  }
})();


// Slideshow foto di panel kiri
(function () {
  var slides = document.querySelectorAll(".plate-slide");
  if (slides.length < 2) return;
  var i = 0;
  setInterval(function () {
    slides[i].classList.remove("is-active");
    i = (i + 1) % slides.length;
    slides[i].classList.add("is-active");
  }, 5000);
})();
