import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Detailed Per-Operation Latency Trends (tracks p50, p90, p95, p99)
const redirectLatency = new Trend('redirect_duration_ms', true);
const listLatency = new Trend('list_duration_ms', true);
const analyticsLatency = new Trend('analytics_duration_ms', true);
const createLatency = new Trend('create_duration_ms', true);
const deleteLatency = new Trend('delete_duration_ms', true);
const errorCount = new Counter('custom_errors');
const rateLimitCount = new Counter('rate_limited_429');

// Configurable Test Parameters via Env Vars
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '300', 10);
const TEST_PROFILE = __ENV.TEST_PROFILE || 'staged'; // 'staged', 'stress', 'soak'

function getStages() {
  if (TEST_PROFILE === 'stress') {
    // Aggressive stress test to find breaking point
    return [
      { duration: '20s', target: Math.floor(TARGET_VUS * 0.5) },
      { duration: '40s', target: TARGET_VUS },
      { duration: '60s', target: Math.floor(TARGET_VUS * 1.5) },
      { duration: '20s', target: 0 },
    ];
  }

  // Progressive 5-Stage SRE Capacity Benchmark (2 minutes total)
  return [
    { duration: '15s', target: Math.floor(TARGET_VUS * 0.2) }, // Stage 1: Warmup & baseline (20%)
    { duration: '35s', target: Math.floor(TARGET_VUS * 0.5) }, // Stage 2: Normal production load (50%)
    { duration: '40s', target: TARGET_VUS },                  // Stage 3: Target capacity (100%)
    { duration: '20s', target: Math.floor(TARGET_VUS * 1.25) },// Stage 4: Peak burst spike (125%)
    { duration: '15s', target: 0 },                           // Stage 5: Cooldown & recovery
  ];
}

export const options = {
  stages: getStages(),
  thresholds: {
    'http_req_failed': ['rate<0.05'], // Allow rate limit threshold
    'redirect_duration_ms': ['p(95)<50', 'p(99)<100'], // In-cloud datacenter SLA
    'list_duration_ms': ['p(95)<150'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://136.81.105.139';
const API_KEY = __ENV.SEED_API_KEY || 'test_api_key_fixture_32_characters';

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
};

export function setup() {
  // Query existing URLs from database to get a rich pool of real IDs
  const res = http.get(`${BASE_URL}/api/v1/urls?limit=50`, { headers });
  let persistentKeys = [];
  let persistentIds = [];

  if (res.status === 200) {
    const items = res.json('data') || [];
    persistentKeys = items.map((i) => i.short_key);
    persistentIds = items.map((i) => i.id);
  }

  // If none existed, create a few
  if (persistentKeys.length === 0) {
    for (let i = 0; i < 5; i++) {
      const createRes = http.post(
        `${BASE_URL}/api/v1/urls`,
        JSON.stringify({
          original_url: `https://news.ycombinator.com/item?id=${Date.now()}-${i}`,
          title: `Setup Seed ${i}`,
        }),
        { headers }
      );
      if (createRes.status === 201) {
        const body = createRes.json();
        persistentKeys.push(body.short_key);
        persistentIds.push(body.id);
      }
    }
  }

  // Pre-warm cache for the first 10 keys
  for (let i = 0; i < Math.min(persistentKeys.length, 10); i++) {
    http.get(`${BASE_URL}/${persistentKeys[i]}`, { redirects: 0 });
  }

  return { persistentKeys, persistentIds };
}

let transientKeys = [];
let transientIds = [];

export default function (data) {
  const rand = Math.random();

  const allKeys = data.persistentKeys.concat(transientKeys);
  const activeKey = allKeys[Math.floor(Math.random() * allKeys.length)] || '7rkExCc';
  const allIds = data.persistentIds.concat(transientIds);
  const activeId = allIds[Math.floor(Math.random() * allIds.length)] || data.persistentIds[0];

  // ============================================================
  // 1. 80% HOT-PATH REDIRECT (Valkey O(1) Cache + ClickHouse log)
  // ============================================================
  if (rand < 0.80) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/${activeKey}`, {
      redirects: 0,
      headers: {
        'User-Agent': 'Mozilla/5.0 (k6-enterprise-benchmark)',
        'X-Forwarded-For': `10.200.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
      },
    });

    redirectLatency.add(Date.now() - start);

    const ok = check(res, {
      'redirect is 302': (r) => r.status === 302,
      'has location header': (r) => r.headers['Location'] !== undefined,
    });

    if (!ok) errorCount.add(1);
  }

  // ============================================================
  // 2. 10% PAGINATED URL LISTS (PostgreSQL Relational Reads)
  // ============================================================
  else if (rand < 0.90) {
    const start = Date.now();
    const page = Math.floor(Math.random() * 3) + 1;
    const res = http.get(`${BASE_URL}/api/v1/urls?page=${page}&limit=10`, { headers });

    listLatency.add(Date.now() - start);

    const ok = check(res, {
      'list status 200': (r) => r.status === 200,
      'has data array': (r) => Array.isArray(r.json('data')),
    });

    if (!ok) errorCount.add(1);
  }

  // ============================================================
  // 3. 5% REAL-TIME ANALYTICS (ClickHouse Columnar Aggregations)
  // ============================================================
  else if (rand < 0.95) {
    if (data.persistentIds.length > 0) {
      const targetId = data.persistentIds[Math.floor(Math.random() * data.persistentIds.length)];
      const start = Date.now();
      const res = http.get(`${BASE_URL}/api/v1/urls/${targetId}/analytics`, { headers });

      analyticsLatency.add(Date.now() - start);

      const ok = check(res, {
        'analytics status 200 or 304': (r) => r.status === 200 || r.status === 304,
      });

      if (!ok) errorCount.add(1);
    }
  }

  // ============================================================
  // 4. 3% CREATE SHORT URL (PostgreSQL Insert + Valkey Cache Hydration)
  // ============================================================
  else if (rand < 0.98) {
    const start = Date.now();
    const unique = `${__VU}-${__ITER}-${Date.now()}`;
    const payload = JSON.stringify({
      original_url: `https://github.com/honojs/hono/issues/${unique}`,
      title: `Bench URL ${unique}`,
    });

    const res = http.post(`${BASE_URL}/api/v1/urls`, payload, { headers });

    createLatency.add(Date.now() - start);

    if (res.status === 201) {
      const body = res.json();
      transientKeys.push(body.short_key);
      transientIds.push(body.id);
      if (transientKeys.length > 25) {
        transientKeys.shift();
        transientIds.shift();
      }
    } else if (res.status === 429) {
      rateLimitCount.add(1);
    } else {
      errorCount.add(1);
    }
  }

  // ============================================================
  // 5. 2% DELETE SHORT URL (PostgreSQL Delete + Cache Invalidation)
  // ============================================================
  else {
    if (transientIds.length > 0) {
      const targetId = transientIds.pop();
      transientKeys.pop();
      const start = Date.now();
      const res = http.del(`${BASE_URL}/api/v1/urls/${targetId}`, null, { headers });
      deleteLatency.add(Date.now() - start);

      const ok = check(res, {
        'delete status 200 or 404': (r) => r.status === 200 || r.status === 404,
      });

      if (!ok) errorCount.add(1);
    } else {
      const res = http.get(`${BASE_URL}/health/live`);
      check(res, { 'health live 200': (r) => r.status === 200 });
    }
  }

  // Realistic micro-jitter between operations (10ms - 40ms)
  sleep(0.01 + Math.random() * 0.03);
}
