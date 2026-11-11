'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AuthResponseData,
  AuthUserDto,
  LoginInput,
  RegisterInput,
} from '@examguard/shared';
import { apiClient, ApiClientError, setCsrfToken } from '../lib/api-client';

export function useAuth() {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient<AuthUserDto>('/api/v1/auth/me');
      setUser(data);
    } catch (err: unknown) {
      setUser(null);
      if (err instanceof ApiClientError && err.statusCode === 401) {
        // Normal unauthenticated state
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch user');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (input: LoginInput) => {
    setError(null);
    const data = await apiClient<AuthResponseData>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    });
    setUser(data.user);
    router.push('/dashboard');
    return data.user;
  };

  const adminLogin = async (input: LoginInput) => {
    setError(null);
    const data = await apiClient<AuthResponseData>('/api/v1/auth/admin/login', {
      method: 'POST',
      body: input,
    });
    setUser(data.user);
    router.push('/admin/dashboard');
    return data.user;
  };

  const register = async (input: RegisterInput) => {
    setError(null);
    const data = await apiClient<AuthResponseData>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
    });
    return data.user;
  };

  const logout = async () => {
    try {
      await apiClient('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setUser(null);
      setCsrfToken(null);
      router.push('/');
    }
  };

  return {
    user,
    loading,
    error,
    login,
    adminLogin,
    register,
    logout,
    refreshUser: fetchUser,
  };
}
