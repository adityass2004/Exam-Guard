import crypto from 'node:crypto';

export function generateUuid(): string {
  return crypto.randomUUID();
}

export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateIncidentCode(date = new Date()): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `INC-${yyyymmdd}-${rand}`;
}

