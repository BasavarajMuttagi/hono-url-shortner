import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '3s', target: 50 },   // Warm up to 50 VUs
    { duration: '18s', target: 120 }, // Push hard to 120 concurrent VUs
    { duration: '4s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_failed': ['rate<0.05'], // Allow minor saturation threshold
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
  const customKey = 'stress-' + Math.random().toString(36).substring(2, 8);
  const res = http.post(
    `${BASE_URL}/api/v1/urls`,
    JSON.stringify({
      original_url: 'https://github.com/axiomhq',
      custom_key: customKey,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );

  const body = res.json();
  const shortKey = body.short_key || customKey;

  // Pre-warm cache
  http.get(`${BASE_URL}/${shortKey}`, { redirects: 0 });

  return { shortKey, urlId: body.id };
}

export default function (data) {
  const rand = Math.random();

  if (rand < 0.90) {
    // 90% Hot-path redirect
    const res = http.get(`${BASE_URL}/${data.shortKey}`, {
      redirects: 0,
      headers: {
        'User-Agent': 'k6-stress-test',
        'CF-IPCountry': 'US',
      },
    });
    check(res, { 'redirect is 302': (r) => r.status === 302 });
  } else {
    // 10% Diagnostics / Metrics
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'status is 200': (r) => r.status === 200 });
  }
}

export function teardown(data) {
  if (data && data.urlId) {
    http.del(`${BASE_URL}/api/v1/urls/${data.urlId}`, null, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
  }
}
