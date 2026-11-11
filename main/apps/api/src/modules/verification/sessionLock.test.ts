import { describe, it, expect, beforeEach } from 'vitest';
import { sessionLockManager, withSessionLock } from './sessionLock.js';

describe('SessionLockManager', () => {
  beforeEach(() => {
    sessionLockManager.clear();
  });

  it('acquires and releases session lock', () => {
    expect(sessionLockManager.acquire('sess-1')).toBe(true);
    expect(sessionLockManager.acquire('sess-1')).toBe(false);
    sessionLockManager.release('sess-1');
    expect(sessionLockManager.acquire('sess-1')).toBe(true);
  });

  it('rejects concurrent executions with 409 VERIFICATION_IN_PROGRESS', async () => {
    let resolveFirst: (() => void) | null = null;
    const firstPromise = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const execution1 = withSessionLock('sess-2', async () => {
      await firstPromise;
      return 'done1';
    });

    // Attempt second execution while first is in flight
    await expect(
      withSessionLock('sess-2', async () => 'done2')
    ).rejects.toThrow('A verification request is already in progress');

    resolveFirst!();
    const res1 = await execution1;
    expect(res1).toBe('done1');

    // After first finishes, a new lock acquisition succeeds
    const execution3 = await withSessionLock('sess-2', async () => 'done3');
    expect(execution3).toBe('done3');
  });

  it('always releases lock even when guarded function throws', async () => {
    await expect(
      withSessionLock('sess-err', async () => {
        throw new Error('Explosion');
      })
    ).rejects.toThrow('Explosion');

    expect(sessionLockManager.isLocked('sess-err')).toBe(false);
    // Next acquisition works
    expect(sessionLockManager.acquire('sess-err')).toBe(true);
  });
});

