import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Prometheus/k6 Metrics
const redirectDuration = new Trend('redirect_duration_ms');
const createDuration = new Trend('create_duration_ms');
const listDuration = new Trend('list_duration_ms');
const analyticsDuration = new Trend('analytics_duration_ms');
const deleteDuration = new Trend('delete_duration_ms');
const errorRate = new Rate('custom_error_rate');

export const options = {
  stages: [
    { duration: '15s', target: 20 },  // Stage 1: Warmup & baseline
    { duration: '35s', target: 50 },  // Stage 2: Normal production load
    { duration: '40s', target: 80 },  // Stage 3: Heavy stress load (4 vCPUs fully engaged)
    { duration: '15s', target: 100 }, // Stage 4: Peak spike test
    { duration: '15s', target: 0 },   // Stage 5: Cooldown & recovery
  ],
  thresholds: {
    'custom_error_rate': ['rate<0.02'],       // Error rate under 2%
    'redirect_duration_ms': ['p(95)<160'],    // 95% of redirects under 160ms over WAN
    'create_duration_ms': ['p(95)<400'],      // DB insert + cache write under 400ms
    'http_req_failed': ['rate<0.02'],
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
  } catch (_) { }
  return 'test_api_key_fixture_32_characters';
}

const API_KEY = getApiKey();

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
};

export function setup() {
  // Pre-seed a batch of 5 starter links so all VUs immediately have links to redirect & query
  const seedKeys = [];
  const seedIds = [];

  for (let i = 0; i < 5; i++) {
    const res = http.post(
      `${BASE_URL}/api/v1/urls`,
      JSON.stringify({
        original_url: `https://example.com/topic-${i}-${Date.now()}`,
        title: `Seed Link ${i}`,
      }),
      { headers }
    );

    if (res.status === 201) {
      const body = res.json();
      seedKeys.push(body.short_key);
      seedIds.push(body.id);
      // Pre-warm Valkey cache
      http.get(`${BASE_URL}/${body.short_key}`, { redirects: 0 });
    }
  }

  return { seedKeys, seedIds };
}

// Track links created per VU for subsequent reads and deletes
let vuCreatedKeys = [];
let vuCreatedIds = [];

export default function (data) {
  const rand = Math.random();

  // Pick an active shortKey from shared seeds or VU-created pool
  const allKeys = data.seedKeys.concat(vuCreatedKeys);
  const activeKey = allKeys[Math.floor(Math.random() * allKeys.length)] || data.seedKeys[0];
  const allIds = data.seedIds.concat(vuCreatedIds);
  const activeId = allIds[Math.floor(Math.random() * allIds.length)] || data.seedIds[0];

  // ============================================================
  // 1. 70% HOT-PATH REDIRECT (Valkey O(1) cache + ClickHouse log)
  // ============================================================
  if (rand < 0.70) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/${activeKey}`, {
      redirects: 0,
      headers: {
        'User-Agent': 'Mozilla/5.0 (k6-load-test)',
        'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 254) + 1}`,
      },
    });

    redirectDuration.add(Date.now() - start);

    const ok = check(res, {
      'redirect status is 302': (r) => r.status === 302,
      'redirect has location header': (r) => r.headers['Location'] !== undefined,
    });

    if (!ok) errorRate.add(1);
  }

  // ============================================================
  // 2. 12% READ: List User URLs with Pagination (PostgreSQL Read)
  // ============================================================
  else if (rand < 0.82) {
    const start = Date.now();
    const page = Math.floor(Math.random() * 3) + 1;
    const res = http.get(`${BASE_URL}/api/v1/urls?page=${page}&limit=10`, { headers });

    listDuration.add(Date.now() - start);

    const ok = check(res, {
      'list status is 200': (r) => r.status === 200,
      'list has data array': (r) => Array.isArray(r.json('data')),
    });

    if (!ok) errorRate.add(1);
  }

  // ============================================================
  // 3. 8% READ: URL Analytics (ClickHouse OLAP Aggregation)
  // ============================================================
  else if (rand < 0.90) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/urls/${activeId}/analytics`, { headers });

    analyticsDuration.add(Date.now() - start);

    const ok = check(res, {
      'analytics status is 200 or 304': (r) => r.status === 200 || r.status === 304,
    });

    if (!ok) errorRate.add(1);
  }

  // ============================================================
  // 4. 6% CREATE: Shorten New URL (Postgres Insert + Valkey Cache)
  // ============================================================
  else if (rand < 0.96) {
    const start = Date.now();
    const unique = `${__VU}-${__ITER}-${Date.now()}`;
    const payload = JSON.stringify({
      original_url: `https://news.ycombinator.com/item?id=${unique}`,
      title: `LoadTest URL ${unique}`,
    });

    const res = http.post(`${BASE_URL}/api/v1/urls`, payload, { headers });

    createDuration.add(Date.now() - start);

    const ok = check(res, {
      'create status is 201': (r) => r.status === 201,
      'create returns short_key': (r) => r.json('short_key') !== undefined,
    });

    if (ok) {
      const body = res.json();
      vuCreatedKeys.push(body.short_key);
      vuCreatedIds.push(body.id);
      // Keep in-memory VU pool manageable
      if (vuCreatedKeys.length > 20) {
        vuCreatedKeys.shift();
        vuCreatedIds.shift();
      }
    } else {
      // 429 means link creation rate limit reached, which is expected protection
      if (res.status !== 429) errorRate.add(1);
    }
  }

  // ============================================================
  // 5. 4% DELETE: Invalidate & Delete Link (Postgres + Valkey Purge)
  // ============================================================
  else {
    if (vuCreatedIds.length > 0) {
      const targetId = vuCreatedIds.pop();
      vuCreatedKeys.pop();

      const start = Date.now();
      const res = http.del(`${BASE_URL}/api/v1/urls/${targetId}`, null, { headers });

      deleteDuration.add(Date.now() - start);

      const ok = check(res, {
        'delete status is 200 or 404': (r) => r.status === 200 || r.status === 404,
      });

      if (!ok) errorRate.add(1);
    } else {
      // If no custom URL to delete, do a lightweight health check
      const res = http.get(`${BASE_URL}/health/live`);
      check(res, { 'health live is 200': (r) => r.status === 200 });
    }
  }

  // Realistic user pacing between operations (50ms - 150ms)
  sleep(0.05 + Math.random() * 0.1);
}

export function teardown(data) {
  // Clean up initial seed links
  if (data && data.seedIds) {
    for (let i = 0; i < data.seedIds.length; i++) {
      http.del(`${BASE_URL}/api/v1/urls/${data.seedIds[i]}`, null, { headers });
    }
  }
}
