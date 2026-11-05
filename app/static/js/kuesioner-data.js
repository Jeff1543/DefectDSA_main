// ==========================================================================
// Kuesioner — data pertanyaan, penyimpanan jawaban, dan perhitungan skor
// Dipakai bersama oleh research-kuesioner.html & research-kuesioner-hasil.html
// ==========================================================================

const KUESIONER_STORAGE_KEY = "mancova_kuesioner_v1";

const KUESIONER_KECAMATAN = ["Batu", "Bumiaji", "Junrejo"];

const KUESIONER_SKALA = { min: "Sangat Tidak Setuju", max: "Sangat Setuju" };

// 8 kategori Likert (3 pertanyaan per kategori = 24 pertanyaan).
// Langkah 1 = Identitas Responden, langkah 2–9 = kategori di bawah ini.
const KUESIONER_KATEGORI = [
  {
    id: "formula_pakan",
    judul: "Formula Pakan",
    singkat: "Formula Pakan",
    deskripsi: "Silakan jawab pertanyaan mengenai formula pakan yang Anda gunakan.",
    pertanyaan: [
      "Saya merasa formula pakan yang saya gunakan membantu meningkatkan berat badan sapi secara optimal.",
      "Pakan yang saya berikan mengandung nutrisi yang sesuai dengan standar untuk sapi potong.",
      "Formula pakan yang saya gunakan cukup terjangkau dan tidak membebani biaya produksi.",
    ],
    saran:
      "Tinjau ulang komposisi pakan terhadap standar kebutuhan sapi potong dan bandingkan biayanya. Konsultasi dengan penyuluh atau ahli nutrisi ternak dapat membantu menemukan formula yang seimbang antara pertumbuhan dan biaya.",
  },
  {
    id: "bibit_unggul",
    judul: "Bibit Unggul",
    singkat: "Bibit Unggul",
    deskripsi:
      "Evaluasi pemilihan bibit sapi potong di peternakan Anda untuk memastikan produktivitas jangka panjang dan ketahanan ternak.",
    pertanyaan: [
      "Saya memilih bibit dengan daya tahan yang baik terhadap penyakit.",
      "Saya merasa penggunaan bibit unggul meningkatkan produktivitas ternak.",
      "Saya merasa bibit unggul memiliki ketahanan baik dalam kondisi lingkungan yang menantang.",
    ],
    saran:
      "Pertimbangkan memilih bibit dari sumber yang terpercaya dengan catatan silsilah dan riwayat kesehatan yang jelas, serta sesuaikan jenis bibit dengan kondisi lingkungan peternakan Anda.",
  },
  {
    id: "kesehatan",
    judul: "Praktik Kesehatan dan Manajemen Penyakit",
    singkat: "Kesehatan",
    deskripsi: "Penilaian terhadap rutinitas kesehatan ternak.",
    pertanyaan: [
      "Saya secara rutin memeriksa kondisi kesehatan sapi potong untuk memastikan kesehatannya.",
      "Saya secara rutin memberikan vaksinasi kepada sapi potong untuk mencegah penyakit.",
      "Saya menjaga kebersihan kandang secara rutin untuk mencegah infeksi dan penyakit pada ternak.",
    ],
    saran:
      "Susun jadwal pemeriksaan kesehatan dan vaksinasi yang tercatat, serta jalin komunikasi dengan dokter hewan atau petugas kesehatan hewan setempat agar penyakit terdeteksi lebih dini.",
  },
  {
    id: "produksi",
    judul: "Produksi Daging & Susu",
    singkat: "Produksi",
    deskripsi: "Evaluasi hasil produksi ternak Anda secara mendalam melalui parameter performa harian.",
    pertanyaan: [
      "Saya berhasil mencapai target berat sapi potong yang optimal sebelum dijual.",
      "Saya puas dengan tingkat produktivitas susu yang dihasilkan ternak saya.",
      "Saya merasa upaya peningkatan kualitas dan kuantitas produksi berjalan sesuai harapan.",
    ],
    saran:
      "Catat berat badan dan hasil produksi secara berkala agar tren performa terlihat jelas, lalu bandingkan dengan target yang ingin dicapai untuk menemukan tahap yang perlu diperbaiki.",
  },
  {
    id: "nutrisi",
    judul: "Pengetahuan tentang Kebutuhan Nutrisi",
    singkat: "Nutrisi",
    deskripsi: "Pemahaman mengenai asupan nutrisi ternak untuk menunjang produktivitas yang optimal.",
    pertanyaan: [
      "Saya memahami kebutuhan nutrisi dasar yang diperlukan sapi potong.",
      "Saya memilih pakan berdasarkan kandungan nutrisinya untuk memenuhi kebutuhan sapi potong.",
      "Saya menyadari pentingnya penyesuaian nutrisi sesuai dengan usia sapi potong.",
    ],
    saran:
      "Ikuti pelatihan atau penyuluhan tentang kebutuhan nutrisi sapi potong, dan biasakan membaca kandungan nutrisi pakan sebelum memilih serta menyesuaikannya dengan usia ternak.",
  },
  {
    id: "wilayah",
    judul: "Wilayah Peternakan",
    singkat: "Wilayah",
    deskripsi:
      "Kondisi lingkungan di area peternakan Anda yang mendukung produktivitas ternak secara optimal.",
    pertanyaan: [
      "Lingkungan wilayah peternakan saya mendukung pertumbuhan sapi potong dengan baik.",
      "Suhu dan kelembapan di wilayah peternakan saya sesuai untuk perkembangan sapi potong.",
      "Ketersediaan air bersih di wilayah peternakan saya cukup untuk kebutuhan ternak sehari-hari.",
    ],
    saran:
      "Perhatikan ventilasi dan drainase kandang untuk mengendalikan suhu serta kelembapan, dan pastikan pasokan air bersih tersedia sepanjang tahun, termasuk saat musim kemarau.",
  },
  {
    id: "pemeliharaan",
    judul: "Aspek Pemeliharaan",
    singkat: "Pemeliharaan",
    deskripsi:
      "Informasi mengenai rutinitas pemeliharaan dan pemantauan ternak untuk memastikan kesehatan dan produktivitas yang berkelanjutan.",
    pertanyaan: [
      "Saya secara rutin membersihkan kandang untuk menjaga kesehatan sapi potong.",
      "Saya merasa teknik pemberian pakan yang saya terapkan membantu meningkatkan produktivitas ternak.",
      "Saya secara aktif memantau perkembangan sapi potong saya.",
    ],
    saran:
      "Buat jadwal pembersihan kandang dan pemberian pakan yang konsisten, serta catat perkembangan ternak secara berkala supaya perubahan kondisi cepat disadari.",
  },
  {
    id: "peluang",
    judul: "Identifikasi Peluang Usaha",
    singkat: "Peluang Usaha",
    deskripsi:
      "Tinjauan terakhir sebelum pengiriman data. Pastikan semua informasi yang Anda berikan telah sesuai dengan kondisi peternakan Anda saat ini.",
    pertanyaan: [
      "Saya aktif memantau perubahan harga daging sapi di pasar saat ini.",
      "Saya memahami cara meningkatkan keuntungan dengan memilih pasar yang tepat.",
      "Saya memanfaatkan teknologi untuk mencari peluang usaha baru dalam bidang peternakan sapi potong.",
    ],
    saran:
      "Pantau harga pasar secara berkala, jajaki beberapa jalur penjualan, dan manfaatkan kelompok ternak atau platform digital untuk memperluas informasi pasar.",
  },
];

// Total langkah = 1 (identitas) + jumlah kategori
const KUESIONER_TOTAL_LANGKAH = 1 + KUESIONER_KATEGORI.length;

function kuesionerStateAwal() {
  const jawaban = {};
  KUESIONER_KATEGORI.forEach((k) => (jawaban[k.id] = k.pertanyaan.map(() => null)));
  return {
    langkah: 1,
    selesai: false,
    tersimpan: false,
    idServer: null,
    editKey: null,
    identitas: { nama: "", umur: "", jk: "", telepon: "", alamat: "", kecamatan: "", pengalaman: "" },
    jawaban,
  };
}

function kuesionerMuat() {
  const awal = kuesionerStateAwal();
  try {
    const raw = sessionStorage.getItem(KUESIONER_STORAGE_KEY);
    if (!raw) return awal;
    const data = JSON.parse(raw);
    const jawaban = {};
    KUESIONER_KATEGORI.forEach((k) => {
      const tersimpan = data.jawaban && Array.isArray(data.jawaban[k.id]) ? data.jawaban[k.id] : [];
      jawaban[k.id] = k.pertanyaan.map((_, i) => {
        const v = Number(tersimpan[i]);
        return v >= 1 && v <= 5 ? v : null;
      });
    });
    return {
      langkah: Math.min(Math.max(parseInt(data.langkah, 10) || 1, 1), KUESIONER_TOTAL_LANGKAH),
      selesai: !!data.selesai,
      tersimpan: !!data.tersimpan,
      idServer: data.idServer || null,
      editKey: data.editKey || null,
      identitas: Object.assign(awal.identitas, data.identitas || {}),
      jawaban,
    };
  } catch (e) {
    return awal;
  }
}

function kuesionerSimpan(state) {
  try {
    sessionStorage.setItem(KUESIONER_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* penyimpanan penuh / diblokir: wizard tetap jalan tanpa persist */
  }
}

function kuesionerReset() {
  try {
    sessionStorage.removeItem(KUESIONER_STORAGE_KEY);
  } catch (e) {}
}

function kuesionerKategoriLengkap(state, kategori) {
  return state.jawaban[kategori.id].every((v) => v !== null);
}

// Interval 5 kelas skala Likert 1–5 (lebar kelas 0,8)
function kuesionerKlasifikasi(rata) {
  if (rata >= 4.2) return { label: "Sangat Baik", level: "sb" };
  if (rata >= 3.4) return { label: "Baik", level: "b" };
  if (rata >= 2.6) return { label: "Cukup", level: "c" };
  if (rata >= 1.8) return { label: "Kurang", level: "k" };
  return { label: "Sangat Kurang", level: "sk" };
}

function kuesionerHitungSkor(state) {
  const kategori = KUESIONER_KATEGORI.map((k) => {
    const nilai = state.jawaban[k.id];
    const rata = nilai.reduce((a, b) => a + (b || 0), 0) / nilai.length;
    return Object.assign({}, k, {
      rata,
      persen: (rata / 5) * 100,
      klas: kuesionerKlasifikasi(rata),
    });
  });
  const rataTotal = kategori.reduce((a, k) => a + k.rata, 0) / kategori.length;
  return {
    kategori,
    rataTotal,
    persenTotal: (rataTotal / 5) * 100,
    klasTotal: kuesionerKlasifikasi(rataTotal),
  };
}


// Mengirim respons ke server (POST /api/questionnaire). Bila respons ini sudah
// pernah terkirim, server memperbarui data yang sama (bukan membuat ganda).
async function kuesionerKirim(state) {
  const id = state.identitas;
  const body = {
    identitas: {
      nama: id.nama,
      umur: Number(id.umur),
      jk: id.jk,
      telepon: id.telepon,
      alamat: id.alamat,
      kecamatan: id.kecamatan,
      pengalaman: id.pengalaman,
    },
    jawaban: state.jawaban,
  };
  if (state.idServer && state.editKey) body.replace = { id: state.idServer, key: state.editKey };

  const res = await Api.post("/api/questionnaire", body);
  state.tersimpan = true;
  state.idServer = res.id;
  state.editKey = res.edit_key;
  kuesionerSimpan(state);
  return res;
}
