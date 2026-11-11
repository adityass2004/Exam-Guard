# ExamGuard — Architecture

## 1. Component view

```mermaid
flowchart LR
  subgraph Browser
    S[Student UI<br/>Next.js]
    A[Admin UI<br/>Next.js]
    CAM[(Webcam<br/>MediaDevices API)]
  end
  subgraph Node["api — Node.js + TypeScript (port 4000)"]
    REST[REST /api/v1]
    WS[WebSocket /ws]
    ENG[Verification orchestrator<br/>+ Trigger engine]
    JOBS[Jobs: watchdog, expiry, retention]
    PR[Prisma ORM]
  end
  subgraph Py["vision — FastAPI (127.0.0.1:8000)"]
    DET[Detect / quality / pose<br/>InsightFace + MediaPipe + OpenCV]
    EMB[Embedding + similarity<br/>ArcFace-class via ONNX Runtime]
  end
  DB[(MySQL)]
  FS[(storage/<br/>encrypted images<br/>and evidence)]

  CAM --> S
  S -- "multipart frame, JSON" --> REST
  A -- "JSON, authorised image streams" --> REST
  A <-- "live events" --> WS
  REST --> ENG
  ENG -- "HTTP, X-Internal-Key" --> DET
  DET --> EMB
  ENG --> PR --> DB
  ENG --> FS
  JOBS --> PR
  ENG --> WS
```

Only `api` reads or writes MySQL and `storage/`. `vision` is stateless. The browser never calls `vision`.

## 2. Continuous verification sequence

```mermaid
sequenceDiagram
  participant B as Browser (loop)
  participant N as Node API
  participant P as Python vision
  participant D as MySQL
  participant F as storage/
  participant W as Admin (WebSocket)

  loop every interval_ms, never overlapping
    B->>N: POST /sessions/:id/verifications (frame)
    N->>N: auth, CSRF, session lock, load snapshot, decrypt reference
    N->>P: POST /v1/verify (frame, reference)
    P-->>N: faceCount, quality, similarityRaw/Pct (no verdict)
    N->>N: apply threshold + trigger state machine
    alt new incident needed
      N->>F: write ONE encrypted evidence image
    end
    N->>D: one transaction: log, counters, incident, evidence row
    N-->>B: outcome + friendly message (no score)
    N-->>W: session.updated / incident.opened|updated
  end
```

## 3. Trigger / incident state machine (per session, per trigger type)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Counting: failure observed
  Counting --> Idle: MATCH resets counter
  Counting --> Active: counter >= limit<br/>(new incident, ONE evidence image)
  Active --> Active: more failures<br/>(update incident, NO new image)
  Active --> Recovered: recovery_match_count consecutive MATCH
  Recovered --> Idle: active_dedupe_key = NULL
```

## 4. Enrollment flow

```mermaid
flowchart TD
  C[Consent recorded] --> S[Start DRAFT profile]
  S --> L[Live preview-check ~ every 700 ms<br/>quality + pose hints, nothing stored]
  L --> K{Acceptable and<br/>pose matches angle?}
  K -- no --> L
  K -- yes --> CAP[Capture: validate again server-side,<br/>store encrypted image + encrypted embedding]
  CAP --> N{5 angles done?<br/>FRONT LEFT RIGHT UP DOWN}
  N -- no --> L
  N -- yes --> F[Finalize: consistency check, centroid]
  F --> R{Approval required?}
  R -- yes --> P[PENDING_APPROVAL → admin approves]
  R -- no --> AP[APPROVED]
  P --> AP
```

## 5. Storage layout

```
storage/
  enrollment/<aa>/<uuid>.bin      AES-256-GCM encrypted JPEG (IV/tag in MySQL)
  evidence/<aa>/<uuid>.bin        same format; exactly one per incident
  tmp/                            transient; cleaned on startup
```

`<aa>` = first two characters of the UUID. Paths are stored relative to `STORAGE_ROOT`. Nothing in `storage/` is ever served statically.

## 6. Process model on Windows (local)

`npm run dev` → `concurrently` starts: `next dev` (web), `tsx watch` or `nodemon` (api), `uvicorn` from `services/vision/.venv` (vision). MySQL runs as a Windows service (or Docker). `scripts/doctor.ps1` verifies all four.
