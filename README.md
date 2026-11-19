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
├── instrumentation.ts      # OpenTelemetry SDK bootstrap (Axiom Cloud OTLP)
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
│   ├── pipeline.ts         # Security headers, CORS, compression, body limit
│   └── otel.ts             # OpenTelemetry active span tracing middleware
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
| **Relational Database** | [PostgreSQL 16](https://www.postgresql.org/) (Aiven) | Persistent storage for users and URLs (UUIDv7) |
| **ORM & Migrations** | [Drizzle ORM](https://orm.drizzle.team/) & `drizzle-kit` | Schema management and SQL queries |
| **In-Memory Cache** | [Valkey / Redis](https://valkey.io/) (Aiven, TLS) | Hot-path redirects, negative caching, rate limits |
| **OLAP Analytics** | [ClickHouse](https://clickhouse.com/) (Aiven) | Columnar storage for high-volume click telemetry |
| **Concurrency Protection** | Mutex SingleFlight | Collapses cache-miss stampedes into 1 DB query |
| **Observability** | [OpenTelemetry](https://opentelemetry.io/) & [Axiom](https://axiom.co/) | Distributed tracing (OTLP Protobuf) & metrics |
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
npm test                  # Run full Vitest integration suite (8 suites, 38 tests)
npm run test:load         # Run hot-path redirect benchmark (50 VUs)
npm run test:load:stampede # Run cache stampede resilience benchmark
npm run test:load:auth    # Run authentication & bcrypt benchmark
npm run test:load:mixed   # Run mixed read/write/analytics benchmark
npm run db:clean          # Purge test users, URLs, and ClickHouse events
```

---

## 📄 License
MIT
