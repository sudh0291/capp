# 🚀 CodeGoAI Platform — Setup & Run Instructions

> **Code execution uses Judge0 CE** (real cloud compiler — no sandbox Docker images needed!)

---

## Prerequisites
- **Node.js** v18 or v20+
- **Docker Desktop** installed and running
- Internet access (for Judge0 code execution API)

---

## 🛠️ Step 1: Start Infrastructure Containers

Open PowerShell in the `codego` folder:

```powershell
docker compose up -d postgres redis chroma ollama
```

Pull the AI models (downloads ~4 GB — only needed once):

```powershell
docker compose exec ollama ollama pull deepseek-coder:6.7b
docker compose exec ollama ollama pull nomic-embed-text
```

> ⏳ Model download can take 5–20 minutes.

---

## ⚙️ Step 2: Configure & Start Backend

In a PowerShell window navigate to `codego\backend`:

```powershell
# Copy env config (already done if .env exists)
Copy-Item .env.example .env

# Install dependencies
npm install

# Start backend
npm run start:dev
```

> ✅ Keep this terminal open. Success message: `Nest application running on http://[::1]:3000`

---

## 🔑 Fix: Postgres Auth Error

If you see `password authentication failed for user "platform_user"`, the postgres container was started without the correct password. Fix it by resetting the volume:

```powershell
# Run from the codego directory
docker compose down
docker volume rm codego_postgres_data
docker compose up -d postgres redis chroma ollama
```

> ⚠️ This resets the database. Re-run Step 3 seeding after this.

---

## 🧠 Step 3: Seed the Database (First Run Only)

Open a **new** PowerShell window in the `codego` directory:

```powershell
# Install root-level dependencies (chromadb + ts-node)
npm install

# Seed AI questions into ChromaDB
npx ts-node scripts/seed-vector-store.ts

# Import student accounts into PostgreSQL
npx ts-node scripts/bulk-import-students.ts
```

---

## 💻 Step 4: Start the Frontend

Open a **third** PowerShell window, navigate to `codego\codego-platform`:

```powershell
npm install
npm run dev
```

Open browser at: **http://localhost:5173**

---

## 🎉 Test Accounts

| Role    | Reg Number | Password       |
|---------|-----------|----------------|
| Student | `21CS001` | `College@2024` |
| Faculty | `FAC001`  | `College@2024` |

> Use the **Demo Login** buttons on the login page to test the UI without any database.

---

## ⚡ How Code Execution Works

```
Student clicks "Run"
  → Frontend → NestJS /api/submissions/run
  → Backend → Judge0 CE API (real cloud compiler)
  → Judge0 compiles + runs code (Python/Java/C++/C/JS/R)
  → Compiler output / errors returned instantly
  → Output compared against sample test case

Student clicks "Submit"
  → Same Judge0 flow for ALL hidden test cases
  → Ollama AI reviews code quality
  → Final grade stored + displayed on Results page
```

---

## 🔧 Troubleshooting

| Issue | Fix |
|-------|-----|
| `password authentication failed` | See **Fix: Postgres Auth Error** section above |
| `Cannot connect to backend` | Ensure `npm run start:dev` is running in `backend/` |
| `Run Code` times out | Check internet connection (Judge0 requires internet) |
| DB connection error | `docker compose up -d postgres` |
| ChromaDB not found | `docker compose up -d chroma` |
| Ollama model error | `docker compose exec ollama ollama pull deepseek-coder:6.7b` |


Here is a clear, technical explanation you can use to explain how the backend manages load balancing and compiler allocation during high traffic (like 200+ simultaneous students submitting code).

You can break it down into four main pillars:

1. Asynchronous Message Queueing (Bull & Redis)
When 200 students hit "Submit" at the exact same second, the backend does not try to compile all 200 submissions immediately. Doing so would crash the compiler (Judge0) or time out the HTTP requests.

How it works: Instead of processing synchronously, the Node.js backend instantly saves the submission as RUNNING in PostgreSQL and pushes the code payload to a Bull Queue backed by Redis (seen in submissions.service.ts).
The Result: The backend responds to the student instantly with a 201 Queued status. This completely eliminates HTTP timeouts and keeps the web server thread pool open to accept more traffic.
2. Pull-Based Compiler Allocation (Worker Concurrency)
Load balancing isn't handled by pushing code to compilers; it’s handled by Workers pulling from the queue.

How it works: You have background Worker processes listening to the Redis queue. If you set worker concurrency to 5 (locally) or 20 (in Docker with 4 workers), exactly that many submissions are sent to the Judge0 compiler containers at any given time.
Backpressure: The queue acts as a shock absorber (backpressure). If Judge0 is at 100% CPU capacity, the remaining 180 submissions safely wait in Redis memory. As soon as a compiler finishes a job, a worker pulls the next one. This guarantees the compiler is never overwhelmed.
3. Aggressive Polling Mitigation (Redis Caching)
Because the HTTP request finishes instantly, the student's frontend switches to "Polling" mode (asking the backend "Is my code done yet?" every 2 seconds). With 200 students, that’s 100 requests per second just checking status.

How it works: To prevent these 100 req/sec from destroying the PostgreSQL database, the backend uses a Redis Cache TTL for the status endpoint (getSubmissionStatus).
The Result: When a student polls for their status, the backend reads directly from RAM (Redis) instead of querying the database.
4. Exponential Backoff & Fault Tolerance
If the Judge0 execution engine momentarily drops a connection due to a network spike or rate limit, the system doesn't instantly fail the student's exam.

How it works: The queue is configured with { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }. If the compiler rejects the job, the worker will wait 2 seconds and try again, then wait 4 seconds and try again.
Summary Pitch for an Interview/Presentation:
"To handle massive burst traffic, our architecture decouples the web API from the heavy compiler engine. When hundreds of students submit code simultaneously, the Node.js API acts as a lightning-fast ingestor, dumping payloads into an in-memory Redis queue and immediately freeing up the client. Separate background workers act as the load balancer—they pull submissions from the queue strictly at the concurrency limit the Judge0 compiler can handle. Meanwhile, the frontend's status polling is shielded from the database by a Redis cache layer, ensuring the system remains completely stable and responsive under heavy load."

11:53 AM
