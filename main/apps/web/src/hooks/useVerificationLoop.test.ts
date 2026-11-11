import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVerificationLoop } from './useVerificationLoop';
import { apiClient } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock useTickWorker to capture the onTick handler directly
let registeredTickHandler: (() => void) | null = null;
vi.mock('./useTickWorker', () => ({
  useTickWorker: ({ onTick, enabled }: { onTick: () => void; enabled: boolean }) => {
    if (enabled) {
      registeredTickHandler = onTick;
    } else {
      registeredTickHandler = null;
    }
  },
}));

describe('useVerificationLoop', () => {
  const dummyBlob = new Blob(['dummy-jpeg-data'], { type: 'image/jpeg' });
  const mockCaptureFrame = vi.fn().mockResolvedValue(dummyBlob);

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTickHandler = null;
  });

  it('initializes in standby checking state', () => {
    const { result } = renderHook(() =>
      useVerificationLoop({
        sessionId: 'test-session-123',
        isActive: true,
        captureFrame: mockCaptureFrame,
        isCameraReady: true,
      })
    );

    expect(result.current.statusCode).toBe('CHECKING');
    expect(result.current.isVerifying).toBe(false);
    expect(result.current.cameraLost).toBe(false);
  });

  it('performs verification cycle on tick and updates state with server response', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        outcome: 'MATCH',
        studentMessage: 'Identity verified',
        statusCode: 'IDENTITY_VERIFIED',
        activeWarning: false,
        nextIntervalMs: 2000,
        serverNow: new Date().toISOString(),
      },
    });

    const { result } = renderHook(() =>
      useVerificationLoop({
        sessionId: 'test-session-123',
        isActive: true,
        captureFrame: mockCaptureFrame,
        isCameraReady: true,
      })
    );

    expect(registeredTickHandler).not.toBeNull();

    await act(async () => {
      await registeredTickHandler!();
    });

    expect(mockCaptureFrame).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/student/sessions/test-session-123/verifications',
      expect.any(FormData),
      expect.objectContaining({
        signal: expect.any(Object),
      })
    );

    expect(result.current.statusCode).toBe('IDENTITY_VERIFIED');
    expect(result.current.studentMessage).toBe('Identity verified');
    expect(result.current.activeWarning).toBe(false);
    expect(result.current.verificationCount).toBe(1);
  });

  it('strictly drops tick if a previous verification cycle is already in flight', async () => {
    let resolvePost: ((value: any) => void) | null = null;
    const pendingPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    vi.mocked(apiClient.post).mockReturnValueOnce(pendingPromise as any);

    renderHook(() =>
      useVerificationLoop({
        sessionId: 'test-session-123',
        isActive: true,
        captureFrame: mockCaptureFrame,
        isCameraReady: true,
      })
    );

    // First tick fires and enters inFlight
    let p1: any;
    act(() => {
      p1 = registeredTickHandler!();
    });

    expect(mockCaptureFrame).toHaveBeenCalledTimes(1);

    // Second tick fires while first is in flight
    await act(async () => {
      await registeredTickHandler!();
    });

    // Should NOT have called captureFrame a second time
    expect(mockCaptureFrame).toHaveBeenCalledTimes(1);

    // Resolve first request
    await act(async () => {
      resolvePost!({
        data: {
          outcome: 'MATCH',
          studentMessage: 'Identity verified',
          statusCode: 'IDENTITY_VERIFIED',
          activeWarning: false,
          serverNow: new Date().toISOString(),
        },
      });
      await p1;
    });
  });

  it('dispatches client event when camera stream error occurs', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { logged: true } });

    const { result } = renderHook(() =>
      useVerificationLoop({
        sessionId: 'test-session-123',
        isActive: true,
        captureFrame: mockCaptureFrame,
        isCameraReady: false,
        cameraError: {
          name: 'DEVICE_IN_USE',
          message: 'Camera is busy',
          userInstruction: 'Close other webcam apps',
        },
      })
    );

    expect(result.current.cameraLost).toBe(true);
    expect(result.current.statusCode).toBe('CAMERA_PROBLEM');
    expect(result.current.activeWarning).toBe(true);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/student/sessions/test-session-123/client-events',
      expect.objectContaining({
        type: 'CAMERA_ERROR',
        errorCode: 'CAMERA_TRACK_ENDED',
      })
    );
  });
});
