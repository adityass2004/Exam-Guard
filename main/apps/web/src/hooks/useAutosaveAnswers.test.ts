import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as apiClientModule from '../lib/api-client';
import { useAutosaveAnswers } from './useAutosaveAnswers';

vi.mock('../lib/api-client', () => ({
  apiClient: {
    put: vi.fn(),
  },
}));

describe('useAutosaveAnswers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes answers and sets status to saved', () => {
    const { result } = renderHook(() => useAutosaveAnswers('sess-123'));

    act(() => {
      result.current.initAnswers({ 'q-1': 'opt-a', 'q-2': 'opt-b' });
    });

    expect(result.current.answers).toEqual({ 'q-1': 'opt-a', 'q-2': 'opt-b' });
    expect(result.current.status).toBe('saved');
  });

  it('optimistically updates answers and calls apiClient.put', async () => {
    const putMock = vi.mocked(apiClientModule.apiClient.put).mockResolvedValue({
      status: 200,
      data: { success: true },
    } as any);

    const { result } = renderHook(() => useAutosaveAnswers('sess-123'));

    await act(async () => {
      await result.current.saveOption('q-1', 'opt-x');
    });

    expect(result.current.answers['q-1']).toBe('opt-x');
    expect(putMock).toHaveBeenCalledWith('/student/sessions/sess-123/answers/q-1', {
      optionId: 'opt-x',
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeTruthy();
  });

  it('handles network failure and sets error status', async () => {
    vi.mocked(apiClientModule.apiClient.put).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAutosaveAnswers('sess-123'));

    await act(async () => {
      await result.current.saveOption('q-1', 'opt-fail');
    });

    expect(result.current.answers['q-1']).toBe('opt-fail');
    expect(result.current.status).toBe('error');
  });
});

