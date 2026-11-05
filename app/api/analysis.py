from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user_optional
from app.api.schemas.analysis import (
    AnalyzeRequest,
    CleanRequest,
    DescriptiveRequest,
)
from app.api.services.file_service import (
    get_dataset,
    get_filename,
    is_cleaned,
    upload_dataset,
)
from app.api.services.descriptive_service import DescriptiveService
from app.api.services import transform_service
from app.api.services.history_service import save_analysis, save_descriptive
from app.api.services.insight_service import InsightService
from app.api.services.interpretation_service import InterpretationService
from app.api.services.mancova_service import MancovaService
from app.api.services.preprocessing_service import clean_dataset
from app.api.services.user_service import now_iso
from app.api.utils.errors import MancovaError, VariableError
from app.api.utils.jsonutil import clean_json


router = APIRouter(
    prefix="/api",
    tags=["Analysis"],
)


@router.get("/health")
def health():

    return {
        "success": True,
        "status": "ok",
    }


@router.post("/upload")
async def upload(file: UploadFile = File(...)):

    content = await file.read()

    result = upload_dataset(
        filename=file.filename or "",
        content=content,
    )

    return {
        "success": True,
        **result,
    }


@router.post("/clean")
def clean(request: CleanRequest):

    numeric_rule = None

    if request.impute_rules:
        numeric_rule = request.impute_rules.numeric

    result = clean_dataset(
        dataset_id=request.dataset_id,
        strategy=request.strategy,
        numeric_rule=numeric_rule,
    )

    return {
        "success": True,
        **result,
    }


@router.post("/analyze")
def analyze(
    request: AnalyzeRequest,
    user=Depends(get_current_user_optional),
):

    # Dataset yang dianalisis harus sudah melalui tahap cleaning.
    if not is_cleaned(request.dataset_id):
        raise VariableError(
            "Dataset belum melalui proses pembersihan data "
            "(data cleaning). Jalankan /api/clean terlebih dahulu "
            "sebelum menjalankan analisis."
        )

    df = get_dataset(request.dataset_id)

    # 1. Validasi struktur variabel (fleksibel: metode mengikuti pilihan)
    structure_result = MancovaService.validate_variable_structure(
        df=df,
        dependent_vars=request.dependent_vars,
        independent_vars=request.independent_vars,
        covariates=request.covariates,
    )

    if not structure_result["valid"]:
        raise VariableError(" ".join(structure_result["errors"]))

    # 1b. Uji pilihan pengguna harus cocok dengan struktur variabel
    if request.method:
        detected = MancovaService.identify_method(
            len(request.dependent_vars),
            len(request.covariates),
            len(request.independent_vars),
        )["code"]
        if detected != request.method:
            raise VariableError(
                f"Struktur variabel tidak sesuai dengan uji {request.method}: "
                f"pilihan Anda ({len(request.dependent_vars)} dependen, "
                f"{len(request.independent_vars)} independen, "
                f"{len(request.covariates)} kovariat) menghasilkan {detected}. "
                "Ubah variabel atau pilih uji yang sesuai."
            )

    # 2. Transformasi (opsional) hanya pada salinan data yang diuji
    numeric_roles = set(request.dependent_vars) | set(request.covariates)
    model_df, transform_info = transform_service.apply(
        df, request.transformations, numeric_roles
    )

    # 3. Uji asumsi dan analisis sesuai metode
    try:
        core = MancovaService.analyze_all(
            df=model_df,
            dependent_vars=request.dependent_vars,
            independent_vars=request.independent_vars,
            covariates=request.covariates,
        )
    except RuntimeError as exc:
        raise MancovaError(str(exc)) from exc

    assumption_result = core["assumptions"]

    analysis_result = {
        **core["analysis"],
        "method": core["method"],
        "effects": core["effects"],
        "dependent_vars": request.dependent_vars,
        "independent_vars": request.independent_vars,
        "covariates": request.covariates,
        "transformations": transform_info,
    }

    # 4. Dashboard (satuan asli)
    dashboard_result = MancovaService.build_dashboard(
        df=df,
        dependent_vars=request.dependent_vars,
        independent_vars=request.independent_vars,
    )

    # 5. Fakta + grafik untuk interpretasi (satuan asli) dan interpretasi
    insight = InsightService.build(
        df, request.dependent_vars, request.independent_vars,
        request.covariates, core["effects"], core["analysis"]["tests"],
    )

    ai_insight = InterpretationService.generate(
        mancova_result=analysis_result,
        assumption_result=assumption_result,
        facts=insight["facts"],
    )

    filename = get_filename(request.dataset_id)

    payload = clean_json({
        "success": True,
        "method": core["method"],
        "dataset": {"filename": filename, "n_rows": int(len(df))},
        "variables": {
            "dependent": request.dependent_vars,
            "independent": request.independent_vars,
            "covariates": request.covariates,
        },
        "assumptions": assumption_result,
        "mancova": analysis_result,  # nama lama dipertahankan (kompatibilitas)
        "effects": core["effects"],
        "dashboard": dashboard_result,
        "ai_insight": ai_insight,
        "insight_viz": insight["viz"],
        "transformations": transform_info,
        "transform_hints": transform_service.hints(
            df, request.dependent_vars, request.covariates
        ),
        "created_at": now_iso(),
    })

    # Riwayat disimpan agar dapat dipantau dari dashboard admin.
    # Hanya hasil ringkasan yang disimpan, bukan isi dataset.
    payload["analysis_id"] = save_analysis(
        user_id=user["id"] if user else None,
        filename=filename,
        n_rows=int(len(df)),
        dependent_vars=request.dependent_vars,
        independent_vars=request.independent_vars,
        covariates=request.covariates,
        payload=payload,
    )

    return payload


@router.post("/descriptive")
def descriptive(
    request: DescriptiveRequest,
    user=Depends(get_current_user_optional),
):

    df = get_dataset(request.dataset_id)

    result = DescriptiveService.describe(
        df=df,
        variables=request.variables,
        group_by=request.group_by,
    )

    filename = get_filename(request.dataset_id)

    payload = clean_json({
        "success": True,
        "method": {
            "code": "STATDES",
            "full_name": "Statistika Deskriptif",
        },
        "dataset": {"filename": filename, "n_rows": int(len(df))},
        **result,
        "created_at": now_iso(),
    })

    payload["analysis_id"] = save_descriptive(
        user_id=user["id"] if user else None,
        filename=filename,
        n_rows=int(len(df)),
        variables=request.variables,
        group_by=request.group_by,
        payload=payload,
    )

    return payload
