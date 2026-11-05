// k6 - uji beban alur lengkap: upload -> clean -> analyze (MANCOVA) -> descriptive
// Jalankan dari folder tests:   k6 run test_beban_alur.js
//
// Semua pengaturan bisa diganti lewat -e tanpa mengubah file ini, contoh:
//   k6 run -e MAX_VUS=30 test_beban_alur.js
//   k6 run -e DATA_FILE=./data_asli.xlsx -e DEP_VARS=Y1,Y2,Y3 -e FACTOR_VARS=Kelompok -e COVARIATES=Umur,Suhu test_beban_alur.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8000';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '10');
const list = (v, def) => (v || def).split(',').map((s) => s.trim()).filter(Boolean);

// ---- Data & variabel uji (default: data sintetis 91 baris x 17 kolom) ----
const DATA_FILE = __ENV.DATA_FILE || './data_uji_91x17.xlsx';   // relatif terhadap file skrip ini
const DEP_VARS = list(__ENV.DEP_VARS, 'Y1_Pipi,Y2_Perut,Y3_Badan');
const FACTOR_VARS = list(__ENV.FACTOR_VARS, 'Ketinggian');
const COVARIATES = list(__ENV.COVARIATES, 'Suhu,Kelembapan,Umur_Bulan');
const DESC_VARS = list(__ENV.DESC_VARS, 'Suhu,Kelembapan,Y1_Pipi,Y2_Perut');
const GROUP_BY = __ENV.GROUP_BY || FACTOR_VARS[0];

// ---- Target kecepatan: p95 dalam milidetik (boleh diubah lewat -e T_UPLOAD=... dst) ----
const T = {
  upload: parseInt(__ENV.T_UPLOAD || '5000'),
  clean: parseInt(__ENV.T_CLEAN || '4000'),
  analyze: parseInt(__ENV.T_ANALYZE || '10000'),
  descriptive: parseInt(__ENV.T_DESCRIPTIVE || '6000'),
};

// Dibaca sekali di tahap init
const DATA = open(DATA_FILE, 'b');
const FILE_NAME = DATA_FILE.split('/').pop();

const tUpload = new Trend('durasi_upload', true);
const tClean = new Trend('durasi_clean', true);
const tAnalyze = new Trend('durasi_analyze', true);
const tDesc = new Trend('durasi_descriptive', true);
const alurGagal = new Rate('alur_gagal');

export const options = {
  stages: [
    { duration: '20s', target: Math.ceil(MAX_VUS / 2) }, // naik
    { duration: '40s', target: MAX_VUS },                // tahan
    { duration: '10s', target: 0 },                      // turun
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],                 // error di bawah 1%
    alur_gagal: ['rate<0.01'],                      // alur lengkap gagal di bawah 1%
    durasi_upload: [`p(95)<${T.upload}`],
    durasi_clean: [`p(95)<${T.clean}`],
    durasi_analyze: [`p(95)<${T.analyze}`],         // komputasi paling berat
    durasi_descriptive: [`p(95)<${T.descriptive}`],
  },
};

const JSON_HDR = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  let ok = true;
  let datasetId = null;

  group('1. upload', () => {
    const res = http.post(
      `${BASE_URL}/api/upload`,
      { file: http.file(DATA, FILE_NAME) },
      { tags: { name: 'upload' } }
    );
    tUpload.add(res.timings.duration);
    const body = res.status === 200 ? res.json() : {};
    datasetId = body.dataset_id;
    ok = check(res, {
      'upload 200': (r) => r.status === 200,
      'dapat dataset_id': () => !!datasetId,
    }) && ok;
  });
  if (!datasetId) { alurGagal.add(true); return; }

  group('2. clean', () => {
    const res = http.post(
      `${BASE_URL}/api/clean`,
      JSON.stringify({
        dataset_id: datasetId,
        strategy: 'impute',
        impute_rules: { numeric: 'median', categorical: 'mode' },
      }),
      { ...JSON_HDR, tags: { name: 'clean' } }
    );
    tClean.add(res.timings.duration);
    ok = check(res, { 'clean 200': (r) => r.status === 200 }) && ok;
  });

  group('3. analyze (MANCOVA)', () => {
    const res = http.post(
      `${BASE_URL}/api/analyze`,
      JSON.stringify({
        dataset_id: datasetId,
        dependent_vars: DEP_VARS,
        independent_vars: FACTOR_VARS,
        covariates: COVARIATES,
      }),
      { ...JSON_HDR, tags: { name: 'analyze' } }
    );
    tAnalyze.add(res.timings.duration);
    ok = check(res, {
      'analyze 200': (r) => r.status === 200,
      'analyze success': (r) => r.status === 200 && r.json().success === true,
    }) && ok;
  });

  group('4. descriptive', () => {
    const res = http.post(
      `${BASE_URL}/api/descriptive`,
      JSON.stringify({
        dataset_id: datasetId,
        variables: DESC_VARS,
        group_by: GROUP_BY,
      }),
      { ...JSON_HDR, tags: { name: 'descriptive' } }
    );
    tDesc.add(res.timings.duration);
    ok = check(res, { 'descriptive 200': (r) => r.status === 200 }) && ok;
  });

  alurGagal.add(!ok);
  sleep(1);
}