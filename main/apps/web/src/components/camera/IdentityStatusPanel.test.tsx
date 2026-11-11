import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { IdentityStatusPanel } from './IdentityStatusPanel';

describe('IdentityStatusPanel', () => {
  it('renders standby state when isActive is false', () => {
    render(<IdentityStatusPanel isActive={false} />);

    expect(screen.getByText('Identity Monitor')).toBeDefined();
    expect(screen.getByText('Standby')).toBeDefined();
    expect(
      screen.getByText('Continuous identity verification starts in the next phase')
    ).toBeDefined();
  });

  it('renders active VERIFIED state with polite live region', () => {
    render(
      <IdentityStatusPanel
        isActive={true}
        statusCode="IDENTITY_VERIFIED"
        studentMessage="Identity verified successfully"
        secondsSinceLastCheck={5}
      />
    );

    expect(screen.getByText('Identity Monitor')).toBeDefined();
    expect(screen.getByText('Verified')).toBeDefined();
    expect(screen.getByText('Identity verified successfully')).toBeDefined();
    expect(screen.getByText('Checked 5s ago')).toBeDefined();

    const liveRegion = screen.getByRole('status');
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
  });

  it('renders active FACE_NOT_DETECTED warning state', async () => {
    render(
      <IdentityStatusPanel
        isActive={true}
        statusCode="FACE_NOT_DETECTED"
        studentMessage="Please look directly at your camera"
        activeWarning={true}
      />
    );

    expect(screen.getByText('Identity Monitor')).toBeDefined();
    // Wait for or directly observe status message
    expect(await screen.findByText('Please look directly at your camera')).toBeDefined();
    expect(screen.getByText('Face Not Detected')).toBeDefined();
  });

  it('renders CAMERA_OFFLINE state when cameraLost is true', () => {
    render(
      <IdentityStatusPanel
        isActive={true}
        statusCode="CHECKING"
        cameraLost={true}
        studentMessage="Webcam feed lost"
      />
    );

    expect(screen.getByText('Camera Offline')).toBeDefined();
    expect(screen.getByText('Webcam feed lost')).toBeDefined();
  });

  it('displays Syncing indicator when isVerifying is active', () => {
    render(
      <IdentityStatusPanel
        isActive={true}
        statusCode="IDENTITY_VERIFIED"
        isVerifying={true}
        secondsSinceLastCheck={0}
      />
    );

    expect(screen.getByText('Syncing...')).toBeDefined();
    expect(screen.getByText('Just verified')).toBeDefined();
  });
});
