# capp - Complete Coding Platform with AI

Welcome to **Appz**, a modern, full-stack coding platform with AI-powered question generation, auto-fix, and grading!

## ✨ Features

- **AI-Powered Question Generation:** Generates unique coding questions using Mistral AI
- **User Question History:** Never repeats questions for the same user
- **Auto-Fix System:** AI helps fix code submissions
- **Full Stack Web App:** React + TypeScript frontend, NestJS backend
- **Dockerized Setup:** One-click deployment with Docker Compose
- **Comprehensive Testing:** Selenium E2E tests with Excel/PDF reports
- **40,000 Pre-loaded Questions:** Ready to use coding problems!

## 📦 Tech Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **TypeORM** - ORM for database
- **PostgreSQL** - Primary database
- **Redis** - Cache and job queue
- **Judge0** - Code execution engine
- **Mistral AI** - Question generation and auto-fix

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Monaco Editor** - Code editor
- **Framer Motion** - Animations

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed
- Node.js 18+

### Step 1: Start Docker Services
```bash
cd c:\codego
docker-compose up -d
```

### Step 2: Seed Database with 40k Questions
```bash
cd backend
node seed-postgres.js
```

### Step 3: Start Backend
```bash
cd backend
npm run start:dev
```

### Step 4: Start Frontend
```bash
cd codego-platform
npm run dev:web
```

Now, open your browser and go to http://localhost:5173

## 📊 Testing

To run the E2E tests with Selenium:
```bash
cd e2e-selenium-tests
npm run test
```
This will generate Excel and PDF reports in `reports/` directory!

## 📁 Directory Structure

```
c:\codego
├── backend/              # NestJS backend
│   ├── src/              # Backend source code
│   └── test/             # Backend tests
├── codego-platform/      # React frontend
│   └── src/              # Frontend source code
├── e2e-selenium-tests/   # E2E testing suite
├── scripts/              # Helper scripts and 40k questions
└── docker-compose.yml    # Docker services config
```

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details!
