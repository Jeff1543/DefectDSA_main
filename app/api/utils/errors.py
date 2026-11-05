from fastapi import HTTPException


class AppError(Exception):
    """Base application error."""

    def __init__(
        self,
        error_code: str,
        message: str,
        status_code: int = 400,
    ):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code

        super().__init__(message)


class FileError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="FILE_ERROR",
            message=message,
            status_code=400,
        )


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="VALIDATION_ERROR",
            message=message,
            status_code=422,
        )


class VariableError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="VARIABLE_ERROR",
            message=message,
            status_code=400,
        )


class CleaningError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="CLEANING_ERROR",
            message=message,
            status_code=400,
        )


class AssumptionTestError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="ASSUMPTION_TEST_ERROR",
            message=message,
            status_code=500,
        )


class MancovaError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="ANALYSIS_ERROR",
            message=message,
            status_code=422,
        )


class AIInsightError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="AI_INSIGHT_ERROR",
            message=message,
            status_code=503,
        )


class AuthError(AppError):
    def __init__(self, message: str = "Autentikasi diperlukan."):
        super().__init__(
            error_code="AUTH_ERROR",
            message=message,
            status_code=401,
        )


class ForbiddenError(AppError):
    def __init__(self, message: str = "Anda tidak memiliki akses."):
        super().__init__(
            error_code="FORBIDDEN",
            message=message,
            status_code=403,
        )


class NotFoundError(AppError):
    def __init__(self, message: str = "Data tidak ditemukan."):
        super().__init__(
            error_code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class ConflictError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="CONFLICT",
            message=message,
            status_code=409,
        )


class RateLimitError(AppError):
    def __init__(self, message: str):
        super().__init__(
            error_code="RATE_LIMITED",
            message=message,
            status_code=429,
        )
