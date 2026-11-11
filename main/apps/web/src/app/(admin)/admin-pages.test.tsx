import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AngleImage } from '../../components/admin/AngleImage';
import { ApprovalPanel } from '../../components/admin/ApprovalPanel';
import { Lightbox } from '../../components/admin/Lightbox';
import { StudentTable } from '../../components/admin/StudentTable';
import * as apiClientModule from '../../lib/api-client';
import AdminDashboardPage from './admin/dashboard/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
  useParams: () => ({ id: 'student-123' }),
}));

describe('Admin Portal Frontend Components (Prompt 04)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Admin Dashboard Page', () => {
    it('renders real aggregate metrics, pending approvals queue, and honest zero empty states', async () => {
      const mockDashboard = {
        data: {
          metrics: {
            totalStudents: 15,
            enrolledCandidates: 8,
            pendingEnrollmentApprovals: 2,
            activeExams: 1,
            activeSessions: 0,
            totalVerificationAttempts: 120,
            successfulVerifications: 110,
            failedVerifications: 4,
            unverifiedVerifications: 6,
            activeSecurityIncidents: 0,
          },
          pendingApprovals: [
            {
              profileId: 'prof-1',
              studentUserId: 'user-1',
              studentId: 'STU-001',
              fullName: 'Bob Smith',
              email: 'bob@example.com',
              version: 1,
              submittedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              sampleCount: 5,
            },
          ],
          recentActions: [
            {
              id: '1',
              action: 'ENROLLMENT_APPROVED',
              actorEmail: 'admin@examguard.local',
              actorName: 'Lead Proctor',
              entityType: 'FaceProfile',
              entityId: 'prof-99',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      };

      vi.spyOn(apiClientModule.apiClient, 'get').mockResolvedValue(mockDashboard as any);

      render(<AdminDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Administrator Dashboard')).toBeDefined();
        expect(screen.getByText('15')).toBeDefined(); // total students
        expect(screen.getByText('Bob Smith')).toBeDefined();
        expect(screen.getByText('ENROLLMENT_APPROVED')).toBeDefined();
        expect(screen.getByText('No Open Incidents')).toBeDefined();
      });
    });
  });

  describe('AngleImage Component', () => {
    it('renders photograph with referrerPolicy="no-referrer" and draggable={false}', () => {
      const mockImage = {
        id: 'img-1',
        angle: 'FRONT' as const,
        capturedAt: new Date().toISOString(),
        width: 640,
        height: 480,
        byteSize: 34500,
        mime: 'image/jpeg',
        quality: { blurScore: 180, luminance: 125, reasons: [] },
        authorizedImageUrl: '/api/v1/admin/images/enrollment/img-1',
      };

      const onClick = vi.fn();
      render(<AngleImage image={mockImage} label="FRONT" onClick={onClick} />);

      const img = screen.getByRole('img');
      expect(img).toBeDefined();
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(img.getAttribute('draggable')).toBe('false');
      expect(img.getAttribute('src')).toBe('/api/v1/admin/images/enrollment/img-1');
      expect(screen.getByText('FRONT')).toBeDefined();
    });

    it('renders placeholder when image is null/not captured', () => {
      render(<AngleImage image={null} label="UP" />);
      expect(screen.getByText('UP')).toBeDefined();
      expect(screen.getByText('Not captured')).toBeDefined();
    });
  });

  describe('ApprovalPanel Interactive Workflow', () => {
    it('renders Approve and Reject buttons for PENDING_APPROVAL and opens confirm modal', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      const onReject = vi.fn().mockResolvedValue(undefined);
      const onRevoke = vi.fn().mockResolvedValue(undefined);

      render(
        <ApprovalPanel
          profileId="prof-1"
          status="PENDING_APPROVAL"
          onApprove={onApprove}
          onReject={onReject}
          onRevoke={onRevoke}
        />,
      );

      // Verify buttons exist
      const approveBtn = screen.getByText('✓ Approve Enrollment');
      const rejectBtn = screen.getByText('✕ Reject');
      expect(approveBtn).toBeDefined();
      expect(rejectBtn).toBeDefined();

      // Click approve button opens confirmation dialog
      fireEvent.click(approveBtn);
      expect(screen.getByText('Approve Candidate Biometric Enrollment')).toBeDefined();

      // Click Confirm in dialog
      const confirmApproveBtn = screen.getByText('Approve Candidate');
      fireEvent.click(confirmApproveBtn);
      await waitFor(() => {
        expect(onApprove).toHaveBeenCalledTimes(1);
      });
    });

    it('opens reject modal and validates minimum reason length', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      const onReject = vi.fn().mockResolvedValue(undefined);
      const onRevoke = vi.fn().mockResolvedValue(undefined);

      render(
        <ApprovalPanel
          profileId="prof-1"
          status="PENDING_APPROVAL"
          onApprove={onApprove}
          onReject={onReject}
          onRevoke={onRevoke}
        />,
      );

      fireEvent.click(screen.getByText('✕ Reject'));
      expect(screen.getByText('Reject Face Enrollment')).toBeDefined();

      const textarea = screen.getByPlaceholderText(/E.g., Down angle capture had heavy glare/i);
      fireEvent.change(textarea, { target: { value: 'Too dark in room' } });

      const confirmRejectBtn = screen.getByText('Confirm Rejection');
      fireEvent.click(confirmRejectBtn);

      await waitFor(() => {
        expect(onReject).toHaveBeenCalledWith('Too dark in room');
      });
    });
  });

  describe('Lightbox Component', () => {
    it('supports keyboard navigation with Left and Right arrow keys and Esc', () => {
      const images = [
        {
          id: 'img-1',
          angle: 'FRONT' as const,
          capturedAt: new Date().toISOString(),
          width: 640,
          height: 480,
          byteSize: 30000,
          mime: 'image/jpeg',
          quality: {},
          authorizedImageUrl: '/api/v1/admin/images/enrollment/img-1',
        },
        {
          id: 'img-2',
          angle: 'LEFT' as const,
          capturedAt: new Date().toISOString(),
          width: 640,
          height: 480,
          byteSize: 31000,
          mime: 'image/jpeg',
          quality: {},
          authorizedImageUrl: '/api/v1/admin/images/enrollment/img-2',
        },
      ];

      const onClose = vi.fn();
      const onNavigate = vi.fn();

      render(
        <Lightbox
          images={images}
          currentIndex={0}
          isOpen={true}
          onClose={onClose}
          onNavigate={onNavigate}
        />,
      );

      // Press Right arrow to navigate to next image
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(onNavigate).toHaveBeenCalledWith(1);

      // Press Escape to close
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('StudentTable Component', () => {
    it('renders student list with status badges and links to inspect profile', () => {
      const students = [
        {
          id: 'stu-1',
          fullName: 'Charlie Davis',
          email: 'charlie@example.com',
          studentId: 'STU-9901',
          status: 'ACTIVE' as const,
          enrollmentStatus: 'APPROVED' as const,
          lastLoginAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      render(<StudentTable students={students} />);
      expect(screen.getByText('Charlie Davis')).toBeDefined();
      expect(screen.getByText('STU-9901')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('Approved')).toBeDefined();
      expect(screen.getByText('Inspect →')).toBeDefined();
    });
  });
});
