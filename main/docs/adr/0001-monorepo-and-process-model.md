# ADR 0001: Monorepo Architecture and Multi-Process Boundary Model

## Status
Accepted

## Context
ExamGuard is a continuous facial identity verification system for online exams with four primary runtime subsystems:
1. Student & Administrator Web Application (Next.js App Router)
2. Central API, Database ORM & Orchestration (Node.js, Express, Prisma)
3. Face Recognition & Vision Engine (Python, FastAPI, InsightFace, ArcFace, ONNX Runtime)
4. Persistent Database (MySQL 8.x)

To guarantee biometric privacy, architectural clarity, and development ergonomics on Windows 10/11, we need to formalize:
- Workspace organization (npm workspaces vs polyrepo)
- Process boundaries and network topology
- Security and data flow constraints between services

## Decision
1. **Monorepo Structure:** We adopt an `npm workspaces` monorepo containing:
   - `apps/web`: Next.js frontend (port 3000)
   - `apps/api`: Node.js Express backend (port 4000)
   - `packages/shared`: Shared TypeScript types, enums, DTOs, and constants
   - `services/vision`: Standalone Python FastAPI microservice (port 8000, 127.0.0.1) with its own dedicated Python virtual environment (`.venv`)
   - `storage/`: Local private encrypted file store (git-ignored)
   - `scripts/`: PowerShell automation (`setup.ps1`, `dev.ps1`, `doctor.ps1`, `db-reset.ps1`)

2. **Strict Communication Boundaries:**
   - The browser never communicates with Python directly. All browser API requests target `/api/*` and are proxied same-origin via Next.js rewrites to the Node API.
   - The Python service never connects to MySQL or external databases. It is strictly stateless and DB-free.
   - Only the Node API accesses MySQL (exclusively via Prisma) and the local encrypted file store (`storage/`).
   - Node API communicates with the Python service over local HTTP (`http://127.0.0.1:8000`) protected by a shared internal secret header `X-Internal-Key`.
   - WebSockets connect directly to `ws://localhost:4000/ws` for administrative monitoring (bypassing Next.js rewrites).

3. **Concurrency and Orchestration:**
   - Root `npm run dev` coordinates web, api, and vision processes simultaneously using `concurrently` with colored prefixing and graceful exit handling on Windows.

## Consequences
- Single repository simplifies coordinated changes across contracts, enums, and API envelopes.
- Clear separation of concerns guarantees that Python code cannot inadvertently bypass authentication or database integrity rules.
- Biometric embeddings and private evidence images stay encrypted in MySQL/storage and are only decrypted in Node.js memory when needed.

