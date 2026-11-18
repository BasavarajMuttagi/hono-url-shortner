import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '3s', target: 20 },  // Quick ramp up
    { duration: '10s', target: 50 }, // Sustained benchmark load
    { duration: '2s', target: 0 },   // Ramp down
  ],
  thresholds: {
    // Accommodates transatlantic/cloud TLS roundtrip to Aiven instance (~40ms WAN base latency)
    'http_req_duration': ['p(95)<75'],
    'http_req_failed': ['rate<0.01'],
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
  const customKey = 'k6-' + Math.random().toString(36).substring(2, 8);
  const payload = JSON.stringify({
    original_url: 'https://news.ycombinator.com',
    custom_key: customKey,
  });

  const res = http.post(`${BASE_URL}/api/v1/urls`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  const body = res.json();
  const shortKey = body.short_key || customKey;

  // Pre-warm the cache with 1 initial request
  http.get(`${BASE_URL}/${shortKey}`, { redirects: 0 });

  return { shortKey, urlId: body.id };
}

export default function (data) {
  // Test the hot-path redirect: redirects: 0 measures Hono + Valkey redirect response directly
  const params = {
    redirects: 0,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) k6-benchmark',
      'CF-IPCountry': 'US',
    },
  };

  const res = http.get(`${BASE_URL}/${data.shortKey}`, params);

  check(res, {
    'status is 302': (r) => r.status === 302,
    'has location header': (r) => r.headers['Location'] !== undefined,
  });
}

export function teardown(data) {
  if (data && data.urlId) {
    http.del(`${BASE_URL}/api/v1/urls/${data.urlId}`, null, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    });
  }
}
