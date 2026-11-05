import math


def clean_json(value):
    """
    Membersihkan struktur data agar aman dijadikan JSON:
    NaN/Infinity (tidak valid di JSON) -> None, tipe numpy -> tipe Python.
    """

    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]

    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            value = value.item()
        except Exception:
            return str(value)

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    return value
