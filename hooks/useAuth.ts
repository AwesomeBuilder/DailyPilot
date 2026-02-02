import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:3001';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Check auth status on mount and handle URL params
  useEffect(() => {
    const checkAuth = async () => {
      // Handle auth callback params
      const urlParams = new URLSearchParams(window.location.search);
      const authSuccess = urlParams.get('auth_success');
      const authError = urlParams.get('auth_error');

      // Clean URL params after reading
      if (authSuccess || authError) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      if (authError) {
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: `Authentication failed: ${authError}`,
        });
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/status`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to check auth status');
        }

        const data = await response.json();

        setState({
          isAuthenticated: data.authenticated,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        console.error('Auth check error:', error);
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: null, // Don't show error for initial check failure
        });
      }
    };

    checkAuth();
  }, []);

  // Login - redirect to Google OAuth
  const login = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/api/auth/url`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const data = await response.json();

      // Redirect to Google OAuth
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Login error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
    }
  }, []);

  // Logout - clear session
  const logout = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      setState({
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    login,
    logout,
    clearError,
  };
}
