import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

export interface SandboxFace {
  id: string;
  label: string;
  embedding: string;
  thumbnail?: string | null;
  quality?: string | null;
  createdAt: string;
}

export interface SandboxVerificationLog {
  id: string;
  faceId?: string | null;
  outcome: string;
  similarityPct?: number | null;
  similarityRaw?: number | null;
  thresholdPct: number;
  faceCount: number;
  latencyMs: number;
  qualityJson?: string | null;
  createdAt: string;
}

export class SandboxDatabase {
  private db: DatabaseSync;

  constructor() {
    const dbDir = path.resolve(process.cwd(), 'storage', 'sandbox');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'sandbox.db');
    this.db = new DatabaseSync(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sandbox_faces (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        embedding TEXT NOT NULL,
        thumbnail TEXT,
        quality TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sandbox_verifications (
        id TEXT PRIMARY KEY,
        face_id TEXT,
        outcome TEXT NOT NULL,
        similarity_pct REAL,
        similarity_raw REAL,
        threshold_pct REAL NOT NULL,
        face_count INTEGER NOT NULL,
        latency_ms REAL NOT NULL,
        quality_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  public saveFace(face: SandboxFace): void {
    const stmt = this.db.prepare(`
      INSERT INTO sandbox_faces (id, label, embedding, thumbnail, quality, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      face.id,
      face.label,
      face.embedding,
      face.thumbnail ?? null,
      face.quality ?? null,
      face.createdAt
    );
  }

  public getFaces(): SandboxFace[] {
    const stmt = this.db.prepare(`
      SELECT id, label, embedding, thumbnail, quality, created_at as createdAt
      FROM sandbox_faces
      ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      embedding: String(r.embedding),
      thumbnail: r.thumbnail ? String(r.thumbnail) : null,
      quality: r.quality ? String(r.quality) : null,
      createdAt: String(r.createdAt),
    }));
  }

  public getFaceById(id: string): SandboxFace | null {
    const stmt = this.db.prepare(`
      SELECT id, label, embedding, thumbnail, quality, created_at as createdAt
      FROM sandbox_faces
      WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: String(row.id),
      label: String(row.label),
      embedding: String(row.embedding),
      thumbnail: row.thumbnail ? String(row.thumbnail) : null,
      quality: row.quality ? String(row.quality) : null,
      createdAt: String(row.createdAt),
    };
  }

  public deleteFace(id: string): void {
    this.db.prepare('DELETE FROM sandbox_faces WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM sandbox_verifications WHERE face_id = ?').run(id);
  }

  public saveLog(log: SandboxVerificationLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO sandbox_verifications (
        id, face_id, outcome, similarity_pct, similarity_raw, threshold_pct, face_count, latency_ms, quality_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.id,
      log.faceId ?? null,
      log.outcome,
      log.similarityPct ?? null,
      log.similarityRaw ?? null,
      log.thresholdPct,
      log.faceCount,
      log.latencyMs,
      log.qualityJson ?? null,
      log.createdAt
    );
  }

  public getRecentLogs(limit = 10): SandboxVerificationLog[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        face_id as faceId,
        outcome,
        similarity_pct as similarityPct,
        similarity_raw as similarityRaw,
        threshold_pct as thresholdPct,
        face_count as faceCount,
        latency_ms as latencyMs,
        quality_json as qualityJson,
        created_at as createdAt
      FROM sandbox_verifications
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      faceId: r.faceId ? String(r.faceId) : null,
      outcome: String(r.outcome),
      similarityPct: r.similarityPct != null ? Number(r.similarityPct) : null,
      similarityRaw: r.similarityRaw != null ? Number(r.similarityRaw) : null,
      thresholdPct: Number(r.thresholdPct),
      faceCount: Number(r.faceCount),
      latencyMs: Number(r.latencyMs),
      qualityJson: r.qualityJson ? String(r.qualityJson) : null,
      createdAt: String(r.createdAt),
    }));
  }

  public clearAll(): void {
    this.db.exec(`
      DELETE FROM sandbox_faces;
      DELETE FROM sandbox_verifications;
    `);
  }
}

export const sandboxDb = new SandboxDatabase();

