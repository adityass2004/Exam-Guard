# ExamGuard Vision Service

Stateless Python FastAPI service for facial detection, quality analysis, embedding extraction, and similarity verification.

## Service Principles
- **Stateless & DB-free:** Never touches MySQL or file storage; holds no persistent candidate data.
- **Node-to-Python only:** Binds by default to `127.0.0.1:8000` and is reached only by the Node API with `X-Internal-Key`.
- **Honest reporting:** Surfaces actual model load state and dependency versions in `/v1/diagnostics` without fake readiness.

## Endpoints
- `GET /v1/health` — Unauthenticated liveness check returning `{ status: "OK"|"DEGRADED", modelLoaded: bool }`.
- `GET /v1/diagnostics` — Authenticated diagnostics returning dependency versions, model state, execution providers, and concurrency stats.
- `POST /v1/quality` — Stub returning 501 NOT_IMPLEMENTED (implemented in Prompt 03).
- `POST /v1/embed` — Stub returning 501 NOT_IMPLEMENTED (implemented in Prompt 03).
- `POST /v1/verify` — Stub returning 501 NOT_IMPLEMENTED (implemented in Prompt 05).

## Setup
Create virtual environment and install dependencies:
```powershell
cd services\vision
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip freeze > requirements.lock.txt
```

## Running standalone
```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

