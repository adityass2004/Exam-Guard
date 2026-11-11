import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { SettingsDiff } from './SettingsDiff';
import { VerificationSettingsDto, CreateVerificationSettingsDto } from '@examguard/shared';

describe('SettingsDiff', () => {
  const current: VerificationSettingsDto = {
    id: 's-123',
    version: 1,
    isActive: true,
    name: 'Default Profile',
    thresholdPct: 75.0,
    intervalMs: 1500,
    consecutiveMismatchLimit: 3,
    missingFaceLimit: 3,
    multipleFacesPolicy: 'ALERT_IMMEDIATELY',
    multipleFacesConsecutiveLimit: 2,
    cameraFailurePolicy: 'ALERT_IMMEDIATELY',
    cameraGraceSeconds: 10,
    serviceFailureLimit: 3,
    repeatedFailureLimit: 5,
    recoveryMatchCount: 3,
    startupGraceSeconds: 15,
    preExamRequiredMatches: 2,
    minFaceQuality: {
      minBlur: 10,
      minBrightness: 40,
      maxBrightness: 250,
      minFaceSizeRatio: 0.1,
      minDetectorScore: 0.6,
    },
    severityRules: {},
    changeNote: 'Initial',
    createdBy: { id: 'u-1', fullName: 'Admin', email: 'admin@test.com' },
    createdAt: new Date().toISOString(),
  };

  it('renders "no modifications" when proposed matches current', () => {
    const proposed: CreateVerificationSettingsDto = {
      name: 'Default Profile',
      thresholdPct: 75.0,
      intervalMs: 1500,
      consecutiveMismatchLimit: 3,
      missingFaceLimit: 3,
      multipleFacesPolicy: 'ALERT_IMMEDIATELY',
      multipleFacesConsecutiveLimit: 2,
      cameraFailurePolicy: 'ALERT_IMMEDIATELY',
      cameraGraceSeconds: 10,
      serviceFailureLimit: 3,
      repeatedFailureLimit: 5,
      recoveryMatchCount: 3,
      startupGraceSeconds: 15,
      preExamRequiredMatches: 2,
      minFaceQuality: {
        minBlur: 10,
        minBrightness: 40,
        maxBrightness: 250,
        minFaceSizeRatio: 0.1,
        minDetectorScore: 0.6,
      },
      severityRules: {},
      changeNote: 'No change',
    };

    render(<SettingsDiff current={current} proposed={proposed} />);
    expect(screen.getByText(/No parameter modifications detected/)).toBeDefined();
  });

  it('renders differences when parameters change', () => {
    const proposed: CreateVerificationSettingsDto = {
      name: 'High Security Profile',
      thresholdPct: 82.5,
      intervalMs: 2000,
      consecutiveMismatchLimit: 2,
      missingFaceLimit: 3,
      multipleFacesPolicy: 'ALERT_IMMEDIATELY',
      multipleFacesConsecutiveLimit: 2,
      cameraFailurePolicy: 'ALERT_IMMEDIATELY',
      cameraGraceSeconds: 10,
      serviceFailureLimit: 3,
      repeatedFailureLimit: 5,
      recoveryMatchCount: 3,
      startupGraceSeconds: 15,
      preExamRequiredMatches: 2,
      minFaceQuality: {
        minBlur: 10,
        minBrightness: 40,
        maxBrightness: 250,
        minFaceSizeRatio: 0.1,
        minDetectorScore: 0.6,
      },
      severityRules: {},
      changeNote: 'Tightened threshold',
    };

    render(<SettingsDiff current={current} proposed={proposed} />);
    expect(screen.getByText(/Parameter Differences Preview/)).toBeDefined();
    expect(screen.getByText('Matching Threshold')).toBeDefined();
    expect(screen.getByText('75.0%')).toBeDefined();
    expect(screen.getByText('82.5%')).toBeDefined();
    expect(screen.getByText('Verification Interval')).toBeDefined();
    expect(screen.getByText('1500 ms')).toBeDefined();
    expect(screen.getByText('2000 ms')).toBeDefined();
  });
});
