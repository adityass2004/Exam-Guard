import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReviewDialog } from './ReviewDialog';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

describe('ReviewDialog Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders disposition options and neutral wording banner', () => {
    render(
      <ReviewDialog
        incidentId="inc-123"
        incidentCode="INC-20261111-TEST01"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Submit Final Incident Disposition')).toBeDefined();
    expect(screen.getByText(/INC-20261111-TEST01/)).toBeDefined();
    expect(screen.getByText('Concern Confirmed After Review')).toBeDefined();
    expect(screen.getByText('False Positive (Candidate Verified)')).toBeDefined();
    expect(screen.getByText('Inconclusive')).toBeDefined();
    expect(screen.getByText(/Document facts neutrally/)).toBeDefined();
  });

  it('requires note >= 10 characters for CONFIRMED_CONCERN before allowing submission', async () => {
    render(
      <ReviewDialog
        incidentId="inc-123"
        incidentCode="INC-20261111-TEST01"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const submitBtn = screen.getByText('Confirm Review');
    const textarea = screen.getByPlaceholderText(/Required: Detail specific findings/);

    // Initial state: empty note -> button is disabled
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    // Enter note < 10 chars
    fireEvent.change(textarea, { target: { value: 'short' } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    // Enter note >= 10 chars
    fireEvent.change(textarea, { target: { value: 'Physical identity differs significantly from profile' } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits review successfully and calls onSuccess callback', async () => {
    (apiClient as any).mockResolvedValue({ success: true });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ReviewDialog
        incidentId="inc-123"
        incidentCode="INC-20261111-TEST01"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const textarea = screen.getByPlaceholderText(/Required: Detail specific findings/);
    fireEvent.change(textarea, {
      target: { value: 'Physical facial structure does not match candidate angles' },
    });

    const submitBtn = screen.getByText('Confirm Review');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalledWith(
        '/api/v1/admin/incidents/inc-123/review',
        expect.objectContaining({
          method: 'POST',
          body: {
            disposition: 'CONFIRMED_CONCERN',
            note: 'Physical facial structure does not match candidate angles',
          },
        })
      );
      expect(onSuccess).toHaveBeenCalledWith(
        'CONFIRMED_CONCERN',
        'Physical facial structure does not match candidate angles'
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
