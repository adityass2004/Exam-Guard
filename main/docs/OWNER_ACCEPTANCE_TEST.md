# ExamGuard Owner Acceptance Test Protocol & Manual Verification Guide

> **Document Version:** 1.0.0  
> **Phase:** 10 of 10 · Project: **ExamGuard**  
> **Environment:** Windows 11 · Physical Webcam · Real Human Participants  

---

## 1. Overview & Purpose

This document provides the definitive, step-by-step verification protocol for the system owner to validate ExamGuard on physical hardware using a real camera, live biometric capture, and controlled identity switching.

> [!IMPORTANT]
> **Privacy & Image Safety:**  
> Never commit participant face captures, screenshots containing identifiable faces, or raw video clips to git. Keep all recorded logs and evidence files private.

---

## 2. Test Prerequisites & Credentials

### Stack Startup
Run the single-command stack launcher:
```powershell
npm run run:all
```
Verify the ports in your browser:
- **Next.js Web Portal:** `http://localhost:3000`
- **Express Backend API:** `http://localhost:4000/api/v1/health`
- **FastAPI Vision Service:** `http://localhost:8000/health`

### Initial Accounts
- **Admin Portal:** `http://localhost:3000/admin/login`
  - Email: `admin@srmist.edu.in`
  - Password: `00000000`
- **Student Portal:** `http://localhost:3000/student/login`
  - Email: `as6769@srmist.edu.in`
  - Password: `00000000`

---

## 3. Step-by-Step Test Scenarios

### Scenario 1: Multi-Angle Face Enrollment (Candidate A)
1. Log in to `http://localhost:3000/student/login` using `as6769@srmist.edu.in` / `00000000`.
2. Accept the **Biometric Consent Disclaimer** (Policy Version 1.0).
3. Allow camera permissions in the browser.
4. Capture all 5 required angles in sequence:
   - **Front:** Look directly at the camera.
   - **Left:** Turn head ~30° to your left.
   - **Right:** Turn head ~30° to your right.
   - **Up:** Tilt head ~20° upward.
   - **Down:** Tilt head ~20° downward.
5. Submit enrollment. Verify the status changes to `PENDING_APPROVAL`.

### Scenario 2: Admin Review & Enrollment Approval
1. Log in to `http://localhost:3000/admin/login` using `admin@srmist.edu.in` / `00000000`.
2. Navigate to **Face Gallery** (`/admin/gallery`).
3. Click on the student card for `as6769@srmist.edu.in`.
4. Inspect the 5 captured angle images (served encrypted and decrypted on-the-fly).
5. Click **Approve Enrollment**. Verify status transitions to `APPROVED`.

### Scenario 3: Pre-Exam Verification & Exam Launch
1. Switch back to the student browser session.
2. Navigate to **Exams** (`/student/exams`) and select the Demo Exam.
3. Complete **Pre-Exam Verification**: hold your face steady for 2 consecutive matching frames.
4. Confirm launch. Verify the exam interface loads with question timer and live verification indicator.

### Scenario 4: Genuine Continuous Monitoring
1. Complete questions while facing the screen normally for 2–3 minutes.
2. In the Admin Portal under **Live Monitoring** (`/admin/monitoring`), observe:
   - Live session row with increasing `totalAttempts` and `matches`.
   - Incident indicator remains green (`NORMAL`).

### Scenario 5: Identity Switch & Incident Escalation (Person B)
1. Have **Person B** replace Candidate A in front of the camera.
2. Within 3 consecutive mismatch frames (~4.5 to 6 seconds):
   - Candidate sees non-disruptive gentle guidance banner ("Please look directly at camera").
   - In Admin Portal: **CRITICAL Alert** opens (`IDENTITY_MISMATCH`).
   - Incident evidence image is captured.
   - Further frames increment `occurrenceCount` without capturing additional images (1 evidence file per incident invariant).

### Scenario 6: Recovery & Second Incident
1. Candidate A returns to the camera.
2. After 3 consecutive matches, the incident transitions to `RECOVERED`.
3. Person B sits back in front of camera.
4. A **second incident** opens with a unique incident code and a distinct second evidence capture.

### Scenario 7: No-Face & Multiple-Faces Testing
1. **No Face:** Move completely out of camera view for > 5 seconds.
   - Verify `NO_FACE` incident opens; verify it is **never** flagged as an identity mismatch.
2. **Multiple Faces:** Have Person B stand next to Candidate A.
   - Verify `MULTIPLE_FACES` trigger fires according to configured policy.

### Scenario 8: Known Presentation Attack / Photo Replay Limitation
1. Hold a printed photograph or smartphone screen displaying Candidate A's photo in front of the camera.
2. **Expected Honest Result:** InsightFace Buffalo_L open-source 2D feature extractor may match the photo as a genuine match.
3. Note in the results table that **2D photograph spoofing is a disclosed system limitation** pending active 3D depth hardware integration.

---

## 4. Owner Verification Results Table

| Step | Test Description | Expected Behavior | Observed Result | Pass / Fail |
|---|---|---|---|---|
| **1.1** | Camera Permission Deny | Clean error prompt with instructions to enable | | |
| **1.2** | 5-Angle Enrollment | Real-time pose window validation & submission | | |
| **2.1** | Admin Image Decryption | Images stream cleanly with audit log entry | | |
| **2.2** | Admin Approval | Profile approved, student cache updated | | |
| **3.1** | Pre-Exam Gate | Requires 2 consecutive matches before start | | |
| **4.1** | Continuous Verification | Real-time match increments every 1.5s | | |
| **5.1** | Identity Switch | Critical alert opens within 3 frames | | |
| **5.2** | Deduplication Invariant | Exactly 1 evidence image captured | | |
| **6.1** | Recovery & Re-trigger | Incident recovers; 2nd swap creates 2nd incident | | |
| **7.1** | No Face Scenario | `NO_FACE` trigger, never `IDENTITY_MISMATCH` | | |
| **7.2** | Multiple Faces | `MULTIPLE_FACES` trigger per policy | | |
| **8.1** | Phone Photo Replay | Matches photograph (documented limitation) | | |

