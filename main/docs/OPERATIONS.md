# ExamGuard Operations & Maintenance Guide

> **Document Version:** 1.0.0  
> **Phase:** 10 of 10 · Project: **ExamGuard**  

---

## 1. Stack Startup & Local Execution

### Standard Single-Command Startup
To start the entire ExamGuard platform (Web, API, and Vision service simultaneously):
```powershell
npm run run:all
```
This runs:
- **Next.js Web Frontend:** `http://localhost:3000` (Port 3000)
- **Express Backend API:** `http://localhost:4000` (Port 4000)
- **FastAPI Computer Vision Service:** `http://localhost:8000` (Port 8000)

### Graceful Termination
Press `Ctrl + C` in the terminal to terminate all services simultaneously.

---

## 2. Backup & Disaster Recovery

> [!CAUTION]
> **Atomic Backup Requirement:**  
> The MySQL database and the `storage/` directory **must always be backed up together**.  
> If database records point to image files that are missing from disk (or vice versa), database consistency checks will fail (`MISSING_EVIDENCE_FILE` / orphan files).

### 2.1 Backup Procedure
1. **Dump MySQL Database:**
   ```powershell
   mysqldump -u root -p examguard > examguard_backup_$(Get-Date -Format "yyyyMMdd_HHmmss").sql
   ```
2. **Archive Storage Directory:**
   ```powershell
   Compress-Archive -Path ./storage -DestinationPath storage_backup_$(Get-Date -Format "yyyyMMdd_HHmmss").zip
   ```
3. **Secure Environment & Keys:**
   Securely store the active `.env` file containing `IMAGE_ENCRYPTION_KEY`, `EMBEDDING_ENCRYPTION_KEY`, and `ARGON2_SECRET`. Without these keys, backed up data **cannot be decrypted**.

### 2.2 Restore Procedure
1. Restore database tables:
   ```powershell
   mysql -u root -p examguard < examguard_backup_xxxx.sql
   ```
2. Extract image storage archive:
   ```powershell
   Expand-Archive -Path storage_backup_xxxx.zip -DestinationPath ./storage -Force
   ```
3. Verify consistency after restore:
   ```powershell
   npm run db:check
   ```

---

## 3. Cryptographic Key Management & Rotation

### 3.1 Encryption at Rest Overview
- **Images:** AES-256-GCM using `IMAGE_ENCRYPTION_KEY` (tagged with `key_version`).
- **Embeddings:** AES-256-GCM using `EMBEDDING_ENCRYPTION_KEY` (tagged with `key_version`).
- **Passwords:** Argon2id with random salt and pepper.

### 3.2 Key Rotation Procedure
1. Each record in `face_embeddings` and `face_enrollment_images` stores `enc_key_version`.
2. To rotate keys without service interruption:
   - Introduce `NEW_KEY` with version increment $V+1$.
   - Service reads existing records using $V$ and encrypts new writes using $V+1$.
   - Background migration decrypts with $V$ and re-encrypts with $V+1$.

---

## 4. Retention Policy & Batch Purge

### 4.1 Automated Scheduled Purge
- Retention is managed by `apps/api/src/jobs/retention.ts`.
- Automatically executes daily at midnight.
- Configurable retention periods via Admin UI (`/admin/settings/system`):
  - Enrollment images of revoked/superseded profiles (default: 90 days).
  - Incident evidence of reviewed incidents (default: 180 days).
  - Verification logs (default: 365 days).
  - Audit logs (default: 730 days).

### 4.2 Manual Purge & Dry-Run
Administrators can preview or trigger purges manually via API or Admin UI:
```bash
POST /api/v1/admin/retention/run
Body: { "dryRun": true }
```
A dry-run returns the exact row and file counts eligible for deletion without deleting any data.

---

## 5. Log Files & Monitoring

- **API Logs:** Serialized JSON via Pino with automatic redaction of passwords, session tokens, base64 images, and biometric vectors.
- **Vision Diagnostics:** Available at `GET http://localhost:8000/v1/diagnostics` (requires `X-Internal-Key` header).
- **Health Checks:**
  - API Liveness: `GET http://localhost:4000/api/v1/health`
  - System Readiness: `GET http://localhost:4000/api/v1/system/status`

---

## 6. Resetting Demo & Test Data

To reset the database to a fresh, seeded development state:
```powershell
npm run db:reset
npm run db:check
```
Clean seed accounts will be created:
- Admin: `admin@srmist.edu.in` / `00000000`
- Student: `as6769@srmist.edu.in` / `00000000`

