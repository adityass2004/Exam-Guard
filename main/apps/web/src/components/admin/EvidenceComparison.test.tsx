import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { EvidenceComparison } from './EvidenceComparison';

describe('EvidenceComparison Component', () => {
  const dummyRegistered = [
    { id: 'img-1', angle: 'FRONT', url: '/images/enrollment/front.jpg', width: 160, height: 120 },
    { id: 'img-2', angle: 'LEFT', url: '/images/enrollment/left.jpg', width: 160, height: 120 },
    { id: 'img-3', angle: 'RIGHT', url: '/images/enrollment/right.jpg', width: 160, height: 120 },
  ];

  it('renders side-by-side evidence image and registered candidate photo', () => {
    render(
      <EvidenceComparison
        triggerId="trig-123"
        incidentCode="INC-20261111-TEST01"
        evidenceUrl="/api/v1/admin/images/evidence/trig-123"
        registeredImages={dummyRegistered}
        firstSimilarityPct={42.5}
        worstSimilarityPct={38.1}
        thresholdPct={75.0}
      />
    );

    expect(screen.getByText('Side-by-Side Biometric Comparison')).toBeDefined();
    expect(screen.getByText('INC-20261111-TEST01')).toBeDefined();
    expect(screen.getByText('42.5%')).toBeDefined();
    expect(screen.getByText('38.1%')).toBeDefined();
    expect(screen.getByText(/75%/)).toBeDefined();

    // Verify angle selector tabs
    expect(screen.getByText('FRONT')).toBeDefined();
    expect(screen.getByText('LEFT')).toBeDefined();
    expect(screen.getByText('RIGHT')).toBeDefined();
  });

  it('toggles horizontal mirror flip class on evidence image', () => {
    render(
      <EvidenceComparison
        triggerId="trig-123"
        incidentCode="INC-20261111-TEST01"
        evidenceUrl="/api/v1/admin/images/evidence/trig-123"
        registeredImages={dummyRegistered}
      />
    );

    const mirrorBtn = screen.getByText('Mirror Flip');
    const evidenceImg = screen.getByAltText(/Evidence frame for incident/);

    expect(evidenceImg.className).not.toContain('scale-x-[-1]');

    // Click to mirror
    fireEvent.click(mirrorBtn);
    expect(evidenceImg.className).toContain('scale-x-[-1]');

    // Click again to unmirror
    fireEvent.click(screen.getByText('Mirrored'));
    expect(evidenceImg.className).not.toContain('scale-x-[-1]');
  });

  it('switches registered photo angle when angle tab is clicked', () => {
    render(
      <EvidenceComparison
        triggerId="trig-123"
        incidentCode="INC-20261111-TEST01"
        registeredImages={dummyRegistered}
      />
    );

    expect(screen.getByText('ANGLE: FRONT')).toBeDefined();

    const leftBtn = screen.getByText('LEFT');
    fireEvent.click(leftBtn);

    expect(screen.getByText('ANGLE: LEFT')).toBeDefined();
  });
});
