import pandas as pd

from app.api.services.file_service import (
    get_dataset,
    mark_cleaned,
    set_dataset,
)
from app.api.utils.errors import CleaningError


class PreprocessingService:
    """Service untuk preprocessing dan data cleaning."""

    @staticmethod
    def validate_dataset(df: pd.DataFrame) -> None:
        """
        Memastikan dataset dapat digunakan untuk analisis.
        """

        if df is None:
            raise ValueError("Dataset tidak ditemukan.")

        if df.empty:
            raise ValueError("Dataset kosong.")

        if len(df.columns) == 0:
            raise ValueError("Dataset tidak memiliki kolom.")

    @staticmethod
    def detect_column_types(df: pd.DataFrame) -> dict:
        """
        Mendeteksi kolom menjadi numeric atau categorical.
        """

        PreprocessingService.validate_dataset(df)

        numeric = []
        categorical = []

        for column in df.columns:
            if pd.api.types.is_numeric_dtype(df[column]):
                numeric.append(str(column))
            else:
                categorical.append(str(column))

        return {
            "numeric": numeric,
            "categorical": categorical,
        }

    @staticmethod
    def clean(
        df: pd.DataFrame,
        strategy: str,
        impute_rules: dict | None = None,
    ) -> pd.DataFrame:
        """
        Membersihkan dataset menggunakan strategi:
        - impute
        - drop
        """

        PreprocessingService.validate_dataset(df)

        if strategy not in {"impute", "drop"}:
            raise ValueError(
                "Strategi cleaning harus 'impute' atau 'drop'."
            )

        cleaned_df = df.copy()

        if strategy == "drop":
            cleaned_df = cleaned_df.dropna()

        elif strategy == "impute":
            rules = impute_rules or {}

            numeric_rule = rules.get("numeric", "mean")
            categorical_rule = rules.get("categorical", "mode")

            if numeric_rule not in {"mean", "median"}:
                raise ValueError(
                    "Aturan imputasi numerik harus 'mean' atau 'median'."
                )

            if categorical_rule != "mode":
                raise ValueError(
                    "Aturan imputasi kategorik harus 'mode'."
                )

            numeric_columns = cleaned_df.select_dtypes(
                include="number"
            ).columns

            categorical_columns = cleaned_df.select_dtypes(
                exclude="number"
            ).columns

            # Numeric
            for column in numeric_columns:

                if cleaned_df[column].isna().any():

                    if numeric_rule == "mean":
                        value = cleaned_df[column].mean()
                    else:
                        value = cleaned_df[column].median()

                    cleaned_df[column] = cleaned_df[column].fillna(value)

            # Categorical
            for column in categorical_columns:

                if cleaned_df[column].isna().any():

                    mode = cleaned_df[column].mode()

                    if not mode.empty:
                        cleaned_df[column] = cleaned_df[column].fillna(
                            mode.iloc[0]
                        )

        if cleaned_df.empty:
            raise ValueError(
                "Dataset menjadi kosong setelah proses cleaning."
            )

        return cleaned_df


# ============================================================
# MODULE-LEVEL ENTRY POINT (dipanggil oleh app/api/analysis.py)
# ============================================================
#
# Fungsi ini sebelumnya di-import oleh router (`clean_dataset`)
# tetapi belum pernah didefinisikan, sehingga backend gagal
# startup dengan ImportError. Fungsi ini juga bertanggung jawab
# menyatukan hasil cleaning kembali ke _DATASETS (lewat
# set_dataset) beserta menandai dataset sebagai bersih (lewat
# mark_cleaned), yang sebelumnya tidak pernah terjadi.

def clean_dataset(
    dataset_id: str,
    strategy: str,
    numeric_rule: str | None = None,
) -> dict:

    df = get_dataset(dataset_id)

    impute_rules = None

    if strategy == "impute":
        impute_rules = {
            "numeric": numeric_rule or "mean",
            "categorical": "mode",
        }

    try:
        cleaned_df = PreprocessingService.clean(
            df=df,
            strategy=strategy,
            impute_rules=impute_rules,
        )
    except ValueError as exc:
        raise CleaningError(str(exc)) from exc

    # Menyimpan kembali dataset bersih ke penyimpanan sementara,
    # menggantikan dataset mentah pada dataset_id yang sama.
    set_dataset(dataset_id, cleaned_df)
    mark_cleaned(dataset_id)

    column_types = PreprocessingService.detect_column_types(cleaned_df)

    return {
        "dataset_id": dataset_id,
        "n_rows_after": len(cleaned_df),
        "columns_detected": column_types,
    }