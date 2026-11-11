import { z } from 'zod';
import { UserRole } from './enums.js';

export const registerSchema = z.object({
  studentId: z
    .string()
    .trim()
    .min(3, 'Student ID must be at least 3 characters')
    .max(32, 'Student ID cannot exceed 32 characters'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(120, 'Full name cannot exceed 120 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address')
    .max(254, 'Email cannot exceed 254 characters'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(12, 'New password must be at least 12 characters long')
    .max(128, 'New password cannot exceed 128 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface AuthUserDto {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  studentId?: string;
  enrollmentStatus?: string | null;
  mustChangePassword?: boolean;
}

export interface AuthResponseData {
  user: AuthUserDto;
}

export interface CsrfResponseData {
  csrfToken: string;
}

