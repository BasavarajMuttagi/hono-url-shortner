import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    stampede: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 5,
      maxDuration: '30s',
    },
  },
  thresholds: {
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
  const customKey = 'stampede-' + Math.random().toString(36).substring(2, 8);
  const payload = JSON.stringify({
    original_url: 'https://postgres.org',
    custom_key: customKey,
  });

  const res = http.post(`${BASE_URL}/api/v1/urls`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  // Purge the cache initially so it is uncached
  http.del(`${BASE_URL}/api/v1/cache/${customKey}`, null, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });

  const body = res.json();
  return { shortKey: customKey, urlId: body.id };
}

export default function (data) {
  // Purge on VU #1 iteration #1 or concurrently hammer the uncached key
  const res = http.get(`${BASE_URL}/${data.shortKey}`, {
    redirects: 0,
  });

  check(res, {
    'stampede redirect succeeded (302)': (r) => r.status === 302,
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
