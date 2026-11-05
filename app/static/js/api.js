// ==========================================================================
// API helper + sesi login (dipakai semua halaman yang memanggil backend)
// ==========================================================================

(function () {
  const TOKEN_KEY = "mancova_token";
  const USER_KEY = "mancova_user";

  const Auth = {
    getToken() {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
    },
    getUser() {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || "null");
      } catch (e) {
        return null;
      }
    },
    setSession(token, user, remember) {
      Auth.clear();
      const store = remember ? localStorage : sessionStorage;
      store.setItem(TOKEN_KEY, token);
      store.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
      [localStorage, sessionStorage].forEach((s) => {
        s.removeItem(TOKEN_KEY);
        s.removeItem(USER_KEY);
      });
    },
  };

  const NO_BACKEND_HELP =
    "Server aplikasi tidak terdeteksi. Jalankan server dengan perintah `python run.py` " +
    "(atau `uvicorn app.api.main:app --reload`) di folder proyek, lalu buka http://127.0.0.1:8000/ " +
    "- jangan membuka halaman lewat Live Server atau dengan klik dua kali pada file HTML.";

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, { method = "GET", body, form, raw = false } = {}) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers.Authorization = "Bearer " + token;

    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, { method, headers, body: payload });
    } catch (e) {
      throw new ApiError(NO_BACKEND_HELP, 0, "NETWORK");
    }

    if (raw && res.ok) return res;

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* respons bukan JSON */
    }

    // Respons bukan JSON dari aplikasi (mis. 404/405/501 dari server file statis):
    // berarti halaman dibuka tanpa server FastAPI.
    if (!res.ok && data === null && [404, 405, 501].includes(res.status)) {
      throw new ApiError(`${NO_BACKEND_HELP} (HTTP ${res.status})`, res.status, "NO_BACKEND");
    }

    if (!res.ok || (data && data.success === false)) {
      const msg = (data && data.message) || `Permintaan gagal (HTTP ${res.status}).`;
      throw new ApiError(msg, res.status, data && data.error_code);
    }
    return data;
  }

  window.Auth = Auth;
  window.ApiError = ApiError;
  window.Api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body }),
    upload: (path, form) => request(path, { method: "POST", form }),
    raw: (path) => request(path, { raw: true }),
    request,
  };
})();
