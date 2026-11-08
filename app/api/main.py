import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.admin import router as admin_router
from app.api.analysis import router as analysis_router
from app.api.auth import router as auth_router
from app.api.gallery import router as gallery_router
from app.api.questionnaire import router as questionnaire_router
from app.api.core.config import STATIC_DIR
from app.api.core.db import close_pool, init_db
from app.api.core.security import _secret
from app.api.services.user_service import ensure_admin
from app.api.utils.errors import AppError


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_admin()
    try:
        _secret()  # gagal lebih awal & jelas di log bila APP_SECRET belum diset
    except RuntimeError as exc:
        logging.getLogger("uvicorn.error").error("KONFIGURASI: %s", exc)
    yield
    close_pool()


app = FastAPI(
    title="Sistem Informasi Manajemen Data Defek Kulit Sapi",
    version="2.1.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
def handle_request_validation(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    parts = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err.get("loc", []) if p != "body")
        parts.append(f"{field}: {err.get('msg', 'tidak valid')}" if field else err.get("msg", "tidak valid"))

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error_code": "VALIDATION_ERROR",
            "message": "; ".join(parts) or "Data yang dikirim tidak valid.",
        },
    )


# ============================================================
# EXCEPTION HANDLERS
# ============================================================
#
# Sebelumnya AppError (FileError, ValidationError, VariableError,
# CleaningError, MancovaError, AIInsightError, dst.) tidak
# memiliki handler FastAPI sama sekali, sehingga error tersebut
# akan bocor menjadi HTTP 500 generik tanpa struktur JSON yang
# konsisten dengan API contract (success/error_code/message).

@app.exception_handler(AppError)
def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error_code": exc.error_code,
            "message": exc.message,
        },
    )


@app.exception_handler(Exception)
def handle_unexpected_error(
    request: Request, exc: Exception
) -> JSONResponse:
    # Fallback terakhir agar traceback internal tidak pernah
    # ditampilkan langsung ke pengguna, sesuai Functional
    # Specification (FR-09 Error Handling).
    # Detail error tetap dicatat di log server (Vercel > Logs / Render > Logs)
    # supaya bisa dilacak tanpa membocorkannya ke pengguna.
    logging.getLogger("uvicorn.error").error(
        "Error tak terduga pada %s %s", request.method, request.url.path, exc_info=exc
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error_code": "INTERNAL_ERROR",
            "message": "Terjadi kesalahan internal pada server.",
        },
    )


# ============================================================
# API
# ============================================================

app.include_router(analysis_router)
app.include_router(auth_router)
app.include_router(questionnaire_router)
app.include_router(admin_router)
app.include_router(gallery_router)


# ============================================================
# STATIC FILES
# ============================================================

if STATIC_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=STATIC_DIR),
        name="static",
    )


# ============================================================
# FRONTEND
# ============================================================

@app.get("/", include_in_schema=False)
def root():

    # Halaman memakai path relatif (css/..., js/...), sehingga harus dibuka
    # dari /static/. Alamat root cukup mengarahkan ke sana.
    if (STATIC_DIR / "index.html").exists():
        return RedirectResponse(url="/static/index.html")

    return {
        "message": "Sistem Informasi Manajemen Data Defek Kulit Sapi"
    }
