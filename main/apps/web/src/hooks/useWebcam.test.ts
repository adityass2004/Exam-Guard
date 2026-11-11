import { describe, expect, it } from 'vitest';
import { mapCameraError } from './useWebcam';

describe('useWebcam Camera Error Mapping', () => {
  it('maps NotAllowedError to PERMISSION_DENIED with user instruction', () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';

    const result = mapCameraError(error);
    expect(result.name).toBe('PERMISSION_DENIED');
    expect(result.userInstruction).toContain('Camera access was denied');
  });

  it('maps NotFoundError to NO_DEVICE_FOUND with user instruction', () => {
    const error = new Error('Requested device not found');
    error.name = 'NotFoundError';

    const result = mapCameraError(error);
    expect(result.name).toBe('NO_DEVICE_FOUND');
    expect(result.userInstruction).toContain('No camera was found');
  });

  it('maps NotReadableError to DEVICE_IN_USE with app conflict instruction', () => {
    const error = new Error('Device in use');
    error.name = 'NotReadableError';

    const result = mapCameraError(error);
    expect(result.name).toBe('DEVICE_IN_USE');
    expect(result.userInstruction).toContain('in use by another application');
  });

  it('maps OverconstrainedError to CONSTRAINTS_NOT_SATISFIED', () => {
    const error = new Error('Overconstrained');
    error.name = 'OverconstrainedError';

    const result = mapCameraError(error);
    expect(result.name).toBe('CONSTRAINTS_NOT_SATISFIED');
  });
});
