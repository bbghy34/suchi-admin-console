'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SESSION_TTL_SECONDS } from '@/lib/session';

const AuthContext = createContext({
  user: null,
  isLoading: true,
  loginUser: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.employee) {
          setUser(data.employee);
          const role = data.employee.role;
          if (role === 'A' || role === 'M' || role === 'E' || role === 'AA' || role === 'T') {
            const secure = window.location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = `auth_role=${encodeURIComponent(role)}; path=/; max-age=${SESSION_TTL_SECONDS}; SameSite=Lax${secure}`;
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          sessionStorage.removeItem('auth_token');
          document.cookie = 'auth_role=; path=/; max-age=0';
        }
      }
    } catch (err) {
      console.error('Failed to fetch authenticated user:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const loginUser = (_token, employee) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    }
    setUser(employee);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
        document.cookie = 'auth_role=; path=/; max-age=0';
      }
      setUser(null);
      window.location.assign('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginUser,
        logout,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthProvider;
