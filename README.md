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

* **High-Speed Hot Path**: Sub-millisecond redirects using Valkey in-memory caching and negative caching sentinels.
* **Cache Stampede Resilience**: `AsyncSingleFlight` collapses concurrent cache misses into a single database query.
* **Collision-Resistant Base62 Keys**: Generates compact 7-character short codes ($62^7 \approx 3.5 \text{ trillion}$ permutations).
* **Vectorized OLAP Analytics**: Micro-batched click telemetry flushed to ClickHouse; fast aggregations for clicks, unique visitors, geo-distribution, referrers, and browsers.
* **Dual Authentication**: Secure HTTP-only JWT cookies for the browser UI and Bearer API keys for REST clients.
* **Account Enumeration Prevention**: Non-revealing generic responses on registration conflicts.
* **Modern Hono JSX UI**:
  * Clean Server-Side Rendered dashboard at `/dashboard` with Tailwind CSS.
  * 0ms in-page telemetry slide-over drawer (background ClickHouse fetch, zero tab reloads).
  * Sign-in and registration pages with semantic HTML forms.
* **OpenAPI 3.1 Documentation**: Live interactive API specification hosted at `/docs`.

---

## 🚀 Quickstart

### 1. Setup
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

### 3. Key Endpoints
* **Dashboard**: `http://localhost:8080/dashboard`
* **Sign In**: `http://localhost:8080/login`
* **API Documentation**: `http://localhost:8080/docs`
* **Health Check**: `http://localhost:8080/health`
* **Prometheus Metrics**: `http://localhost:8080/metrics`

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
