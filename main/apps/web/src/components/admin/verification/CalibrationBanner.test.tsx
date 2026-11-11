import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { CalibrationBanner } from './CalibrationBanner';

describe('CalibrationBanner', () => {
  it('renders PROVISIONAL badge and Buffalo_L notice', () => {
    render(<CalibrationBanner thresholdPct={75.0} />);

    expect(screen.getByText('PROVISIONAL')).toBeDefined();
    expect(screen.getByText(/InsightFace Buffalo_L/)).toBeDefined();
    expect(screen.getByText('75.0%')).toBeDefined();
    expect(screen.getByText(/Notice on Liveness & Spoofing Limitations/)).toBeDefined();
  });
});

