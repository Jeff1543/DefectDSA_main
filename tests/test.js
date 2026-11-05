import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // naik ke 10 user virtual
    { duration: '1m',  target: 10 },  // tahan 1 menit
    { duration: '10s', target: 0 },   // turun
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],     // error di bawah 1%
    http_req_duration: ['p(95)<1000'],  // 95% request di bawah 1 detik
  },
};

export default function () {
  const res = http.get('http://127.0.0.1:8000/static/index.html');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}