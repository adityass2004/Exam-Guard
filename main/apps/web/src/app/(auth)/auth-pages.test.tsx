import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '../../lib/api-client';
import StudentLoginPage from './login/page';
import AdminLoginPage from './admin/login/page';
import StudentRegisterPage from './register/page';
import StudentLayout from '../(student)/layout';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Auth Frontend Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  describe('Student Login Page', () => {
    it('submits credentials and redirects to /dashboard on success', async () => {
      // /api/v1/auth/me on mount in useAuth
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
        if (path === '/api/v1/auth/me') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No session');
        }
        if (path === '/api/v1/auth/login') {
          return {
            user: {
              id: 'stu-1',
              email: 'student@examguard.local',
              role: 'STUDENT',
              fullName: 'Alice Smith',
              isActive: true,
              isLocked: false,
            },
          };
        }
        return {};
      });

      render(<StudentLoginPage />);

      const emailInput = screen.getByPlaceholderText('student@examguard.local');
      const passwordInput = screen.getByPlaceholderText('••••••••••••');
      const submitBtn = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'student@examguard.local' } });
      fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('displays error message when login fails with 401', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
        if (path === '/api/v1/auth/me') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No session');
        }
        if (path === '/api/v1/auth/login') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'Invalid email or password');
        }
        return {};
      });

      render(<StudentLoginPage />);

      const emailInput = screen.getByPlaceholderText('student@examguard.local');
      const passwordInput = screen.getByPlaceholderText('••••••••••••');
      const submitBtn = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'wrong@examguard.local' } });
      fireEvent.change(passwordInput, { target: { value: 'WrongPassword123!' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Admin Login Page', () => {
    it('submits credentials and redirects to /admin/dashboard on success', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
        if (path === '/api/v1/auth/me') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No session');
        }
        if (path === '/api/v1/auth/admin/login') {
          return {
            user: {
              id: 'admin-1',
              email: 'admin@examguard.local',
              role: 'ADMIN',
              fullName: 'System Administrator',
              isActive: true,
              isLocked: false,
            },
          };
        }
        return {};
      });

      render(<AdminLoginPage />);

      const emailInput = screen.getByPlaceholderText('admin@examguard.local');
      const passwordInput = screen.getByPlaceholderText('••••••••••••');
      const submitBtn = screen.getByRole('button', { name: /authenticate as admin/i });

      fireEvent.change(emailInput, { target: { value: 'admin@examguard.local' } });
      fireEvent.change(passwordInput, { target: { value: 'AdminPassword123!' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
      });
    });
  });

  describe('Student Registration Page', () => {
    it('enforces client validation for passwords matching and length', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
        if (path === '/api/v1/auth/me') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No session');
        }
        return {};
      });

      render(<StudentRegisterPage />);

      const studentIdInput = screen.getByPlaceholderText('e.g. STU-2026-081');
      const fullNameInput = screen.getByPlaceholderText('e.g. Jane Doe');
      const emailInput = screen.getByPlaceholderText('jane.doe@university.edu');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••••••');
      const passwordInput = passwordInputs[0];
      const confirmPasswordInput = passwordInputs[1];
      const submitBtn = screen.getByRole('button', { name: /complete registration/i });

      fireEvent.change(studentIdInput, { target: { value: 'STU-999' } });
      fireEvent.change(fullNameInput, { target: { value: 'Jane Student' } });
      fireEvent.change(emailInput, { target: { value: 'jane@university.edu' } });

      // Short password test (< 12 chars)
      fireEvent.change(passwordInput, { target: { value: 'short123' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'short123' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 12 characters long')).toBeInTheDocument();
      });

      // Mismatched passwords test
      fireEvent.change(passwordInput, { target: { value: 'LongEnoughPassword123!' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'DifferentPassword123!' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('submits registration form successfully and redirects to /login', async () => {
      let registered = false;
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
        if (path === '/api/v1/auth/me') {
          throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No session');
        }
        if (path === '/api/v1/auth/register') {
          registered = true;
          return {
            user: {
              id: 'stu-new',
              email: 'valid@university.edu',
              role: 'STUDENT',
              fullName: 'Valid Student',
            },
          };
        }
        return {};
      });

      render(<StudentRegisterPage />);

      const studentIdInput = screen.getByPlaceholderText('e.g. STU-2026-081');
      const fullNameInput = screen.getByPlaceholderText('e.g. Jane Doe');
      const emailInput = screen.getByPlaceholderText('jane.doe@university.edu');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••••••');
      const submitBtn = screen.getByRole('button', { name: /complete registration/i });

      fireEvent.change(studentIdInput, { target: { value: 'STU-NEW-1' } });
      fireEvent.change(fullNameInput, { target: { value: 'Valid Student' } });
      fireEvent.change(emailInput, { target: { value: 'valid@university.edu' } });
      fireEvent.change(passwordInputs[0], { target: { value: 'ValidLongPassword123!' } });
      fireEvent.change(passwordInputs[1], { target: { value: 'ValidLongPassword123!' } });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(registered).toBe(true);
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Session Check & Protected Layout', () => {
    it('redirects to /login when user is unauthenticated', async () => {
      vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async () => {
        throw new apiClientModule.ApiClientError('UNAUTHENTICATED', 401, 'No active session');
      });

      render(
        <StudentLayout>
          <div>Protected Student Content</div>
        </StudentLayout>,
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
      expect(screen.queryByText('Protected Student Content')).not.toBeInTheDocument();
    });
  });
});

