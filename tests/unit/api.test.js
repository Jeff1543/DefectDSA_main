import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadScript } from "./helpers/load-script.js";

loadScript("api.js");
const { Auth, Api, ApiError } = window;

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Auth", () => {
  const user = { id: 1, name: "Admin", role: "admin" };

  it("setSession(remember=true) memakai localStorage", () => {
    Auth.setSession("tok", user, true);
    expect(localStorage.getItem("mancova_token")).toBe("tok");
    expect(sessionStorage.getItem("mancova_token")).toBeNull();
    expect(Auth.getToken()).toBe("tok");
    expect(Auth.getUser()).toEqual(user);
  });

  it("setSession(remember=false) memakai sessionStorage", () => {
    Auth.setSession("tok", user, false);
    expect(sessionStorage.getItem("mancova_token")).toBe("tok");
    expect(localStorage.getItem("mancova_token")).toBeNull();
  });

  it("setSession menimpa sesi lama di kedua storage", () => {
    Auth.setSession("lama", user, true);
    Auth.setSession("baru", user, false);
    expect(localStorage.getItem("mancova_token")).toBeNull();
    expect(Auth.getToken()).toBe("baru");
  });

  it("clear() menghapus token dan user", () => {
    Auth.setSession("tok", user, true);
    Auth.clear();
    expect(Auth.getToken()).toBeNull();
    expect(Auth.getUser()).toBeNull();
  });

  it("getUser() tahan terhadap JSON rusak", () => {
    localStorage.setItem("mancova_user", "{rusak");
    expect(Auth.getUser()).toBeNull();
  });
});

describe("Api", () => {
  it("GET sukses mengembalikan JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true, n: 3 })));
    await expect(Api.get("/api/x")).resolves.toEqual({ success: true, n: 3 });
  });

  it("menyertakan header Authorization bila sudah login", async () => {
    Auth.setSession("tok123", {}, false);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await Api.get("/api/me");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok123");
  });

  it("POST mengirim body JSON beserta Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await Api.post("/api/auth/login", { email: "a@b.c" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.c" }));
  });

  it("respons gagal dilempar sebagai ApiError dengan pesan, status, dan kode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error_code: "AUTH_FAILED", message: "Email atau kata sandi salah." }, 401)
      )
    );
    const err = await Api.post("/api/auth/login", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Email atau kata sandi salah.");
    expect(err.status).toBe(401);
    expect(err.code).toBe("AUTH_FAILED");
  });

  it("kegagalan jaringan -> ApiError NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await Api.get("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK");
    expect(err.status).toBe(0);
  });

  it("404 non-JSON (tanpa server FastAPI) -> NO_BACKEND", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));
    const err = await Api.get("/api/x").catch((e) => e);
    expect(err.code).toBe("NO_BACKEND");
  });

  it("HTTP 200 dengan success:false tetap dianggap gagal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: false, message: "Ditolak." })));
    await expect(Api.get("/api/x")).rejects.toThrow("Ditolak.");
  });
});
