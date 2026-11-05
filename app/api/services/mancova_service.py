import re

import numpy as np
import pandas as pd

from statsmodels.formula.api import ols
from statsmodels.multivariate.manova import MANOVA
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.diagnostic import linear_reset
from scipy import stats

from app.api.core.config import MAX_FACTOR_LEVELS


class MancovaService:
    """Service utama untuk validasi dan analisis ANOVA/ANCOVA/MANOVA/MANCOVA dan Regresi Linier."""

    # ============================================================
    # METODE & TIPE VARIABEL
    # ============================================================

    @staticmethod
    def is_factor_like(series: pd.Series) -> bool:
        """
        Kolom boleh dipakai sebagai faktor jika bertipe kategorik, atau
        numerik dengan sedikit nilai unik (mis. kode kelompok 1/2/3).
        """

        if not pd.api.types.is_numeric_dtype(series):
            return True

        return 2 <= series.nunique(dropna=True) <= MAX_FACTOR_LEVELS

    @staticmethod
    def identify_method(
        n_dependent: int, n_covariates: int, n_independent: int = 1
    ) -> dict:
        """
        Tanpa faktor (n_independent == 0) dan dengan prediktor numerik
        (diisi pada kotak Kovariat) -> Regresi Linier. Selainnya mengikuti
        aturan ANOVA / ANCOVA / MANOVA / MANCOVA.
        """

        if n_independent == 0 and n_covariates >= 1:
            return {
                "code": "Regresi Linier",
                "full_name": "Linear Regression (Regresi Linier)",
                "multivariate": False,
                "has_covariates": True,
                "is_regression": True,
                "reason": (
                    f"Tidak ada faktor (kategori) dan terdapat {n_covariates} "
                    "prediktor numerik terhadap 1 variabel dependen."
                ),
            }

        multivariate = n_dependent >= 2
        has_covariates = n_covariates >= 1

        if multivariate:
            code = "MANCOVA" if has_covariates else "MANOVA"
        else:
            code = "ANCOVA" if has_covariates else "ANOVA"

        full_names = {
            "ANOVA": "Analysis of Variance",
            "ANCOVA": "Analysis of Covariance",
            "MANOVA": "Multivariate Analysis of Variance",
            "MANCOVA": "Multivariate Analysis of Covariance",
        }

        reason = (
            f"Terdapat {n_dependent} variabel dependen "
            f"({'multivariat' if multivariate else 'univariat'}) dan "
            + (f"{n_covariates} kovariat." if has_covariates else "tidak ada kovariat.")
        )

        return {
            "code": code,
            "full_name": full_names[code],
            "multivariate": multivariate,
            "has_covariates": has_covariates,
            "is_regression": False,
            "reason": reason,
        }

    # ============================================================
    # VARIABLE STRUCTURE
    # ============================================================

    @staticmethod
    def validate_variable_structure(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
        covariates: list[str],
    ) -> dict:

        errors = []

        # --------------------------------------------------------
        # Minimum jumlah
        # --------------------------------------------------------

        if len(dependent_vars) < 1:
            errors.append(
                "Minimal 1 variabel dependen harus dipilih."
            )

        regression = len(independent_vars) == 0 and len(covariates) >= 1

        if len(independent_vars) < 1 and not regression:
            errors.append(
                "Pilih minimal 1 variabel independen (faktor) untuk ANOVA/ANCOVA/"
                "MANOVA/MANCOVA, atau kosongkan faktor dan isi kovariat/prediktor "
                "numerik untuk Regresi Linier."
            )

        if regression and len(dependent_vars) > 1:
            errors.append(
                "Regresi Linier (tanpa faktor) hanya mendukung 1 variabel dependen. "
                "Pilih 1 variabel dependen, atau tambahkan faktor untuk MANCOVA."
            )

        # --------------------------------------------------------
        # Semua variabel harus dikenal
        # --------------------------------------------------------

        available_columns = set(df.columns)

        selected_variables = (
            dependent_vars
            + independent_vars
            + covariates
        )

        unknown_variables = [
            variable
            for variable in selected_variables
            if variable not in available_columns
        ]

        if unknown_variables:
            errors.append(
                "Variabel tidak ditemukan dalam dataset: "
                + ", ".join(unknown_variables)
            )

        # --------------------------------------------------------
        # Duplicate antar kategori
        # --------------------------------------------------------

        duplicate_variables = [
            variable
            for variable in set(selected_variables)
            if selected_variables.count(variable) > 1
        ]

        if duplicate_variables:
            errors.append(
                "Variabel tidak boleh muncul pada lebih dari "
                "satu kategori: "
                + ", ".join(duplicate_variables)
            )

        # --------------------------------------------------------
        # Type validation
        # --------------------------------------------------------

        if not errors:

            for variable in dependent_vars:

                if not pd.api.types.is_numeric_dtype(
                    df[variable]
                ):
                    errors.append(
                        f"Variabel dependen '{variable}' "
                        "harus bertipe numerik."
                    )

            for variable in independent_vars:

                if not MancovaService.is_factor_like(df[variable]):
                    errors.append(
                        f"Variabel independen '{variable}' harus kategorik, "
                        f"atau numerik dengan 2-{MAX_FACTOR_LEVELS} nilai unik "
                        "(kode kelompok)."
                    )

            for variable in covariates:

                if not pd.api.types.is_numeric_dtype(
                    df[variable]
                ):
                    errors.append(
                        f"Variabel kovariat '{variable}' "
                        "harus bertipe numerik."
                    )

        if regression and not errors:
            n_complete = len(df[dependent_vars + covariates].dropna())
            if n_complete < len(covariates) + 3:
                errors.append(
                    f"Data lengkap ({n_complete} baris) terlalu sedikit untuk regresi "
                    f"dengan {len(covariates)} prediktor (minimal {len(covariates) + 3} baris)."
                )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "dependent_vars": dependent_vars,
            "independent_vars": independent_vars,
            "covariates": covariates,
        }

    # ============================================================
    # ASSUMPTION TESTS
    # ============================================================

    # ============================================================
    # BOX'S M TEST (homogenitas matriks ragam-peragam)
    # ============================================================
    #
    # Implementasi pendekatan chi-square Box's M Test, mengikuti
    # rumus baku (Box, 1949; sebagaimana dituliskan di Tabachnick
    # & Fidell, "Using Multivariate Statistics"):
    #
    #   M = (N-k) * ln|S_pooled| - sum_i[(n_i-1) * ln|S_i|]
    #   C = (sum_i[1/(n_i-1)] - 1/(N-k)) * (2p^2+3p-1)/(6(p+1)(k-1))
    #   chi2 = M * (1-C), df = (k-1)*p*(p+1)/2
    #
    # dengan p = banyaknya variabel respons, k = banyaknya
    # kelompok, N = total observasi, S_i = matriks kovarians
    # kelompok ke-i, S_pooled = matriks kovarians gabungan.
    #
    # KETERBATASAN yang perlu diketahui pengguna hasil:
    # - Box's M sangat sensitif terhadap ukuran sampel besar
    #   (mudah signifikan meski perbedaan kovariansnya kecil
    #   secara praktis).
    # - Pengelompokan dilakukan berdasarkan kombinasi seluruh
    #   independent_vars (bukan per faktor terpisah).
    # - Apabila salah satu kelompok memiliki observasi lebih
    #   sedikit dari jumlah variabel respons (p), matriks
    #   kovarians kelompok tersebut singular (tidak dapat
    #   dibalik/di-log-determinankan), sehingga hasil dikembalikan
    #   sebagai "not_evaluated", bukan dipaksakan menghasilkan
    #   angka yang tidak valid.

    @staticmethod
    def _run_box_m_test(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
    ) -> dict:

        data = df[dependent_vars].apply(pd.to_numeric, errors="coerce")

        if len(independent_vars) == 1:
            group_key = df[independent_vars[0]].astype(str)
        else:
            group_key = df[independent_vars].astype(str).agg(
                "|".join, axis=1
            )

        p = len(dependent_vars)

        group_sizes: list[int] = []
        group_covariances: list[np.ndarray] = []

        for _, group_data in data.groupby(group_key):

            group_data = group_data.dropna()
            n_i = len(group_data)

            # Matriks kovarians p x p membutuhkan minimal p+1
            # observasi agar tidak singular.
            if n_i <= p:
                continue

            group_sizes.append(n_i)
            group_covariances.append(group_data.cov().values)

        k = len(group_sizes)

        if k < 2:
            return {
                "status": "not_evaluated",
                "statistic": None,
                "p_value": None,
                "detail": (
                    "Box's M Test membutuhkan minimal dua kelompok "
                    "dengan jumlah observasi lebih besar dari "
                    "banyaknya variabel respons pada masing-masing "
                    "kelompok. Data yang tersedia tidak memenuhi "
                    "syarat tersebut."
                ),
            }

        n_total = sum(group_sizes)
        dof_within = n_total - k

        pooled_covariance = np.zeros((p, p))
        for n_i, cov_i in zip(group_sizes, group_covariances):
            pooled_covariance += (n_i - 1) * cov_i
        pooled_covariance /= dof_within

        sign_pooled, logdet_pooled = np.linalg.slogdet(
            pooled_covariance
        )

        if sign_pooled <= 0:
            return {
                "status": "not_evaluated",
                "statistic": None,
                "p_value": None,
                "detail": (
                    "Matriks kovarians gabungan bersifat singular "
                    "(determinan tidak positif), sehingga Box's M "
                    "Test tidak dapat dihitung pada data ini."
                ),
            }

        m_statistic = dof_within * logdet_pooled

        for n_i, cov_i in zip(group_sizes, group_covariances):
            sign_i, logdet_i = np.linalg.slogdet(cov_i)
            if sign_i <= 0:
                return {
                    "status": "not_evaluated",
                    "statistic": None,
                    "p_value": None,
                    "detail": (
                        "Salah satu matriks kovarians kelompok "
                        "bersifat singular, sehingga Box's M Test "
                        "tidak dapat dihitung pada data ini."
                    ),
                }
            m_statistic -= (n_i - 1) * logdet_i

        sum_inverse_dof = sum(1 / (n_i - 1) for n_i in group_sizes)

        c_correction = (
            (sum_inverse_dof - 1 / dof_within)
            * (2 * p**2 + 3 * p - 1)
            / (6 * (p + 1) * (k - 1))
        )

        chi2_statistic = m_statistic * (1 - c_correction)
        degrees_of_freedom = (k - 1) * p * (p + 1) / 2

        p_value = float(
            1 - stats.chi2.cdf(chi2_statistic, degrees_of_freedom)
        )

        status = "met" if p_value >= 0.05 else "not_met"

        return {
            "status": status,
            "statistic": float(chi2_statistic),
            "df": degrees_of_freedom,
            "p_value": round(p_value, 6),
            "detail": (
                f"Box's M Test dihitung atas {k} kelompok "
                f"(berdasarkan kombinasi {', '.join(independent_vars)}), "
                f"total {n_total} observasi."
            ),
        }

    # ============================================================
    # HOMOGENEITY OF REGRESSION SLOPES
    # ============================================================
    #
    # Diuji dengan memasukkan suku interaksi antara setiap
    # kovariat dengan setiap variabel independen (faktor) ke
    # dalam model MANOVA, lalu memeriksa signifikansi suku
    # interaksi tersebut lewat Wilks' Lambda. Apabila salah satu
    # suku interaksi signifikan (p < 0.05), maka kemiringan
    # regresi kovariat terhadap respons dianggap TIDAK homogen
    # antar kelompok perlakuan (asumsi dilanggar) - ini merupakan
    # pendekatan baku untuk menguji asumsi ini pada MANCOVA.

    @staticmethod
    def _run_homogeneity_of_slopes_test(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
        covariates: list[str],
    ) -> dict:

        dependent_formula = " + ".join(dependent_vars)
        independent_formula = " + ".join(
            f"C({variable})" for variable in independent_vars
        )
        covariate_formula = " + ".join(covariates)
        interaction_formula = " + ".join(
            f"C({iv}):{cv}"
            for iv in independent_vars
            for cv in covariates
        )

        formula = (
            f"{dependent_formula} ~ "
            f"{independent_formula} + "
            f"{covariate_formula} + "
            f"{interaction_formula}"
        )

        try:
            model = MANOVA.from_formula(formula, data=df)
            mv_result = model.mv_test()
        except Exception as exc:
            return {
                "status": "not_evaluated",
                "statistic": None,
                "p_value": None,
                "detail": (
                    "Model interaksi kovariat x variabel independen "
                    f"gagal diestimasi ({exc.__class__.__name__}), "
                    "kemungkinan karena data tidak cukup untuk "
                    "menaksir suku interaksi tersebut."
                ),
            }

        interaction_effect_names = [
            name for name in mv_result.results.keys() if ":" in name
        ]

        significant_effects = []
        smallest_p_value = None

        for effect_name in interaction_effect_names:

            stat_table = mv_result.results[effect_name]["stat"]

            if "Wilks' lambda" not in stat_table.index:
                continue

            p_value = float(
                stat_table.loc["Wilks' lambda"]["Pr > F"]
            )

            if smallest_p_value is None or p_value < smallest_p_value:
                smallest_p_value = p_value

            if p_value < 0.05:
                significant_effects.append(effect_name)

        if smallest_p_value is None:
            return {
                "status": "not_evaluated",
                "statistic": None,
                "p_value": None,
                "detail": (
                    "Suku interaksi kovariat x variabel independen "
                    "tidak dapat dievaluasi (kemungkinan hanya "
                    "terdapat satu kombinasi kelompok pada data)."
                ),
            }

        status = "not_met" if significant_effects else "met"

        detail = (
            "Kemiringan regresi tidak homogen pada interaksi: "
            + ", ".join(significant_effects)
            if significant_effects
            else (
                "Tidak ditemukan interaksi kovariat x variabel "
                "independen yang signifikan pada taraf 5%."
            )
        )

        return {
            "status": status,
            "statistic": None,
            "p_value": round(smallest_p_value, 6),
            "detail": detail,
        }

    # ============================================================
    # ASSUMPTION TESTS (menyesuaikan dengan metode)
    # ============================================================
    #
    # - >= 2 variabel dependen (MANOVA/MANCOVA): normalitas (Shapiro-Wilk
    #   per variabel, sebagai screening) + Box's M.
    # - 1 variabel dependen (ANOVA/ANCOVA): normalitas residual
    #   (Shapiro-Wilk) + homogenitas ragam (Levene).
    # - Ada kovariat (ANCOVA/MANCOVA): ditambah linearitas dan
    #   homogenitas kemiringan regresi.

    _ASSUMPTION_META = {
        "independensi_pengamatan": {
            "label": "Independensi Pengamatan",
            "meaning": "Setiap pengamatan (misalnya satu ekor sapi) tidak saling memengaruhi.",
            "test_name": "Berdasarkan desain penelitian",
            "info": (
                "Asumsi ini ditentukan oleh cara data dikumpulkan sehingga tidak "
                "dapat diuji otomatis. Pastikan satu baris data mewakili satu "
                "pengamatan yang terpisah."
            ),
        },
        "linearitas_kovariat_dependen": {
            "label": "Linearitas Kovariat dan Dependen",
            "meaning": "Hubungan antara kovariat dan variabel dependen berbentuk garis lurus.",
            "test_name": "Ramsey RESET",
            "met": "Model lurus sudah cukup menggambarkan hubungan kovariat dengan variabel dependen (p = {p}, di atas 0,05).",
            "not_met": (
                "Ada indikasi hubungan melengkung yang tidak tertangkap model lurus "
                "(p = {p}, di bawah 0,05). Lihat grafik sebar untuk memastikan bentuknya."
            ),
        },
        "normalitas_multivariat": {
            "label": "Normalitas (Multivariat)",
            "meaning": "Data variabel dependen berdistribusi mendekati normal.",
            "test_name": "Shapiro-Wilk (per variabel dependen)",
            "met": (
                "Uji Shapiro-Wilk tidak menolak normalitas pada semua variabel "
                "dependen (p terkecil = {p}, di atas 0,05)."
            ),
            "not_met": (
                "Setidaknya satu variabel dependen menyimpang dari distribusi normal "
                "(p terkecil = {p}, di bawah 0,05). Pada sampel yang cukup besar "
                "MANOVA relatif tahan terhadap pelanggaran ini; Pillai's trace adalah "
                "statistik yang paling robust."
            ),
        },
        "normalitas_residual": {
            "label": "Normalitas Residual",
            "meaning": "Sisa perhitungan model (residual) berdistribusi mendekati normal.",
            "test_name": "Shapiro-Wilk (residual model)",
            "met": "Residual model tidak menyimpang dari distribusi normal (p = {p}, di atas 0,05).",
            "not_met": (
                "Residual model menyimpang dari distribusi normal (p = {p}, di bawah 0,05). "
                "Hasil F perlu ditafsirkan hati-hati, terutama bila sampel kecil."
            ),
        },
        "homogenitas_matriks_kovarians": {
            "label": "Homogenitas Matriks Kovarians",
            "meaning": "Pola keragaman antar variabel dependen sama di semua kelompok.",
            "test_name": "Box's M",
            "met": "Matriks kovarians antar kelompok tidak berbeda nyata (p = {p}, di atas 0,05).",
            "not_met": (
                "Matriks kovarians antar kelompok berbeda nyata (p = {p}, di bawah 0,05). "
                "Gunakan Pillai's trace sebagai acuan karena lebih robust."
            ),
        },
        "homogenitas_ragam": {
            "label": "Homogenitas Ragam",
            "meaning": "Keragaman variabel dependen relatif sama di semua kelompok.",
            "test_name": "Levene (berbasis median)",
            "met": "Ragam antar kelompok tidak berbeda nyata (p = {p}, di atas 0,05).",
            "not_met": (
                "Ragam antar kelompok berbeda nyata (p = {p}, di bawah 0,05). Hasil F bisa "
                "kurang akurat, terutama bila ukuran kelompok tidak seimbang."
            ),
        },
        "homogenitas_kemiringan_regresi": {
            "label": "Homogenitas Kemiringan Regresi",
            "meaning": "Pengaruh kovariat terhadap variabel dependen sama di semua kelompok.",
            "test_name": "Uji interaksi faktor x kovariat",
            "met": (
                "Tidak ada interaksi faktor x kovariat yang signifikan (p terkecil = {p}, "
                "di atas 0,05), sehingga model dengan kovariat layak dipakai."
            ),
            "not_met": (
                "Pengaruh kovariat berbeda antar kelompok (p terkecil = {p}, di bawah 0,05). "
                "Pertimbangkan model dengan interaksi atau tanpa kovariat tersebut."
            ),
        },
    }

    _ASSUMPTION_H = {'independensi_pengamatan': (None, None, []), 'linearitas_kovariat_dependen': ('Hubungan kovariat dengan variabel dependen linear (model lurus sudah cukup).', 'Hubungan tidak linear (ada lengkungan yang tidak tertangkap model lurus).', [('transform', 'Transformasi variabel', 'Bila hubungan melengkung, transformasi kovariat atau variabel dependen (mis. log atau akar kuadrat) sering meluruskannya.'), ('info', 'Tambah suku kuadrat kovariat', 'Memasukkan kovariat kuadrat (x²) ke model dapat menangkap hubungan melengkung (di luar fitur sistem saat ini).'), ('info', 'Periksa pencilan', 'Satu-dua titik ekstrem dapat membuat hubungan tampak melengkung. Periksa grafik sebar di atas.')]), 'normalitas_multivariat': ('Data variabel dependen berdistribusi normal.', 'Data variabel dependen tidak berdistribusi normal.', [('transform', 'Transformasi data', 'Log atau akar kuadrat untuk data condong ke kanan (ekor panjang di nilai besar), kuadrat untuk condong ke kiri, atau Box-Cox yang memilih transformasi terbaik otomatis.'), ('info', 'Periksa pencilan', 'Nilai ekstrem sering membuat data tidak normal. Cek apakah salah input; hapus hanya jika memang salah.'), ('info', 'Tambah jumlah sampel', "Dengan sampel yang cukup besar (sekitar 30 data per kelompok atau lebih) hasil MANOVA/MANCOVA cukup tahan terhadap pelanggaran normalitas; Pillai's trace paling robust.")]), 'normalitas_residual': ('Residual model berdistribusi normal.', 'Residual model tidak berdistribusi normal.', [('transform', 'Transformasi data', 'Log atau akar kuadrat untuk data condong ke kanan, kuadrat untuk condong ke kiri, atau Box-Cox. Setelah itu sistem menguji ulang.'), ('info', 'Periksa pencilan', 'Nilai ekstrem sering menyebabkan residual tidak normal. Cek apakah salah input.'), ('info', 'Gunakan uji non-parametrik', 'Bila transformasi tidak membantu, Kruskal-Wallis (untuk 1 faktor) adalah alternatif yang tidak mensyaratkan normalitas (di luar fitur sistem saat ini).')]), 'homogenitas_matriks_kovarians': ('Matriks kovarians variabel dependen sama di semua kelompok.', 'Matriks kovarians berbeda antar kelompok.', [('info', "Gunakan Pillai's trace", "Statistik ini paling tahan terhadap pelanggaran Box's M. Sistem sudah menampilkannya pada tabel hasil; jadikan itu acuan."), ('transform', 'Transformasi data', 'Log atau akar kuadrat sering menyamakan keragaman antar kelompok.'), ('info', 'Seimbangkan ukuran kelompok', "Bila jumlah data tiap kelompok mirip, pelanggaran ini jauh lebih tidak berpengaruh. Catatan: Box's M sangat sensitif, p kecil pada sampel besar sering tidak berdampak praktis.")]), 'homogenitas_ragam': ('Ragam (variasi) variabel dependen sama di semua kelompok.', 'Ragam berbeda di setidaknya satu kelompok.', [('transform', 'Transformasi data', 'Log atau akar kuadrat biasanya menyamakan ragam, terutama bila kelompok dengan rata-rata besar juga memiliki sebaran lebar.'), ('info', 'Seimbangkan ukuran kelompok', 'Dengan jumlah data per kelompok yang mirip, uji F lebih tahan terhadap ragam yang tidak sama.'), ('info', 'Gunakan Welch ANOVA', 'Alternatif yang tidak mensyaratkan ragam sama (di luar fitur sistem saat ini).')]), 'homogenitas_kemiringan_regresi': ('Pengaruh kovariat terhadap dependen sama di semua kelompok (tidak ada interaksi faktor × kovariat).', 'Pengaruh kovariat berbeda antar kelompok (ada interaksi).', [('info', 'Analisis terpisah per kelompok', 'Bila kemiringan berbeda, jalankan analisis untuk tiap kelompok, atau masukkan suku interaksi ke model (di luar fitur sistem saat ini).'), ('transform', 'Transformasi variabel', 'Kadang perbedaan kemiringan hilang setelah variabel ditransformasi.'), ('info', 'Pertimbangkan tanpa kovariat', 'Bila kovariat tidak seragam pengaruhnya, analisis tanpa kovariat (ANOVA/MANOVA) lebih jujur.')])}

    @staticmethod
    def _fmt_p(p) -> str:
        if p is None:
            return "-"
        if p < 0.001:
            return "< 0,001"
        return f"{p:.3f}".replace(".", ",")

    @staticmethod
    def _decorate_assumption(test: dict) -> dict:
        meta = MancovaService._ASSUMPTION_META[test["name"]]
        status = test["status"]
        p = test.get("p_value")

        test["label"] = meta["label"]
        test["meaning"] = meta["meaning"]
        test.setdefault("test_name", meta["test_name"])

        if test["type"] == "statistical":
            test["alpha"] = 0.05

        if status == "info":
            explanation = meta.get("info", test.get("message", ""))
        elif status == "not_evaluated":
            explanation = test.get("detail") or "Asumsi ini tidak dapat dievaluasi pada data ini."
        else:
            template = meta["met"] if status == "met" else meta["not_met"]
            explanation = template.format(p=MancovaService._fmt_p(p))
            if status == "not_met" and test.get("detail") and p is None:
                explanation += " " + test["detail"]

        test["explanation"] = explanation.replace("p = <", "p <")

        h0, h1, remedies = MancovaService._ASSUMPTION_H[test["name"]]
        if h0 and status in ("met", "not_met") and p is not None:
            test["h0"] = h0
            test["h1"] = h1
            met = status == "met"
            test["decision"] = "H0 diterima" if met else "H0 ditolak"
            expr = "< 0,001" if p < 0.001 else f"= {MancovaService._fmt_p(p)}"
            test["decision_text"] = (
                f"Nilai p {expr}, tidak lebih kecil dari α (0,05), maka H0 diterima "
                "(gagal ditolak): asumsi terpenuhi."
                if met
                else f"Nilai p {expr}, lebih kecil dari α (0,05), maka H0 ditolak: "
                "asumsi tidak terpenuhi."
            )
        elif h0:
            test["h0"] = h0
            test["h1"] = h1

        if status == "not_met":
            test["remedies"] = [
                {"action": a, "title": t, "text": x} for a, t, x in remedies
            ]

        return test

    @staticmethod
    def _run_linearity(df, dependent_vars, independent_vars, covariates) -> dict:
        """Ramsey RESET per variabel dependen; p terkecil dipakai."""

        results = []
        for dependent in dependent_vars:
            formula = f"{dependent} ~ " + " + ".join(
                [f"C({v})" for v in independent_vars] + list(covariates)
            )
            try:
                fit = ols(formula, data=df).fit()
                reset = linear_reset(fit, power=2, test_type="fitted", use_f=True)
                results.append((float(reset.pvalue), float(reset.statistic)))
            except Exception:
                continue

        results = [r for r in results if np.isfinite(r[0])]

        if not results:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Uji kelinearan tidak dapat dihitung pada data ini (data terlalu sedikit atau kovariat konstan).",
            }

        p_value, statistic = min(results, key=lambda r: r[0])
        return {
            "status": "met" if p_value >= 0.05 else "not_met",
            "statistic": statistic,
            "p_value": p_value,
        }

    @staticmethod
    def _run_normality_residual(df, dependent, independent_vars, covariates) -> dict:
        formula = f"{dependent} ~ " + " + ".join(
            [f"C({v})" for v in independent_vars] + list(covariates)
        )

        try:
            residuals = ols(formula, data=df).fit().resid.dropna()
        except Exception as exc:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": f"Model gagal diestimasi ({exc.__class__.__name__}).",
            }

        if len(residuals) < 3:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Jumlah data terlalu sedikit untuk uji normalitas.",
            }

        sample = residuals.sample(min(len(residuals), 5000), random_state=42)

        if sample.nunique() < 2:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Residual bernilai konstan sehingga uji normalitas tidak dapat dihitung.",
            }

        statistic, p_value = stats.shapiro(sample)
        return {
            "status": "met" if p_value >= 0.05 else "not_met",
            "statistic": float(statistic),
            "p_value": float(p_value),
        }

    @staticmethod
    def _run_levene_test(df, dependent, independent_vars) -> dict:
        groups = [
            g[dependent].dropna().to_numpy()
            for _, g in df.groupby(independent_vars)
            if g[dependent].dropna().shape[0] >= 2
        ]

        if len(groups) < 2:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Diperlukan minimal 2 kelompok dengan masing-masing >= 2 data.",
            }

        statistic, p_value = stats.levene(*groups, center="median")

        if pd.isna(p_value):
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Uji Levene tidak dapat dihitung (kemungkinan data konstan).",
            }

        return {
            "status": "met" if p_value >= 0.05 else "not_met",
            "statistic": float(statistic),
            "p_value": round(float(p_value), 6),
            "df": len(groups) - 1,
        }

    @staticmethod
    def _run_homogeneity_of_slopes_univariate(
        df, dependent, independent_vars, covariates
    ) -> dict:
        terms = (
            [f"C({v})" for v in independent_vars]
            + list(covariates)
            + [f"C({iv}):{cv}" for iv in independent_vars for cv in covariates]
        )

        try:
            table = anova_lm(ols(f"{dependent} ~ " + " + ".join(terms), data=df).fit(), typ=2)
        except Exception as exc:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": (
                    "Model interaksi kovariat x faktor gagal diestimasi "
                    f"({exc.__class__.__name__}); data mungkin tidak cukup."
                ),
            }

        interaction = table[[":" in str(idx) for idx in table.index]]
        p_values = interaction["PR(>F)"].dropna() if not interaction.empty else []

        if len(p_values) == 0:
            return {
                "status": "not_evaluated", "statistic": None, "p_value": None,
                "detail": "Suku interaksi kovariat x faktor tidak dapat dievaluasi.",
            }

        significant = [str(i) for i, p in p_values.items() if p < 0.05]
        smallest = float(p_values.min())

        return {
            "status": "not_met" if significant else "met",
            "statistic": None,
            "p_value": round(smallest, 6),
            "detail": (
                "Interaksi signifikan pada: " + ", ".join(significant)
                if significant
                else "Tidak ada interaksi faktor x kovariat yang signifikan pada taraf 5%."
            ),
        }

    # ------------------------------------------------------------
    # Data visualisasi untuk setiap uji asumsi
    # ------------------------------------------------------------

    @staticmethod
    def _group_labels(df, independent_vars, max_groups=12):
        """Label kelompok gabungan seluruh faktor, atau None bila terlalu banyak."""

        keys = df[independent_vars].astype(str).agg(" / ".join, axis=1)
        return keys if keys.nunique() <= max_groups else None

    @staticmethod
    def _viz_normality(df, dependent_vars, independent_vars, covariates, multivariate):
        series = []
        for dv in dependent_vars[:4]:
            if multivariate:
                values = df[dv].dropna().astype(float)
                label = dv
            else:
                formula = f"{dv} ~ " + " + ".join(
                    [f"C({v})" for v in independent_vars] + list(covariates)
                )
                try:
                    values = ols(formula, data=df).fit().resid.dropna().astype(float)
                except Exception:
                    continue
                label = f"Residual {dv}"

            if len(values) < 3 or values.nunique() < 2:
                continue

            bins = int(min(15, max(5, np.ceil(np.log2(len(values)) + 1))))
            counts, edges = np.histogram(values, bins=bins)
            mean, std = float(values.mean()), float(values.std(ddof=1))
            ordered = np.sort(values.to_numpy())
            n = len(ordered)
            theo = stats.norm.ppf((np.arange(1, n + 1) - 0.5) / n)
            z = (ordered - mean) / std if std > 0 else ordered * 0
            step = max(1, n // 80)

            series.append({
                "label": label,
                "n": int(n),
                "counts": [int(c) for c in counts],
                "edges": [float(e) for e in edges],
                "mean": mean,
                "std": std,
                "qq": {
                    "theoretical": [float(x) for x in theo[::step]],
                    "sample": [float(x) for x in z[::step]],
                },
            })
        return {"type": "normality", "series": series} if series else None

    @staticmethod
    def _viz_group_box(df, dependent, independent_vars):
        keys = MancovaService._group_labels(df, independent_vars)
        if keys is None:
            return None

        groups = []
        for label in sorted(keys.unique(), key=lambda x: (len(x), x)):
            v = df.loc[keys == label, dependent].dropna().astype(float)
            if len(v) < 2:
                continue
            q1, med, q3 = (float(x) for x in np.percentile(v, [25, 50, 75]))
            iqr = q3 - q1
            inside = v[(v >= q1 - 1.5 * iqr) & (v <= q3 + 1.5 * iqr)]
            groups.append({
                "label": label, "n": int(len(v)), "mean": float(v.mean()),
                "variance": float(v.var(ddof=1)),
                "min": float(v.min()), "q1": q1, "median": med, "q3": q3, "max": float(v.max()),
                "whisker_low": float(inside.min()), "whisker_high": float(inside.max()),
            })
        return {"type": "group_box", "variable": dependent, "groups": groups} if len(groups) >= 2 else None

    @staticmethod
    def _viz_group_sd(df, dependent_vars, independent_vars):
        keys = MancovaService._group_labels(df, independent_vars)
        if keys is None:
            return None

        groups = []
        for label in sorted(keys.unique(), key=lambda x: (len(x), x)):
            sub = df.loc[keys == label, dependent_vars].astype(float)
            if len(sub) < 2:
                continue
            groups.append({
                "label": label, "n": int(len(sub)),
                "sds": [float(x) for x in sub.std(ddof=1).fillna(0)],
            })
        return (
            {"type": "group_sd", "variables": list(dependent_vars), "groups": groups}
            if len(groups) >= 2 else None
        )

    @staticmethod
    def _viz_scatter(df, dependent_vars, independent_vars, covariates, with_group_lines):
        keys = (
            df[independent_vars[0]].astype(str)
            if independent_vars else pd.Series("", index=df.index)
        )
        levels = (
            sorted(keys.unique(), key=lambda x: (len(x), x))
            if independent_vars and keys.nunique() <= 8 else []
        )

        pairs = []
        for cov in covariates:
            for dv in dependent_vars:
                if len(pairs) >= 2:
                    break
                sub = df[[cov, dv]].dropna()
                if len(sub) < 3 or sub[cov].nunique() < 2 or sub[dv].nunique() < 2:
                    continue
                reg = stats.linregress(sub[cov], sub[dv])
                sample = sub.sample(min(len(sub), 150), random_state=1)
                pair = {
                    "x": cov, "y": dv,
                    "points": [
                        [float(a), float(b), levels.index(keys[i]) if levels else 0]
                        for i, a, b in zip(sample.index, sample[cov], sample[dv])
                    ],
                    "groups": levels,
                    "overall": {
                        "slope": float(reg.slope), "intercept": float(reg.intercept),
                        "r": float(reg.rvalue), "p": float(reg.pvalue),
                    },
                    "group_lines": [],
                }
                if with_group_lines and levels:
                    for lv in levels:
                        g = df.loc[keys == lv, [cov, dv]].dropna()
                        if len(g) >= 3 and g[cov].nunique() > 1:
                            slope, intercept = np.polyfit(g[cov], g[dv], 1)
                            pair["group_lines"].append({
                                "group": lv, "slope": float(slope), "intercept": float(intercept),
                            })
                pairs.append(pair)
        return {"type": "scatter", "pairs": pairs} if pairs else None

    @staticmethod
    def test_assumptions(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
        covariates: list[str],
    ) -> dict:

        method = MancovaService.identify_method(
            len(dependent_vars), len(covariates), len(independent_vars)
        )
        multivariate = method["multivariate"]
        has_covariates = method["has_covariates"]
        is_regression = method.get("is_regression", False)

        tests = []

        # Regresi Linier: langsung ke hasil, tanpa tahap uji asumsi.
        if is_regression:
            return {
                "method": method["code"],
                "assumptions_met": True,
                "tests": [],
                "summary": {
                    "total": 0, "evaluated": 0, "met": 0, "not_met": 0,
                    "not_evaluated": 0, "informational": 0,
                },
                "warning_message": None,
                "skipped": True,
            }

        # 1. Independensi (informasional)
        tests.append({
            "name": "independensi_pengamatan",
            "type": "informational",
            "status": "info",
            "message": (
                "Independensi pengamatan merupakan asumsi berbasis desain "
                "penelitian dan tidak dapat dinilai secara otomatis dari dataset."
            ),
        })

        # 2. Linearitas (hanya bila ada kovariat)
        if has_covariates:
            linearity = MancovaService._run_linearity(
                df, dependent_vars, independent_vars, covariates
            )
            tests.append({
                "name": "linearitas_kovariat_dependen",
                "type": "statistical" if linearity["status"] != "not_evaluated" else "informational",
                **linearity,
            })

        # 3 & 4. Normalitas + homogenitas
        if multivariate:
            p_values = []
            for dependent in dependent_vars:
                series = df[dependent].dropna()
                if len(series) < 3 or series.nunique() < 2:
                    continue
                sample = series.sample(min(len(series), 5000), random_state=42)
                _, p_value = stats.shapiro(sample)
                p_values.append(p_value)

            normality_p = min(p_values) if p_values else None
            tests.append({
                "name": "normalitas_multivariat",
                "type": "statistical" if p_values else "informational",
                "status": (
                    "not_evaluated" if normality_p is None
                    else ("not_met" if normality_p < 0.05 else "met")
                ),
                "statistic": None,
                "p_value": float(normality_p) if normality_p is not None else None,
                "detail": "" if p_values else "Data terlalu sedikit atau konstan untuk uji normalitas.",
            })

            box_m = MancovaService._run_box_m_test(
                df=df,
                dependent_vars=dependent_vars,
                independent_vars=independent_vars,
            )
            tests.append({
                "name": "homogenitas_matriks_kovarians",
                "type": "statistical" if box_m["status"] != "not_evaluated" else "informational",
                **box_m,
            })
        else:
            dependent = dependent_vars[0]

            normality = MancovaService._run_normality_residual(
                df, dependent, independent_vars, covariates
            )
            tests.append({
                "name": "normalitas_residual",
                "type": "statistical" if normality["status"] != "not_evaluated" else "informational",
                **normality,
            })

            levene = MancovaService._run_levene_test(df, dependent, independent_vars)
            tests.append({
                "name": "homogenitas_ragam",
                "type": "statistical" if levene["status"] != "not_evaluated" else "informational",
                **levene,
            })

        # 5. Homogenitas kemiringan regresi (hanya bila ada kovariat dan faktor)
        if has_covariates and not is_regression:
            if multivariate:
                slopes = MancovaService._run_homogeneity_of_slopes_test(
                    df=df,
                    dependent_vars=dependent_vars,
                    independent_vars=independent_vars,
                    covariates=covariates,
                )
            else:
                slopes = MancovaService._run_homogeneity_of_slopes_univariate(
                    df, dependent_vars[0], independent_vars, covariates
                )
            tests.append({
                "name": "homogenitas_kemiringan_regresi",
                "type": "statistical" if slopes["status"] != "not_evaluated" else "informational",
                **slopes,
            })

        # Visualisasi setiap uji
        for test in tests:
            name = test["name"]
            try:
                if name in ("normalitas_multivariat", "normalitas_residual"):
                    test["viz"] = MancovaService._viz_normality(
                        df, dependent_vars, independent_vars, covariates, multivariate)
                elif name == "homogenitas_ragam":
                    test["viz"] = MancovaService._viz_group_box(
                        df, dependent_vars[0], independent_vars)
                elif name == "homogenitas_matriks_kovarians":
                    test["viz"] = MancovaService._viz_group_sd(
                        df, dependent_vars, independent_vars)
                elif name == "linearitas_kovariat_dependen":
                    test["viz"] = MancovaService._viz_scatter(
                        df, dependent_vars, independent_vars, covariates, False)
                elif name == "homogenitas_kemiringan_regresi":
                    test["viz"] = MancovaService._viz_scatter(
                        df, dependent_vars, independent_vars, covariates, True)
            except Exception:
                test["viz"] = None   # visualisasi tidak boleh menggagalkan uji

        for test in tests:
            MancovaService._decorate_assumption(test)

        statistical = [t for t in tests if t["type"] == "statistical"]
        assumptions_met = all(t["status"] == "met" for t in statistical)

        summary = {
            "total": len(tests),
            "evaluated": len(statistical),
            "met": sum(1 for t in statistical if t["status"] == "met"),
            "not_met": sum(1 for t in statistical if t["status"] == "not_met"),
            "not_evaluated": sum(1 for t in tests if t["status"] == "not_evaluated"),
            "informational": sum(1 for t in tests if t["status"] == "info"),
        }

        warning_message = None
        if not assumptions_met:
            warning_message = (
                f"Satu atau lebih asumsi {method['code']} tidak terpenuhi. "
                "Hasil analisis tetap ditampilkan, tetapi harus "
                "diinterpretasikan dengan hati-hati."
            )

        return {
            "method": method["code"],
            "assumptions_met": assumptions_met,
            "tests": tests,
            "summary": summary,
            "warning_message": warning_message,
        }

    # ============================================================
    # ANALISIS UTAMA (ANOVA / ANCOVA / MANOVA / MANCOVA)
    # ============================================================

    @staticmethod
    def run_analysis(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
        covariates: list[str],
    ) -> dict:

        # Seluruh variabel independen dimasukkan sebagai suku aditif
        # (tanpa interaksi) dan dibungkus C(...) agar diperlakukan sebagai
        # faktor kategorik. Kovariat (jika ada) masuk sebagai prediktor numerik.

        rhs_terms = [f"C({v})" for v in independent_vars] + list(covariates)
        rhs = " + ".join(rhs_terms)

        tests = []

        if len(dependent_vars) >= 2:
            formula = f"{' + '.join(dependent_vars)} ~ {rhs}"

            try:
                result = MANOVA.from_formula(formula, data=df).mv_test()
            except Exception as exc:
                raise RuntimeError(
                    "Proses analisis multivariat gagal dijalankan. Periksa apakah ada "
                    "variabel konstan, kelompok dengan data terlalu sedikit, atau "
                    "dua variabel yang saling berkolinear (mis. dua kolom yang "
                    "mengkodekan hal yang sama)."
                ) from exc

            for effect_name, effect_result in result.results.items():
                stat_table = effect_result["stat"]

                for statistic_name in [
                    "Wilks' lambda",
                    "Pillai's trace",
                    "Hotelling-Lawley trace",
                    "Roy's greatest root",
                ]:
                    if statistic_name not in stat_table.index:
                        continue

                    row = stat_table.loc[statistic_name]
                    p_value = float(row["Pr > F"])

                    tests.append({
                        "effect": effect_name,
                        "statistic": statistic_name,
                        "value": float(row["Value"]),
                        "f_value": float(row["F Value"]) if "F Value" in row else None,
                        "df": float(row["Num DF"]) if "Num DF" in row else None,
                        "den_df": float(row["Den DF"]) if "Den DF" in row else None,
                        "p_value": p_value,
                        "significant": p_value < 0.05,
                    })
        else:
            formula = f"{dependent_vars[0]} ~ {rhs}"

            try:
                table = anova_lm(ols(formula, data=df).fit(), typ=2)
            except Exception as exc:
                raise RuntimeError(
                    "Proses analisis gagal dijalankan. Periksa apakah ada variabel "
                    "konstan, kelompok dengan data terlalu sedikit, atau dua "
                    "variabel yang saling berkolinear."
                ) from exc

            residual_ss = float(table.loc["Residual", "sum_sq"])
            residual_df = float(table.loc["Residual", "df"])

            for effect_name, row in table.iterrows():
                if effect_name == "Residual":
                    continue

                p_value = float(row["PR(>F)"])
                f_value = float(row["F"])

                tests.append({
                    "effect": str(effect_name),
                    "statistic": "F",
                    "value": f_value,
                    "f_value": f_value,
                    "df": float(row["df"]),
                    "den_df": residual_df,
                    "p_value": p_value,
                    "significant": bool(p_value < 0.05),
                    "partial_eta_sq": float(row["sum_sq"]) / (float(row["sum_sq"]) + residual_ss),
                })

        result = {"tests": tests}

        if not independent_vars and covariates and len(dependent_vars) == 1:
            result["regression"] = MancovaService._regression_summary(
                df, dependent_vars[0], covariates
            )

        return result

    @staticmethod
    def _regression_summary(df, dependent, predictors) -> dict:
        fit = ols(f"{dependent} ~ " + " + ".join(predictors), data=df).fit()
        ci = fit.conf_int()
        names = ["Intercept"] + list(predictors)

        coefficients = []
        for name in names:
            coefficients.append({
                "term": name,
                "estimate": float(fit.params[name]),
                "std_error": float(fit.bse[name]),
                "t_value": float(fit.tvalues[name]),
                "p_value": float(fit.pvalues[name]),
                "ci_low": float(ci.loc[name, 0]),
                "ci_high": float(ci.loc[name, 1]),
                "significant": bool(fit.pvalues[name] < 0.05),
            })

        # Koefisien terstandar (beta) agar kekuatan antar prediktor sebanding
        y_sd = float(df[dependent].std(ddof=1))
        for c in coefficients[1:]:
            x_sd = float(df[c["term"]].std(ddof=1))
            c["beta"] = c["estimate"] * x_sd / y_sd if y_sd > 0 else None

        return {
            "dependent": dependent,
            "n": int(fit.nobs),
            "r_squared": float(fit.rsquared),
            "adj_r_squared": float(fit.rsquared_adj),
            "f_value": float(fit.fvalue) if np.isfinite(fit.fvalue) else None,
            "f_p_value": float(fit.f_pvalue) if np.isfinite(fit.f_pvalue) else None,
            "df_model": float(fit.df_model),
            "df_resid": float(fit.df_resid),
            "rmse": float(np.sqrt(fit.mse_resid)),
            "significant": bool(np.isfinite(fit.f_pvalue) and fit.f_pvalue < 0.05),
            "coefficients": coefficients,
        }

    # Nama lama dipertahankan agar kode yang memanggil run_mancova tidak patah.
    @staticmethod
    def run_mancova(df, dependent_vars, independent_vars, covariates) -> dict:
        return MancovaService.run_analysis(
            df=df,
            dependent_vars=dependent_vars,
            independent_vars=independent_vars,
            covariates=covariates,
        )

    # ------------------------------------------------------------
    # Orkestrasi: uji asumsi + analisis, memakai nama variabel aman
    # ------------------------------------------------------------
    #
    # Nama kolom pengguna bisa mengandung spasi/simbol yang merusak formula
    # patsy. Karena itu model dijalankan dengan alias (V0Q, V1Q, ...), lalu
    # seluruh keluaran dipetakan kembali ke nama kolom asli.

    @staticmethod
    def _unalias(value, reverse: dict):
        if isinstance(value, str):
            return re.sub(
                r"\bV\d+Q\b", lambda m: reverse.get(m.group(0), m.group(0)), value
            )
        if isinstance(value, dict):
            return {k: MancovaService._unalias(v, reverse) for k, v in value.items()}
        if isinstance(value, list):
            return [MancovaService._unalias(v, reverse) for v in value]
        return value

    @staticmethod
    def _label_effect(effect: str, reverse: dict) -> tuple[str, str]:
        if effect == "Intercept":
            return "Intercept", "intercept"

        def strip(part: str) -> str:
            part = re.sub(r"^C\((.*)\)$", r"\1", part.strip())
            return reverse.get(part, part)

        if ":" in effect:
            return " × ".join(strip(p) for p in effect.split(":")), "interaction"

        if effect.startswith("C("):
            return strip(effect), "factor"

        return strip(effect), "covariate"

    @staticmethod
    def analyze_all(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
        covariates: list[str],
    ) -> dict:

        all_vars = list(dependent_vars) + list(independent_vars) + list(covariates)
        aliases = {name: f"V{i}Q" for i, name in enumerate(all_vars)}
        reverse = {alias: name for name, alias in aliases.items()}

        model_df = df[all_vars].dropna().rename(columns=aliases)

        if len(model_df) < 4:
            raise RuntimeError(
                "Jumlah data lengkap terlalu sedikit untuk dianalisis "
                "(minimal 4 baris tanpa data kosong)."
            )

        dv = [aliases[v] for v in dependent_vars]
        iv = [aliases[v] for v in independent_vars]
        cv = [aliases[v] for v in covariates]

        method = MancovaService.identify_method(len(dv), len(cv), len(iv))

        assumptions = MancovaService.test_assumptions(model_df, dv, iv, cv)
        analysis = MancovaService.run_analysis(model_df, dv, iv, cv)

        effects = []
        seen = set()

        for test in analysis["tests"]:
            label, effect_type = MancovaService._label_effect(test["effect"], reverse)
            test["effect_label"] = label
            test["effect_type"] = effect_type

        for test in analysis["tests"]:
            key = test["effect"]
            if key in seen:
                continue
            seen.add(key)

            candidates = [t for t in analysis["tests"] if t["effect"] == key]
            chosen = next(
                (t for t in candidates if t["statistic"] in ("Pillai's trace", "F")),
                candidates[0],
            )
            effects.append({
                "effect": key,
                "effect_label": chosen["effect_label"],
                "effect_type": chosen["effect_type"],
                "statistic": chosen["statistic"],
                "p_value": chosen["p_value"],
                "significant": chosen["significant"],
            })

        return {
            "method": method,
            "assumptions": MancovaService._unalias(assumptions, reverse),
            "analysis": MancovaService._unalias(analysis, reverse),
            "effects": MancovaService._unalias(effects, reverse),
        }

    # ============================================================
    # DASHBOARD
    # ============================================================

    @staticmethod
    def build_dashboard(
        df: pd.DataFrame,
        dependent_vars: list[str],
        independent_vars: list[str],
    ) -> dict:

        # --------------------------------------------------------
        # Defect Risk Map
        # --------------------------------------------------------
        #
        # risk_level sebelumnya selalu di-hardcode "medium" untuk
        # semua lokasi, tanpa memperhitungkan data sama sekali.
        # Sekarang risk_level dihitung relatif terhadap rata-rata
        # seluruh variabel respons pada dataset yang sama: lokasi
        # dengan rata-rata luas defek di atas mean+1*std diberi
        # label "high", di bawah mean-1*std diberi label "low",
        # selebihnya "medium". Ini masih pendekatan sederhana
        # (bukan hasil klasifikasi statistik formal), sehingga
        # sebaiknya divalidasi lebih lanjut oleh tim statistik
        # sebelum dipakai sebagai dasar keputusan.

        defect_risk_map = []

        location_mapping = {
            "pipi": "pipi",
            "pundak": "pundak",
            "badan": "badan",
            "pinggul": "pinggul",
            "perut": "perut",
        }

        means = {
            variable: float(df[variable].mean())
            for variable in dependent_vars
        }

        overall_mean = (
            sum(means.values()) / len(means) if means else 0.0
        )
        overall_std = (
            float(pd.Series(list(means.values())).std())
            if len(means) > 1
            else 0.0
        )

        for variable, mean_area in means.items():

            location = variable.lower()

            for key, value in location_mapping.items():
                if key in location:
                    location = value
                    break

            if overall_std == 0 or pd.isna(overall_std):
                risk_level = "not_evaluated"
            elif mean_area > overall_mean + overall_std:
                risk_level = "high"
            elif mean_area < overall_mean - overall_std:
                risk_level = "low"
            else:
                risk_level = "medium"

            defect_risk_map.append({
                "location": location,
                "mean_area_cm2": round(mean_area, 4),
                "risk_level": risk_level,
            })

        # --------------------------------------------------------
        # Defect by Altitude
        # --------------------------------------------------------
        #
        # Sebelumnya selalu array kosong, tanpa mencoba menghitung
        # apa pun. Sekarang dicari variabel independen yang namanya
        # mengandung kata kunci "ketinggian"/"altitude"; jika
        # ditemukan, dihitung rata-rata seluruh variabel respons
        # per kategori pada variabel tersebut. Jika tidak ditemukan
        # variabel yang cocok, hasil dikembalikan sebagai array
        # kosong beserta penanda eksplisit agar frontend dapat
        # membedakan "belum ada data" dari "sengaja dikosongkan".

        altitude_variable = next(
            (
                variable
                for variable in independent_vars
                if "ketinggian" in variable.lower()
                or "altitude" in variable.lower()
            ),
            None,
        )

        defect_by_altitude = []

        if altitude_variable is not None and dependent_vars:

            combined_mean = df[dependent_vars].mean(axis=1)

            grouped = (
                combined_mean.groupby(df[altitude_variable])
                .mean()
                .round(4)
            )

            defect_by_altitude = [
                {
                    "altitude_category": str(category),
                    "mean_area_cm2": float(value),
                }
                for category, value in grouped.items()
            ]

        return {
            "defect_risk_map": defect_risk_map,
            "defect_by_altitude": defect_by_altitude,
            "defect_by_altitude_evaluated": (
                altitude_variable is not None
            ),
        }