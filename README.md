# Hono URL Shortener & ClickHouse Analytics Engine

High-throughput URL shortener and real-time OLAP analytics engine built with **Hono**, **PostgreSQL**, **Valkey/Redis**, and **ClickHouse**.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    User([Visitor / Client]) -->|GET /:shortKey| Hono[Hono Web Server]
    
    subgraph Redirect Hot Path
        Hono -->|1. Check Cache| Valkey[(Valkey / Redis Cache)]
        Valkey -->|Cache Hit| Return302[302 Redirect]
        Valkey -->|Cache Miss| SF[AsyncSingleFlight Gate]
        SF -->|Single Query| PG[(PostgreSQL OLTP)]
        PG -->|Backfill Cache with Jitter| Valkey
        PG --> Return302
    end
    
    subgraph Telemetry Pipeline
        Return302 -.->|Non-blocking Event| Buffer[In-Memory Buffer]
        Buffer -->|Batch Flush 500 items or 1s| CH[(ClickHouse OLAP)]
    end

    subgraph Management
        Owner([URL Owner]) -->|Cookie / API Key| App[REST API & Hono JSX UI]
        App -->|CRUD Links| PG
        App -->|Purge Key| Valkey
        App -->|Aggregations| CH
    end
```

---

## 📁 Project Structure (Tree Hierarchy)

```
src/
├── app.ts                  # Application setup, global middleware pipeline & error boundary
├── server.ts               # HTTP server bootstrap, backing tier checks, keep-alive timeouts
├── config/
│   └── env.ts              # Zod environment schema validation
├── routes/                 # Express-style flat router tree
│   ├── index.ts            # Central route dispatcher (rootRouter)
│   ├── auth.ts             # authRouter: register, login, logout, me
│   ├── url.ts              # urlRouter: CRUD URLs, cache purge
│   ├── analytics.ts        # analyticsRouter: ClickHouse multi-aggregations
│   ├── redirect.ts         # redirectRouter: hot-path Base62 /:shortKey redirect
│   ├── metrics.ts          # metricsRouter: deep health checks & telemetry
│   └── docs.ts             # docsRouter: interactive Swagger UI & OpenAPI 3.1
├── cache/
│   └── redis.ts            # Valkey/Redis client (TLS), jittered caching, negative caching
├── db/
│   ├── schema.ts           # Drizzle ORM PostgreSQL schema
│   ├── index.ts            # Drizzle client instance & connection check
│   ├── seed.ts             # Seed script for test users and links
│   └── cleanup.ts          # Teardown script for integration tests
├── clickhouse/
│   └── client.ts           # ClickHouse client, micro-batch flush buffer
├── middleware/
│   ├── auth.ts             # Dual auth guard (HTTP-only cookie + API key fallback)
│   ├── ratelimit.ts        # Redis sliding-window rate limiter (100 req/min)
│   └── app-middleware.ts   # Built-in Hono middleware (logger, requestId, cors, secureHeaders)
├── helpers/
│   ├── base62.ts           # Collision-resistant Base62 short key generator
│   ├── parser.ts           # User-Agent parser & GDPR HMAC-SHA256 IP hashing
│   ├── password.ts         # Bcrypt password hashing & verification
│   └── singleflight.ts     # AsyncSingleFlight cache stampede protection
└── views/
    ├── layout.tsx          # Base HTML5 layout with Tailwind CSS CDN
    ├── auth.tsx            # Login and Registration SSR pages
    ├── dashboard.tsx       # Interactive Dashboard SSR page & drawer
    └── components/         # Navbars, link tables, analytics slide-overs
```

---

## 🛠️ Tools & Technologies Used

| Category | Technology | Usage in Project |
|---|---|---|
| **Framework** | [Hono v4](https://hono.dev/) | Web framework, route handling, and JSX SSR |
| **Language & Runtime** | [TypeScript](https://www.typescriptlang.org/) & [Node.js](https://nodejs.org/) | Type-safe backend application logic |
| **Process Manager** | [PM2](https://pm2.keymetrics.io/) | Cluster mode multi-core process runner in container |
| **Relational Database** | [PostgreSQL 18](https://www.postgresql.org/) (Aiven) | Persistent storage for users and URLs (UUIDv7) |
| **ORM & Migrations** | [Drizzle ORM](https://orm.drizzle.team/) & `drizzle-kit` | Schema management and SQL queries |
| **In-Memory Cache** | [Valkey / Redis](https://valkey.io/) (Aiven, TLS) | Hot-path redirects, negative caching, rate limits |
| **OLAP Analytics** | [ClickHouse](https://clickhouse.com/) (Aiven) | Columnar storage for high-volume click telemetry |
| **Concurrency Protection** | Mutex SingleFlight | Collapses cache-miss stampedes into 1 DB query |
| **Observability** | Hono `logger()` & `requestId()` | Fast, native zero-overhead logging & request tracing |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Responsive UI styling for server-rendered JSX views |
| **Testing** | [Vitest](https://vitest.dev/) | Automated unit and integration test suites |
| **Load Testing** | [k6](https://k6.io/) | Concurrency, cache stampede, and throughput benchmarks |
| **API Docs** | [Swagger UI](https://swagger.io/) (`@hono/swagger-ui`) | Interactive OpenAPI 3.1 documentation |

---

## 🌟 Key Features

* **Sub-3ms Redirection Hot Path**: Sub-millisecond redirects using Valkey in-memory caching and negative caching sentinels.
* **Cache Stampede Resilience**: `AsyncSingleFlight` collapses 50+ concurrent cache misses into a single database query.
* **Collision-Resistant Base62 Keys**: Generates compact 7-character short codes ($62^7 \approx 3.5 \text{ trillion}$ permutations).
* **Vectorized OLAP Analytics**: Micro-batched click telemetry flushed to ClickHouse; aggregations for clicks, unique visitors, geo-distribution, referrers, and browsers.
* **Dual Authentication**: Secure HTTP-only JWT cookies for the browser UI and Bearer API keys for REST clients.
* **Account Enumeration Prevention**: Non-revealing generic responses on registration conflicts and login attempts.
* **Deep Health Check**: Live verification of PostgreSQL, Valkey, and ClickHouse with 5-second in-memory caching to prevent DB connection pool exhaustion.
* **Zero-Downtime Keep-Alive**: Configured 620s/650s HTTP keep-alive timeouts to prevent 502 Bad Gateway errors behind cloud load balancers (GCP LB, AWS ALB, Nginx).
* **Modern Hono JSX UI**:
  * Clean Server-Side Rendered dashboard at `/dashboard` with Tailwind CSS.
  * 0ms in-page telemetry slide-over drawer (background ClickHouse fetch, zero tab reloads).
  * Sign-in and registration pages with semantic HTML forms.
* **OpenAPI 3.1 Documentation**: Live interactive API specification hosted at `/docs`.

---

## 🚀 Quickstart

### 1. Local Setup
```bash
git clone <repository-url>
cd hono-url-shortner
npm install
cp .env.example .env
# Configure database URIs and secrets in .env
```

### 2. Database & Server
```bash
npm run db:migrate    # Apply PostgreSQL schema migrations
npm run db:seed       # Seed initial user & test URLs
npm run dev           # Start development server with hot-reloading
```

### 3. Docker Container
The repository includes an optimized multi-stage `Dockerfile` (`node:26-alpine`) running as non-root user `node`:

```bash
# Build production image
docker build -t hono-url-shortner .

# Run container (uses local .env file)
docker run --rm -d --name hono-prod -p 8080:8080 --env-file .env hono-url-shortner
```

---

## 🌐 Key Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/:shortKey` | `GET` | Hot-path visitor redirect (302 Found) |
| `/dashboard` | `GET` | Interactive management dashboard |
| `/login` | `GET`, `POST` | User sign-in page and form submission |
| `/register` | `GET`, `POST` | User registration page and form submission |
| `/docs` | `GET` | Swagger UI interactive OpenAPI 3.1 documentation |
| `/docs/openapi.json` | `GET` | Raw OpenAPI 3.1 JSON specification |
| `/health` | `GET` | Deep readiness check (verifies Postgres, Valkey, ClickHouse; 200/503) |
| `/health/ready` | `GET` | Readiness probe alias for load balancers |
| `/health/live` | `GET` | Shallow liveness ping for process supervisors |
| `/metrics` | `GET` | Storage latency and system memory metrics |
| `/api/v1/urls` | `POST`, `GET` | REST API for URL creation and paginated listing |
| `/api/v1/urls/:id` | `GET`, `DELETE`| REST API for URL metadata and deletion |
| `/api/v1/urls/:id/analytics` | `GET` | ClickHouse OLAP analytics dataset with ETag caching |
| `/api/v1/cache/:shortKey` | `DELETE` | Cache invalidation endpoint |

---

## 🧪 Testing & Benchmarks

```bash
npm test                  # Run full Vitest integration suite
npm run test:load         # Run hot-path redirect benchmark (50 VUs)
npm run test:load:stampede # Run cache stampede resilience benchmark
npm run test:load:auth    # Run authentication & bcrypt benchmark
npm run test:load:mixed   # Run staged 5-stage CRUD benchmark (100 VUs)
npm run db:clean          # Purge test users, URLs, and ClickHouse events
```

---

## 📊 Cloud Benchmark & Production Load Test (GCP Single-VM)

An empirical multi-stage CRUD load test was executed directly against a live remote GCP instance to measure realistic cloud performance under concurrent stress.

### 1. Environment & Machine Architecture

| Component | Specification / Configuration |
| :--- | :--- |
| **Cloud Provider & Region** | Google Cloud Platform (GCP) Compute Engine — `asia-south1-a` (Mumbai, India) |
| **Machine Type** | `e2-standard-4` (4 vCPUs, 16 GB RAM, 10 GB pd-standard boot disk) |
| **Operating System** | Ubuntu 22.04 LTS (`x86_64`) |
| **Container Engine** | Docker 29.1.3 (`--network=host`) running `ghcr.io/basavarajmuttagi/hono-url-shortner:latest` |
| **Process Clustering** | **PM2 Cluster Mode** (`pm2-runtime start dist/server.js -i max`), running 4 worker processes pinned across all 4 vCPUs |
| **Secret Provisioning** | Google Cloud Secret Manager (`hono-env`) streamed into RAM tmpfs (`/dev/shm/hono.env`, `chmod 600`) and immediately deleted (zero persistent disk exposure) |
| **Managed PostgreSQL** | Aiven PostgreSQL 18.7 (2 vCPUs, 4 GB RAM, 80 GB NVMe SSD, `Connection limit: 100`, client pool `max: 7` per worker process) |
| **Managed In-Memory Cache** | Aiven Valkey (Redis-compatible, TLS enabled) |
| **Managed OLAP Analytics** | Aiven ClickHouse Cloud (vectorized clickstream analytics) |

---

### 2. Workload & Stage Configuration

* **Tool**: Grafana k6
* **Client Location**: External client machine connecting over public WAN to `http://34.93.1.248:8080/`
* **Duration**: 2 minutes (122 seconds total including ramp-down)
* **Stage Progression**:
  * **Stage 1 (0:00 – 0:15)**: Warmup ramp from 1 to 20 Virtual Users (VUs)
  * **Stage 2 (0:15 – 0:50)**: Sustained normal load at 50 VUs
  * **Stage 3 (0:50 – 1:30)**: Heavy stress ramp to 80 VUs (saturating all 4 vCPUs)
  * **Stage 4 (1:30 – 1:45)**: Peak spike test at 100 VUs
  * **Stage 5 (1:45 – 2:00)**: Cooldown recovery ramp down to 0 VUs
* **Operation Distribution**:
  * **70% Hot-Path Redirects** (`GET /:shortKey`): Valkey $O(1)$ memory lookup + background ClickHouse event stream
  * **12% Paginated URL Lists** (`GET /api/v1/urls?page=X`): PostgreSQL relational reads
  * **8% Analytics Queries** (`GET /api/v1/urls/:id/analytics`): ClickHouse columnar aggregation queries
  * **6% Link Creation** (`POST /api/v1/urls`): PostgreSQL write + Base62 key generation + Valkey cache hydration
  * **4% Link Deletion** (`DELETE /api/v1/urls/:id`): PostgreSQL row delete + Valkey cache purge

---

### 3. Actual Benchmark Results (k6 Raw Telemetry)

#### Performance Metrics Table
| Metric | Value | Details |
| :--- | :--- | :--- |
| **Total Requests Completed** | **27,338** | Across 27,323 completed iterations |
| **Test Duration** | **2m 02.4s** | 5 staged concurrency phases |
| **Sustained Throughput** | **223.33 req/sec** | Mixed read/write/analytics operations |
| **Network Data Received** | **29 MB** | 236 kB/sec sustained transfer |
| **Network Data Sent** | **4.0 MB** | 33 kB/sec sustained transfer |
| **Total Validation Checks** | **51,303** | 48,653 succeeded (94.83%), 2,650 rate-limited (5.16%) |

#### Per-Operation Latency Breakdown (Over Public WAN)
*All latencies include transatlantic/public WAN network round-trip time between client and Mumbai datacenter (~50ms base RTT).*

| Operation | Requests Share | Average | Median (`med`) | p(90) | p(95) | Min | Max | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Redirect** (`GET /:shortKey`) | 70% | 74.61 ms | **59.00 ms** | 124.00 ms | 137.00 ms | 49.00 ms | 404.00 ms | **100%** |
| **List URLs** (`GET /urls`) | 12% | 114.34 ms | **94.00 ms** | 167.00 ms | 179.00 ms | 81.00 ms | 423.00 ms | **100%** |
| **Create URL** (`POST /urls`) | 6% | 120.24 ms | **96.00 ms** | 170.00 ms | 190.40 ms | 78.00 ms | 399.00 ms | *Rate-limited* |
| **Delete URL** (`DELETE /urls/:id`) | 4% | 350.36 ms | **237.50 ms** | 672.90 ms | 994.70 ms | 151.00 ms | 1,619.00 ms | **100%** |
| **Analytics** (`GET /analytics`) | 8% | 536.42 ms | **371.00 ms** | 1,177.60 ms | 1,481.15 ms | 165.00 ms | 2,202.00 ms | **100%** |
| **Overall HTTP Duration** | **100%** | **121.09 ms** | **64.64 ms** | **179.68 ms** | **341.42 ms** | **33.88 ms** | **2.20 s** | **95.16%** |

> **Rate Limit Note (`429 Too Many Requests`)**:
> During the test, 1,325 link creation requests (4.84% of total requests) received HTTP 429. This was not a server error; the application's sliding-window rate limiter in `src/middleware/ratelimit.ts` correctly enforced the security threshold of **100 link creations/minute per user**. Because all 100 concurrent VUs operated under the same fixture API key, they saturated the limit within the first ~20 seconds of each minute. All other operations (redirects, lists, analytics, deletes) achieved **100% success**.

---

### 4. VM Hardware & Guest Telemetry During Peak Load

* **Peak Host CPU Utilization**: **~41.2%** during the 100-VU spike (20% averaged across the 1-minute Cloud Monitoring window).
* **Container Memory Usage**: **316.4 MiB / 15.62 GiB** (only **1.98%** container memory pressure).
* **Host OS Total RAM Usage**: **786 MB** used out of 15,990 MB available (~5% total system utilization).
* **PM2 Worker Health**: **0 process restarts (`↺ 0`)** across all 4 cluster worker processes.
* **Database Connection Headroom**: The connection pool remained stable throughout the test with zero connection exhaustion errors on Aiven PostgreSQL.

---

## 📄 License
MIT
