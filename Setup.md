# ExamGuard — Setup & Installation Guide

This document provides a comprehensive, step-by-step installation and execution guide for **ExamGuard**, a real-time multi-modal AI exam proctoring and biometric face verification system.

---

## 1. System Requirements & Prerequisites

Ensure the following tools are installed on your host machine before starting:

| Component | Minimum Version | Recommended Version | Purpose |
|---|---|---|---|
| **Node.js** | `>= 20.0.0 LTS` | `22.x LTS` | Next.js 15 Web App & Express API |
| **npm** | `>= 10.0.0` | `10.8+` | Workspace monorepo dependency management |
| **Python** | `3.10` or `3.11` | `3.11.x 64-bit` | InsightFace (ArcFace 512-dim) ONNX Vision Engine |
| **MySQL Server** | `8.0+` | `8.0.36+` | Production relational database (port `3306`) |
| **Git** | `2.40+` | Latest | Version control |
| **Hardware** | Webcam + 8GB RAM | 16GB RAM + HD Cam | Biometric frame capture & inference |

---

## 2. Repository Layout

The project is structured with a clean root level containing documentation and a `main/` directory holding the monorepo codebase:

```
Exam_Guard/
├── README.md               # Architecture, features, tech stack & overview
├── Setup.md                # This setup, installation & execution guide
├── .gitignore              # Multi-tier gitignore protecting secrets and artifacts
├── package.json            # Root proxy runner forwarding scripts to main/
└── main/                   # Core Monorepo & Application Source Code
    ├── apps/
    │   ├── api/            # Express + Prisma + SQLite Backend (Port 4000)
    │   └── web/            # Next.js 15 (App Router) Frontend (Port 3000)
    ├── packages/
    │   └── shared/         # Shared TypeScript schemas, enums & contracts
    ├── services/
    │   └── vision/         # FastAPI + InsightFace Python Vision Engine (Port 8000)
    ├── scripts/            # Database reset, seed, security & setup scripts
    ├── storage/            # Encrypted evidence files & isolated Sandbox SQLite DB
    ├── docs/               # System architecture, ADRs & calibration specs
    ├── .env.example        # Environment variable blueprint
    ├── docker-compose.yml  # Optional Docker container for MySQL
    ├── package.json        # Monorepo workspaces definition
    └── tsconfig.base.json  # Shared TypeScript compiler configuration
```

---

## 3. Quick Automated Setup (Windows)

ExamGuard includes an automated PowerShell setup script that validates prerequisites, installs Node dependencies, creates the Python virtual environment, generates cryptographic keys, and initializes the database.

Open PowerShell as Administrator in the repository root and run:

```powershell
npm run setup
```
*(Or directly: `cd main; powershell -ExecutionPolicy Bypass -File ./scripts/setup.ps1`)*

The script will:
1. Check Node.js, Git, Python 3.11, and MySQL reachability on port 3306.
2. Generate secure AES-256-GCM encryption keys and secrets in `main/.env`.
3. Install npm dependencies across all workspaces (`@examguard/web`, `@examguard/api`, `@examguard/shared`).
4. Create the Python virtual environment in `main/services/vision/.venv` and install `requirements.txt`.
5. Run Prisma database migrations and seed baseline accounts.

---

## 4. Manual Step-by-Step Installation

If you prefer installing components manually or are on a non-Windows environment, follow these steps:

### Step 4.1: Navigate to Main Codebase
```bash
cd main
```

### Step 4.2: Install Node.js Dependencies
```bash
npm install
```

### Step 4.3: Set Up Python 3.11 Vision Environment
```bash
# Create virtual environment in services/vision/.venv
python -m venv services/vision/.venv

# Activate virtual environment
# Windows PowerShell:
.\services\vision\.venv\Scripts\Activate.ps1
# Linux / macOS:
# source services/vision/.venv/bin/activate

# Upgrade pip and install requirements
pip install --upgrade pip
pip install -r services/vision/requirements.txt
```

### Step 4.4: Configure Environment Variables
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```

Generate secure 32-byte cryptographic keys using the helper script:
```bash
node scripts/gen-secrets.mjs
```

Paste the generated keys into `main/.env`:
```ini
PORT=4000
NODE_ENV=development
DATABASE_URL="mysql://root:YourPassword@127.0.0.1:3306/examguard"
JWT_SECRET="<generated-secret>"
JWT_REFRESH_SECRET="<generated-secret>"
COOKIE_SECRET="<generated-secret>"
CSRF_SECRET="<generated-secret>"
STORAGE_ENCRYPTION_KEY="<generated-32-byte-hex-key>"
IMAGE_ENCRYPTION_KEY="<generated-32-byte-hex-key>"
EMBEDDING_ENCRYPTION_KEY="<generated-32-byte-hex-key>"
VISION_URL="http://127.0.0.1:8000"
VISION_INTERNAL_KEY="<generated-secret>"
```

### Step 4.5: Initialize MySQL Database
Ensure MySQL is running on port `3306` (or start via `docker compose -f main/docker-compose.yml up -d mysql`).

Create database, apply Prisma migrations, and seed initial data:
```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
npm run db:seed
```

---

## 5. Starting the System

You can run all three services concurrently with a single command from either the **root** folder or the `main/` directory:

```bash
npm run run:all
```

This starts:
- **Frontend Web Portal:** `http://localhost:3000` (Next.js 15)
- **Backend API Service:** `http://localhost:4000` (Express + Prisma)
- **Vision AI Engine:** `http://localhost:8000` (FastAPI + InsightFace)

To run services individually in separate terminals:
```bash
npm run dev:web      # Terminal 1: Web application
npm run dev:api      # Terminal 2: API backend
npm run dev:vision   # Terminal 3: Vision service
```

---

## 6. Pre-Seeded Default Accounts

| Role | Email | Password | Access Area |
|---|---|---|---|
| **Admin / Proctor** | `admin@examguard.local` | `AdminPass123!` | `/admin/dashboard`, `/admin/monitoring`, `/admin/gallery` |
| **Student / Candidate** | `student@examguard.local` | `StudentPass123!` | `/dashboard`, `/enrollment`, `/exams` |
| **Demo Testing Sandbox** | *(No Login Required)* | *(No Auth)* | `/sandbox` (Accessible directly from login page) |

---

## 7. How to Demonstrate & Test

### Demonstration Flow 1: Unauthenticated Testing Sandbox (Zero Setup Required)
1. Open `http://localhost:3000/login` in your browser.
2. Click the amber banner button: **"Open Testing Sandbox →"** (or go directly to `http://localhost:3000/sandbox`).
3. **Step 1: Capture 5 Reference Images:**
   - Enter a candidate name (e.g. `Aditya`).
   - Click **"📸 Capture Image #1"** or use **"⚡ Auto-Burst 5 Images"** to collect 5 sequential frames.
   - Click **"✨ Enroll 5 Images & Start Testing →"**.
   - The backend processes all 5 frames through InsightFace, computes a unit-normalized 512-dim centroid embedding, and stores the profile in an isolated SQLite database (`main/storage/sandbox/sandbox.db`).
4. **Step 2: Live Threat Testing:**
   - The camera stream displays real-time verification against the 5-image centroid.
   - Live similarity meter dynamically indicates matching confidence against the threshold slider.
   - **Test Scenarios to Demonstrate:**
     - **Match:** Stay facing the camera $\rightarrow$ 🟢 Green `MATCH` indicator.
     - **Absence:** Step away or cover camera $\rightarrow$ ⚠️ Amber `NO_FACE` trigger.
     - **Second Person:** Have a colleague enter frame $\rightarrow$ 👥 Orange `MULTIPLE_FACES` alert.
     - **Impersonator:** Have another person sit in front $\rightarrow$ 🔴 Red `MISMATCH` alert.
5. **Database Isolation:** All sandbox data lives in `main/storage/sandbox/sandbox.db`. Production MySQL data remains 100% clean and untouched. Click **"Clear Sandbox DB"** at any time to reset.

### Demonstration Flow 2: Official Full Exam Proctoring
1. Sign in as Admin (`admin@examguard.local` / `AdminPass123!`).
2. Go to `/admin/exams` and create or schedule an exam.
3. Sign in as Student (`student@examguard.local` / `StudentPass123!`).
4. Complete the 5-step biometric enrollment at `/enrollment`.
5. Switch to Admin and approve the profile at `/admin/enrollments`.
6. Student starts the exam at `/exams`: pre-exam face verification gates the session until consecutive matches pass.
7. During the exam, continuous verification checks the webcam every second.
8. Admin monitors all active sessions in real-time at `/admin/monitoring`.

---

## 8. Verification & Diagnostics

Run the automated test and consistency suite to verify environment health:

```bash
npm run test          # Runs all unit and integration test suites
npm run typecheck     # Validates TypeScript types across all workspaces
npm run db:check      # Checks 5 MySQL database consistency invariants
npm run doctor        # System diagnostic health check
```

---

## 9. Preparing to Push to GitHub

The repository `.gitignore` is pre-configured to strictly prevent sensitive files from being pushed. Before committing:

1. **Verify untracked sensitive files are ignored:**
   ```bash
   git status
   ```
   Ensure `.env`, `node_modules/`, `mysql-data/`, `*.onnx`, and `.venv/` are **NOT** listed under Changes to be committed.

2. **Stage and push:**
   ```bash
   git add README.md Setup.md .gitignore package.json main/
   git commit -m "feat: organized repository structure with root README, Setup, and main monorepo"
   git push origin main
   ```

