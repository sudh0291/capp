# CodeGo — Platform Architecture Guide
> How 2000 students can write an assessment simultaneously without the backend jamming.

---

## Table of Contents
1. [How the Frontend Works](#1-how-the-frontend-works)
2. [How the Backend Works](#2-how-the-backend-works)
3. [How Docker Wires Everything Together](#3-how-docker-wires-everything-together)
4. [How Load Balancing Works for 2000 Students](#4-how-load-balancing-works-for-2000-students)
5. [How Compiler Allocation Works (No Jamming)](#5-how-compiler-allocation-works-no-jamming)
6. [Running the Platform](#6-running-the-platform)

---

## 1. How the Frontend Works

The frontend is a **React SPA** (Single Page Application) served as static files by NGINX.

```
Student's Browser  →  NGINX  →  /usr/share/nginx/html (built React files)
```

### Key behaviours

| Action | What happens |
|---|---|
| Student opens the app | NGINX serves `index.html` instantly from disk — no server logic needed |
| Student refreshes `/dashboard` | NGINX's `try_files` rule rewrites it to `index.html` — **this is what prevents "site not found" errors** |
| Static assets (JS, CSS) | Cached in the browser for 1 year via `Cache-Control: immutable` — never re-downloaded |
| API calls (`/api/...`) | NGINX proxies them to the NestJS backend cluster — the frontend never talks to the backend directly |

### What the student sees during a submission

```
1. Click "Submit"
   └─► POST /api/submissions  →  receives { submissionId, status: "queued" } instantly

2. Every 2 seconds, poll:
   └─► GET /api/submissions/:id/status  →  { status: "running" }
   └─► GET /api/submissions/:id/status  →  { status: "running" }
   └─► GET /api/submissions/:id/status  →  { status: "completed", score: 85 }

3. Fetch full result once:
   └─► GET /api/submissions/:id  →  full grade report with test case details
```

The student gets a response in **under 100ms** from clicking Submit — no spinner waiting for code to compile.

---

## 2. How the Backend Works

The backend is a **NestJS** application (Node.js + TypeScript) broken into focused modules.

```
src/
├── auth/           Login, JWT token generation
├── users/          Student profiles, progress stats
├── questions/      AI question generation (Ollama), ChromaDB RAG retrieval
├── submissions/    Accept submissions → enqueue → return status
├── execution/      Judge0 API wrapper + Bull worker processor
├── grading/        AI code review + deterministic pass/fail scoring
├── results/        Final result storage
├── faculty/        Faculty dashboard, CSV import, analytics
└── common/
    └── redis/      Shared Redis client (cache + queue backbone)
```

### Request lifecycle (simplified)

```
Login
  AuthService  →  validates bcrypt password  →  returns JWT token

Load Question
  QuestionsController  →  QuestionsService.getQuestion(id)
                       →  checks Redis cache (1-hour TTL)
                       →  if miss: reads from Postgres, stores in Redis
                       →  returns question JSON

Submit Code
  SubmissionsController  →  SubmissionsService.submitCode()
                         →  saves Submission row (status: RUNNING)
                         →  adds job to Bull 'execution' queue in Redis
                         →  returns { submissionId, status: "queued" }

Background (Worker container)
  ExecutionProcessor.handleRun()
    →  calls ExecutionService.runAllTestCases()
       →  for each test case: POST to Judge0 → poll until done
    →  calls GradingService.grade()  (AI review + score)
    →  updates Submission row (status: COMPLETED, score: N)
    →  deletes Redis status cache key  (next poll gets fresh DB data)
    →  updates User progress stats
```

---

## 3. How Docker Wires Everything Together

Running `docker compose up` starts **14 containers** that work as one system.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         docker-compose.yml                          │
│                                                                     │
│  ┌─────────┐     ┌──────────────────────────────────────────────┐  │
│  │  NGINX  │────►│  api1  api2  api3  api4  (NestJS instances)  │  │
│  └─────────┘     └──────────────────┬───────────────────────────┘  │
│       │                             │                               │
│  serves React                  reads/writes                         │
│  static files                       │                               │
│                          ┌──────────▼──────────┐                   │
│                          │      PgBouncer       │                   │
│                          │  (connection pooler) │                   │
│                          └──────────┬───────────┘                   │
│                                     │ max 25 real connections        │
│                          ┌──────────▼──────────┐                   │
│                          │      PostgreSQL      │                   │
│                          └─────────────────────┘                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │   Redis  ◄──── api1..4 (enqueue jobs, read/write cache)     │   │
│  │          ◄──── worker1..4 (dequeue and process jobs)        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────┐   ┌─────────────────────────────────────┐   │
│  │  worker1..4       │──►│  Judge0-server + Judge0-workers      │   │
│  │  (Bull workers)   │   │  (self-hosted code execution)        │   │
│  └───────────────────┘   └─────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐                                │
│  │   Ollama    │   │   ChromaDB   │  (AI generation, RAG)          │
│  └─────────────┘   └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Environment variable handoff

The `.env` file in `backend/` is for **local development only**.  
When running in Docker, `docker-compose.yml` overrides the critical variables automatically:

| Variable | Local `.env` value | Docker override |
|---|---|---|
| `DB_HOST` | `localhost` | `pgbouncer` |
| `DB_PORT` | `5433` | `6432` |
| `REDIS_HOST` | `localhost` | `redis` |
| `JUDGE0_URL` | `http://localhost:2358` | `http://judge0-server:2358` |

You never need to manually edit the file when switching environments.

---

## 4. How Load Balancing Works for 2000 Students

### The problem without load balancing

Node.js runs on a single CPU core. One NestJS instance can handle roughly 200-400 concurrent requests before it starts slowing down. At 9:00 AM when 2000 students log in simultaneously, a single instance would queue requests and eventually time out.

### The solution: 4 NestJS instances behind NGINX

```
2000 students
     │
     ▼
  NGINX (least_conn algorithm)
     │
     ├──► api1 (handling ~480 students)
     ├──► api2 (handling ~510 students)
     ├──► api3 (handling ~490 students)
     └──► api4 (handling ~520 students)
```

**`least_conn`** — NGINX always routes the next request to whichever instance has the fewest active connections. This self-balances without any manual tuning.

**`keepalive 64`** — NGINX reuses 64 open connections to each backend instance instead of re-handshaking for every request. This eliminates TCP overhead under high concurrency.

**`max_fails=3 fail_timeout=30s`** — If an instance crashes, NGINX stops sending it traffic within 3 failed requests and tries again after 30 seconds. Combined with `restart: always` in Docker, the container recovers and re-joins the pool automatically.

**`GET /health` endpoint** — Docker sends a health probe every 15 seconds. If it fails 3 times, Docker restarts the container. NGINX also monitors this to remove dead instances.

### Database connection pooling (PgBouncer)

Without PgBouncer, each of the 4 NestJS instances would hold 10 open Postgres connections = 40 total. Under burst load this could spike to hundreds. PostgreSQL's default `max_connections=100` would be breached and new connections would be refused.

```
4 API instances × 5 TypeORM connections each = 20 connections to PgBouncer
PgBouncer multiplexes these into 25 real Postgres connections (POOL_MODE=transaction)
Postgres only ever sees 25 connections — well within its limit of 50
```

### Redis caching (cutting DB load by ~60%)

Every time a student loads a question, the backend checks Redis first:

- **Question cache** (1-hour TTL) — 2000 students loading the same question = 1 DB query, not 2000.
- **Submission status cache** (2-second TTL) — 2000 students polling every 2s = at most ~1000 DB queries/second, not 2000.
- **JWT validation** — passport-jwt validates the token cryptographically without hitting the DB at all (user info is embedded in the token payload).

---

## 5. How Compiler Allocation Works (No Jamming)

This is the most important part. Previously, code execution happened **inside the HTTP request cycle** — the student's browser had to wait for the entire compile + run + grade cycle to complete before receiving a response. Under load, this caused timeouts.

### The new flow: queue-based async execution

```
BEFORE (blocking):
  Student submits  →  API waits for Judge0 (~5-15s)  →  API waits for AI grade (~3s)
  →  responds  ──  Total: 8-18 seconds per student, blocks the API thread

AFTER (non-blocking):
  Student submits  →  API saves row + adds to queue  →  responds in <100ms
                                    │
                         Redis Bull Queue
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
           worker1              worker2             worker3/4
         (5 jobs max)         (5 jobs max)         (5 jobs max each)
               │
      for each test case:
        POST to Judge0 → poll → result
      grade with AI
      update DB row
      invalidate Redis cache
```

### Judge0 compiler allocation

**Self-hosted Judge0** runs as its own mini-cluster inside Docker:

```
worker1..4 (Bull)  ──►  judge0-server (HTTP API)
                              │
                    judge0-workers (2 processes)
                              │
                    isolate sandbox (one per execution)
                    [cgroup CPU + memory limits enforced]
```

Each code submission gets its own **isolate sandbox** — a Linux container within the Judge0 worker with:
- CPU time limit: 5 seconds
- Memory limit: 256 MB
- Separate process namespace (student code cannot see other students' processes)

### Why it never jams

| Scenario | What happens |
|---|---|
| 2000 students submit at 9:00 AM | 2000 jobs enter the Redis queue instantly. All 2000 API responses return in <100ms. |
| Workers process at their own pace | 4 workers × 5 concurrency = 20 Judge0 calls in-flight at any moment. Remaining jobs wait safely in Redis. |
| Judge0 is slow | The Bull job retries up to 3 times with exponential backoff. Student polls and eventually sees COMPLETED. |
| A worker crashes | Docker restarts it in seconds. It picks up pending jobs from Redis (jobs are never lost). |
| Judge0 server is overloaded | `MAX_QUEUE_SIZE=200` in judge0.conf — if hit, Judge0 returns 503, Bull retries the job. |

### Estimated throughput

```
20 concurrent Judge0 executions
Each execution: ~3-8 seconds (compile + run all test cases)
Throughput: ~20 ÷ 5s avg = ~4 submissions completed per second
2000 submissions: ~500 seconds (~8 minutes) to clear the full queue

In practice: students are staggered — they don't all submit at exactly the same second.
Realistic clearance time for a 2000-student exam: 3-5 minutes.
```

---

## 6. Running the Platform

### Local development (no Docker)

```bash
# Start Postgres + Redis (Docker only for infra)
docker compose up postgres redis -d

# Start backend
cd backend
npm run start:dev

# Start frontend
cd codego-platform
npm run dev
```

### Full Docker stack (production-like)

```bash
# Build frontend first
cd codego-platform
npm run build        # outputs to dist/

# Start everything
cd ..
docker compose up --build -d

# Check all containers are healthy
docker compose ps

# Watch logs
docker compose logs -f api1 worker1
```

### Checking load balancer is working

```bash
# Hit the backend 8 times — you should see 4 different process IDs in the logs
for i in {1..8}; do curl -s http://localhost/health; done

# Watch NGINX routing decisions
docker compose logs -f nginx
```

### Scaling workers up if queue is growing

```bash
# Add 2 more workers without restarting anything else
docker compose up --scale worker=6 -d
```
