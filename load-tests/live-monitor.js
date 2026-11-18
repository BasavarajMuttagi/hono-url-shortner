import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 50 },  // 1. Ramp up to 50 VUs (watch the curve climb)
    { duration: '35s', target: 50 }, // 2. Hold sustained 50 VUs for 35s (flat high plateau)
    { duration: '5s', target: 0 },   // 3. Ramp down to 0 (watch the cooldown drop)
  ],
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
      original_url: 'https://github.com/axiomhq',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );

  const body = res.json();
  const shortKey = body.short_key;

  // Pre-warm Valkey memory cache
  http.get(`${BASE_URL}/${shortKey}`, { redirects: 0 });

  return { shortKey, urlId: body.id };
}

export default function (data) {
  // Hit hot-path redirect and health endpoints in high-frequency loop
  const res = http.get(`${BASE_URL}/${data.shortKey}`, {
    redirects: 0,
    headers: { 'User-Agent': 'k6-live-monitor' },
  });

  check(res, { 'redirect is 302': (r) => r.status === 302 });

  // Minor 10ms micro-pause so VUs push high throughput without locking out sockets
  sleep(0.01);
}

export function teardown(data) {
  if (data && data.urlId) {
    http.del(`${BASE_URL}/api/v1/urls/${data.urlId}`, null, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
  }
}
