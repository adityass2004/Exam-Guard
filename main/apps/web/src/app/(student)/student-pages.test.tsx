import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '../../lib/api-client';
import StudentDashboardPage from './dashboard/page';
import StudentEnrollmentPage from './enrollment/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('Student Portal Frontend Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Student Dashboard Page', () => {
    it('renders real dashboard data and active exams with eligibility state', async () => {
      const mockDashboardData = {
        profile: {
          fullName: 'Alice Candidate',
          email: 'alice@examguard.local',
          studentId: 'STU-1001',
        },
        enrollment: {
          status: 'PENDING_APPROVAL',
          version: 1,
          hasConsent: true,
          progress: 5,
          canStartExam: false,
          statusMessage: 'Awaiting administrator verification review',
        },
        availableExams: [
          {
            id: 'exam-1',
            title: 'Sample CS101 Midterm Examination',
            durationMinutes: 60,
            totalQuestions: 8,
            canStart: false,
            eligibilityReason: 'Enrollment must be approved first',
          },
        ],
        previousSessions: [],
        verificationSummary: {
          totalAttempts: 12,
          successfulMatches: 10,
          failedMatches: 2,
          unverified: 0,
        },
        previousWarnings: [],
      };

      vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue(mockDashboardData);

      render(<StudentDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Alice Candidate/i)).toBeInTheDocument();
        expect(screen.getByText(/Awaiting administrator verification review/i)).toBeInTheDocument();
        expect(screen.getByText(/Sample CS101 Midterm Examination/i)).toBeInTheDocument();
        expect(screen.getByText(/Enrollment must be approved first/i)).toBeInTheDocument();
        expect(screen.getByText(/No previous examination sessions recorded/i)).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument(); // successful matches
      });
    });
  });

  describe('Student Enrollment Page', () => {
    it('shows Step 0 Consent screen when student has not yet consented', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue({
        hasConsent: false,
        profile: null,
        previousApprovedProfileExists: false,
      });

      render(<StudentEnrollmentPage />);

      await waitFor(() => {
        expect(screen.getByText('Biometric Verification Consent')).toBeInTheDocument();
        expect(screen.getByText(/Accept Consent & Begin Enrollment/i)).toBeInTheDocument();
      });
    });

    it('shows Step 7 Approved screen when student profile is already approved', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue({
        hasConsent: true,
        profile: {
          id: 'p-1',
          version: 1,
          status: 'APPROVED',
          progress: 5,
          angles: {
            FRONT: { captured: true },
            LEFT: { captured: true },
            RIGHT: { captured: true },
            UP: { captured: true },
            DOWN: { captured: true },
          },
        },
        previousApprovedProfileExists: true,
      });

      render(<StudentEnrollmentPage />);

      await waitFor(() => {
        expect(screen.getByText(/Biometric Profile Approved/i)).toBeInTheDocument();
        expect(screen.getByText(/Return to Student Dashboard/i)).toBeInTheDocument();
      });
    });
  });
});
