import { AppError } from '../../lib/errors.js';

class SessionLockManager {
  private locks: Set<string> = new Set();

  acquire(sessionId: string): boolean {
    if (this.locks.has(sessionId)) {
      return false;
    }
    this.locks.add(sessionId);
    return true;
  }

  release(sessionId: string): void {
    this.locks.delete(sessionId);
  }

  isLocked(sessionId: string): boolean {
    return this.locks.has(sessionId);
  }

  clear(): void {
    this.locks.clear();
  }
}

export const sessionLockManager = new SessionLockManager();

export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const acquired = sessionLockManager.acquire(sessionId);
  if (!acquired) {
    throw new AppError(
      'VERIFICATION_IN_PROGRESS',
      409,
      'A verification request is already in progress for this session'
    );
  }

  try {
    return await fn();
  } finally {
    sessionLockManager.release(sessionId);
  }
}
