# 🚀 AutoPilot Template

Your AI Command Center starter kit for the AutoPilot Hackathon.

Build an intelligent, multi-agent command center that automates business processes with AI — while keeping humans in the loop for oversight and exception handling.

---

## Prerequisites

Before you begin, make sure you have these installed on your machine:

| Tool | macOS | Windows | Why you need it |
|------|-------|---------|-----------------|
| **Docker Desktop** | [Download for Mac](https://www.docker.com/products/docker-desktop/) | [Download for Windows](https://www.docker.com/products/docker-desktop/) | Runs all services (backend, frontend, database) in containers |
| **Git** | Pre-installed or `brew install git` | [Download](https://git-scm.com/download/win) or `winget install Git.Git` | Clone the repository |

> **Windows users:** Make sure WSL 2 is enabled (Docker Desktop will prompt you). If you see a WSL error, run `wsl --install` in PowerShell as Administrator and restart.

---

## 🚀 Getting Started — Step by Step

### Step 1: Clone the Repository

**macOS (Terminal) / Windows (PowerShell / Git Bash):**
```bash
git clone <your-repo-url>
cd AutoPilot-Template
```

### Step 2: Create Your Environment File

**macOS / Linux:**
```bash
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Windows (Command Prompt):**
```cmd
copy .env.example .env
```

> The default `.env` works out of the box — `AUTH_BYPASS=true` means no external auth setup needed. The app starts with a "Dev User" session automatically.

### Step 3: docker compose up --build -d

---

## 📋 Common Commands Reference

### macOS / Linux (using `make`)

| Command | What it does |
|---------|-------------|
| `make up` | Build and start all services |
| `make down` | Stop all services |
| `make logs-be` | Stream backend logs (live) |
| `make logs-fe` | Stream frontend logs (live) |
| `make reset-db` | Reset database and re-seed sample data |
| `make migrate-create MSG='add users table'` | Create a new database migration |
| `make migrate-up` | Apply all pending migrations |
| `make migrate-down` | Rollback the last migration |
| `make migrate-history` | Show migration history |
| `make lint` | Lint backend + frontend code |
| `make test-be` | Run backend unit tests |
| `make help` | Show all available commands |

### Windows (using `docker compose` directly)

| Command | What it does |
|---------|-------------|
| `docker compose up --build -d` | Build and start all services |
| `docker compose down` | Stop all services |
| `docker compose logs -f backend` | Stream backend logs (live) |
| `docker compose logs -f frontend` | Stream frontend logs (live) |
| `docker compose exec backend python scripts/reset_db.py` | Reset database |
| `docker compose exec backend alembic revision --autogenerate -m "description"` | Create migration |
| `docker compose exec backend alembic upgrade head` | Apply all pending migrations |
| `docker compose exec backend alembic downgrade -1` | Rollback last migration |
| `docker compose exec backend alembic history --verbose` | Show migration history |
| `docker compose exec backend pytest` | Run backend tests |

> **Tip for Windows:** You can install `make` via [Chocolatey](https://chocolatey.org/) (`choco install make`) or [Scoop](https://scoop.sh/) (`scoop install make`) to use the shorter `make` commands.

---

## 🔍 Viewing Logs & Debugging

### Watch all logs at once
```bash
# macOS / Linux
docker compose logs -f

# Stop following with Ctrl+C
```

### Watch a specific service
```bash
# Backend only
docker compose logs -f backend

# Frontend only
docker compose logs -f frontend

# Database only
docker compose logs -f postgres
```

### Check if a service is healthy
```bash
# Quick health check
curl http://localhost:8001/api/health

# Or check container status
docker compose ps
```

### Restart a single service (without touching others)
```bash
docker compose restart frontend
docker compose restart backend
```

---

## What's Included

### Backend (FastAPI + Python)
- ✅ FastAPI with auto-generated Swagger docs
- ✅ PostgreSQL database with Alembic migrations
- ✅ Auth system with dev-mode bypass (`AUTH_BYPASS=true`)
- ✅ Audit logging middleware (every request logged)
- ✅ Items CRUD API (sample entity)
- ✅ File storage API (local or cloud)
- ✅ Role-based authorization engine

### Frontend (Next.js + React)
- ✅ Premium glassmorphic UI with Framer Motion animations
- ✅ Dashboard with stat cards and activity chart
- ✅ AI Policies page with demo data (5 sample policies)
- ✅ AI Insights page with demo data (patterns, anomalies, actions)
- ✅ AI Manager chat interface
- ✅ Workbench page
- ✅ Settings page
- ✅ Command palette (⌘K / Ctrl+K)

### Infrastructure
- ✅ Docker Compose for one-command startup
- ✅ Pre-built production frontend (instant page loads)
- ✅ Cross-platform (macOS, Windows, Linux)

---

## What YOU Build

This is a **starter template**. You need to connect these frontend shells to real AI logic:

| Feature | Frontend Status | Your Task |
|---------|----------------|-----------| 
| **AI Manager** | ✅ Chat UI ready | Connect to your AI agent orchestration backend |
| **AI Policies** | ✅ Demo data loaded | Build the policy engine that evaluates rules at runtime |
| **AI Insights** | ✅ Demo data loaded | Build the analysis engine that generates insights from your data |
| **Workbench** | ✅ UI shell ready | Build exception routing — when AI fails, send work items here |

See **[`docs/command-center-guide.md`](docs/command-center-guide.md)** for the full architecture guide.

---

## Project Structure

```
AutoPilot-Template/
├── app/                    # Backend (FastAPI)
│   ├── main.py             # App entry point
│   ├── security.py         # Auth + AUTH_BYPASS logic
│   ├── authz.py            # Authorization engine
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic schemas
│   ├── routers/            # API endpoints
│   ├── services/           # Business logic
│   └── core/               # Database, storage
├── frontend/               # Frontend (Next.js)
│   ├── src/app/            # Pages (dashboard, AI, admin, etc.)
│   ├── src/components/     # Reusable UI components
│   └── src/lib/            # API client, utilities
├── alembic/                # Database migrations
├── scripts/                # Seed data, utilities
├── docs/                   # Documentation
│   ├── command-center-guide.md   # ⭐ What to build
│   ├── hackathon-brief.md        # ⭐ Problem statements
│   ├── design-system-template.md # UI patterns
│   └── Audit System Guide.md     # Audit logging
├── docker-compose.yml      # Service orchestration
├── Dockerfile              # Backend container
├── Makefile                # Dev commands (macOS/Linux)
└── .env.example            # Environment config template
```

---

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_BYPASS` | `true` | Skip all auth (dev mode) |
| `AUTH_DEBUG` | `true` | Verbose auth logging |
| `APP_ENV` | `development` | Backend mode |
| `DATABASE_URL` | auto-generated | PostgreSQL connection |
| `FRONTEND_URL` | `http://localhost:3001` | CORS origin |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Docker not found** | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and make sure it's running |
| **Port 3001 already in use** | Stop whatever is on that port: `lsof -ti:3001 \| xargs kill` (Mac) or change the port in `docker-compose.yml` |
| **Port 5432 already in use** | You have a local PostgreSQL running. Stop it or change the port in `docker-compose.yml` |
| **`make` not found (Windows)** | Use `docker compose` commands directly (see table above) or install make via `choco install make` |
| **WSL error (Windows)** | Run `wsl --install` in PowerShell as Admin, then restart your PC |
| **ERR_CONNECTION_RESET on localhost (Windows)** | WSL2's relay can intercept port 3001 via IPv6. Use `.\scripts\start.ps1` which handles this automatically, or manually run `wsl --shutdown` before `docker compose up --build -d`. |
| **Containers crash-looping** | Check logs: `docker compose logs backend` — usually a missing env var or DB issue |
| **Frontend shows blank page** | Check if backend is healthy: `curl http://localhost:8001/api/health` |
| **Database connection refused** | Wait 10-15 seconds after startup — Postgres needs time to initialize on first run |

---

## Documentation

| Document | Purpose |
|----------|---------| 
| **[Command Center Guide](docs/command-center-guide.md)** | What is a Command Center, AI Policies, Insights, Manager, Workbench |
| **[Hackathon Brief](docs/hackathon-brief.md)** | Problem statements, judging criteria |
| **[Design System](docs/design-system-template.md)** | UI component patterns, colors, spacing |
| **[Audit System](docs/Audit%20System%20Guide.md)** | Audit logging architecture |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Python 3.11 + FastAPI | API server |
| **Frontend** | Next.js 15 + React 19 | Web dashboard |
| **Database** | PostgreSQL 15 | Persistent storage |
| **ORM** | SQLAlchemy 2 + Alembic | Data modeling + migrations |
| **Auth** | NextAuth.js + JWT | Authentication (bypass-able) |
| **UI** | Tailwind CSS + Framer Motion | Styling + animations |
| **Containers** | Docker + Docker Compose | Development environment |
