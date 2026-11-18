import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '3s', target: 15 },
    { duration: '10s', target: 30 },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    'http_req_failed': ['rate<0.02'],
    'http_req_duration': ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

function getApiKey() {
  if (__ENV.SEED_API_KEY) return __ENV.SEED_API_KEY;
  if (__ENV.API_KEY) return __ENV.API_KEY;
  try {
    const raw = open('../.env');
    const match = raw.match(/^SEED_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch (_) {}
  return '';
}

const API_KEY = getApiKey();

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/v1/urls`,
    JSON.stringify({
      original_url: 'https://hono.dev',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );

  const body = res.json();
  return { shortKey: body.short_key, urlId: body.id };
}

export default function (data) {
  const rand = Math.random();

  if (rand < 0.85) {
    // 85% Hot-path redirection
    const res = http.get(`${BASE_URL}/${data.shortKey}`, {
      redirects: 0,
      headers: { 'CF-IPCountry': 'US' },
    });
    check(res, { 'redirect is 302': (r) => r.status === 302 });
  } else if (rand < 0.95) {
    // 10% Health and Metrics check
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health is 200': (r) => r.status === 200 });
  } else {
    // 5% ClickHouse Analytics queries
    const res = http.get(`${BASE_URL}/api/v1/urls/${data.urlId}/analytics`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    check(res, {
      'analytics is 200 or 304': (r) => r.status === 200 || r.status === 304,
    });
  }
}

export function teardown(data) {
  if (data && data.urlId) {
    http.del(`${BASE_URL}/api/v1/urls/${data.urlId}`, null, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
  }
}
