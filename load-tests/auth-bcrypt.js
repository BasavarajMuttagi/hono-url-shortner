import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '3s', target: 10 },
    { duration: '6s', target: 20 },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    // 20 concurrent VUs hammering bcrypt 10 salt rounds queue in Node's libuv threadpool
    'http_req_duration': ['p(95)<700'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const uniqueId = `${__VU}-${__ITER}-${Date.now()}`;
  const email = `loaduser_${uniqueId}@example.com`;
  const password = 'BenchmarkPassword123!';

  // 1. Register with bcrypt & UUIDv7
  const regRes = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(regRes, {
    'register is 201': (r) => r.status === 201,
    'user has uuidv7': (r) => {
      const b = r.json();
      return b.user && b.user.id && b.user.id.startsWith('01');
    },
    'has auth cookie': (r) => r.headers['Set-Cookie'] !== undefined,
  });

  // 2. Login with bcrypt verification
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, {
    'login is 200': (r) => r.status === 200,
    'has token': (r) => r.json().token !== undefined,
  });

  // 3. Immediately clean up test benchmark user
  const loginBody = loginRes.json();
  if (loginBody && loginBody.token) {
    http.del(`${BASE_URL}/api/v1/auth/me`, null, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
  }
}
